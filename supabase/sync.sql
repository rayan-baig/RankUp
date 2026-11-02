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

-- Where everybody's XP stood when the family goal was set; the bar counts from
-- here. See set_family_goal below.
alter table family_goals add column if not exists start_xp int not null default 0;
-- Held to a sensible size like the rest of the goal (see the end of schema.sql).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'family_goals_start_range') then
    alter table family_goals add constraint family_goals_start_range
      check (start_xp between 0 and 100000000) not valid;
  end if;
end $$;

create or replace function bump_rev() returns trigger
language plpgsql as $$
begin
  new.rev := nextval('sync_rev');
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['families','kids','quests','submissions','rewards','redemptions','notes','overrides','family_goals']
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
  -- When the whole family is being deleted, its rows go with it by cascade and
  -- there is no device left to tell. Writing a tombstone then pointed at a
  -- family that no longer existed, the foreign key refused it, and the refusal
  -- aborted the deletion: "Delete account" failed for every family with a
  -- child in it. Only a family that still exists needs to hear about a row.
  if exists (select 1 from families where id = old.family_id) then
    insert into deletions (family_id, table_name, row_id)
    values (old.family_id, tg_table_name, old.id);
  end if;
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
 * Two parents editing the same chore.
 *
 * Each phone sends only the columns it changed, so two edits to different
 * fields both survive. Two edits to the SAME field: the one that reaches the
 * server last wins — and the one it replaced used to vanish without a trace,
 * the parent who typed it none the wiser. Every edit a parent's phone makes
 * to a chore is now written into the family's history with what it replaced
 * and who had written that, so a lost edit can always be found (it is in
 * "Download my data", under activity). The functions that move a chore's
 * status are not edits and are not recorded.
 */
alter table quests add column if not exists edited_by uuid;

/** Writes the history line. Its own function so the trigger can run as the caller. */
-- Callable from a browser (it has to be, for the trigger), so it writes only
-- into the caller's own family, as a parent of it, and only about a child of
-- that family: a direct call could otherwise name any family's child.
create or replace function log_quest_edit(p_family uuid, p_kid uuid, p_meta jsonb) returns void
language sql security definer set search_path = public as $$
  insert into events (family_id, kid_id, type, meta)
  select p_family, p_kid, 'quest_edited', p_meta
   where exists (select 1 from parents where user_id = auth.uid() and family_id = p_family)
     and (p_kid is null or exists (select 1 from kids where id = p_kid and family_id = p_family))
     -- What the trigger sends is a chore's changed fields, which the limits on
     -- quests keep to a few thousand characters; a direct call is held to that.
     and octet_length(p_meta::text) <= 20000;
$$;
revoke all on function log_quest_edit(uuid, uuid, jsonb) from public;
grant execute on function log_quest_edit(uuid, uuid, jsonb) to anon, authenticated;

-- Not security definer, on purpose: it has to see who is writing. A database
-- function (approve_submission and the rest) runs as the table's owner and is
-- not an edit; a phone writing the table directly is. Same test as
-- guard_kid_balances.
create or replace function record_quest_edit() returns trigger
language plpgsql set search_path = public as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_key text;
begin
  if current_user = (select tableowner from pg_tables where schemaname = 'public' and tablename = 'quests')
     or current_user = 'service_role'
     or (select rolsuper from pg_roles where rolname = current_user) then
    return new;
  end if;
  for v_key in select jsonb_object_keys(v_new) loop
    if v_key in ('rev', 'edited_by', 'status', 'completed_at', 'redo_note', 'redo_count',
                 'last_reset_on', 'created_at', 'created_by', 'family_id', 'id') then
      continue;
    end if;
    if v_new -> v_key is distinct from v_old -> v_key then
      v_changes := v_changes || jsonb_build_object(v_key,
                     jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
    end if;
  end loop;
  if v_changes = '{}'::jsonb then return new; end if;

  perform log_quest_edit(new.family_id, new.kid_id, jsonb_build_object(
    'questId', new.id,
    'title', new.title,
    'by', auth.uid(),
    'changes', v_changes,
    -- Whose edit this one wrote over, when it was somebody else's.
    'replaced_edit_by', case when old.edited_by is distinct from auth.uid() then old.edited_by end));
  new.edited_by := auth.uid();
  return new;
end $$;

drop trigger if exists quests_record_edit on quests;
create trigger quests_record_edit before update on quests
  for each row execute function record_quest_edit();

/**
 * The family goal used to live on the phone of the parent who set it. One row
 * per family, keyed by the family, so a clear is told to the other devices as
 * a tombstone whose row id is the family's own id.
 */
create or replace function record_goal_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from families where id = old.family_id) then
    insert into deletions (family_id, table_name, row_id)
    values (old.family_id, 'family_goals', old.family_id);
  end if;
  return old;
