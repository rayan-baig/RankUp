-- ---------------------------------------------------------------------------
-- School districts (schools.sql, "School districts").
--
-- One customer buying the School League for many schools. The claims worth
-- testing:
--   - the price ladder: the district's own numbers, and adding a school
--     never makes the plan cheaper;
--   - signing up, adding schools, a principal claiming the invite, a school
--     already on RankUp joining with the district's code, leaving;
--   - what the district sees: totals only, none for a school with too few
--     students taking part, and never a child;
--   - a live plan pays for the schools its prices cover, and a school falls
--     back to its own plan, its trial or the free level when the plan ends,
--     with nothing deleted;
--   - Stripe's events applied once and in order; a refund in full ends it;
--   - "Get a quote" is rate limited;
--   - retention removes a district a year after its plan ended, never a school.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function t56_user(p_n int) returns uuid language sql immutable as $$
  select ('56a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;

-- District admins (1, 2), principals (3, 4), a parent (5), a child's phone
-- (6), a signed-in stranger (7), a teacher (8), another adult (9).
insert into auth.users (id, email)
select t56_user(n), 't56-user-' || n || '@example.com' from generate_series(1, 9) n;

insert into families (id, name, tier) values ('56f00000-0000-4000-8000-000000000001', 'The Quillfeathers', 'standard');
insert into parents (user_id, family_id, name) values (t56_user(5), '56f00000-0000-4000-8000-000000000001', 'Quentin');
select seed_consent('56f00000-0000-4000-8000-000000000001', t56_user(5));
-- Eight children with names that must never reach a district.
insert into kids (id, family_id, name)
select ('56c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '56f00000-0000-4000-8000-000000000001',
       'Zebedee' || n || ' Quillfeather'
  from generate_series(1, 8) n;
update kids set user_id = t56_user(6) where id = '56c00000-0000-4000-8000-000000000001';
insert into quests (id, family_id, kid_id, title)
select ('56e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '56f00000-0000-4000-8000-000000000001',
       ('56c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Secret chore words ' || n
  from generate_series(1, 8) n;

create temp table t56 (k text primary key, v text);
grant all on t56 to app_user;

-- ---------- the price ladder ----------
do $$
declare
  q jsonb;
  prev bigint;
  n int;
  sizes int[];
  b int;
  bands int[] := array[100, 500, 1000, 5000];
  bigger int := 0;
  r int;
begin
  perform ok('anyone may ask a district''s price (it is public, like a school''s)',
    has_function_privilege('anon', 'district_price_quote(int[])', 'execute'));

  q := district_price_quote(array[420, 420]);
  perform ok('two medium schools: 10% off each, $531 a school a year, $1,062 in all',
    (q->>'ok')::boolean and (q->>'yearly_cents')::int = 106200 and (q->>'full_yearly_cents')::int = 118000
    and (q->>'saving_cents')::int = 11800
    and jsonb_array_length(q->'lines') = 1 and (q->'lines'->0->>'unit_yearly_cents')::int = 53100
    and (q->'lines'->0->>'pct')::int = 10 and (q->'lines'->0->>'quantity')::int = 2, q::text);

  q := district_price_quote(array_fill(420, array[10]));
  perform ok('ten: the first nine at 10% off, the tenth at 20% off',
    (q->>'yearly_cents')::int = 9 * 53100 + 47200 and jsonb_array_length(q->'lines') = 2, q::text);

  q := district_price_quote(array_fill(250, array[25]));
  perform ok('twenty-five small: 9 at 10%, 15 at 20%, the 25th at 30% ($203)',
    (q->>'yearly_cents')::int = 9 * 26100 + 15 * 23200 + 20300, q::text);

  q := district_price_quote(array[250, 2000, 900]);
  perform ok('places go biggest school first: one line per size, very large first',
    (q->'lines'->0->>'band') = 'xl' and (q->'lines'->2->>'band') = 'small', q::text);

  perform ok('a size that is not a school gets no price', (district_price_quote(array[420, 0])->>'reason') = 'bad_size');
  perform ok('one school is the School League, not a district plan',
    (district_price_quote(array[420])->>'reason') = 'too_few_schools');
  perform ok('more than 100 schools is a quote, not a self-serve plan',
    (district_price_quote(array_fill(420, array[101]))->>'reason') = 'too_many_schools');

  -- Every size, every count from 2 to 100: each school added costs more.
  foreach b in array bands loop
    prev := 0;
    for n in 2 .. 100 loop
      q := district_price_quote(array_fill(b, array[n]));
      if (q->>'yearly_cents')::bigint <= prev then bigger := bigger + 1; end if;
      prev := (q->>'yearly_cents')::bigint;
    end loop;
  end loop;
  perform ok('for schools of one size, from 2 to 100, more schools always cost more in total', bigger = 0, bigger::text);

  -- Mixed sizes: add any school to any plan, and the total goes up.
  perform setseed(0.56);
  bigger := 0;
  for r in 1 .. 400 loop
    n := 2 + floor(random() * 98)::int;
    sizes := array(select bands[1 + floor(random() * 4)::int] from generate_series(1, n));
    prev := (district_price_quote(sizes)->>'yearly_cents')::bigint;
    q := district_price_quote(sizes || bands[1 + floor(random() * 4)::int]);
    if (q->>'yearly_cents')::bigint <= prev then bigger := bigger + 1; end if;
    if (q->>'yearly_cents')::bigint >= (q->>'full_yearly_cents')::bigint then bigger := bigger + 1; end if;
  end loop;
  perform ok('400 mixed districts: adding any school always costs more, and a district always pays less than its schools would alone',
    bigger = 0, bigger::text);
end $$;

-- ---------- signing a district up ----------
do $$
declare r jsonb;
begin
  perform become(null);
  perform ok('signing a district up needs a sign-in', (register_district('North Valley Unified', 'Dr Ames')->>'reason') = 'not_signed_in');
  perform become(t56_user(6));
  perform ok('a child''s sign-in CANNOT sign a district up',
    (register_district('Kid District', 'Me')->>'reason') = 'not_an_adult');
  perform become(t56_user(1));
  perform ok('the district needs its name', (register_district('X', 'Dr Ames')->>'reason') = 'bad_name');
  perform ok('and the admin''s', (register_district('North Valley Unified', '  ')->>'reason') = 'bad_your_name');
  r := register_district('North  Valley   Unified', 'Dr Ames');
  perform ok('someone at the district office signs it up', (r->>'ok')::boolean, r::text);
  insert into t56 values ('district', r->>'district_id');
  perform ok('and is its admin, with a code for schools already on RankUp',
    exists (select 1 from district_staff where user_id = t56_user(1) and role = 'admin')
    and (select length(link_code) from districts where id = (r->>'district_id')::uuid) = 8
    and (select name from districts where id = (r->>'district_id')::uuid) = 'North Valley Unified');
  perform ok('one district per sign-in', (register_district('Another', 'Dr Ames')->>'reason') = 'already_district_staff');
end $$;

-- ---------- adding schools ----------
do $$
declare r jsonb;
begin
  perform become(t56_user(7));
  perform ok('a stranger cannot add a school to anyone''s district',
    (add_district_school('Oak School', 'Springfield', 420)->>'reason') = 'not_district_admin');
  perform become(t56_user(1));
  perform ok('a school needs its name', (add_district_school('O', 'Springfield', 420)->>'reason') = 'bad_name');
  perform ok('and its size', (add_district_school('Oak School', 'Springfield', 0)->>'reason') = 'bad_size');

  r := add_district_school('Oak School', 'Springfield', 420);
  perform ok('the admin adds a school, and gets a one-time invite for its principal',
    (r->>'ok')::boolean and length(r->>'invite') = 10, r::text);
  insert into t56 values ('oak', r->>'school_id'), ('oak_invite', r->>'invite');
  perform ok('the school starts like any new school: a free trial, not checked yet, in the district''s league',
    exists (select 1 from schools where id = (r->>'school_id')::uuid and status = 'trial' and not verified
              and district = 'North Valley Unified' and district_key = 'north valley unified' and size_band = 'medium'));

  r := add_district_school('Pine School', 'Shelbyville', 250);
  insert into t56 values ('pine', r->>'school_id'), ('pine_invite', r->>'invite');
end $$;

-- ---------- a principal claims the invite ----------
do $$
declare r jsonb; v_new text;
begin
  perform become(null);
  perform ok('claiming an invite needs a sign-in',
    (claim_school_invite((select v from t56 where k = 'oak_invite'), 'Ms Oak')->>'reason') = 'not_signed_in');
  perform become(t56_user(6));
  perform ok('a child cannot claim one',
    (claim_school_invite((select v from t56 where k = 'oak_invite'), 'Me')->>'reason') = 'not_an_adult');
  perform become(t56_user(3));
  perform ok('the principal gives their name', (claim_school_invite((select v from t56 where k = 'oak_invite'), '')->>'reason') = 'bad_your_name');
  perform ok('a wrong invite is no invite', (claim_school_invite('ZZZZZZZZZZ', 'Ms Oak')->>'reason') = 'no_such_code');
  r := claim_school_invite(lower((select v from t56 where k = 'oak_invite')), 'Ms Oak');
  perform ok('the principal becomes the school''s admin', (r->>'ok')::boolean
    and exists (select 1 from school_staff where user_id = t56_user(3) and role = 'admin'
                  and school_id = (select v from t56 where k = 'oak')::uuid), r::text);
  perform ok('and the invite is used up',
    (select admin_invite from district_schools where school_id = (select v from t56 where k = 'oak')::uuid) is null);
  perform ok('one school per sign-in',
    (claim_school_invite((select v from t56 where k = 'pine_invite'), 'Ms Oak')->>'reason') = 'already_staff');

  update district_schools set invite_expires_at = now() - interval '1 minute'
   where school_id = (select v from t56 where k = 'pine')::uuid;
  perform become(t56_user(9));
  perform ok('an invite past its 30 days no longer works',
    (claim_school_invite((select v from t56 where k = 'pine_invite'), 'Mr Pine')->>'reason') = 'invite_expired');

  perform become(t56_user(7));
  perform ok('a stranger cannot make a new invite',
    (new_school_invite((select v from t56 where k = 'pine')::uuid)->>'reason') = 'not_district_admin');
  perform become(t56_user(1));
  perform ok('nor can the district for a school that is not its own',
    (new_school_invite(gen_random_uuid())->>'reason') = 'not_your_school');
  perform ok('a school whose principal has signed up needs no invite',
    (new_school_invite((select v from t56 where k = 'oak')::uuid)->>'reason') = 'has_admin');
  r := new_school_invite((select v from t56 where k = 'pine')::uuid);
  v_new := r->>'invite';
  perform ok('the district makes a fresh one', (r->>'ok')::boolean and v_new <> (select v from t56 where k = 'pine_invite'));
  perform become(t56_user(9));
  perform ok('and the new one works',
    (claim_school_invite(v_new, 'Mr Pine')->>'ok')::boolean);
end $$;

-- ---------- a school already on RankUp joins ----------
do $$
declare r jsonb; v_code text;
begin
  perform become(t56_user(4));
  r := register_school('Elm Academy', 'Somewhere Else', 'Ogdenville', 900, 'Mr Elm');
  insert into t56 values ('elm', r->>'school_id');

  perform become(t56_user(7));
  perform ok('a stranger cannot rotate the district''s code', (rotate_district_code()->>'reason') = 'not_district_admin');
  perform become(t56_user(1));
  r := rotate_district_code();
  v_code := r->>'link_code';
  perform ok('the district can change its code', (r->>'ok')::boolean and length(v_code) = 8);

  perform become(t56_user(7));
  perform ok('only a school''s admin can join a district', (join_district(v_code)->>'reason') = 'not_school_admin');
  perform become(t56_user(4));
  perform ok('a wrong code is no district', (join_district('NOPE1234')->>'reason') = 'no_such_code');
  r := join_district(lower(v_code));
  perform ok('the school''s admin joins with the district''s code', (r->>'ok')::boolean and r->>'name' = 'North Valley Unified');
  perform ok('its own district, as typed, stays as it was (its league does not move)',
    (select district from schools where id = (select v from t56 where k = 'elm')::uuid) = 'Somewhere Else');
  perform ok('one district per school', (join_district(v_code)->>'reason') = 'already_in_district');
  perform ok('the school can leave', (leave_district()->>'ok')::boolean);
  perform ok('once', (leave_district()->>'reason') = 'not_in_district');
  perform become(t56_user(7));
  perform ok('a stranger has no school to take out', (leave_district()->>'reason') = 'not_school_admin');
  perform become(t56_user(4));
  perform ok('and join again', (join_district(v_code)->>'ok')::boolean);
end $$;

-- ---------- what the district sees ----------
-- Six children in Oak, two in Pine, each with approved chores this month.
insert into school_members (kid_id, school_id, family_id, show_name, joined_at)
select ('56c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       (select v from t56 where k = case when n <= 6 then 'oak' else 'pine' end)::uuid,
       '56f00000-0000-4000-8000-000000000001', true, date_trunc('month', now())
  from generate_series(1, 8) n;
-- Five children of one family are that family's numbers (school_group_shown:
-- 5 students from 3 families): the eight live in three households.
insert into families (id, name, tier) values
  ('56f00000-0000-4000-8000-000000000002', 'The Quillfeathers Two', 'standard'),
  ('56f00000-0000-4000-8000-000000000003', 'The Quillfeathers Three', 'standard');
update kids k set family_id = ('56f00000-0000-4000-8000-00000000000' || (1 + n % 3)::text)::uuid
  from generate_series(1, 8) n where k.id = ('56c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
update school_members m set family_id = k.family_id from kids k where m.kid_id = k.id and k.name like 'Zebedee%';
insert into submissions (family_id, quest_id, kid_id, status, decided_at, note)
select '56f00000-0000-4000-8000-000000000001', ('56e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('56c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'approved', now(), 'A note a child typed'
  from generate_series(1, 8) n, generate_series(1, 2) twice
 where n <> 6;

do $$
declare
  r jsonb;
  oak jsonb;
  pine jsonb;
begin
  perform become(t56_user(7));
  perform ok('a stranger has no district page', (district_overview()->'district') = 'null'::jsonb);
  perform become(t56_user(3));
  perform ok('nor does a school''s admin: a school is not its district',
    (district_overview()->'district') = 'null'::jsonb);

  perform become(t56_user(1));
  r := district_overview();
  select e into oak from jsonb_array_elements(r->'district'->'schools') e where e->>'name' = 'Oak School';
  select e into pine from jsonb_array_elements(r->'district'->'schools') e where e->>'name' = 'Pine School';
  perform ok('the district sees its three schools', jsonb_array_length(r->'district'->'schools') = 3, r::text);
  perform ok('Oak, with six students taking part: five did a chore, ten chores, an average of 1.7',
    (oak->'this_month'->>'shown')::boolean and (oak->'this_month'->>'students')::int = 6
    and (oak->'this_month'->>'active')::int = 5 and (oak->'this_month'->>'chores')::int = 10
    and (oak->'this_month'->>'score')::numeric = 1.7, oak::text);
  perform ok('Pine has two: too few to show anything but that',
    not (pine->'this_month'->>'shown')::boolean and (pine->'this_month'->>'students')::int = 2
    and not (pine->'this_month' ? 'chores') and not (pine->'this_month' ? 'active'), pine::text);
  perform ok('the district''s totals add up only the schools shown, so Pine''s number cannot be worked out',
    (r->'district'->'totals'->>'students')::int = 6 and (r->'district'->'totals'->>'chores')::int = 10
    and (r->'district'->'totals'->>'shown')::int = 1 and (r->'district'->'totals'->>'schools')::int = 3,
    (r->'district'->'totals')::text);
  perform ok('whether each principal has signed up, and Pine''s invite is used',
    (oak->>'has_admin')::boolean and (pine->>'has_admin')::boolean and pine->'invite' = 'null'::jsonb);
  perform ok('never a child: no name, no first name, no id, no chore, nothing a child typed',
    position('Zebedee' in r::text) = 0 and position('Quillfeather' in r::text) = 0
    and position('56c00000' in r::text) = 0 and position('Secret chore' in r::text) = 0
    and position('A note' in r::text) = 0 and position('Quentin' in r::text) = 0, left(r::text, 300));
  perform ok('nor the codes a school hands out to its parents and staff',
    position((select join_code from schools where id = (select v from t56 where k = 'oak')::uuid) in r::text) = 0
    and position((select staff_code from schools where id = (select v from t56 where k = 'oak')::uuid) in r::text) = 0);
  perform ok('and its plan, priced from its own schools: medium, small and large',
    (r->'district'->'quote'->>'schools')::int = 3 and (r->'district'->'quote'->>'ok')::boolean);

  perform become(t56_user(3));
  r := school_overview();
  perform ok('the school''s own page is as it was: its Stars, by the parent''s say-so',
    jsonb_typeof(r->'school'->'stars') = 'array' and (r->'school'->'district_plan'->>'name') = 'North Valley Unified'
    and not (r->'school'->'district_plan'->>'covered')::boolean, (r->'school'->'district_plan')::text);
end $$;

-- ---------- paying, and what the plan pays for ----------
do $$
declare
  d uuid := (select v from t56 where k = 'district')::uuid;
  oak uuid := (select v from t56 where k = 'oak')::uuid;
  pine uuid := (select v from t56 where k = 'pine')::uuid;
  elm uuid := (select v from t56 where k = 'elm')::uuid;
  r jsonb;
  ash uuid;
begin
  -- Pine's free trial is over: on its own it sits the league out.
  update schools set trial_ends_at = now() - interval '1 day' where id = pine;
  perform ok('Pine, with its trial over and no plan, is not live', not school_is_live(pine));

  perform become(t56_user(7));
  perform ok('a stranger cannot start a district''s invoice', (district_checkout_info()->>'reason') = 'not_district_admin');
  perform become(t56_user(1));
  r := district_checkout_info();
  perform ok('the admin can, for the plan its schools add up to',
    (r->>'ok')::boolean and (r->'quote'->>'schools')::int = 3 and (r->>'district_id')::uuid = d, r::text);

  perform become(null);
  r := apply_district_subscription(d, 'active', 'cus_t56', 'sub_t56', 'evt_t56_1', '{}', now() - interval '10 minutes',
                                   now() + interval '1 year', '{"medium": 1, "small": 1}', false);
  perform ok('Stripe says the plan is live', (r->>'status') = 'active', r::text);
  perform ok('the medium and the small school it pays for are covered',
    district_covers(oak) and district_covers(pine));
  perform ok('Pine is live again, paid for by its district', school_is_live(pine));
  perform ok('Elm, a large school the plan has no price for, is not', not district_covers(elm));
  perform ok('applied once, however often Stripe sends it',
    (apply_district_subscription(d, 'active', 'cus_t56', 'sub_t56', 'evt_t56_1', '{}', now(), null, '{}', false)->>'duplicate')::boolean);

  perform become(t56_user(1));
  r := district_checkout_info();
  perform ok('a paying district is not invoiced twice', r->>'reason' = 'already_paying' and r ? 'quote', r::text);
  perform become(t56_user(3));
  perform ok('and Oak cannot start a plan of its own: its district pays for it',
    (school_checkout_info()->>'reason') = 'district_pays');
  perform ok('its page says so', (school_overview()->'school'->'district_plan'->>'covered')::boolean);

  update schools set status = 'suspended' where id = pine;
  perform ok('a suspension is still ours: no plan makes a suspended school live', not school_is_live(pine));
  update schools set status = 'trial' where id = pine;

  -- A fourth school, medium: added after the plan was bought.
  perform become(t56_user(1));
  ash := (add_district_school('Ash School', 'Springfield', 500)->>'school_id')::uuid;
  perform ok('a school added after the plan waits for the plan to be updated', not district_covers(ash) and district_covers(oak));
  perform become(null);
  perform apply_district_subscription(d, 'active', 'cus_t56', 'sub_t56', 'evt_t56_2', '{}', now() - interval '9 minutes',
                                      now() + interval '1 year', '{}', true);
  perform ok('a plan set up by hand in Stripe pays for every school', district_covers(ash) and district_covers(elm));

  -- A Champion its district pays for: the free month goes to the district's account.
  insert into school_awards (district_key, month_key, school_id, score) values ('t56 key', '2001-01', oak, 9.9);
  select e into r from jsonb_array_elements(unapplied_school_awards()) e where e->>'school_id' = oak::text;
  perform ok('a Champion paid for by its district gets its month as credit on the district''s account',
    r->>'stripe_customer_id' = 'cus_t56' and r->>'status' = 'active' and (r->>'district_paid')::boolean, r::text);
  delete from school_awards where district_key = 't56 key';
  perform ok('and its month''s email says the district pays',
    school_month_summary(oak, to_char(now(), 'YYYY-MM'))->>'district_plan' = 'North Valley Unified');

  perform ok('older news than the latest is ignored',
    apply_district_subscription(d, 'canceled', 'cus_t56', 'sub_t56', 'evt_t56_old', '{}', now() - interval '1 hour')->>'ignored' = 'out_of_date');
  perform ok('news about another, older plan is ignored',
    apply_district_subscription(d, 'canceled', 'cus_t56', 'sub_t56_other', 'evt_t56_3', '{}', now() - interval '8 minutes')->>'ignored' = 'not_current_subscription');
  perform ok('an invoice paid late keeps the schools covered while Stripe chases it',
    apply_district_subscription(d, 'past_due', 'cus_t56', 'sub_t56', 'evt_t56_4', '{}', now() - interval '7 minutes', null, '{}', true)->>'status' = 'active'
    and district_covers(pine));
  perform ok('a payment is recorded', (record_district_payment(d, 'invoice:in_t56', 106200, 'usd')->>'recorded')::boolean);
  perform ok('with its amount, against the district',
    (select amount_pence from billing_events where stripe_event = 'invoice:in_t56' and district_id = d) = 106200);
  perform ok('once per invoice', not (record_district_payment(d, 'invoice:in_t56', 106200, 'usd')->>'recorded')::boolean);

  r := apply_district_subscription(d, 'canceled', 'cus_t56', 'sub_t56', 'evt_t56_5',
                                   jsonb_build_object('ended_at', now()), now() - interval '6 minutes');
  perform ok('when the district stops paying, the plan ends', r->>'status' = 'lapsed', r::text);
  perform ok('and each school falls back: Pine (trial over) sits out, Oak (still on its trial) plays on',
    not school_is_live(pine) and school_is_live(oak) and not district_covers(oak));
  perform ok('nothing is deleted: the schools, their members and their place in the district are all there',
    (select count(*) from district_schools where district_id = d) = 4
    and (select count(*) from school_members where school_id in (oak, pine)) = 8
    and exists (select 1 from schools where id = pine));
  perform become(t56_user(1));
  perform ok('a district whose plan ended can be invoiced again', (district_checkout_info()->>'ok')::boolean);
  perform become(null);

  perform apply_district_subscription(d, 'active', 'cus_t56', 'sub_t56_b', 'evt_t56_6', '{}', now() - interval '5 minutes',
                                      now() + interval '1 year', '{"medium": 2, "small": 1, "large": 1}', false);
  perform ok('paying again covers them again', district_covers(pine) and district_covers(elm) and district_covers(ash));

  perform ok('a partial refund is goodwill and changes nothing',
    apply_district_refund(d, 'ch_t56_part', false)->>'ignored' = 'partial_refund');
  perform ok('a refund needs the charge', apply_district_refund(d, null, true)->>'reason' = 'no_charge');
  perform ok('and a district that exists', apply_district_refund(gen_random_uuid(), 'ch_t56_x', true)->>'reason' = 'no_district');
  perform ok('as does a subscription event',
    apply_district_subscription(gen_random_uuid(), 'active')->>'reason' = 'no_district');
  r := apply_district_refund(d, 'ch_t56_full', true, now() - interval '4 minutes');
  perform ok('a refund in full ends the cover now', r->>'status' = 'lapsed' and not district_covers(pine), r::text);
  perform ok('once per charge', (apply_district_refund(d, 'ch_t56_full', true)->>'duplicate')::boolean);
  perform ok('and "active" for the same year does not bring it back for free',
    apply_district_subscription(d, 'active', 'cus_t56', null, 'evt_t56_7', '{}', now() - interval '3 minutes',
                                now() + interval '1 year' - interval '1 day')->>'ignored' = 'refunded_period');
end $$;

-- ---------- "Get a quote" is rate limited ----------
do $$
declare n int;
begin
  delete from district_quote_attempts;
  perform ok('a request is noted', (record_district_quote('t56-ip-a')->>'ok')::boolean);
  perform record_district_quote('t56-ip-a');
  perform record_district_quote('t56-ip-a');
  perform ok('three an hour from one address, then wait', record_district_quote('t56-ip-a')->>'reason' = 'too_many_quotes');
  perform ok('another address is not held up by it', (record_district_quote('t56-ip-b')->>'ok')::boolean);
  for n in 1 .. 30 loop perform record_district_quote('t56-ip-' || n); end loop;
  perform ok('and thirty an hour in all, so nobody can flood the inbox', record_district_quote('t56-ip-new')->>'reason' = 'busy');
  delete from district_quote_attempts;
end $$;

-- ---------- a hundred schools is the most a district adds by itself ----------
do $$
declare
  d2 uuid;
  r jsonb;
begin
  perform become(t56_user(2));
  d2 := (register_district('Big Plains District', 'Ms Plains')->>'district_id')::uuid;
  insert into schools (id, name, district, district_key, student_count, size_band)
  select ('56b00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Plains ' || n, 'Big Plains District', 'big plains district', 100, 'small'
    from generate_series(1, 100) n;
  insert into district_schools (school_id, district_id)
  select ('56b00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, d2 from generate_series(1, 100) n;
  perform ok('past a hundred schools, a district asks for a quote',
    (add_district_school('Plains 101', 'Plainsville', 100)->>'reason') = 'too_many_schools');
  perform ok('its price says the same', (district_checkout_info()->>'ok')::boolean
    and (district_overview()->'district'->'quote'->>'ok')::boolean);
  perform become(t56_user(4));
  perform leave_district();
  perform ok('nor can a school join a district that already has a hundred',
    (join_district((select link_code from districts where id = d2))->>'reason') = 'too_many_schools');
  delete from districts where id = d2;
  delete from schools where id::text like '56b00000-%';
  perform join_district((select link_code from districts where id = (select v from t56 where k = 'district')::uuid));
end $$;

-- ---------- taking a school out ----------
do $$
declare
  r jsonb;
  lone uuid;
begin
  perform become(t56_user(7));
  perform ok('a stranger cannot take a school out', (remove_district_school((select v from t56 where k = 'pine')::uuid)->>'reason') = 'not_district_admin');
  perform become(t56_user(1));
  perform ok('nor the district one that is not its own', (remove_district_school(gen_random_uuid())->>'reason') = 'not_your_school');
  r := remove_district_school((select v from t56 where k = 'pine')::uuid);
  perform ok('a school taken out carries on by itself, with its staff and students',
    r->>'school' = 'kept' and exists (select 1 from schools where id = (select v from t56 where k = 'pine')::uuid)
    and (select count(*) from school_members where school_id = (select v from t56 where k = 'pine')::uuid) = 2);
  lone := (add_district_school('Never Opened School', 'Nowhere', 100)->>'school_id')::uuid;
  r := remove_district_school(lone);
  perform ok('one the district added whose principal never signed up goes with it: nobody is left to run it',
    r->>'school' = 'deleted' and not exists (select 1 from schools where id = lone));
end $$;

-- ---------- retention ----------
do $$
declare
  d uuid := (select v from t56 where k = 'district')::uuid;
  r jsonb;
begin
  insert into district_quote_attempts (ip_key, tried_at) values ('t56-old', now() - interval '3 days'), ('t56-new', now());
  update district_schools set admin_invite = 'T56OLDINVT', invite_expires_at = now() - interval '1 day'
   where school_id = (select school_id from district_schools where district_id = d and admin_invite is null limit 1);
  update districts set billing_ends_at = now() - interval '200 days', billing_event_at = now() - interval '200 days' where id = d;
  r := run_retention();
  perform ok('a district whose plan ended under a year ago is kept', exists (select 1 from districts where id = d), r::text);
  perform ok('"Get a quote" marks go after two days', not exists (select 1 from district_quote_attempts where ip_key = 't56-old')
    and exists (select 1 from district_quote_attempts where ip_key = 't56-new'));
  perform ok('an invite that ran out is cleared', not exists (select 1 from district_schools where admin_invite = 'T56OLDINVT'));

  update districts set billing_ends_at = now() - interval '400 days', billing_event_at = now() - interval '400 days',
                       created_at = now() - interval '800 days' where id = d;
  r := run_retention();
  perform ok('a year after its plan ended, the district goes', not exists (select 1 from districts where id = d)
    and (r->>'districts_deleted')::int >= 1, r::text);
  perform ok('its admin and its list of schools with it',
    not exists (select 1 from district_staff where district_id = d) and not exists (select 1 from district_schools where district_id = d));
  perform ok('and never a school: they all carry on',
    (select count(*) from schools where id in (select v::uuid from t56 where k in ('oak', 'pine', 'elm'))) = 3);
  delete from district_quote_attempts;
end $$;

-- ---------- a browser reaches none of the server's half ----------
do $$
begin
  perform ok('the district''s own page, and nothing past it, is callable when signed in',
    has_function_privilege('authenticated', 'district_overview()', 'execute')
    and has_function_privilege('authenticated', 'register_district(text,text)', 'execute')
    and not has_function_privilege('authenticated', 'district_school_month(uuid,date)', 'execute')
    and not has_function_privilege('anon', 'district_covers(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'apply_district_subscription(uuid,text,text,text,text,jsonb,timestamptz,timestamptz,jsonb,boolean)', 'execute')
    and not has_function_privilege('anon', 'record_district_quote(text)', 'execute'));
  perform ok('and every district table has row level security on, with nothing granted to a browser',
    (select bool_and(c.relrowsecurity) from pg_class c
      where c.relname in ('districts', 'district_staff', 'district_schools', 'district_quote_attempts')
        and c.relnamespace = 'public'::regnamespace)
    and (select count(*) from pg_class c where c.relname in ('districts', 'district_staff', 'district_schools', 'district_quote_attempts')
          and c.relnamespace = 'public'::regnamespace) = 4);
end $$;

-- Tidy up: the app's tests run against this database afterwards.
delete from schools where id in (select v::uuid from t56 where k in ('oak', 'pine', 'elm'))
   or name in ('Ash School');
delete from families where id in ('56f00000-0000-4000-8000-000000000001', '56f00000-0000-4000-8000-000000000002', '56f00000-0000-4000-8000-000000000003');
delete from auth.users where id in (select t56_user(n) from generate_series(1, 9) n);
drop function t56_user(int);
