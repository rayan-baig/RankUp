-- ---------------------------------------------------------------------------
-- The scheduled jobs do what docs/LAUNCH.md says, and nothing else.
--
--   retention   deletes exactly the categories LAUNCH.md lists, older than
--               their limits, and does not touch one other row anywhere: every
--               other table is fingerprinted before and after, generated from
--               the catalogue, so a table added later is covered too.
--   reminders   fire at the family's local time on both sides of a clock
--               change (US autumn and spring, and a time the spring change
--               skips), once a day.
--   digest      goes out in each family's own Sunday evening, wherever it is,
--               and once: a second run, or two runs at once, cannot send it
--               twice.
--   push        a phone the push service has given up on is deleted, not kept.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('34a00000-0000-4000-8000-0000000000a1', 't34-parent@example.com'),
  ('34a00000-0000-4000-8000-0000000000a2', 't34-ny@example.com'),
  ('34a00000-0000-4000-8000-0000000000a3', 't34-la@example.com'),
  ('34a00000-0000-4000-8000-0000000000a4', 't34-london@example.com'),
  ('34a00000-0000-4000-8000-0000000000a5', 't34-tokyo@example.com');
insert into families (id, name, tier, timezone) values
  ('34a00000-0000-4000-8000-00000000000f', 'T34 Retention', 'elite', 'UTC'),
  ('34a00000-0000-4000-8000-0000000000f2', 'T34 New York', 'elite', 'America/New_York'),
  ('34a00000-0000-4000-8000-0000000000f3', 'T34 Los Angeles', 'elite', 'America/Los_Angeles'),
  ('34a00000-0000-4000-8000-0000000000f4', 'T34 London', 'elite', 'Europe/London'),
  ('34a00000-0000-4000-8000-0000000000f5', 'T34 Tokyo', 'elite', 'Asia/Tokyo');
insert into parents (user_id, family_id, name) values
  ('34a00000-0000-4000-8000-0000000000a1', '34a00000-0000-4000-8000-00000000000f', 'Rae'),
  ('34a00000-0000-4000-8000-0000000000a2', '34a00000-0000-4000-8000-0000000000f2', 'Nia'),
  ('34a00000-0000-4000-8000-0000000000a3', '34a00000-0000-4000-8000-0000000000f3', 'Lou'),
  ('34a00000-0000-4000-8000-0000000000a4', '34a00000-0000-4000-8000-0000000000f4', 'Len'),
  ('34a00000-0000-4000-8000-0000000000a5', '34a00000-0000-4000-8000-0000000000f5', 'Toki');
select seed_consent(f, u) from (values
  ('34a00000-0000-4000-8000-00000000000f'::uuid, '34a00000-0000-4000-8000-0000000000a1'::uuid),
  ('34a00000-0000-4000-8000-0000000000f2', '34a00000-0000-4000-8000-0000000000a2'),
  ('34a00000-0000-4000-8000-0000000000f3', '34a00000-0000-4000-8000-0000000000a3'),
  ('34a00000-0000-4000-8000-0000000000f4', '34a00000-0000-4000-8000-0000000000a4'),
  ('34a00000-0000-4000-8000-0000000000f5', '34a00000-0000-4000-8000-0000000000a5')) v(f, u);
insert into kids (id, family_id, name) values
  ('34a00000-0000-4000-8000-00000000000c', '34a00000-0000-4000-8000-00000000000f', 'Reed'),
  ('34a00000-0000-4000-8000-0000000000c3', '34a00000-0000-4000-8000-0000000000f3', 'Lark'),
  ('34a00000-0000-4000-8000-0000000000c4', '34a00000-0000-4000-8000-0000000000f4', 'Lyle'),
  ('34a00000-0000-4000-8000-0000000000c5', '34a00000-0000-4000-8000-0000000000f5', 'Tomo');
insert into quests (id, family_id, kid_id, title) values
  ('34a00000-0000-4000-8000-0000000000e1', '34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-00000000000c', 'Bins'),
  ('34a00000-0000-4000-8000-0000000000e3', '34a00000-0000-4000-8000-0000000000f3', '34a00000-0000-4000-8000-0000000000c3', 'Bins'),
  ('34a00000-0000-4000-8000-0000000000e4', '34a00000-0000-4000-8000-0000000000f4', '34a00000-0000-4000-8000-0000000000c4', 'Bins'),
  ('34a00000-0000-4000-8000-0000000000e5', '34a00000-0000-4000-8000-0000000000f5', '34a00000-0000-4000-8000-0000000000c5', 'Bins');