end $$;
drop trigger if exists family_goals_deleted on family_goals;
create trigger family_goals_deleted after delete on family_goals
  for each row execute function record_goal_deletion();

/**
 * A child removed takes their XP out of the total, so it comes out of where
 * the goal started too. Otherwise the whole balance came off the top and the
 * bar fell to nothing, though the others had earned XP since. What the child
 * earned towards it before leaving stays counted.
 */
create or replace function goal_without_kid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update family_goals
     set start_xp = greatest(0, start_xp - coalesce(old.xp, 0))
   where family_id = old.family_id;
  return old;
end $$;
drop trigger if exists kids_leave_goal on kids;
create trigger kids_leave_goal after delete on kids
  for each row execute function goal_without_kid();

/**
 * The family goal and how far along it is, for family_snapshot.
 *
 * Progress is everybody's XP now, less where it stood when the goal was set.
 * A child's phone can read only its own child's row, so it cannot add that up
 * itself; this does it for every device, with the rights to see every child
 * in the caller's family and nobody else's.
 *
 * Progress moves whenever any child's XP does, which does not touch the goal's
 * own row. So the goal is sent again whenever a child's row has changed since
 * the device last looked (or a child was removed), not only when the goal did.
 */
create or replace function family_goal_since(p_since bigint default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'family_id',  g.family_id,
           'name',       g.name,
           'target_xp',  g.target_xp,
           'start_xp',   g.start_xp,
           'created_at', g.created_at,
           'rev',        g.rev,
           'progress',   greatest(0, (select coalesce(sum(k.xp), 0) from kids k
                                       where k.family_id = g.family_id) - g.start_xp))), '[]'::jsonb)
    from family_goals g
   where g.family_id = current_family_id()
     and (g.rev > coalesce(p_since, 0)
          or exists (select 1 from kids k
                      where k.family_id = g.family_id and k.rev > coalesce(p_since, 0))
          or exists (select 1 from deletions d
                      where d.family_id = g.family_id and d.table_name = 'kids'
                        and d.rev > coalesce(p_since, 0)));
$$;
revoke all on function family_goal_since(bigint) from public;
grant execute on function family_goal_since(bigint) to authenticated;

/**
 * Set, change or clear the family goal. Parent only.
 *
 * Where the bar starts is decided here, from the children's XP as the server
 * has it, not from a phone that may not have synced for a day (which would
 * start the bar low and hand the family XP they earned before the goal).
 * The same goal saved again (a new target, say) keeps what was earned; a goal
 * with a different name starts again from where everybody is now.
 *
 * p_start_xp is only for a goal set before goals were shared, which a phone
 * sends up once: it is taken only if the family has no goal yet, so it cannot
 * overwrite one another parent has set since, and it is held to what the
 * children actually have.
 */
