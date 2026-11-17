-- ---------------------------------------------------------------------------
-- Fixes from the pre-launch review of gifts, districts, pauses and pilots.
--
-- Each block is a defect found by tracing a real caller, written down as a
-- check that failed before its fix:
--   - a district's plan pays for its schools that are not suspended
--     (district_plan_quote leaves a suspended school off the bill), so a
--     suspended school must not take one of the places the plan pays for:
--     it did, and the last school added of that size sat the league out
--     while the district paid for it;
--   - a pause keeps the renewal date it started with (plan_pauses.paid_until)
--     and plan_pause_credit gives it to /api/keep-plan, so resuming early
--     after a renewal fell inside the pause gives back the days paid for and
--     no more (tests/keepplan.mjs drives the resume itself).
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function t59_user(p_n int) returns uuid language sql immutable as $$
  select ('59a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;

insert into auth.users (id, email)
select t59_user(n), 't59-user-' || n || '@example.com' from generate_series(1, 3) n;

create temp table t59 (k text primary key, v text);
grant all on t59 to app_user;

-- ---------- a suspended school takes no place the plan pays for ----------
do $$
declare
  r jsonb;
  d uuid;
  ash uuid;
  birch uuid;
  cedar uuid;
  q jsonb;
begin
  perform become(t59_user(1));
  r := register_district('Review Valley Unified', 'Dr Review');
  d := (r->>'district_id')::uuid;
  -- Three small schools, added in this order.
  ash := (add_district_school('Ash School', 'Reviewton', 200)->>'school_id')::uuid;
  birch := (add_district_school('Birch School', 'Reviewton', 210)->>'school_id')::uuid;
  cedar := (add_district_school('Cedar School', 'Reviewton', 220)->>'school_id')::uuid;
  perform become(null);
  -- One transaction gives all three the same moment: a day apart, as a
  -- district adding them one by one would.
  update district_schools set added_at = now() - interval '3 days' where school_id = ash;
  update district_schools set added_at = now() - interval '2 days' where school_id = birch;
  update district_schools set added_at = now() - interval '1 day' where school_id = cedar;

  -- The operator suspends the first one (it was not a real school, say).
  perform set_school_status(ash, 'suspended');

  q := district_plan_quote(d);
  perform ok('the district''s plan is priced for its two schools that are not suspended',
    (q->>'ok')::boolean and (q->>'schools')::int = 2 and (q->'lines'->0->>'band') = 'small'
    and (q->'lines'->0->>'quantity')::int = 2, q::text);

  -- The district pays that invoice: two small schools.
  r := apply_district_subscription(d, 'active', 'cus_t59', 'sub_t59', 'evt_t59_' || gen_random_uuid(), '{}', now(),
                                   now() + interval '1 year', '{"small": 2}', false);
  perform ok('(the plan is live)', (r->>'status') = 'active', r::text);

  perform ok('both schools the district pays for are covered: the suspended one takes no place',
    district_covers(birch) and district_covers(cedar),
    format('birch %s, cedar %s', district_covers(birch), district_covers(cedar)));
  perform ok('so both play in the league', school_is_live(birch) and school_is_live(cedar));
  perform ok('and the suspended school is not covered, nor shown to the district as paid for',
    not district_covers(ash) and not school_is_live(ash));

  perform become(t59_user(1));
  r := district_overview();
  perform ok('the district page says the same: two paid for, the suspended one not',
    (select count(*) from jsonb_array_elements(r->'district'->'schools') e where (e->>'covered')::boolean) = 2
    and not (select (e->>'covered')::boolean from jsonb_array_elements(r->'district'->'schools') e where e->>'name' = 'Ash School'),
    (r->'district'->'schools')::text);
  perform become(null);

  insert into t59 values ('district', d::text);
end $$;

-- ---------- what a pause gives back when resumed early ----------
insert into families (id, name, tier, subscription_status, stripe_customer_id, stripe_subscription_id,
                      billing_cycle, subscription_renews_at)
values ('59f00000-0000-4000-8000-000000000001', 'The Reviewers', 'standard', 'active', 'cus_t59_a', 'sub_t59_a',
        'month', now() + interval '20 days'),
       ('59f00000-0000-4000-8000-000000000002', 'The Unknowns', 'standard', 'active', 'cus_t59_b', 'sub_t59_b',
        'month', null);

do $$
declare
  a uuid := '59f00000-0000-4000-8000-000000000001';
  b uuid := '59f00000-0000-4000-8000-000000000002';
  r jsonb;
  c jsonb;
begin
  r := start_plan_pause(a, 1);
  perform ok('(the family pauses, 20 days before its renewal date)', (r->>'ok')::boolean, r::text);
  perform ok('the pause keeps the renewal date it started with',
    (select paid_until from plan_pauses where id = (r->>'pause_id')::bigint)
      = (select subscription_renews_at from families where id = a));
  -- The renewal falls inside the pause, and Stripe's news moves the date on.
  update families set subscription_renews_at = now() + interval '50 days' where id = a;
  c := plan_pause_credit(a);
  perform ok('plan_pause_credit says when the pause started and the renewal date it started with, not the new one',
    (c->>'started_at')::timestamptz = (select started_at from plan_pauses where id = (r->>'pause_id')::bigint)
    and abs(extract(epoch from (c->>'paid_until')::timestamptz - (now() + interval '20 days'))) < 5, c::text);
  perform end_plan_pause(a);
  perform ok('with no pause running it has nothing to give back', plan_pause_credit(a) = '{}'::jsonb);

  r := start_plan_pause(b, 1);
  perform ok('a renewal date not known yet is kept as not known',
    (r->>'ok')::boolean and (plan_pause_credit(b)->'paid_until') = 'null'::jsonb, plan_pause_credit(b)::text);

  perform ok('the browser cannot ask it, for its own family or any other',
    not has_function_privilege('authenticated', 'plan_pause_credit(uuid)', 'execute')
    and not has_function_privilege('anon', 'plan_pause_credit(uuid)', 'execute'));
end $$;

-- ---------- tidy up ----------
do $$
declare d uuid := (select v from t59 where k = 'district')::uuid;
begin
  delete from schools where id in (select school_id from district_schools where district_id = d);
  delete from districts where id = d;
  delete from auth.users where id in (select t59_user(n) from generate_series(1, 3) n);
  delete from families where id in ('59f00000-0000-4000-8000-000000000001', '59f00000-0000-4000-8000-000000000002');
end $$;
drop function t59_user(int);
