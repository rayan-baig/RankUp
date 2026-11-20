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
-- Submissions are never deleted by retention, old or new.
insert into submissions (id, family_id, quest_id, kid_id, status, submitted_at) values
  ('34a00000-0000-4000-8000-0000000000d1', '34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-0000000000e1',
   '34a00000-0000-4000-8000-00000000000c', 'pending', now() - interval '400 days'),
  ('34a00000-0000-4000-8000-0000000000d2', '34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-0000000000e1',
   '34a00000-0000-4000-8000-00000000000c', 'pending', now() - interval '13 days');
insert into events (family_id, kid_id, type, created_at) values
  ('34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-00000000000c', 'quest_approved', now() - interval '91 days'),
  ('34a00000-0000-4000-8000-00000000000f', '34a00000-0000-4000-8000-00000000000c', 'quest_approved', now() - interval '89 days');
insert into crash_reports (family_id, where_at, message, created_at) values
  ('34a00000-0000-4000-8000-00000000000f', 'T34', 'old', now() - interval '91 days'),
  ('34a00000-0000-4000-8000-00000000000f', 'T34', 'new', now() - interval '89 days');
insert into server_errors (where_at, message, created_at) values
  ('t34', 'old', now() - interval '91 days'),
  ('t34', 'new', now() - interval '89 days');
insert into error_report_kinds (fingerprint, first_seen_at, last_reported_at) values
  ('t34-old', now() - interval '200 days', now() - interval '91 days'),
  ('t34-never-sent', now() - interval '91 days', null),
  ('t34-new', now() - interval '200 days', now() - interval '89 days');
insert into error_report_sends (claimed_at, sent_at) values
  (now() - interval '3 days', now() - interval '3 days'),
  (now() - interval '1 day', now() - interval '1 day');
insert into usage_daily (day, metric, shard, n) values
  ((now() at time zone 'utc')::date - 401, 'help_views', 0, 1),
  ((now() at time zone 'utc')::date - 399, 'help_views', 0, 1);
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
-- Gifts (billing.sql): a checkout never paid for, 15 days and 13 days old;
-- a paid one whose recipient details and buyer email are past their day,
-- and one still inside both; codes typed 3 days and 1 day ago.
insert into gift_orders (id, plan, delivery, created_at) values
  ('34a00000-0000-4000-8000-0000000009a1', 'elite', 'email', now() - interval '15 days'),
  ('34a00000-0000-4000-8000-0000000009a2', 'elite', 'email', now() - interval '13 days');
insert into gift_orders (id, plan, delivery, created_at, paid_at, stripe_session, code_hash, expires_at) values
  ('34a00000-0000-4000-8000-0000000009a3', 'standard', 'email', now() - interval '800 days', now() - interval '800 days',
   'cs_t34_old', encode(sha256('t34-old'::bytea), 'hex'), now() - interval '70 days'),
  ('34a00000-0000-4000-8000-0000000009a4', 'standard', 'self', now() - interval '20 days', now() - interval '20 days',
   'cs_t34_new', encode(sha256('t34-new'::bytea), 'hex'), now() + interval '710 days');
insert into gift_buyers (order_id, email, created_at, keep_until) values
  ('34a00000-0000-4000-8000-0000000009a1', 'buyer-unpaid-old@example.com', now() - interval '15 days', null),
  ('34a00000-0000-4000-8000-0000000009a2', 'buyer-unpaid-new@example.com', now() - interval '13 days', null),
  ('34a00000-0000-4000-8000-0000000009a3', 'buyer-old@example.com', now() - interval '800 days', now() - interval '70 days'),
  ('34a00000-0000-4000-8000-0000000009a4', 'buyer-new@example.com', now() - interval '20 days', now() + interval '710 days');
insert into gift_recipients (order_id, to_name, to_email, message, created_at, keep_until) values
  ('34a00000-0000-4000-8000-0000000009a1', 'Old', 'to-unpaid-old@example.com', 'Hi', now() - interval '15 days', null),
  ('34a00000-0000-4000-8000-0000000009a2', 'New', 'to-unpaid-new@example.com', 'Hi', now() - interval '13 days', null),
  ('34a00000-0000-4000-8000-0000000009a3', 'Old', 'to-old@example.com', 'Hi', now() - interval '800 days', now() - interval '770 days'),
  ('34a00000-0000-4000-8000-0000000009a4', 'New', 'to-new@example.com', 'Hi', now() - interval '20 days', now() + interval '10 days');
insert into gift_redeem_attempts (family_id, ip_key, tried_at) values
  ('34a00000-0000-4000-8000-00000000000f', 't34', now() - interval '3 days'),
  ('34a00000-0000-4000-8000-00000000000f', 't34', now() - interval '1 day');