create or replace function set_family_goal(p_name text, p_target_xp int, p_start_xp int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_name   text := left(btrim(coalesce(p_name, '')), 80);
  v_total  int;
  v_goal   family_goals%rowtype;
begin
  if v_family is null or not is_parent() then
    return jsonb_build_object('ok', false, 'reason', 'not_parent');
  end if;

  if v_name = '' then
    delete from family_goals where family_id = v_family;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;
  if p_target_xp is null or p_target_xp <= 0 or p_target_xp > 10000000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_target');
  end if;

  select coalesce(sum(xp), 0) into v_total from kids where family_id = v_family;
  select * into v_goal from family_goals where family_id = v_family for update;

  if p_start_xp is not null then
    if found then
      -- Theirs stands. Touch it so the phone that sent this is sent it back.
      update family_goals set name = name where family_id = v_family;
      return jsonb_build_object('ok', true, 'kept', true);
    end if;
    insert into family_goals (family_id, name, target_xp, start_xp)
    values (v_family, v_name, p_target_xp, least(greatest(p_start_xp, 0), v_total));
    return jsonb_build_object('ok', true);
  end if;

  if found and btrim(v_goal.name) = v_name then
    update family_goals set target_xp = p_target_xp where family_id = v_family;
  else
    insert into family_goals (family_id, name, target_xp, start_xp, created_at)
    values (v_family, v_name, p_target_xp, v_total, now())
    on conflict (family_id) do update
      set name = excluded.name, target_xp = excluded.target_xp,
          start_xp = excluded.start_xp, created_at = excluded.created_at;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function set_family_goal(text, int, int) from public;
grant execute on function set_family_goal(text, int, int) to authenticated;

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
      -- Nor the other photo and photo-check columns, which RankUp no longer
      -- fills: they were a third of every row, and a family with a year of
      -- chores has thousands of rows. Measured in tests/guarantees.mjs.
      select jsonb_agg(to_jsonb(s) - array['photo_data', 'photo_path', 'photo_hash', 'ai_report',
                                           'ai_verdict', 'ai_score', 'photo_deleted_at', 'family_id']
                       || jsonb_build_object('has_photo', s.photo_data is not null))
        from submissions s where s.rev > cutoff), '[]'::jsonb),
    'rewards',     coalesce((select jsonb_agg(to_jsonb(r)) from rewards r     where r.rev > cutoff), '[]'::jsonb),
    'redemptions', coalesce((select jsonb_agg(to_jsonb(r)) from redemptions r where r.rev > cutoff), '[]'::jsonb),
    'notes',       coalesce((select jsonb_agg(to_jsonb(n)) from notes n       where n.rev > cutoff), '[]'::jsonb),
    'overrides',   coalesce((select jsonb_agg(to_jsonb(o)) from overrides o   where o.rev > cutoff), '[]'::jsonb),
    'family_goals', family_goal_since(cutoff),
    -- Only what a device reads from a tombstone.
    'deletions',   coalesce((select jsonb_agg(jsonb_build_object('rev', d.rev, 'table_name', d.table_name,
                                                                 'row_id', d.row_id))
                               from deletions d where d.rev > cutoff), '[]'::jsonb)
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
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_family and role = 'parent') then
    raise exception 'not allowed to submit for this kid';
  end if;

  if v_quest.kid_id <> p_kid_id then
    return jsonb_build_object('ok', false, 'reason', 'wrong_kid');
  end if;
  -- Sent again because the phone never heard back: the submission is
  -- already here. Answering "not open" made the phone undo a submission
  -- that had in fact arrived.
  if exists (select 1 from submissions where id = p_submission_id and kid_id = p_kid_id and quest_id = p_quest_id) then
    return jsonb_build_object('ok', true, 'repeat', true);
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
    -- No photograph is ever stored: RankUp takes none. A phone running an
    -- older version may still send one, and it is dropped here.
    null, null,
    coalesce(p_payload->>'capture_source', 'none'),
    coalesce(p_payload->>'note', ''),
    -- A score is a percentage. Held to 0..100 rather than refused, so a
    -- typo like 999 from an older phone does not bounce the whole chore.
    -- Read as a numeric first, so a number too big for an int is held to
    -- the range too instead of failing the whole chore.
    least(100, greatest(0, nullif(p_payload->>'test_score', '')::numeric))::int,
    -- How long it took: a day at most, which is longer than any timer.
    least(86400000, greatest(0, nullif(p_payload->>'elapsed_ms', '')::numeric))::int,
    coalesce((p_payload->>'on_time')::boolean, true),
    -- RankUp has no photo check; what an older phone says about one is not kept.
    null, null, null,
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
/**
 * Receipts for calls that move a balance, so a retry is not a second charge.
 *
 * A phone that sends a request and never hears back (a tunnel, a closed app,
 * a reset connection) sends it again; it cannot know whether the first one
 * landed. Without this, every one of those retries was a second game paid, a
 * second tax taken, a second payout recorded. Each such call now carries a
 * request id made on the device when the action happened, and the function
 * writes its answer here. The same id again returns the same answer and
 * changes nothing.
 *
 * Read and written only by the security-definer functions below.
 */
