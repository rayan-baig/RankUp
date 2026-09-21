-- ---------------------------------------------------------------------------
-- Sync support.
--
-- Run this AFTER schema.sql. It adds the two things syncing needs:
--
--   1. a revision number on every row a device has to keep in step, so a device
--      can ask "what changed since I last looked?" instead of re-downloading
--      everything;
--   2. `family_snapshot()`, which answers that question in one round trip.
--
-- WHY A COUNTER AND NOT A TIMESTAMP. The obvious design is `updated_at` plus
-- "give me everything newer than X". It is subtly broken: inside a transaction
-- Postgres' now() is frozen at the transaction start, so several rows written
-- together share one timestamp, and a device that syncs on that exact instant
-- silently misses them. The failure looks like "sometimes a quest just doesn't
-- appear", which is miserable to diagnose later. A single sequence gives every
-- write its own strictly increasing number, so nothing can tie and nothing can
-- be skipped. It is also immune to clock skew between devices.
--
-- Writes do NOT need special functions. Row level security already stops a kid
-- editing a quest's XP or another family's anything (proved in
-- supabase/test/01-security.sql), so devices write to the tables directly. The
-- one exception is awarding XP, which stays inside approve_submission because
-- it has to be atomic and parent-only.
-- ---------------------------------------------------------------------------

create sequence if not exists sync_rev;

create or replace function bump_rev() returns trigger
language plpgsql as $$
begin
  new.rev := nextval('sync_rev');
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['families','kids','quests','submissions','rewards','redemptions','notes','overrides']
  loop
    execute format(
      'alter table %I add column if not exists rev bigint not null default nextval(''sync_rev'')', t);
    execute format('drop trigger if exists %I on %I', t || '_rev', t);
    execute format(
      'create trigger %I before update on %I for each row execute function bump_rev()',
      t || '_rev', t);
    -- `families` is keyed by its own id rather than a family_id column.
    if t = 'families' then
      execute 'create index if not exists families_sync_idx on families (id, rev)';
    else
      execute format('create index if not exists %I on %I (family_id, rev)', t || '_sync_idx', t);
    end if;
  end loop;
end $$;

/**
 * Deleting a row would otherwise be invisible to the other device — it would
 * never hear about it and would keep showing the deleted quest forever. So
 * deletions are recorded rather than silent.
 */
create table if not exists deletions (
  id         bigserial primary key,
  rev        bigint not null default nextval('sync_rev'),
  family_id  uuid not null references families(id) on delete cascade,
  table_name text not null,
  row_id     uuid not null,
  deleted_at timestamptz not null default now()
);

create index if not exists deletions_sync_idx on deletions (family_id, rev);
alter table deletions enable row level security;

drop policy if exists deletions_read on deletions;
drop policy if exists deletions_read on deletions;
create policy deletions_read on deletions
  for select using (family_id = current_family_id());

create or replace function record_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into deletions (family_id, table_name, row_id)
  values (old.family_id, tg_table_name, old.id);
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['kids','quests','submissions','rewards','notes','redemptions','overrides']
  loop
    execute format('drop trigger if exists %I on %I', t || '_deleted', t);
    execute format(
      'create trigger %I after delete on %I for each row execute function record_deletion()',
      t || '_deleted', t);
  end loop;
end $$;

/**
 * Everything this family's devices need, limited to what changed since `p_since`.
 *
 * Row level security still applies inside this function because it is NOT
 * security definer — a kid calling it gets their own rows, a parent gets the
 * whole family. One function, and the same rules as everywhere else decide what
 * comes back.
 *
 * `server_rev` is the head of the revision log, and it is NOT safe for a device
 * to bank the moment it arrives. `rev` comes from a sequence, and a sequence
 * hands out its number when a write starts, not when it commits. So a row can
 * be given rev 500 by a transaction that is still open while this function
 * reads head = 501 and returns without it. If the device stored 501 straight
 * away it would afterwards only ask for rows newer than that, and row 500 —
 * committed a heartbeat later — would never be sent to it again.
 *
 * The device is what closes that hole: it holds each head it is given for a few
 * seconds before writing it down, and keeps asking from the older one in the
 * meantime. A transaction that commits in that window is caught by the overlap.
 * The cost is that recent rows are sent twice, which the merge already expects.
 * See CURSOR_LAG_MS in src/lib/sync/syncEngine.js.
 */