-- ===========================================================================
-- Retention
-- ===========================================================================

-- One of each thing the job may delete, old enough to go, and one just young
-- enough to stay.
insert into submissions (id, family_id, quest_id, kid_id, status, submitted_at, photo_data) values
  ('34a00000-0000-4000-8000-0000000000d1', '34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-0000000000e1',
   '34a00000-0000-4000-8000-00000000000c', 'pending', now() - interval '15 days', 'data:image/jpeg;base64,OLD'),
  ('34a00000-0000-4000-8000-0000000000d2', '34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-0000000000e1',
   '34a00000-0000-4000-8000-00000000000c', 'pending', now() - interval '13 days', 'data:image/jpeg;base64,NEW');
insert into events (family_id, kid_id, type, created_at) values
  ('34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-00000000000c', 'quest_approved', now() - interval '91 days'),
  ('34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-00000000000c', 'quest_approved', now() - interval '89 days');
insert into crash_reports (family_id, where_at, message, created_at) values
  ('34a00000-0000-4000-8000-00000000000f', 'T34', 'old', now() - interval '91 days'),
  ('34a00000-0000-4000-8000-00000000000f', 'T34', 'new', now() - interval '89 days');
insert into pairing_codes (code, kid_name, expires_at) values
  ('934001', 'Old', now() - interval '3 days'),
  ('934002', 'New', now() - interval '1 day');
insert into pairing_claim_attempts (user_id, tried_at) values
  ('34a00000-0000-4000-8000-0000000000a1', now() - interval '3 days'),
  ('34a00000-0000-4000-8000-0000000000a1', now() - interval '1 day');
insert into rpc_receipts (id, kid_id, fn, result, created_at) values
  (gen_random_uuid(), '34a00000-0000-4000-8000-00000000000c', 'T34', '{}', now() - interval '31 days'),
  (gen_random_uuid(), '34a00000-0000-4000-8000-00000000000c', 'T34', '{}', now() - interval '29 days');
insert into billing_cancellations (family_key, stripe_customer_id, stripe_subscription_id, queued_at, done_at) values
  ('t34-done-long-ago', 'cus_t34a', 'sub_t34a', now() - interval '40 days', now() - interval '31 days'),
  ('t34-done-lately',   'cus_t34b', 'sub_t34b', now() - interval '40 days', now() - interval '29 days'),
  ('t34-nothing-to-do', null, null, now() - interval '8 days', now() - interval '8 days'),
  ('t34-still-waiting', 'cus_t34c', 'sub_t34c', now() - interval '400 days', null);

/*
 * Every table, fingerprinted without the rows the job may delete (and, for
 * submissions, without the photo column it may clear: an older version kept
 * photos, RankUp keeps none). Generated from the catalogue, so a table added
 * later is covered too. Run before and after; they must match exactly.
 *
 * The sync revision of a submission is left out too: clearing a photo bumps
 * it, and that is checked on its own.
 *
 * What the job may delete is exactly the list in docs/LAUNCH.md ("Retention
 * keeps the database small"), with the limits api/run-retention.js passes by
 * default (14, 90, 2) and the fixed ones inside run_retention.
 */
create or replace function t34_kept(p_goes jsonb) returns jsonb language plpgsql as $$
declare t record; v_cols text; v_hash text; v_out jsonb := '{}';
begin
  for t in select c.oid::regclass as rel, c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by c.relname
  loop
    select string_agg(format('x.%I', attname), ', ' order by attnum) into v_cols
      from pg_attribute
     where attrelid = t.rel and attnum > 0 and not attisdropped
       and not (t.relname = 'submissions' and attname in ('photo_data', 'photo_deleted_at', 'rev'));
    execute format('select md5(coalesce(string_agg(r::text, ''|'' order by r::text), '''')) from (select %s from %s x where %s) r',
                   v_cols, t.rel, coalesce('not (' || (p_goes ->> t.relname) || ')', 'true')) into v_hash;
    v_out := v_out || jsonb_build_object(t.relname, v_hash);
  end loop;
  return v_out;
end $$;

do $$
declare
  v_goes jsonb := jsonb_build_object(
    'events',                 'x.created_at < now() - interval ''90 days''',
    'crash_reports',          'x.created_at < now() - interval ''90 days''',
    'pairing_codes',          'x.expires_at < now() - interval ''2 days''',
    'pairing_claim_attempts', 'x.tried_at < now() - interval ''2 days''',
    'rpc_receipts',           'x.created_at < now() - interval ''30 days''',
    'billing_cancellations',  'x.done_at is not null and (x.done_at < now() - interval ''30 days'' or (x.stripe_customer_id is null and x.stripe_subscription_id is null and x.queued_at < now() - interval ''7 days''))');
  k text;
  v_before jsonb;
  v_after jsonb;
  v_n bigint;
  v_changed text[] := '{}';
  v_left text[] := '{}';
  v_vacuous text[] := '{}';
  v_photos_before jsonb;
