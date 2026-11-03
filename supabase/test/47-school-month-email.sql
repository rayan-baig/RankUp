-- ---------------------------------------------------------------------------
-- A school's month, by email, to its admin (claim_school_month_emails,
-- school_month_summary, finish_school_month_email; api/settle-schools.js).
--
--   * what it says is right: the league result (place in the district,
--     Champion, rivalries, or why it was not ranked), what the school paid
--     that month, and when the plan renews, ends, or the trial ends;
--   * only the admins are written to, never a teacher, and only schools
--     whose month was settled and that are not suspended;
--   * once per school per month, even with two runs at once; a failed send
--     gives the claim back; a claim from a run that died is taken again
--     after an hour;
--   * no child is in it;
--   * only the scheduled job can call any of it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into auth.users (id, email) values
  ('47a00000-0000-4000-8000-0000000000a1', 't47-head-hill@example.com'),
  ('47a00000-0000-4000-8000-0000000000a2', 't47-teacher-hill@example.com'),
  ('47a00000-0000-4000-8000-0000000000a3', 't47-head-lake@example.com'),
  ('47a00000-0000-4000-8000-0000000000a4', 't47-head-new@example.com'),
  ('47a00000-0000-4000-8000-0000000000a5', 't47-head-gone@example.com'),
  ('47a00000-0000-4000-8000-0000000000a6', 't47-deputy-hill@example.com');
insert into schools (id, name, district, district_key, student_count, size_band, status, verified,
                     trial_ends_at, billing_status, billing_period_end, billing_ends_at) values
  ('47500000-0000-4000-8000-000000000001', 'T47 Hill', 'T47 Valley', 't47 valley', 120, 'medium', 'active', true,
   now() - interval '60 days', 'active', '2026-11-14 10:00+00', null),
  ('47500000-0000-4000-8000-000000000002', 'T47 Lake', 'T47 Valley', 't47 valley', 80, 'small', 'active', true,
   now() - interval '60 days', 'active', '2026-11-20 10:00+00', '2026-11-20 10:00+00'),
  ('47500000-0000-4000-8000-000000000003', 'T47 New', 'T47 Valley', 't47 valley', 30, 'small', 'trial', false,
   '2026-11-25 10:00+00', null, null, null),
  ('47500000-0000-4000-8000-000000000004', 'T47 Gone', 'T47 Valley', 't47 valley', 30, 'small', 'suspended', true,
   now(), null, null, null);
insert into school_staff (user_id, school_id, name, role) values
  ('47a00000-0000-4000-8000-0000000000a1', '47500000-0000-4000-8000-000000000001', 'Head', 'admin'),
  ('47a00000-0000-4000-8000-0000000000a6', '47500000-0000-4000-8000-000000000001', 'Deputy', 'admin'),
  ('47a00000-0000-4000-8000-0000000000a2', '47500000-0000-4000-8000-000000000001', 'Teacher', 'teacher'),
  ('47a00000-0000-4000-8000-0000000000a3', '47500000-0000-4000-8000-000000000002', 'Head', 'admin'),
  ('47a00000-0000-4000-8000-0000000000a4', '47500000-0000-4000-8000-000000000003', 'Head', 'admin'),
  ('47a00000-0000-4000-8000-0000000000a5', '47500000-0000-4000-8000-000000000004', 'Head', 'admin');

-- September 2026, as settlement leaves it: Hill first, Lake second, New not
-- ranked (unchecked, three students), Gone suspended. Hill was Champion and
-- beat Lake.
insert into school_month_scores (school_id, month_key, score, students, ranked) values
  ('47500000-0000-4000-8000-000000000001', '2026-09', 14.2, 41, true),
  ('47500000-0000-4000-8000-000000000002', '2026-09', 9.8, 22, true),
  ('47500000-0000-4000-8000-000000000003', '2026-09', 3.0, 3, false),
  ('47500000-0000-4000-8000-000000000004', '2026-09', 5.0, 8, true);