create or replace function family_snapshot(p_since bigint default 0)
returns jsonb
language plpgsql stable as $$
declare
  cutoff bigint := coalesce(p_since, 0);
  head   bigint := last_value from sync_rev;
begin
  -- A caller who is in no family yet — a kid's phone waiting to be paired —
  -- can see nothing, and must NOT be handed a cursor. If it banked one it
  -- would afterwards only ask for writes newer than the moment it was still a
  -- stranger, and every quest assigned before pairing would stay invisible to
  -- it forever. Returning nothing makes the device try again from zero.
  if current_family_id() is null then
    return null;
  end if;

  return jsonb_build_object(
    'server_rev',  head,
    'families',    coalesce((select jsonb_agg(to_jsonb(f)) from families f    where f.rev > cutoff), '[]'::jsonb),
    'kids',        coalesce((select jsonb_agg(to_jsonb(k)) from kids k        where k.rev > cutoff), '[]'::jsonb),
    'quests',      coalesce((select jsonb_agg(to_jsonb(q)) from quests q      where q.rev > cutoff), '[]'::jsonb),
    /*
     * WITHOUT the photograph, which is 96% of this payload when one is in it.
     *
     * A 720px proof photo is about 60KB, and 80KB once it is base64. Carrying
     * it here sent it to every device on every delivery: to the parent, who
     * needs it; to the CHILD'S OWN PHONE, which took it and already has it;
     * and two or three times over, because the cursor deliberately lags so
     * that nothing committed late is stepped over. One photo crossed the wire
     * roughly five times to be looked at once.
     *
     * The flag is all a device needs to know it should go and fetch one. See
     * submission_photo below, which hands over exactly one, to exactly the
     * device that is going to draw it.
     */
    'submissions', coalesce((
      select jsonb_agg(to_jsonb(s) - 'photo_data'
                       || jsonb_build_object('has_photo', s.photo_data is not null))
        from submissions s where s.rev > cutoff), '[]'::jsonb),
    'rewards',     coalesce((select jsonb_agg(to_jsonb(r)) from rewards r     where r.rev > cutoff), '[]'::jsonb),
    'redemptions', coalesce((select jsonb_agg(to_jsonb(r)) from redemptions r where r.rev > cutoff), '[]'::jsonb),
    'notes',       coalesce((select jsonb_agg(to_jsonb(n)) from notes n       where n.rev > cutoff), '[]'::jsonb),
    'overrides',   coalesce((select jsonb_agg(to_jsonb(o)) from overrides o   where o.rev > cutoff), '[]'::jsonb),
    'deletions',   coalesce((select jsonb_agg(to_jsonb(d)) from deletions d   where d.rev > cutoff), '[]'::jsonb)
  );
end $$;

grant execute on function family_snapshot(bigint) to authenticated;

-- Asked directly by the server when it needs to know which family a caller
-- belongs to — a push, for instance, before it will buzz anybody's phone. It
-- returns that one id and nothing else, which is the point: the endpoints that
-- needed it were calling family_snapshot and pulling down the whole family,
-- photos included, to read a single field off the front.
grant execute on function current_family_id() to authenticated;

-- Photo proof.
--
-- The photo travels as base64 in this column, which keeps the loop working
-- across devices without a second service to set up. It no longer bloats the
-- snapshot: family_snapshot returns a flag and submission_photo hands the
-- image over on its own, once, to the device that will draw it.
--
-- Supabase Storage is still the better long-term home — it would keep the
-- bytes out of Postgres entirely and let a CDN serve them — but the thing that
-- made it urgent was the bandwidth, and that is dealt with. See docs/SYNC.md.
alter table submissions add column if not exists photo_data text;
alter table submissions add column if not exists photo_deleted_at timestamptz;

/**
 * One proof photograph, for the device that is about to show it.
 *
 * Not security definer: row level security decides. A parent can read their
 * own family's submissions and a child can read their own, and this function
 * inherits exactly that — there is no new way in here, only a narrower way to
 * ask for something the caller could already see.
 *
 * Returns null rather than raising for a photo that is gone. Approving or
 * sending back a chore destroys the image at that moment, so "no longer there"
 * is the normal end state for every photo in the system, not an error.
 */
create or replace function submission_photo(p_submission_id uuid)
returns text
language sql stable as $$
  select photo_data from submissions where id = p_submission_id;
$$;