begin
  -- Each category has something to delete, or this proves nothing.
  for k in select jsonb_object_keys(v_goes) loop
    execute format('select count(*) from %I x where %s', k, v_goes ->> k) into v_n;
    if v_n = 0 then v_vacuous := v_vacuous || k; end if;
  end loop;
  perform ok('(there is something old in every category the job deletes)', cardinality(v_vacuous) = 0,
             array_to_string(v_vacuous, ', '));

  v_before := t34_kept(v_goes);
  -- Clearing a photo bumps that submission's sync revision (so phones hear of
  -- it); no other submission's may move.
  create temp table t34_revs on commit drop as
    select id, rev, (photo_data is not null and submitted_at < now() - interval '14 days') as purged from submissions;
  select jsonb_object_agg(id, photo_data) into v_photos_before
    from submissions where photo_data is not null and submitted_at >= now() - interval '14 days';

  perform run_retention(14, 90, 2);

  v_after := t34_kept(v_goes);
  for k in select jsonb_object_keys(v_before) loop
    if v_before ->> k is distinct from v_after ->> k then v_changed := v_changed || k; end if;
  end loop;
  perform ok('retention changes not one row it is not meant to, in any table',
             cardinality(v_changed) = 0, 'changed: ' || array_to_string(v_changed, ', '));

  for k in select jsonb_object_keys(v_goes) loop
    execute format('select count(*) from %I x where %s', k, v_goes ->> k) into v_n;
    if v_n > 0 then v_left := v_left || k; end if;
  end loop;
  perform ok('and deletes everything in each category that is past its limit',
             cardinality(v_left) = 0, 'still there: ' || array_to_string(v_left, ', '));

  perform ok('no submission but those whose photo was cleared has changed',
    not exists (select 1 from t34_revs r join submissions s using (id) where s.rev <> r.rev and not r.purged));
  perform ok('an old photo left by an older version is cleared, the submission kept',
    (select photo_data is null from submissions where id = '34a00000-0000-4000-8000-0000000000d1'));
  perform ok('and one younger than the limit is not',
    (select jsonb_object_agg(id, photo_data) from submissions
      where photo_data is not null and submitted_at >= now() - interval '14 days') = v_photos_before);
  perform ok('a Stripe cancellation still waiting is kept however old it is',
    exists (select 1 from billing_cancellations where family_key = 't34-still-waiting'));
end $$;

drop function t34_kept(jsonb);

-- ===========================================================================
-- Reminders, across a clock change
-- ===========================================================================

insert into reminder_schedules (id, family_id, role, label, at_local, timezone) values
  -- Six in the evening in New York.
  ('34a00000-0000-4000-8000-0000000000b1', '34a00000-0000-4000-8000-0000000000f2', 'parent', 'T34 evening', '18:00', 'America/New_York'),
  -- Half past two, which the spring change skips altogether.
  ('34a00000-0000-4000-8000-0000000000b2', '34a00000-0000-4000-8000-0000000000f2', 'parent', 'T34 skipped', '02:30', 'America/New_York'),
  -- Six in the evening in London, whose clocks change a week earlier.
  ('34a00000-0000-4000-8000-0000000000b3', '34a00000-0000-4000-8000-0000000000f4', 'parent', 'T34 london', '18:00', 'Europe/London');

create or replace function t34_due(p_now timestamptz, p_id uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(due_reminders_at(p_now, 120)->'reminders') r
                  where (r->>'id')::uuid = p_id);
$$;

do $$
declare ny uuid := '34a00000-0000-4000-8000-0000000000b1';
        skipped uuid := '34a00000-0000-4000-8000-0000000000b2';
        london uuid := '34a00000-0000-4000-8000-0000000000b3';