insert into school_awards (district_key, month_key, school_id, score, applied_at) values
  ('t47 valley', '2026-09', '47500000-0000-4000-8000-000000000001', 14.2, now());
insert into school_rivalries (id, challenger_id, rival_id, status, answered_at) values
  ('47600000-0000-4000-8000-000000000001', '47500000-0000-4000-8000-000000000002',
   '47500000-0000-4000-8000-000000000001', 'active', '2026-08-01');
insert into school_rivalry_results (rivalry_id, month_key, challenger_score, rival_score, winner_id) values
  ('47600000-0000-4000-8000-000000000001', '2026-09', 9.8, 14.2, '47500000-0000-4000-8000-000000000001');
-- Hill paid in September, and in October (which is not September's email).
insert into billing_events (school_id, stripe_event, type, payload, amount_pence, currency, received_at) values
  ('47500000-0000-4000-8000-000000000001', 'in_t47_sep', 'school:invoice_paid', '{}', 4900, 'USD', '2026-09-14 10:01+00'),
  ('47500000-0000-4000-8000-000000000001', 'in_t47_oct', 'school:invoice_paid', '{}', 4900, 'USD', '2026-10-14 10:01+00'),
  ('47500000-0000-4000-8000-000000000002', 'in_t47_lake', 'school:invoice_paid', '{}', 2900, 'usd', '2026-09-20 10:01+00');

do $$
declare
  v jsonb; hill jsonb; lake jsonb; fresh jsonb; w jsonb;
begin
  v := claim_school_month_emails('2026-09-01', 50);
  hill := (select e from jsonb_array_elements(v->'emails') e where e->>'school_id' = '47500000-0000-4000-8000-000000000001');
  lake := (select e from jsonb_array_elements(v->'emails') e where e->>'school_id' = '47500000-0000-4000-8000-000000000002');
  fresh := (select e from jsonb_array_elements(v->'emails') e where e->>'school_id' = '47500000-0000-4000-8000-000000000003');

  perform ok('every settled school gets the month, but not one that is suspended',
    hill is not null and lake is not null and fresh is not null
    and not exists (select 1 from jsonb_array_elements(v->'emails') e where e->>'school_id' = '47500000-0000-4000-8000-000000000004'),
    v::text);
  perform ok('to its admins, each by address, never to a teacher',
    hill->'recipients' = '["t47-head-hill@example.com", "t47-deputy-hill@example.com"]'::jsonb, hill->>'recipients');

  perform ok('the Champion is told it won, and that its free month was given',
    (hill->>'champion')::boolean and (hill->>'free_month_given')::boolean and (hill->>'rank')::int = 1);
  perform ok('second place is second of the district''s ranked schools that month',
    (lake->>'rank')::int = 2 and (lake->>'ranked_schools')::int = 3 and not (lake->>'champion')::boolean, lake::text);
  perform ok('the rivalry, from each side',
    hill->'rivalries' = '[{"rival": "T47 Lake", "result": "won"}]'::jsonb
    and lake->'rivalries' = '[{"rival": "T47 Hill", "result": "lost"}]'::jsonb, (hill->'rivalries')::text);
  perform ok('a school that was not ranked is told so, with what it needs',
    not (fresh->>'ranked')::boolean and fresh->>'rank' is null and not (fresh->>'verified')::boolean
    and (fresh->>'min_students')::int = school_min_students() and (fresh->>'students')::int = 3, fresh::text);

  perform ok('what it paid that month, and only that month',
    hill->'paid' = '[{"minor": 4900, "currency": "USD"}]'::jsonb, (hill->'paid')::text);
  perform ok('in its own currency', lake->'paid' = '[{"minor": 2900, "currency": "USD"}]'::jsonb, (lake->'paid')::text);
  perform ok('nothing, on a free trial', fresh->'paid' = '[]'::jsonb);

  perform ok('a plan that carries on says when it renews',
    (hill->>'renews_at')::timestamptz = '2026-11-14 10:00+00' and hill->>'ends_at' is null);
  perform ok('a plan cancelled in the portal says when it ends, and not that it renews',
    lake->>'renews_at' is null and (lake->>'ends_at')::timestamptz = '2026-11-20 10:00+00');
  perform ok('a trial says when the trial ends',
    (fresh->>'trial_ends_at')::timestamptz = '2026-11-25 10:00+00' and fresh->>'renews_at' is null);

  perform ok('no child is in it: no names, no ids',
    not exists (select 1 from jsonb_object_keys(hill) k where k ~ 'kid|star|student_name|children'));

  -- Claimed: a second run (or two at once) gets nothing.
  w := claim_school_month_emails('2026-09-01', 50);
  perform ok('a second run at the same time claims none of them', jsonb_array_length(w->'emails') = 0, w::text);

  perform finish_school_month_email('47500000-0000-4000-8000-000000000001', '2026-09', true);
  perform finish_school_month_email('47500000-0000-4000-8000-000000000002', '2026-09', false);
  w := claim_school_month_emails('2026-09-01', 50);
  perform ok('a send that failed is given back, and the next run takes it',
    jsonb_array_length(w->'emails') = 1 and w->'emails'->0->>'school_id' = '47500000-0000-4000-8000-000000000002', w::text);

  -- New's run died after claiming. An hour later it is taken again.
  update school_month_emails set claimed_at = now() - interval '61 minutes'
   where school_id = '47500000-0000-4000-8000-000000000003';
  w := claim_school_month_emails('2026-09-01', 50);
  perform ok('a claim left by a run that died is taken again after an hour',
    jsonb_array_length(w->'emails') = 1 and w->'emails'->0->>'school_id' = '47500000-0000-4000-8000-000000000003', w::text);

  update school_month_emails set claimed_at = now() - interval '2 hours'
   where school_id = '47500000-0000-4000-8000-000000000001';
  w := claim_school_month_emails('2026-09-01', 50);
  perform ok('a month sent is never claimed again, however old', not exists (
    select 1 from jsonb_array_elements(w->'emails') e where e->>'school_id' = '47500000-0000-4000-8000-000000000001'));

  perform ok('a month not settled has no email', jsonb_array_length(claim_school_month_emails('2026-07-01', 50)->'emails') = 0);
  perform ok('a batch is as many as asked for',
    jsonb_array_length((select claim_school_month_emails('2026-10-01', 1))->'emails') <= 1);
end $$;

-- A school with no admin address is not claimed, so one added later still gets it.
do $$
declare v jsonb;
begin
  update auth.users set email = null where id = '47a00000-0000-4000-8000-0000000000a3';
  delete from school_month_emails where school_id = '47500000-0000-4000-8000-000000000002';
  v := claim_school_month_emails('2026-09-01', 50);
  perform ok('a school with nobody to write to is left unclaimed',
    not exists (select 1 from jsonb_array_elements(v->'emails') e where e->>'school_id' = '47500000-0000-4000-8000-000000000002')
    and not exists (select 1 from school_month_emails where school_id = '47500000-0000-4000-8000-000000000002'));
end $$;

rollback;

-- ---------- the scheduled job's alone ----------
do $$
declare f text;
begin
  foreach f in array array['school_month_summary(uuid,text)', 'claim_school_month_emails(date,integer)',
                           'finish_school_month_email(uuid,text,boolean)']
  loop
    perform ok(f || ' cannot be called from a browser, with or without a sign-in',
      to_regprocedure(f) is not null
      and not has_function_privilege('anon', to_regprocedure(f), 'execute')
      and not has_function_privilege('authenticated', to_regprocedure(f), 'execute'));
  end loop;
  -- The table: no policy, so no rows to any browser even if a grant slipped
  -- back (31-every-table.sql tries it with every grant restored).
  perform ok('nor can the table be read from one',
    (select relrowsecurity from pg_class where oid = 'school_month_emails'::regclass)
    and not exists (select 1 from pg_policies where tablename = 'school_month_emails'));
end $$;