create table if not exists rpc_receipts (
  id         uuid primary key,
  kid_id     uuid,
  fn         text not null,
  result     jsonb not null,
  created_at timestamptz not null default now()
);
alter table rpc_receipts enable row level security;
revoke all on rpc_receipts from anon, authenticated;

create or replace function rpc_receipt(p_request_id uuid, p_kid_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select result || jsonb_build_object('repeat', true)
    from rpc_receipts where id = p_request_id and kid_id is not distinct from p_kid_id
$$;
revoke execute on function rpc_receipt(uuid, uuid) from public, anon, authenticated;

create or replace function keep_rpc_receipt(p_request_id uuid, p_kid_id uuid, p_fn text, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_request_id is not null then
    insert into rpc_receipts (id, kid_id, fn, result) values (p_request_id, p_kid_id, p_fn, p_result)
    on conflict (id) do nothing;
  end if;
  return p_result;
end $$;
revoke execute on function keep_rpc_receipt(uuid, uuid, text, jsonb) from public, anon, authenticated;

drop function if exists play_minigame(uuid, text, int);
-- Gained p_tz; the old signature has to go or the two would sit side by side.
drop function if exists play_minigame(uuid, text, int, uuid);
create or replace function play_minigame(
  p_kid_id uuid,
  p_game   text,
  p_score  int,
  p_request_id uuid default null,
  -- The phone's time zone: the daily cap resets on the family's day, which
  -- is the day the phone shows. See family_today.
  p_tz text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid    kids;
  v_score  int;
  v_wanted int;
  v_paid   int;
  v_today  int;
  v_best   int;
  v_prior  jsonb;
  v_day    date;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;

  -- This child, or a parent in their family. Nobody else.
  if not exists (select 1 from kids where id = p_kid_id and user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id and role = 'parent') then
    raise exception 'not allowed to play for this child';
  end if;

  -- The same game, sent again because the phone never heard the answer.
  v_prior := rpc_receipt(p_request_id, p_kid_id);
  if v_prior is not null then return v_prior; end if;

  /*
   * The game ids the arcade actually ships. This list and MINIGAMES in
   * src/data/minigames.js have to agree: a game missing from here is one a
   * child can play and finish while the server quietly refuses to pay for
   * it, which looks exactly like the app losing their winnings.
   *
   * That is not a hypothetical. Ten games were added to the app and this
   * list was not touched, so every one of them was being rejected here.
   * tests/gameids.mjs now compares the two and fails if they drift again.
   */
  if p_game not in (
    'stack', 'memory', 'chain', 'lights', 'catch',
    'snake', 'merge', 'bricks', 'sweeper', 'sky', 'four', 'slide',
    'sports', 'blocks', 'sweets', 'impostor', 'turbo',
    'track', 'wildfire', 'royal', 'tennis',
    'holdem', 'blackjack', 'gofish'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_game');
  end if;
  if v_kid.play_tokens < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no_tokens');
  end if;

  -- A score arriving from a phone is a claim, not a fact. Clamping it is what
  -- stops "I scored 4 billion" from being worth anything.
  v_score := greatest(0, least(100, coalesce(p_score, 0)));

  -- Reset the day's tally when the family's date rolls over.
  v_day   := family_today(v_kid.family_id, p_tz);
  v_today := case when v_kid.game_day >= v_day then v_kid.game_coins_today else 0 end;

  v_wanted := greatest(1, least(5, round(v_score / 20.0)::int));
  v_paid   := greatest(0, least(v_wanted, 15 - v_today));

  v_best := greatest(coalesce((v_kid.best_scores->>p_game)::int, 0), v_score);

  update kids
     set play_tokens      = play_tokens - 1,
         coins            = coins + v_paid,
         game_day         = greatest(v_day, coalesce(v_kid.game_day, v_day)),
         game_coins_today = v_today + v_paid,
         best_scores      = coalesce(best_scores, '{}'::jsonb) || jsonb_build_object(p_game, v_best)
   where id = p_kid_id;

  insert into events (family_id, kid_id, type, meta)
  values (v_kid.family_id, p_kid_id, 'minigame_played',
          jsonb_build_object('game', p_game, 'score', v_score, 'coins', v_paid));

  return keep_rpc_receipt(p_request_id, p_kid_id, 'play_minigame', jsonb_build_object(
    'ok', true, 'coins', v_paid, 'score', v_score, 'best', v_best,
    'capped', v_paid < v_wanted,
    'tokens_left', v_kid.play_tokens - 1,
    'earned_today', v_today + v_paid
  ));
end $$;

grant execute on function play_minigame(uuid, text, int, uuid, text) to authenticated;

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

  if not exists (select 1 from parents where user_id = auth.uid() and family_id = v_sub.family_id
                                         and role = 'parent') then
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
-- Gained p_tz, the phone's time zone: see family_today.
drop function if exists claim_login_bonus(uuid, int);
create or replace function claim_login_bonus(p_kid_id uuid, p_coins int default 5, p_tz text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid kids;
  v_day date;
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
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id and role = 'parent') then
    raise exception 'not allowed';
  end if;

  -- The family's day, which is the day the phone offers the bonus on. Later
  -- than today only happens when a zone changes, and still counts as claimed.
  v_day := family_today(v_kid.family_id, p_tz);
  if v_kid.last_login_bonus >= v_day then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update kids
     -- Always five. The amount used to come from the request (capped at 50),
     -- so a child's device could ask for ten times the bonus.
     set coins = coins + 5, last_login_bonus = v_day
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
 * `p_last` is the day the chore was last finished or last came back, whichever
 * is later. A chore that is not finished is never due: the child still owes
 * it, and bringing it back would quietly wipe a send-back a parent had just
 * written.
 *
 * `p_week_day` is the family's chosen day for weekly chores (ISO: Monday 1 to
 * Sunday 7). A weekly chore comes back on the first such day after it was
 * finished. Without one it comes back seven days after it was finished.
 *
 * Gained p_week_day: the four-argument version is dropped so the two cannot
 * both exist.
 */
drop function if exists recurring_quest_due(text, text, date, date);
create or replace function recurring_quest_due(
  p_recurrence text,
  p_status text,
  p_last date,
  p_today date,
  p_week_day int default null
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
    when p_recurrence = 'weekly' and p_week_day between 1 and 7 then
      -- The first chosen weekday strictly after the day it was finished.
      p_today >= p_last + (case when ((p_week_day - extract(isodow from p_last)::int + 7) % 7) = 0 then 7
                                else (p_week_day - extract(isodow from p_last)::int + 7) % 7 end)
    when p_recurrence = 'weekly'   then p_today >= p_last + 7
    else false
  end;
$$;

/*
 * The day a family's weekly chores come back. Null keeps "seven days after it
 * was done". Set by a parent through set_week_reset_day below.
 */
alter table families add column if not exists week_resets_on smallint
  check (week_resets_on between 1 and 7);

create or replace function set_week_reset_day(p_day int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family uuid := current_family_id();
begin
  if v_family is null or not is_parent() then
    return jsonb_build_object('ok', false, 'reason', 'not_parent');
  end if;
  if p_day is not null and (p_day < 1 or p_day > 7) then
    return jsonb_build_object('ok', false, 'reason', 'bad_day');
  end if;
  update families set week_resets_on = p_day where id = v_family;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function set_week_reset_day(int) from public;
grant execute on function set_week_reset_day(int) to authenticated;

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
drop function if exists reset_due_recurring_quests();
create or replace function reset_due_recurring_quests(p_tz text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_today  date;
  v_tz     text;
  v_ids    uuid[];
begin
  if v_family is null then return jsonb_build_object('ok', false, 'reason', 'no_family'); end if;

  /*
   * "Today" where the family is, not in UTC.
   *
   * This used current_date, which is UTC. The phone reopens a daily chore on
   * its own local day, so for a family east of UTC (Sydney: every morning
   * until 11:00) the phone showed the chore open, the child did it, and the
   * server refused the submission because by its clock the day had not
   * turned. The work vanished.
   *
   * The phone says which zone it is in. Any real zone is within a day of
   * UTC, so the worst a changed setting can do is move a chore's day by one,
   * and last_reset_on still lets it come back only once per day.
   */
  v_tz := coalesce(nullif(p_tz, ''), (select timezone from families where id = v_family), 'UTC');
  begin
    v_today := (now() at time zone v_tz)::date;
  exception when others then
    -- Not a zone Postgres knows. (Looking it up in pg_timezone_names first
    -- read the whole time zone database on every call.)
    v_tz := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
  end;

  /*
   * The day it was finished is the family's day, not the server's. A bare
   * completed_at::date is the UTC date, so a chore approved on a Los Angeles
   * evening counted as done "tomorrow" and then skipped the next day.
   *
   * And it is the later of that and the day it last came back: a daily chore
   * that came back on Monday but was only done on Wednesday came straight
   * back again on Wednesday, so it could be done and paid twice in one day.
   */
  with due as (
    select q.id from quests q
     where q.family_id = v_family
       and recurring_quest_due(q.recurrence, q.status,
                               greatest(q.last_reset_on, (q.completed_at at time zone v_tz)::date),
                               v_today,
                               (select week_resets_on from families where id = v_family))
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

grant execute on function reset_due_recurring_quests(text) to authenticated;
revoke execute on function recurring_quest_due(text, text, date, date, int) from public;

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
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id and role = 'parent') then
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
         -- A hue is an angle on the colour wheel.
         avatar_hue    = coalesce(((p_avatar_hue % 360) + 360) % 360, avatar_hue)
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
-- Gained p_tz, the phone's time zone: see family_today.
drop function if exists use_streak_freeze(uuid);
create or replace function use_streak_freeze(p_kid_id uuid, p_tz text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid kids;
  v_day date;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;

  -- NULL-safe: see claim_login_bonus.
  if not exists (select 1 from kids k where k.id = p_kid_id and k.user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id and role = 'parent') then
    raise exception 'not allowed';
  end if;

  if v_kid.streak_freezes < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no_tokens');
  end if;
  -- Already counted for today. Spending a token would buy nothing, and two
  -- taps on a slow connection must not cost two.
  v_day := family_today(v_kid.family_id, p_tz);
  if v_kid.streak_last_day >= v_day then
    return jsonb_build_object('ok', false, 'reason', 'already_safe');
  end if;

  update kids
     set streak_freezes = streak_freezes - 1,
         streak_last_day = v_day
   where id = p_kid_id;

  return jsonb_build_object('ok', true, 'freezes_left', v_kid.streak_freezes - 1);
end $$;

grant execute on function use_streak_freeze(uuid, text) to authenticated;

/** Spending currency on a reward. Checks the balance where it cannot be faked. */
create or replace function redeem_reward(p_redemption_id uuid, p_reward_id uuid, p_kid_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid kids;
  v_reward rewards;
begin
  -- The child's row is locked first and held to the end, so two phones
  -- spending the same coins at once take turns: the second sees what the
  -- first left, and is refused if that is not enough.
  select * into v_kid from kids where id = p_kid_id for update;
  if v_kid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- NULL-safe. `v_kid.user_id is distinct from auth.uid()` is FALSE when both
  -- sides are null — and both are null for a child profile that was never
  -- paired to a phone, called with no bearer token at all. So the guard passed
  -- for an anonymous caller and this security-definer function moved the
  -- child's balance anyway. A profile with no device must be the hardest to
  -- touch, not the easiest.
  if not exists (select 1 from kids k where k.id = p_kid_id and k.user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id and role = 'parent') then
    raise exception 'not allowed';
  end if;
  -- Sent again because the phone never heard back: the redemption id is the
  -- request id. Charging first and then inserting "on conflict do nothing"
  -- took the coins a second time and recorded one redemption.
  --
  -- Asked before whether the reward still exists. A purchase that landed,
  -- whose answer was lost, and whose reward a parent then deleted, used to be
  -- answered "not found" on the retry: the phone gave the child their coins
  -- back on screen and said so, while the server had (rightly) kept them.
  if exists (select 1 from redemptions where id = p_redemption_id) then
    if exists (select 1 from redemptions where id = p_redemption_id and kid_id = p_kid_id) then
      return jsonb_build_object('ok', true, 'repeat', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_reward from rewards where id = p_reward_id;
  -- Deleted by a parent while this purchase was on its way (a child buying
  -- offline, say). Nothing is charged, and the phone is told why.
  if v_reward is null then
    return jsonb_build_object('ok', false, 'reason', 'reward_gone');
  end if;
  -- A reward from another family would otherwise set the price here.
  if v_reward.family_id is distinct from v_kid.family_id then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
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
drop function if exists apply_currency_tax(uuid, int);
create or replace function apply_currency_tax(p_kid_id uuid, p_percent int, p_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kid kids;
  v_taken int;
  v_prior jsonb;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;
  if not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id and role = 'parent') then
    raise exception 'only a parent in this family can apply a tax';
  end if;
  v_prior := rpc_receipt(p_request_id, p_kid_id);
  if v_prior is not null then return v_prior; end if;

  v_taken := floor(v_kid.coins * greatest(1, least(p_percent, 100)) / 100.0);
  update kids set coins = coins - v_taken where id = p_kid_id;
  return keep_rpc_receipt(p_request_id, p_kid_id, 'apply_currency_tax',
                          jsonb_build_object('ok', true, 'amount', v_taken));
end $$;

grant execute on function submit_quest(uuid, uuid, uuid, jsonb) to anon, authenticated;
grant execute on function reject_submission(uuid, text) to authenticated;
grant execute on function claim_login_bonus(uuid, int, text) to anon, authenticated;
grant execute on function redeem_reward(uuid, uuid, uuid) to anon, authenticated;
grant execute on function apply_currency_tax(uuid, int, uuid) to authenticated;

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
  -- A child's device is not a parent. Without this a child could start a
  -- family of their own and become its parent, with a fresh Elite trial.
  if exists (select 1 from kids where user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'child_device');
  end if;
  if exists (select 1 from parents where user_id = auth.uid()) then
    return jsonb_build_object(
      'ok', false, 'reason', 'already_in_family',
      'family_id', (select family_id from parents where user_id = auth.uid()));
  end if;

  -- Held to the columns' limits (see the end of schema.sql) rather than
  -- refused: a long name should not stop a family being made.
  insert into families (name) values (coalesce(nullif(left(trim(p_family_name), 100), ''), 'My family'))
  returning * into v_family;

  insert into parents (user_id, family_id, name)
  values (auth.uid(), v_family.id, coalesce(nullif(left(trim(p_parent_name), 100), ''), 'Parent'));

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

/**
 * A parent handing over a reward.
 *
 * "Mark given" used to change only the phone it was tapped on. Redemptions are
 * written by functions, never by a device directly, so nothing carried it to
 * the server: the next pull put it back to "requested" on that phone, and every
 * other device kept showing the reward as owed. Parent only; supporters watch.
 */
create or replace function mark_redemption_given(p_redemption_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family uuid := current_family_id();
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can mark a reward as given';
  end if;
  update redemptions
     set status = 'given', given_at = coalesce(given_at, now())
   where id = p_redemption_id and family_id = v_family;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function mark_redemption_given(uuid) to authenticated;

/**
 * Cut a child's phone off.
 *
 * "Unlink" said it removed the device's access and did not: it changed a field
 * on the parent's own phone, and the child's phone (or a lost one) kept reading
 * and writing as the child. Access comes from kids.user_id, so this clears it.
 * Pairing again gives the new phone its own identity.
 */
create or replace function unlink_kid_device(p_kid_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family uuid := current_family_id();
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can unlink a device';
  end if;
  update kids set user_id = null where id = p_kid_id and family_id = v_family;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_such_kid');
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function unlink_kid_device(uuid) to authenticated;