begin
  -- Saturday 31 October 2026: New York is on summer time, UTC-4. 18:00 there
  -- is 22:00 UTC.
  perform ok('Saturday before the clocks go back: not due at 17:55 New York time',
    not t34_due('2026-10-31 21:55+00', ny));
  perform ok('due at 18:05 New York time', t34_due('2026-10-31 22:05+00', ny));
  perform mark_reminder_sent_at(ny, '2026-10-31 22:05+00');
  perform ok('and once sent, not due again that evening', not t34_due('2026-10-31 23:30+00', ny));

  -- Sunday 1 November: the clocks went back at 02:00. UTC-5 now, so 18:00 is
  -- 23:00 UTC. A schedule kept in UTC would fire at 17:00 local.
  perform ok('the day the clocks go back: NOT due at 22:05 UTC, which is now 17:05 there',
    not t34_due('2026-11-01 22:05+00', ny));
  perform ok('due at 23:05 UTC, which is 18:05 there', t34_due('2026-11-01 23:05+00', ny));
  perform mark_reminder_sent_at(ny, '2026-11-01 23:05+00');
  perform ok('and sent once', not t34_due('2026-11-02 00:30+00', ny));

  -- London went back a week earlier (25 October): GMT, UTC+0.
  perform ok('London, after its own change: due at 18:05 GMT',
    t34_due('2026-11-01 18:05+00', london) and not t34_due('2026-11-01 17:05+00', london));

  -- Sunday 14 March 2027: New York jumps from 02:00 to 03:00 (UTC-4 again).
  perform ok('the day the clocks go forward: due at 22:05 UTC, which is 18:05 there',
    t34_due('2027-03-14 22:05+00', ny) and not t34_due('2027-03-14 21:55+00', ny));
  -- 02:30 never happens that night. 03:05 local is 07:05 UTC.
  perform ok('a reminder set for a time the change skips still comes, just after it',
    t34_due('2027-03-14 07:05+00', skipped));
  perform mark_reminder_sent_at(skipped, '2027-03-14 07:05+00');
  perform ok('and only once', not t34_due('2027-03-14 08:30+00', skipped));
end $$;

drop function t34_due(timestamptz, uuid);

-- ===========================================================================
-- The weekly digest
-- ===========================================================================

-- Each family finished a chore on Wednesday 4 November 2026, so each has a
-- week to report on the Sunday after (8 November).
insert into submissions (family_id, quest_id, kid_id, status, decided_at) values
  ('34a00000-0000-4000-8000-0000000000f3', '34a00000-0000-4000-8000-0000000000e3', '34a00000-0000-4000-8000-0000000000c3', 'approved', '2026-11-04 18:00+00'),
  ('34a00000-0000-4000-8000-0000000000f4', '34a00000-0000-4000-8000-0000000000e4', '34a00000-0000-4000-8000-0000000000c4', 'approved', '2026-11-04 18:00+00'),
  ('34a00000-0000-4000-8000-0000000000f5', '34a00000-0000-4000-8000-0000000000e5', '34a00000-0000-4000-8000-0000000000c5', 'approved', '2026-11-04 18:00+00');

create or replace function t34_digests(p_now timestamptz) returns text[] language sql as $$
  select coalesce(array_agg(f.name order by f.name), '{}')
    from jsonb_array_elements(due_digests_at(p_now, 7, 18)->'digests') d
    join families f on f.id = (d->>'family_id')::uuid
   where f.name like 'T34 %';
$$;