insert into gift_checkout_attempts (ip_key, tried_at) values ('t34', now() - interval '3 days'), ('t34', now() - interval '1 day');
-- Pauses (billing.sql): one over 91 days ago, one ended early 91 days ago,
-- one over 89 days ago, and one still running.
insert into plan_pauses (family_id, months, started_at, resumes_at, ended_at) values
  ('34a00000-0000-4000-8000-00000000000f', 1, now() - interval '121 days', now() - interval '91 days', null),
  ('34a00000-0000-4000-8000-00000000000f', 3, now() - interval '100 days', now() + interval '20 days', now() - interval '91 days'),
  ('34a00000-0000-4000-8000-00000000000f', 1, now() - interval '119 days', now() - interval '89 days', null),
  ('34a00000-0000-4000-8000-00000000000f', 2, now() - interval '10 days', now() + interval '50 days', null);
-- Pilots (schools.sql): a code nobody used, 91 days and 89 days after it
-- could last be used; a pilot that ended 366 days ago and one 300 days ago;
-- codes typed wrong 3 days and 1 day ago.
insert into schools (id, name, district, district_key, student_count, size_band) values
  ('34a00000-0000-4000-8000-0000000005c1', 'T34 School', 'T34 District', 't34 district', 100, 'small'),
  ('34a00000-0000-4000-8000-0000000005c2', 'T34 Other School', 'T34 District', 't34 district', 100, 'small');
insert into school_pilots (code_hash, label, days, code_expires_at, created_at, school_id, redeemed_at, ends_at) values
  (encode(sha256('t34-p1'::bytea), 'hex'), 'T34 unused old', 90, now() - interval '91 days', now() - interval '150 days', null, null, null),
  (encode(sha256('t34-p2'::bytea), 'hex'), 'T34 unused new', 90, now() - interval '89 days', now() - interval '150 days', null, null, null),
  (encode(sha256('t34-p3'::bytea), 'hex'), 'T34 ended old', 90, now() - interval '400 days', now() - interval '500 days',
   '34a00000-0000-4000-8000-0000000005c1', now() - interval '456 days', now() - interval '366 days'),
  (encode(sha256('t34-p4'::bytea), 'hex'), 'T34 ended new', 90, now() - interval '350 days', now() - interval '400 days',
   '34a00000-0000-4000-8000-0000000005c2', now() - interval '390 days', now() - interval '300 days');
insert into school_pilot_attempts (user_id, tried_at) values
  ('34a00000-0000-4000-8000-0000000000a1', now() - interval '3 days'),
  ('34a00000-0000-4000-8000-0000000000a1', now() - interval '1 day');

