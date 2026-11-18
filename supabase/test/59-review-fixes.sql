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
select t59_user(n), 't59-user-' || n || '@example.com' from generate_series(1, 6) n;

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

-- ===========================================================================
-- The follow-up: the rest of the review's list.
-- ===========================================================================

-- A few helpers, removed at the end.
create or replace function t59_id(p_kind text, p_n int) returns uuid language sql immutable as $$
  select ('59' || p_kind || '00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
-- A school, with codes nobody else has.
create or replace function t59_school(p_n int, p_name text, p_district text default 't59 district')
returns uuid language sql as $$
  insert into schools (id, name, district, district_key, city, student_count, size_band, join_code, staff_code, created_at)
  values (t59_id('b', p_n), p_name, p_district, p_district, 'Reviewton', 200, 'small',
          'J59' || lpad(p_n::text, 3, '0'), 'S59' || lpad(p_n::text, 5, '0'), now() - interval '60 days')
  returning id $$;
-- A child in a family (made if need be) and in a school, with a chore.
create or replace function t59_child(p_n int, p_family int, p_school uuid, p_group uuid default null)
returns uuid language plpgsql as $$
begin
  if not exists (select 1 from families where id = t59_id('d', p_family)) then
    insert into families (id, name, tier) values (t59_id('d', p_family), 'T59 Family ' || p_family, 'standard');
    -- A parent who has given consent, as every family with a child has.
    insert into auth.users (id, email) values (t59_id('a', 100 + p_family), 't59-parent-' || p_family || '@example.com');
    insert into parents (user_id, family_id, name) values (t59_id('a', 100 + p_family), t59_id('d', p_family), 'T59 Parent');
    perform seed_consent(t59_id('d', p_family), t59_id('a', 100 + p_family));
  end if;
  insert into kids (id, family_id, name) values (t59_id('c', p_n), t59_id('d', p_family), 'Zinnia' || p_n || ' Secretname');
  insert into quests (id, family_id, kid_id, title, category)
  values (t59_id('e', p_n), t59_id('d', p_family), t59_id('c', p_n), 'T59 chore words', 'kitchen');
  insert into school_members (kid_id, school_id, family_id, joined_at, group_id)
  values (t59_id('c', p_n), p_school, t59_id('d', p_family), now() - interval '40 days', p_group);
  return t59_id('c', p_n);
end $$;
-- n chores accepted for a child, at a moment (a day apart each, so all count).
create or replace function t59_done(p_n int, p_count int, p_at timestamptz, p_category text default null)
returns void language plpgsql as $$
declare q uuid := t59_id('e', p_n);
begin
  if p_category is not null then
    q := gen_random_uuid();
    insert into quests (id, family_id, kid_id, title, category)
    select q, family_id, id, 'T59 chore words', p_category from kids where id = t59_id('c', p_n);
  end if;
  insert into submissions (family_id, quest_id, kid_id, status, decided_at)
  select k.family_id, q, k.id, 'approved', p_at + make_interval(days => i)
    from kids k, generate_series(0, p_count - 1) i where k.id = t59_id('c', p_n);
end $$;

-- ---------- numbers shown only for 5 students from 3 families ----------
do $$
declare
  a uuid := t59_school(1, 'T59 Two Families School');
  m date := date_trunc('month', now())::date;
  c jsonb;
  d jsonb;
  n int;
begin
  -- Five children, all busy, but from two families.
  for n in 1 .. 5 loop
    perform t59_child(n, case when n <= 3 then 1 else 2 end, a);
    perform t59_done(n, 2, m::timestamptz);
  end loop;
  c := school_card(a, 'parent');
  perform ok('five students from two families: the school card shows no average (it is two families'' own)',
    (c->>'students')::int = 5 and c->'score' = 'null'::jsonb and not (c->>'ranked')::boolean, c->>'score');
  d := district_school_month(a, m);
  perform ok('nor does a district see their numbers', not (d->>'shown')::boolean and not (d ? 'chores'), d::text);

  -- A sixth child from a third family, but only two of the six did a chore.
  perform t59_child(6, 3, a);
  update submissions set status = 'rejected' where kid_id in (t59_id('c', 3), t59_id('c', 4), t59_id('c', 5), t59_id('c', 1));
  perform t59_done(6, 1, m::timestamptz);
  c := school_card(a, 'parent');
  perform ok('six students from three families, but two did a chore: still no average (it is theirs)',
    c->'score' = 'null'::jsonb, c::text);
  d := district_school_month(a, m);
  perform ok('the district sees how many took part and did a chore, but not the chores',
    (d->>'shown')::boolean and (d->>'students')::int = 6 and (d->>'active')::int = 2
    and not (d->>'chores_shown')::boolean and d->'chores' = 'null'::jsonb and d->'score' = 'null'::jsonb, d::text);
  perform ok('and its totals leave those chores out',
    (district_totals(jsonb_build_array(jsonb_build_object('this_month', d)), 'this_month')->>'chores')::int = 0);

  -- A third child does a chore: now the average may be shown.
  perform t59_done(1, 1, m::timestamptz + interval '3 days');
  update submissions set status = 'approved' where kid_id = t59_id('c', 1);
  perform ok('three of them did one: the average shows', school_card(a, 'parent')->'score' <> 'null'::jsonb
    and (district_school_month(a, m)->>'chores_shown')::boolean);
end $$;

-- ---------- houses: the same rule, and nothing worked out by subtraction ----------
do $$
declare
  b uuid := t59_school(2, 'T59 Houses School');
  h1 uuid := gen_random_uuid();
  h2 uuid := gen_random_uuid();
  g jsonb;
  n int;
  m timestamptz := date_trunc('month', now());
begin
  insert into school_groups (id, school_id, name) values (h1, b, 'Hawk House'), (h2, b, 'Heron House');
  -- Hawk: 5 children from 3 families, 2 of them did a chore. Heron: 5 from 3
  -- other families, 4 of them did.
  for n in 11 .. 15 loop
    perform t59_child(n, 10 + (n % 3), b, h1);
    if n <= 12 then perform t59_done(n, 2, m); end if;
  end loop;
  for n in 16 .. 20 loop
    perform t59_child(n, 20 + (n % 3), b, h2);
    if n <= 19 then perform t59_done(n, 1, m); end if;
  end loop;
  g := school_group_totals(b, m, m + interval '1 month');
  perform ok('both houses show how many took part (5 students, 3 families each)',
    (select bool_and((e->>'shown')::boolean) from jsonb_array_elements(g) e), g::text);
  perform ok('Hawk, where two did a chore, shows no chores and no average',
    (select not (e->>'chores_shown')::boolean and e->'chores' = 'null'::jsonb and e->'average' = 'null'::jsonb
       from jsonb_array_elements(g) e where e->>'name' = 'Hawk House'), g::text);
  perform ok('and so Heron hides its chores too, or the school''s less Heron''s would be those two children''s',
    (select not (e->>'chores_shown')::boolean and e->'chores' = 'null'::jsonb
       from jsonb_array_elements(g) e where e->>'name' = 'Heron House'), g::text);

  -- A third Hawk child does a chore: both houses' chores show.
  perform t59_done(13, 1, m);
  g := school_group_totals(b, m, m + interval '1 month');
  perform ok('with three in Hawk who did one, both houses show their chores and averages',
    (select bool_and((e->>'chores_shown')::boolean and e->'average' <> 'null'::jsonb) from jsonb_array_elements(g) e), g::text);

  -- Five from two families in a third house: not shown, and the leftover rule hides the smallest other.
  insert into school_groups (school_id, name) values (b, 'Owl House');
  for n in 21 .. 25 loop
    perform t59_child(n, 30 + (n % 2), b, (select id from school_groups where school_id = b and name = 'Owl House'));
  end loop;
  g := school_group_totals(b, m, m + interval '1 month');
  perform ok('a house of five from two families shows nothing',
    (select not (e->>'shown')::boolean and not (e ? 'students') from jsonb_array_elements(g) e where e->>'name' = 'Owl House'), g::text);
  perform ok('and one more house hides, or the school less the others would be those two families',
    (select count(*) from jsonb_array_elements(g) e where (e->>'shown')::boolean) = 1, g::text);
end $$;

-- ---------- the report: the busiest week and kinds with 3 or more children ----------
do $$
declare
  c uuid := t59_school(3, 'T59 Report School');
  r jsonb;
  n int;
  w1 timestamptz := date_trunc('week', now() - interval '21 days') + interval '12 hours';
  w2 timestamptz := date_trunc('week', now() - interval '14 days') + interval '12 hours';
begin
  insert into school_staff (user_id, school_id, name, role) values (t59_user(2), c, 'T59 Head', 'admin');
  update schools set trial_ends_at = now() + interval '30 days' where id = c;
  for n in 31 .. 36 loop perform t59_child(n, 40 + (n % 3), c); end loop;
  -- Week one: two children, six chores each, one a day (twelve).
  perform t59_done(31, 6, w1);
  perform t59_done(32, 6, w1, 'pets');
  -- Week two: three children, one each (three).
  for n in 33 .. 35 loop perform t59_done(n, 1, w2); end loop;
  perform become(t59_user(2));
  r := school_pilot_report();
  perform become(null);
  perform ok('(the report shows the school: 6 students from 3 families, 5 did a chore)',
    (r->'totals'->>'shown')::boolean and (r->'totals'->>'chores_shown')::boolean, r->>'totals');
  perform ok('the busiest week is the one with three children in it, not the one with two and more chores',
    (r->'busiest_week'->>'starts')::date = date_trunc('week', w2 at time zone 'UTC')::date
    and (r->'busiest_week'->>'chores')::int = 3, r->>'busiest_week');
  perform ok('and pets, which one child did, is not among the kinds',
    not exists (select 1 from jsonb_array_elements(r->'kinds') k where k->>'kind' = 'pets'), r->>'kinds');
  perform ok('never a child''s name', r::text !~ 'Zinnia|Secretname|T59 chore');
end $$;

-- ---------- a gift waiting for a paid plan starts when the plan really ends ----------
do $$
declare
  f uuid := t59_id('d', 60);
  v_starts timestamptz := now() + interval '20 days';
  r jsonb;
  g families;
begin
  insert into families (id, name, tier, subscription_status, stripe_subscription_id, subscription_ends_at,
                        gift_tier, gift_starts_at, gift_until, billing_event_at)
  values (f, 'T59 Waiting Gift', 'standard', 'active', 'sub_t59_gift', v_starts,
          'elite', v_starts, v_starts + interval '12 months', now() - interval '1 day');
  insert into gift_orders (plan, delivery, paid_at, stripe_session, code_hash, expires_at, redeemed_at, redeemed_by)
  values ('elite', 'self', now() - interval '2 days', 'cs_t59_wait', repeat('5', 64), now() + interval '2 years',
          now() - interval '1 day', f);
  perform ok('(the gift waits for the paid plan''s end, 20 days away)', effective_tier(f) = 'standard');
  -- The parent cancels at once in Stripe's portal: the plan ends now.
  r := apply_subscription_change(f, 'canceled', 'standard', null, 'sub_t59_gift', now(), 'evt_t59_gift_' || gen_random_uuid(),
                                 jsonb_build_object('type', 'customer.subscription.deleted', 'ended_at', now()), now());
  select * into g from families where id = f;
  perform ok('the plan ending at once starts the gift now, not in 20 days',
    abs(extract(epoch from g.gift_starts_at - now())) < 5 and effective_tier(f) = 'elite', g.gift_starts_at::text);
  perform ok('and the gift keeps all of its 12 months, from now',
    abs(extract(epoch from g.gift_until - (v_starts + interval '12 months' - interval '20 days'))) < 5, g.gift_until::text);

  -- A refund in full ends a paid plan too.
  update families set tier = 'standard', subscription_status = 'active', stripe_subscription_id = 'sub_t59_gift2',
                      subscription_ends_at = now() + interval '10 days', gift_starts_at = now() + interval '10 days',
                      gift_until = now() + interval '10 days' + interval '12 months' where id = f;
  r := apply_subscription_change(f, 'refunded', 'starter', null, null, null, 'evt_t59_gift_' || gen_random_uuid(), '{}', now());
  perform ok('a refund in full of the paid plan starts the waiting gift too', effective_tier(f) = 'elite'
    and (select gift_starts_at <= now() + interval '5 seconds' from families where id = f));
end $$;

-- ---------- two gifts: each its own plan for its own 12 months, the better first ----------
do $$
declare
  f uuid := t59_id('d', 61);
  r jsonb;
  g families;
  v_left interval;
begin
  insert into families (id, name, tier, gift_tier, gift_starts_at, gift_until)
  values (f, 'T59 Two Gifts', 'starter', 'standard', now() - interval '2 months', now() + interval '10 months');
  select gift_until - now() into v_left from families where id = f;
  insert into gift_orders (plan, delivery, paid_at, stripe_session, code_hash, expires_at)
  values ('elite', 'self', now(), 'cs_t59_two', encode(sha256(convert_to('TWOGIFT23456', 'UTF8')), 'hex'), now() + interval '2 years');
  r := redeem_gift_code(f, 'TWO-GIFT-23456', 'ip-t59');
  select * into g from families where id = f;
  perform ok('an Elite Pass gift on top of a Standard one runs first: Elite Pass now, for its 12 months',
    (r->>'ok')::boolean and g.gift_tier = 'elite' and abs(extract(epoch from g.gift_starts_at - now())) < 5
    and abs(extract(epoch from g.gift_until - (now() + interval '12 months'))) < 5 and effective_tier(f) = 'elite', r::text);
  perform ok('then the rest of the Standard gift, as Standard',
    g.gift_then_tier = 'standard' and abs(extract(epoch from g.gift_then_until - (g.gift_until + v_left))) < 5,
    g.gift_then_until::text);
  update families set gift_starts_at = now() - interval '13 months', gift_until = now() - interval '1 month',
                      gift_then_until = now() + interval '9 months' where id = f;
  perform ok('after the Elite Pass year, the family has Standard, not Elite Pass', effective_tier(f) = 'standard');
end $$;

-- ---------- cover before payment: 30 days, once ever ----------
do $$
declare
  d uuid;
  s uuid := t59_school(4, 'T59 Invoiced District School', 't59 grace');
  own uuid := t59_school(5, 'T59 Invoiced School', 't59 grace');
  r jsonb;
begin
  perform become(t59_user(3));
  r := register_district('T59 Grace Unified', 'Dr Grace');
  d := (r->>'district_id')::uuid;
  perform become(null);
  insert into district_schools (school_id, district_id) values (s, d);
  update schools set trial_ends_at = now() - interval '1 day' where id in (s, own);

  perform apply_district_subscription(d, 'active', 'cus_t59g', 'sub_t59g1', 'evt_t59g_' || gen_random_uuid(), '{}', now(),
                                      now() + interval '1 year', '{"small": 1}', false);
  perform ok('a district''s plan by invoice covers its schools before it is paid, for a while', district_covers(s));
  update districts set cover_grace_from = now() - interval '31 days' where id = d;
  perform ok('but not after 30 days with nothing paid', not district_covers(s) and not school_is_live(s));
  perform record_district_payment(d, 'invoice:in_t59g1', 100, 'usd', 'sub_t59g1');
  perform ok('paid: covered again', district_covers(s));

  -- Cancelled, and invoiced again: no second 30 days.
  perform apply_district_subscription(d, 'canceled', 'cus_t59g', 'sub_t59g1', 'evt_t59g_' || gen_random_uuid(), '{}', now(), null, null, false);
  perform apply_district_subscription(d, 'active', 'cus_t59g', 'sub_t59g2', 'evt_t59g_' || gen_random_uuid(), '{}', now(),
                                      now() + interval '1 year', '{"small": 1}', false);
  perform ok('cancelling and invoicing again does not start another 30 days', not district_covers(s));
  perform record_district_payment(d, 'invoice:in_t59g2', 100, 'usd', 'sub_t59g2');
  perform ok('the new plan covers once its invoice is paid', district_covers(s));

  -- A school's own plan by invoice: the same.
  perform apply_school_subscription(own, 'active', 'cus_t59o', 'sub_t59o1', 'evt_t59o_' || gen_random_uuid(),
                                    '{"collection": "send_invoice"}', now(), now() + interval '1 year');
  perform ok('a school''s own plan by invoice: in the league before it is paid, for a while', school_is_live(own));
  update schools set cover_grace_from = now() - interval '31 days' where id = own;
  perform ok('but not after 30 days with nothing paid', not school_is_live(own));
  perform record_school_payment(own, 'invoice:in_t59o1', 100, 'usd', 'sub_t59o1');
  perform ok('paid: back in the league', school_is_live(own));
  update schools set billing_by_invoice = false, paid_subscription_id = null where id = own;
  perform ok('a plan by card is paid at checkout, and in the league as before', school_is_live(own));
end $$;

-- ---------- the billing version moves on whenever the plan really changes ----------
do $$
declare
  d uuid := (select id from districts where name = 'T59 Grace Unified');
  v0 int;
  s6 uuid := t59_school(6, 'T59 Version School', 't59 grace');
begin
  select billing_version into v0 from districts where id = d;
  insert into district_schools (school_id, district_id) values (s6, d);
  perform ok('a school added moves the district''s billing version on', (select billing_version from districts where id = d) = v0 + 1);
  delete from district_schools where school_id = s6;
  perform ok('and taken off again: A, then B, then A again is a new version each time, never a repeat',
    (select billing_version from districts where id = d) = v0 + 2);
  update schools set size_band = 'large' where id = (select school_id from district_schools where district_id = d limit 1);
  perform ok('a school changing size moves it on', (select billing_version from districts where id = d) = v0 + 3);
  perform apply_district_subscription(d, 'canceled', 'cus_t59g', 'sub_t59g2', 'evt_t59g_' || gen_random_uuid(), '{}', now(), null, null, false);
  perform ok('so does Stripe''s news, a cancel included', (select billing_version from districts where id = d) = v0 + 4);
end $$;

-- ---------- no school with two plans ----------
do $$
declare
  s uuid := t59_school(7, 'T59 One Plan School');
  r jsonb;
begin
  perform apply_school_subscription(s, 'active', 'cus_t59one', 'sub_t59_invoice', 'evt_t59one_' || gen_random_uuid(),
                                    '{"collection": "send_invoice"}', now(), now() + interval '1 year');
  perform ok('(the school pays by invoice)', (select stripe_subscription_id = 'sub_t59_invoice' from schools where id = s));
  -- A card checkout left open in another tab is paid after all.
  r := apply_school_subscription(s, 'active', 'cus_t59one', 'sub_t59_card', 'evt_t59one_' || gen_random_uuid(),
                                 '{"collection": "charge_automatically"}', now(), now() + interval '1 month');
  perform ok('a second plan for a school already paid for is not taken as its plan',
    r->>'ignored' = 'duplicate_plan' and (select stripe_subscription_id = 'sub_t59_invoice' from schools where id = s), r::text);
  perform ok('it is written down for the webhook to cancel and refund',
    (duplicate_plan('sub_t59_card')->>'school_id')::uuid = s and not (duplicate_plan('sub_t59_card')->>'refunded')::boolean);
  perform mark_duplicate_plan('sub_t59_card', true, array['pi_t59_card']);
  perform ok('once done, its refund is known as that, not the school''s plan refunded',
    duplicate_plan_payment(array['ch_x', 'pi_t59_card']) and not duplicate_plan_payment(array['pi_t59_other'])
    and (duplicate_plan('sub_t59_card')->>'cancelled')::boolean);

  -- The card checkouts a plan by invoice closes.
  perform record_school_checkout(s, 'cs_t59_open');
  perform ok('a card checkout the admin opened is remembered for a day', open_school_checkouts(s) = array['cs_t59_open']);
  perform forget_school_checkout('cs_t59_open');
  perform ok('and forgotten once closed', open_school_checkouts(s) = '{}');
end $$;

-- ---------- a school paying for itself and through its district ----------
do $$
declare
  d uuid;
  s uuid := t59_school(8, 'T59 Paying Twice School', 't59 twice');
  r jsonb;
begin
  perform become(t59_user(4));
  r := register_district('T59 Twice Unified', 'Dr Twice');
  d := (r->>'district_id')::uuid;
  perform become(null);
  update schools set status = 'active', stripe_subscription_id = 'sub_t59_own', billing_status = 'active',
                     billing_period_end = now() + interval '20 days' where id = s;
  insert into district_schools (school_id, district_id) values (s, d);
  perform apply_district_subscription(d, 'active', 'cus_t59t', 'sub_t59t', 'evt_t59t_' || gen_random_uuid(), '{}', now(),
                                      now() + interval '1 year', null, true);
  perform ok('a district covering a school before it has paid does not stop the school''s own plan',
    not exists (select 1 from jsonb_array_elements(schools_paying_twice()) e where (e->>'school_id')::uuid = s));
  perform record_district_payment(d, 'invoice:in_t59t', 100, 'usd', 'sub_t59t');
  r := (select e from jsonb_array_elements(schools_paying_twice()) e where (e->>'school_id')::uuid = s);
  perform ok('once the district has paid, the school''s own plan is listed to stop at the end of its period',
    r->>'subscription_id' = 'sub_t59_own' and r->>'district' = 'T59 Twice Unified' and not (r->>'told')::boolean, r::text);
  perform mark_district_takeover(s);
  update schools set billing_ends_at = now() + interval '20 days' where id = s;
  perform ok('and not again once it is set to stop',
    not exists (select 1 from jsonb_array_elements(schools_paying_twice()) e where (e->>'school_id')::uuid = s));
end $$;

-- ---------- tidy up ----------
do $$
declare d uuid := (select v from t59 where k = 'district')::uuid;
begin
  delete from schools where id in (select school_id from district_schools where district_id = d);
  delete from districts where id = d;
  delete from auth.users where id in (select t59_user(n) from generate_series(1, 6) n);
  delete from auth.users where id::text like '59a00000-0000-4000-8000-%';
  delete from families where id in ('59f00000-0000-4000-8000-000000000001', '59f00000-0000-4000-8000-000000000002');
  delete from families where id::text like '59d00000-0000-4000-8000-%';
  delete from schools where id::text like '59b00000-0000-4000-8000-%';
  delete from districts where name in ('T59 Grace Unified', 'T59 Twice Unified');
  delete from gift_orders where stripe_session in ('cs_t59_wait', 'cs_t59_two');
end $$;
drop function t59_done(int, int, timestamptz, text);
drop function t59_child(int, int, uuid, uuid);
drop function t59_school(int, text, text);
drop function t59_id(text, int);
drop function t59_user(int);