do $$
declare v jsonb;
begin
  perform ok('Saturday evening everywhere: nobody is due',
    t34_digests('2026-11-07 20:00+00') = '{}');

  -- 09:30 UTC on Sunday is 18:30 in Tokyo, 09:30 in London, 01:30 in LA.
  perform ok('Sunday 09:30 UTC: only Tokyo, where it is half past six in the evening',
    t34_digests('2026-11-08 09:30+00') = array['T34 Tokyo'], t34_digests('2026-11-08 09:30+00')::text);
  perform ok('17:59 in London is not yet the evening',
    not ('T34 London' = any (t34_digests('2026-11-08 17:59+00'))));

  -- The job claims each family's week before it sends.
  v := due_digests_at('2026-11-08 09:30+00', 7, 18)->'digests';
  perform ok('the first run to claim Tokyo''s week gets it',
    claim_digest('34a00000-0000-4000-8000-0000000000f5', (select d->>'week_key' from jsonb_array_elements(v) d
                   where d->>'family_id' = '34a00000-0000-4000-8000-0000000000f5')));
  perform ok('and a second run at the same moment does not',
    not claim_digest('34a00000-0000-4000-8000-0000000000f5', (select d->>'week_key' from jsonb_array_elements(v) d
                       where d->>'family_id' = '34a00000-0000-4000-8000-0000000000f5')));

  -- 18:30 UTC: London's evening. Tokyo has been sent; it is Monday there.
  perform ok('Sunday 18:30 UTC: London, and Tokyo is not sent again',
    t34_digests('2026-11-08 18:30+00') = array['T34 London'], t34_digests('2026-11-08 18:30+00')::text);
  perform claim_digest('34a00000-0000-4000-8000-0000000000f4', '2026-W45');
  perform ok('once London''s is claimed, the hourly runs that follow send nothing more there',
    not ('T34 London' = any (t34_digests('2026-11-08 19:30+00')))
    and not ('T34 London' = any (t34_digests('2026-11-08 22:30+00'))));

  -- 02:30 UTC on Monday is 18:30 on Sunday in Los Angeles (UTC-8 in November).
  perform ok('Monday 02:30 UTC is still Sunday evening in Los Angeles, and it is due there',
    t34_digests('2026-11-09 02:30+00') = array['T34 Los Angeles'], t34_digests('2026-11-09 02:30+00')::text);
end $$;

drop function t34_digests(timestamptz);

-- The job claims before it sends: two runs that overlap cannot both send.
do $$ begin
  perform ok('claim_digest is the server''s, not a browser''s',
    not has_function_privilege('authenticated', 'claim_digest(uuid,text)', 'execute')
    and not has_function_privilege('anon', 'claim_digest(uuid,text)', 'execute'));
end $$;

-- ===========================================================================
-- Push: a phone the push service has given up on is deleted
-- ===========================================================================

insert into push_subscriptions (endpoint, keys, family_id, user_id, role) values
  ('https://push.example/t34-gone',    '{}', '34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-0000000000a1', 'parent'),
  ('https://push.example/t34-refused', '{}', '34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-0000000000a1', 'parent'),
  ('https://push.example/t34-twice',   '{}', '34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-0000000000a1', 'parent');

do $$ begin
  perform record_push_failure('https://push.example/t34-gone', true);
  perform ok('a phone the push service says is gone (404/410) is deleted at once',
    not exists (select 1 from push_subscriptions where endpoint = 'https://push.example/t34-gone'));

  perform record_push_failure('https://push.example/t34-refused', false) from generate_series(1, 4);
  perform ok('four refusals: still kept, in case it recovers',
    exists (select 1 from push_subscriptions where endpoint = 'https://push.example/t34-refused'));
  perform record_push_failure('https://push.example/t34-refused', false);
  perform ok('the fifth: deleted, not kept for ever holding a way to buzz a phone',
    not exists (select 1 from push_subscriptions where endpoint = 'https://push.example/t34-refused'));

  perform record_push_failure('https://push.example/t34-twice', false) from generate_series(1, 2);
  perform ok('and a phone with a couple of failures is still sent to',
    exists (select 1 from push_targets('34a00000-0000-4000-8000-00000000000f', 'parent')
             where endpoint = 'https://push.example/t34-twice'));
end $$;

-- The family's hourly cap is counted against the family, whichever device
-- asks: claim_push_send takes nothing else. tests/push.mjs drives it from
-- several phones through the real endpoint.
do $$
declare v_allowed int := 0; i int;
begin
  delete from push_sends where family_id = '34a00000-0000-4000-8000-00000000000f';
  for i in 1 .. 70 loop
    if claim_push_send('34a00000-0000-4000-8000-00000000000f') then v_allowed := v_allowed + 1; end if;
  end loop;
  perform ok('sixty notices an hour for a family, and no more', v_allowed = 60, v_allowed::text);
  perform ok('counted by family alone: the function is told nothing about the device',
    (select pronargs from pg_proc where oid = 'claim_push_send(uuid,integer)'::regprocedure) = 2
    and (select proargnames[1] from pg_proc where oid = 'claim_push_send(uuid,integer)'::regprocedure) = 'p_family_id');
end $$;