grant execute on function submission_photo(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- The writes a device is NOT allowed to make directly.
--
-- Everything else in this app is written straight to the tables, because row
-- level security is enough to make that safe. These are the exceptions: they
-- decide a quest's outcome or move currency, so they have to be atomic and they
-- have to check who is asking. A device that could set `status = 'approved'`
-- itself, or write its own `coins` column, would make every other rule here
-- decorative.
-- ---------------------------------------------------------------------------

/** A kid sends in their proof. Creates the submission and flips the quest together. */
create or replace function submit_quest(
  p_submission_id uuid,
  p_quest_id uuid,
  p_kid_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_quest quests;
  v_family uuid;
begin
  select * into v_quest from quests where id = p_quest_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_quest'); end if;
  v_family := v_quest.family_id;

  -- The caller must be this kid, or a parent in the family.
  if not exists (select 1 from kids where id = p_kid_id and user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_family) then
    raise exception 'not allowed to submit for this kid';
  end if;

  if v_quest.kid_id <> p_kid_id then
    return jsonb_build_object('ok', false, 'reason', 'wrong_kid');
  end if;
  if v_quest.status not in ('assigned', 'redo') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  -- The same one-payout-per-quest rule the app enforces, enforced again here.
  if exists (select 1 from submissions where quest_id = p_quest_id and status = 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;

  insert into submissions (
    id, family_id, quest_id, kid_id, photo_hash, photo_data, capture_source,
    note, test_score, elapsed_ms, on_time, ai_verdict, ai_score, ai_report, status
  ) values (
    p_submission_id, v_family, p_quest_id, p_kid_id,
    p_payload->>'photo_hash', p_payload->>'photo_data',
    coalesce(p_payload->>'capture_source', 'none'),
    coalesce(p_payload->>'note', ''),
    nullif(p_payload->>'test_score', '')::int,
    nullif(p_payload->>'elapsed_ms', '')::int,
    coalesce((p_payload->>'on_time')::boolean, true),
    p_payload->>'ai_verdict',
    nullif(p_payload->>'ai_score', '')::int,
    p_payload->'ai_report',
    'pending'
  ) on conflict (id) do nothing;

  update quests set status = 'submitted' where id = p_quest_id;
  return jsonb_build_object('ok', true);
end $$;

/**
 * Finish a minigame and collect what it is worth.
 *
 * The client computes the same number so a child sees it immediately, but this
 * is the authority — currency is the one thing a tampered phone must never be
 * able to set. Three separate limits apply, and the daily cap is the important
 * one: it sits well below a single chore's payout, so grinding the arcade can
 * never compete with tidying a room.
 *
 * The payout rule is mirrored in coinsForScore() in src/data/minigames.js.
 * supabase/test/09-minigames.sql checks the two agree.
 */
create or replace function play_minigame(
  p_kid_id uuid,
  p_game   text,
  p_score  int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid    kids;
  v_score  int;
  v_wanted int;
  v_paid   int;
  v_today  int;
  v_best   int;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;

  -- This child, or a parent in their family. Nobody else.
  if not exists (select 1 from kids where id = p_kid_id and user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id) then
    raise exception 'not allowed to play for this child';
  end if;

  if p_game not in ('tap', 'stack', 'memory') then
    return jsonb_build_object('ok', false, 'reason', 'no_game');
  end if;
  if v_kid.play_tokens < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no_tokens');
  end if;

  -- A score arriving from a phone is a claim, not a fact. Clamping it is what
  -- stops "I scored 4 billion" from being worth anything.
  v_score := greatest(0, least(100, coalesce(p_score, 0)));

  -- Reset the day's tally when the date rolls over.
  v_today := case when v_kid.game_day = current_date then v_kid.game_coins_today else 0 end;

  v_wanted := greatest(1, least(5, round(v_score / 20.0)::int));
  v_paid   := greatest(0, least(v_wanted, 15 - v_today));

  v_best := greatest(coalesce((v_kid.best_scores->>p_game)::int, 0), v_score);

  update kids
     set play_tokens      = play_tokens - 1,
         coins            = coins + v_paid,
         game_day         = current_date,
         game_coins_today = v_today + v_paid,
         best_scores      = coalesce(best_scores, '{}'::jsonb) || jsonb_build_object(p_game, v_best)
   where id = p_kid_id;

  insert into events (family_id, kid_id, type, meta)
  values (v_kid.family_id, p_kid_id, 'minigame_played',
          jsonb_build_object('game', p_game, 'score', v_score, 'coins', v_paid));

  return jsonb_build_object(
    'ok', true, 'coins', v_paid, 'score', v_score, 'best', v_best,
    'capped', v_paid < v_wanted,
    'tokens_left', v_kid.play_tokens - 1,
    'earned_today', v_today + v_paid
  );
end $$;

grant execute on function play_minigame(uuid, text, int) to authenticated;

/** The parent sends work back to be redone. */
create or replace function reject_submission(
  p_submission_id uuid,
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sub submissions;
begin
  select * into v_sub from submissions where id = p_submission_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_sub.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'decided'); end if;

  if not exists (select 1 from parents where user_id = auth.uid() and family_id = v_sub.family_id) then
    raise exception 'only a parent in this family can send work back';
  end if;

  -- Same as approving: the photo goes the instant it has been looked at.
  update submissions
     set status = 'rejected', decided_at = now(), parent_note = coalesce(p_note, ''),
         photo_data = null, photo_deleted_at = now()
   where id = p_submission_id;

  update quests
     set status = 'redo', redo_note = coalesce(p_note, ''), redo_count = redo_count + 1
   where id = v_sub.quest_id;

  insert into events (family_id, kid_id, type, meta)
  values (v_sub.family_id, v_sub.kid_id, 'quest_rejected',
          jsonb_build_object('questId', v_sub.quest_id, 'reason', coalesce(p_note, '')));

  return jsonb_build_object('ok', true);
end $$;

/** The daily login bonus. Server-side so it genuinely cannot be claimed twice. */
create or replace function claim_login_bonus(p_kid_id uuid, p_coins int default 5)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_kid kids;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;

  -- NULL-safe. `v_kid.user_id is distinct from auth.uid()` is FALSE when both
  -- sides are null — and both are null for a child profile that was never
  -- paired to a phone, called with no bearer token at all. So the guard passed
  -- for an anonymous caller and this security-definer function moved the
  -- child's balance anyway. A profile with no device must be the hardest to
  -- touch, not the easiest.
  if not exists (select 1 from kids k where k.id = p_kid_id and k.user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id) then
    raise exception 'not allowed';
  end if;

  if v_kid.last_login_bonus = current_date then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update kids
     set coins = coins + greatest(0, least(p_coins, 50)), last_login_bonus = current_date
   where id = p_kid_id;
  return jsonb_build_object('ok', true);
end $$;

/**
 * Is a repeating chore due to come back?
 *
 * The rule, in one place, because the app works it out too — a phone with no
 * backend still has to bring tomorrow's chores back by itself. Kept as its own
 * function so the two can be checked against each other; tests/recurrence.mjs
 * runs this and the app's version over every combination and fails if they
 * ever disagree.
 *
 * `p_last` is the day the chore was last finished or last came back. A chore
 * that is not finished is never due: the child still owes it, and bringing it
 * back would quietly wipe a send-back a parent had just written.
 */
create or replace function recurring_quest_due(
  p_recurrence text,
  p_status text,
  p_last date,
  p_today date
) returns boolean
language sql immutable set search_path = public as $$
  select case
    when p_recurrence not in ('daily', 'weekdays', 'weekly') then false
    when p_status <> 'approved' then false
    when p_last is null or p_today is null then false
    when p_recurrence = 'daily'    then p_today > p_last
    -- Monday is 1 and Friday is 5 in ISO terms. A chore set for weekdays does
    -- not reappear on a Saturday, which is the entire point of the option.
    when p_recurrence = 'weekdays' then p_today > p_last and extract(isodow from p_today) between 1 and 5
    when p_recurrence = 'weekly'   then p_today >= p_last + 7
    else false
  end;
$$;

/**
 * Bring back every repeating chore in the caller's family that is due.
 *
 * The device asks; the DATABASE decides. A phone cannot name a quest to
 * reopen — it calls this and the rule above is applied to the rows as they
 * actually are. That matters because reopening a quest is how a chore gets
 * paid a second time, so "which ones are due" must not be the caller's
 * opinion. A child's own phone may call it: whoever opens the app first in
 * the morning brings the day's chores back for everybody.
 *
 * Idempotent through last_reset_on, so two devices opening at breakfast do
 * not bring the same chore back twice.
 */
create or replace function reset_due_recurring_quests()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_today  date := current_date;
  v_ids    uuid[];
begin
  if v_family is null then return jsonb_build_object('ok', false, 'reason', 'no_family'); end if;

  with due as (
    select q.id from quests q
     where q.family_id = v_family
       and recurring_quest_due(q.recurrence, q.status,
                               coalesce(q.last_reset_on, q.completed_at::date), v_today)
     for update
  ), reopened as (
    update quests q
       set status = 'assigned',
           completed_at = null,
           redo_note = null,
           redo_count = 0,
           last_reset_on = v_today
      from due
     where q.id = due.id
    returning q.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from reopened;

  return jsonb_build_object('ok', true, 'reset', to_jsonb(v_ids), 'count', coalesce(array_length(v_ids, 1), 0));
end $$;

grant execute on function reset_due_recurring_quests() to authenticated;
revoke execute on function recurring_quest_due(text, text, date, date) from public;

/**
 * A child changing how their own app looks.
 *
 * Row level security lets only a parent write the kids table, for good reason —
 * that row holds XP, currency and streaks. But it also holds the child's theme,
 * their equipped skin, their profile frame and their drop selector, and those
 * are the child's to choose. With no way to write them, the phone kept the
 * choice locally and the very next pull handed the old row straight back: the
 * kid picked a theme and watched it snap back within seconds.
 *
 * Worse, `skins` lives in that row too. Buying one took the coins server-side
 * and left the skin itself in local state only, so the next pull deleted the
 * thing they had just paid for.
 *
 * So: a narrow function that writes the cosmetic columns and nothing else. It
 * cannot touch a balance, and it refuses to equip a skin the child does not
 * own — the one cosmetic field with a price attached.
 */
create or replace function set_kid_look(
  p_kid_id        uuid,
  p_theme_id      text default null,
  p_profile_frame text default null,
  p_drop_selector text default null,
  p_skin_id       text default null,
  p_avatar_hue    int  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_kid kids;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;

  -- NULL-safe, for the same reason as every other guard in this file: a child
  -- profile that was never paired has user_id null, and so does an anonymous
  -- caller, so `is distinct from` would have let a stranger dress them up.
  if not exists (select 1 from kids k where k.id = p_kid_id and k.user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id) then
    raise exception 'not allowed';
  end if;

  -- The only cosmetic that costs money. Everything else here is free, so there
  -- is nothing to cheat by setting it.
  if p_skin_id is not null and p_skin_id <> ''
     and not (coalesce(v_kid.skins, '[]'::jsonb) ? p_skin_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_owned');
  end if;

  update kids
     set theme_id      = coalesce(p_theme_id, theme_id),
         profile_frame = coalesce(p_profile_frame, profile_frame),
         drop_selector = coalesce(p_drop_selector, drop_selector),
         -- An empty string means "take it off", which coalesce alone cannot say.
         skin_id       = case when p_skin_id = '' then null else coalesce(p_skin_id, skin_id) end,
         avatar_hue    = coalesce(p_avatar_hue, avatar_hue)
   where id = p_kid_id;

  return jsonb_build_object('ok', true);
end $$;

grant execute on function set_kid_look(uuid, text, text, text, text, int) to authenticated;

/**
 * Spending a Streak Freeze to keep a run alive.
 *
 * A freeze token is earned, and a streak is the thing children care most about
 * in this app, so both live in the columns only the database may move. The
 * reducer changed them locally anyway and queued nothing: the token came back
 * and the streak broke on the next pull, about eight seconds after the child
 * thought they had saved it.
 */
create or replace function use_streak_freeze(p_kid_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_kid kids;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;

  -- NULL-safe: see claim_login_bonus.
  if not exists (select 1 from kids k where k.id = p_kid_id and k.user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id) then
    raise exception 'not allowed';
  end if;

  if v_kid.streak_freezes < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no_tokens');
  end if;
  -- Already counted for today. Spending a token would buy nothing, and two
  -- taps on a slow connection must not cost two.
  if v_kid.streak_last_day = current_date then
    return jsonb_build_object('ok', false, 'reason', 'already_safe');
  end if;

  update kids
     set streak_freezes = streak_freezes - 1,
         streak_last_day = current_date
   where id = p_kid_id;

  return jsonb_build_object('ok', true, 'freezes_left', v_kid.streak_freezes - 1);
end $$;

grant execute on function use_streak_freeze(uuid) to authenticated;

/** Spending currency on a reward. Checks the balance where it cannot be faked. */
create or replace function redeem_reward(p_redemption_id uuid, p_reward_id uuid, p_kid_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid kids;
  v_reward rewards;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  select * into v_reward from rewards where id = p_reward_id;
  if v_kid is null or v_reward is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- A reward from another family would otherwise set the price here.
  if v_reward.family_id is distinct from v_kid.family_id then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- NULL-safe. `v_kid.user_id is distinct from auth.uid()` is FALSE when both
  -- sides are null — and both are null for a child profile that was never
  -- paired to a phone, called with no bearer token at all. So the guard passed
  -- for an anonymous caller and this security-definer function moved the
  -- child's balance anyway. A profile with no device must be the hardest to
  -- touch, not the easiest.
  if not exists (select 1 from kids k where k.id = p_kid_id and k.user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id) then
    raise exception 'not allowed';
  end if;
  if v_kid.coins < v_reward.cost then
    return jsonb_build_object('ok', false, 'reason', 'insufficient');
  end if;

  update kids set coins = coins - v_reward.cost where id = p_kid_id;
  insert into redemptions (id, family_id, reward_id, kid_id, name, cost, status)
  values (p_redemption_id, v_kid.family_id, p_reward_id, p_kid_id, v_reward.name, v_reward.cost, 'requested')
  on conflict (id) do nothing;

  return jsonb_build_object('ok', true);
end $$;

/** The Currency Tax tier of the System Override Protocol. Parent only. */
create or replace function apply_currency_tax(p_kid_id uuid, p_percent int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid kids;
  v_taken int;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;
  if not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id) then
    raise exception 'only a parent in this family can apply a tax';
  end if;

  v_taken := floor(v_kid.coins * greatest(1, least(p_percent, 100)) / 100.0);
  update kids set coins = coins - v_taken where id = p_kid_id;
  return jsonb_build_object('ok', true, 'amount', v_taken);
end $$;

grant execute on function submit_quest(uuid, uuid, uuid, jsonb) to anon, authenticated;
grant execute on function reject_submission(uuid, text) to authenticated;
grant execute on function claim_login_bonus(uuid, int) to anon, authenticated;
grant execute on function redeem_reward(uuid, uuid, uuid) to anon, authenticated;
grant execute on function apply_currency_tax(uuid, int) to authenticated;

/**
 * Creating a family, for a brand-new account.
 *
 * This has to be a function rather than a plain insert because of a
 * chicken-and-egg problem: the row level security policy on `parents` only lets
 * a parent write rows in their own family, and a person signing up for the
 * first time is not yet a parent of anything. So the very first row cannot be
 * written by the account that needs it.
 *
 * Safe because it only ever creates a family for whoever is calling, and
 * refuses if that account already belongs to one.
 */
create or replace function create_family(p_family_name text, p_parent_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_family families;
begin
  if auth.uid() is null then raise exception 'must be signed in'; end if;
  if exists (select 1 from parents where user_id = auth.uid()) then
    return jsonb_build_object(
      'ok', false, 'reason', 'already_in_family',
      'family_id', (select family_id from parents where user_id = auth.uid()));
  end if;

  insert into families (name) values (coalesce(nullif(trim(p_family_name), ''), 'My family'))
  returning * into v_family;

  insert into parents (user_id, family_id, name)
  values (auth.uid(), v_family.id, coalesce(nullif(trim(p_parent_name), ''), 'Parent'));

  /*
   * A fortnight of the real thing, with no card asked for.
   *
   * Nobody buys a chore app on a feature list. They buy it the first time
   * their child photographs a made bed and it lands on their phone. Asking for
   * a card before that moment is asking someone to pay for a promise, and
   * almost nobody does.
   *
   * Elite rather than Standard, and deliberately: the parts worth paying for —
   * the AI check on the photo, a second child, the behaviour charts — are the
   * parts that have to be felt during the fortnight, not read about after it.
   * What they fall back to is Starter, which is free and still runs the whole
   * loop, so the end of a trial is a smaller app rather than a locked one.
   */
  perform grant_trial(v_family.id, 'elite', 14);
  select * into v_family from families where id = v_family.id;

  return jsonb_build_object('ok', true, 'family_id', v_family.id, 'family_name', v_family.name,
                            'trial_tier', v_family.trial_tier, 'trial_ends_at', v_family.trial_ends_at);
end $$;

grant execute on function create_family(text, text) to authenticated;
