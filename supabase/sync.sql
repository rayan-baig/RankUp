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
  foreach t in array array['kids','quests','submissions','rewards','notes']
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
 * `server_rev` is the cursor to send back next time. It is read BEFORE the rows
 * are gathered, so a write landing mid-query is picked up by the next sync
 * rather than being stepped over.
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
    'submissions', coalesce((select jsonb_agg(to_jsonb(s)) from submissions s where s.rev > cutoff), '[]'::jsonb),
    'rewards',     coalesce((select jsonb_agg(to_jsonb(r)) from rewards r     where r.rev > cutoff), '[]'::jsonb),
    'redemptions', coalesce((select jsonb_agg(to_jsonb(r)) from redemptions r where r.rev > cutoff), '[]'::jsonb),
    'notes',       coalesce((select jsonb_agg(to_jsonb(n)) from notes n       where n.rev > cutoff), '[]'::jsonb),
    'overrides',   coalesce((select jsonb_agg(to_jsonb(o)) from overrides o   where o.rev > cutoff), '[]'::jsonb),
    'deletions',   coalesce((select jsonb_agg(to_jsonb(d)) from deletions d   where d.rev > cutoff), '[]'::jsonb)
  );
end $$;

grant execute on function family_snapshot(bigint) to authenticated;

-- Photo proof.
--
-- The photo travels as base64 in this column for now, which keeps the loop
-- working across devices without a second service to set up. It is NOT the
-- right long-term home: a 60KB string per submission bloats every snapshot that
-- carries one. Before real users, move these into Supabase Storage and keep
-- only the path — see docs/SYNC.md.
alter table submissions add column if not exists photo_data text;
alter table submissions add column if not exists photo_deleted_at timestamptz;

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

  if v_kid.user_id is distinct from auth.uid()
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

  if v_kid.user_id is distinct from auth.uid()
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

  return jsonb_build_object('ok', true, 'family_id', v_family.id, 'family_name', v_family.name);
end $$;

grant execute on function create_family(text, text) to authenticated;