/*
 * Every table, fingerprinted without the rows the job may delete. Generated
 * from the catalogue, so a table added later is covered too. Run before and
 * after; they must match exactly, column for column (sync revisions too).
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
       ;
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
    'server_errors',          'x.created_at < now() - interval ''90 days''',
    'error_report_kinds',     'coalesce(x.last_reported_at, x.first_seen_at) < now() - interval ''90 days''',
    'error_report_sends',     'x.claimed_at < now() - interval ''2 days''',
    'usage_daily',            'x.day < (now() at time zone ''utc'')::date - 400',
    'gift_orders',            'x.paid_at is null and x.created_at < now() - interval ''14 days''',
    'gift_buyers',            'x.keep_until < now() or exists (select 1 from gift_orders o where o.id = x.order_id and o.paid_at is null and o.created_at < now() - interval ''14 days'')',
    'gift_recipients',        'x.keep_until < now() or exists (select 1 from gift_orders o where o.id = x.order_id and o.paid_at is null and o.created_at < now() - interval ''14 days'')',
    'gift_redeem_attempts',   'x.tried_at < now() - interval ''2 days''',
    'gift_checkout_attempts', 'x.tried_at < now() - interval ''2 days''',
    'plan_pauses',            'coalesce(x.ended_at, x.resumes_at) < now() - interval ''90 days''',
    'school_pilots',          '(x.redeemed_at is null and x.code_expires_at < now() - interval ''90 days'') or (x.redeemed_at is not null and x.ends_at < now() - interval ''365 days'')',
    'school_pilot_attempts',  'x.tried_at < now() - interval ''2 days''',
    'billing_cancellations',  'x.done_at is not null and (x.done_at < now() - interval ''30 days'' or (x.stripe_customer_id is null and x.stripe_subscription_id is null and x.queued_at < now() - interval ''7 days''))');
  k text;
  v_before jsonb;
  v_after jsonb;
  v_n bigint;
  v_changed text[] := '{}';
  v_left text[] := '{}';
  v_vacuous text[] := '{}';
begin
  -- Each category has something to delete, or this proves nothing.
  for k in select jsonb_object_keys(v_goes) loop
    execute format('select count(*) from %I x where %s', k, v_goes ->> k) into v_n;
    if v_n = 0 then v_vacuous := v_vacuous || k; end if;
  end loop;
  perform ok('(there is something old in every category the job deletes)', cardinality(v_vacuous) = 0,
             array_to_string(v_vacuous, ', '));

  v_before := t34_kept(v_goes);
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

  perform ok('a submission four hundred days old is kept: it is the family''s record',
    exists (select 1 from submissions where id = '34a00000-0000-4000-8000-0000000000d1'));
  perform ok('a gift''s order stays once it was paid for, even when its details have gone: it is the record of the sale',
    exists (select 1 from gift_orders where id = '34a00000-0000-4000-8000-0000000009a3'));
  perform ok('the buyer''s email and the recipient''s details go on their day, and stay until then',
    not exists (select 1 from gift_buyers where order_id = '34a00000-0000-4000-8000-0000000009a3')
    and not exists (select 1 from gift_recipients where order_id = '34a00000-0000-4000-8000-0000000009a3')
    and exists (select 1 from gift_buyers where order_id = '34a00000-0000-4000-8000-0000000009a4')
    and exists (select 1 from gift_recipients where order_id = '34a00000-0000-4000-8000-0000000009a4'));
  perform ok('a gift never paid for goes after 14 days, with what was typed into it',
    not exists (select 1 from gift_orders where id = '34a00000-0000-4000-8000-0000000009a1')
    and not exists (select 1 from gift_buyers where order_id = '34a00000-0000-4000-8000-0000000009a1')
    and exists (select 1 from gift_orders where id = '34a00000-0000-4000-8000-0000000009a2'));
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

-- A quiet family's week is never worked out. Most families are quiet in any
-- given fortnight, and the batched job (claim_due_digests_at) used to work out
-- every due family's whole week before finding it had nothing to say: with
-- 50,000 families one call took 7 seconds (docs/PERFORMANCE.md). At 02:30 UTC
-- on Monday it is Sunday evening in Los Angeles (a chore on Wednesday) and in
-- New York (no chore at all): family_week_digest must run for exactly the
-- families that get a digest. Counted by Postgres itself (track_functions),
-- and undone afterwards so the claims do not reach the tests below.
do $$
declare v jsonb; v_calls bigint;
begin
  set local track_functions = 'pl';
  begin
    v := claim_due_digests_at('2026-11-09 02:30+00', 7, 18, 100000, null, 300)->'digests';
    select coalesce(sum(calls), 0) into v_calls from pg_stat_xact_user_functions where funcname = 'family_week_digest';
    perform ok('the digest job reaches Los Angeles, which had a chore',
      exists (select 1 from jsonb_array_elements(v) d where d->>'family_id' = '34a00000-0000-4000-8000-0000000000f3'));
    perform ok('not New York, which had none',
      not exists (select 1 from jsonb_array_elements(v) d where d->>'family_id' = '34a00000-0000-4000-8000-0000000000f2'));
    perform ok('and works out a week only for the families it sends one to, never a quiet one',
      v_calls = jsonb_array_length(v), format('%s weeks worked out for %s digests', v_calls, jsonb_array_length(v)));
    raise exception 't34_undo';
  exception when raise_exception then
    if sqlerrm <> 't34_undo' then raise; end if;
  end;
end $$;

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

-- The schools the pilot rows above hung on.
delete from schools where id in ('34a00000-0000-4000-8000-0000000005c1', '34a00000-0000-4000-8000-0000000005c2');

-- ===========================================================================
-- The Season autopilot (0.23.0): run_season_autopilot, run daily by pg_cron
-- where it is switched on and by /api/run-retention either way.
-- ===========================================================================
do $$
declare r jsonb; v_today date := (now() at time zone 'utc')::date; v_before text;
begin
  delete from season_plan;
  v_before := (select coalesce(string_agg(id::text, ',' order by id), '') from seasons);
  r := run_season_autopilot(v_today);
  perform ok('the autopilot with no launch day changes nothing', r->>'idle' = 'no_launch_date'
    and (select coalesce(string_agg(id::text, ',' order by id), '') from seasons) = v_before, r::text);
  insert into season_plan (id, launch_on) values (1, v_today + 20);
  r := run_season_autopilot(v_today);
  perform ok('with launch day 20 days away, it makes Season 1, secretly', r->'made' = '[1]'::jsonb
    and (select starts_on from seasons where number = 1) = v_today + 20, r::text);
  r := run_season_autopilot(v_today);
  perform ok('run again the same day: nothing more', r->'made' = '[]'::jsonb and (r->>'moved')::int = 0, r::text);
  perform ok('the job is the server''s alone',
    not has_function_privilege('anon', 'run_season_autopilot(date)', 'execute')
    and not has_function_privilege('authenticated', 'run_season_autopilot(date)', 'execute'));
  delete from season_reminders;
  delete from seasons where number = 1;
  delete from season_plan;
end $$;
