-- ---------------------------------------------------------------------------
-- The School League.
--
-- The claims worth testing are the ones that keep children safe and the
-- prizes honest: that only a parent can put a child in a school, that a school
-- never sees a name a parent did not agree to and an unchecked school sees
-- none, that nothing about a child crosses to another school, that scores are
-- computed (and capped) rather than reported, and that closing a month twice
-- does not crown or pay twice.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- Admins of three schools, a teacher, three parents, and one child's sign-in.
insert into auth.users (id, email) values
  ('5c111111-0000-0000-0000-00000000000a', 'league-sa@example.com'),
  ('5c111111-0000-0000-0000-00000000000b', 'league-sb@example.com'),
  ('5c111111-0000-0000-0000-00000000000c', 'league-sc@example.com'),
  ('5c111111-0000-0000-0000-0000000000a1', 'league-t@example.com'),
  ('5c111111-0000-0000-0000-000000000001', 'league-pa@example.com'),
  ('5c111111-0000-0000-0000-000000000002', 'league-pb@example.com'),
  ('5c111111-0000-0000-0000-000000000003', 'league-px@example.com'),
  ('5c111111-0000-0000-0000-0000000000f1', 'league-k1@example.com');

insert into families (id, name, tier) values
  ('5c222222-0000-0000-0000-000000000001', 'The Ashes',   'standard'),
  ('5c222222-0000-0000-0000-000000000002', 'The Birches', 'standard'),
  ('5c222222-0000-0000-0000-000000000003', 'The Xus',     'starter');

insert into parents (user_id, family_id, name) values
  ('5c111111-0000-0000-0000-000000000001', '5c222222-0000-0000-0000-000000000001', 'Pat'),
  ('5c111111-0000-0000-0000-000000000002', '5c222222-0000-0000-0000-000000000002', 'Bea'),
  ('5c111111-0000-0000-0000-000000000003', '5c222222-0000-0000-0000-000000000003', 'Xan');

select seed_consent('5c222222-0000-0000-0000-000000000001', '5c111111-0000-0000-0000-000000000001');
select seed_consent('5c222222-0000-0000-0000-000000000002', '5c111111-0000-0000-0000-000000000002');
select seed_consent('5c222222-0000-0000-0000-000000000003', '5c111111-0000-0000-0000-000000000003');

-- Five children in each of the first two families (a school needs five to be
-- ranked), one in the third. A1 has a sign-in of their own.
insert into kids (id, family_id, name)
select ('5c44444' || f || '-0000-0000-0000-00000000000' || n)::uuid,
       ('5c222222-0000-0000-0000-00000000000' || f)::uuid,
       (case f when 1 then 'Ava' when 2 then 'Ben' end) || n || ' Surname'
  from generate_series(1, 2) f, generate_series(1, 5) n;
insert into kids (id, family_id, name) values
  ('5c444443-0000-0000-0000-000000000001', '5c222222-0000-0000-0000-000000000003', 'Xia');
update kids set user_id = '5c111111-0000-0000-0000-0000000000f1'
 where id = '5c444441-0000-0000-0000-000000000001';

insert into quests (id, family_id, kid_id, title)
select ('5c55555' || substr(k.id::text, 8, 1) || '-0000-0000-0000-00000000000' || right(k.id::text, 1))::uuid,
       k.family_id, k.id, 'Tidy'
  from kids k where k.family_id::text like '5c222222-%';

-- Approved quests: one helper so the months below read plainly.
create or replace function seed_done(p_kid uuid, p_at timestamptz, p_n int, p_status text default 'approved')
returns void language sql as $$
  insert into submissions (family_id, quest_id, kid_id, status, decided_at)
  select k.family_id, q.id, k.id, p_status, p_at
    from kids k join quests q on q.kid_id = k.id, generate_series(1, p_n)
   where k.id = p_kid;
$$;

-- LAST month. Ava1 has 20 approved on one day, which counts as 8, and one
-- more on another day: 9 points. Ava2-5 two each on separate days. So school A
-- averages (9 + 4*2) / 5 = 3.4. Ben1-5 one each: school B averages 1.0.
-- A rejected one counts for nothing.
do $$
declare
  m timestamptz := date_trunc('month', now()) - interval '1 month';
  n int;
begin
  perform seed_done('5c444441-0000-0000-0000-000000000001', m + interval '2 days', 20);
  perform seed_done('5c444441-0000-0000-0000-000000000001', m + interval '3 days', 1);
  for n in 2..5 loop
    perform seed_done(('5c444441-0000-0000-0000-00000000000' || n)::uuid, m + interval '4 days', 1);
    perform seed_done(('5c444441-0000-0000-0000-00000000000' || n)::uuid, m + interval '5 days', 1);
  end loop;
  for n in 1..5 loop
    perform seed_done(('5c444442-0000-0000-0000-00000000000' || n)::uuid, m + interval '6 days', 1);
  end loop;
  perform seed_done('5c444442-0000-0000-0000-000000000001', m + interval '7 days', 5, 'rejected');
  perform seed_done('5c444443-0000-0000-0000-000000000001', m + interval '8 days', 3);

  -- THIS month: A two each, B one each.
  m := date_trunc('month', now());
  for n in 1..5 loop
    perform seed_done(('5c444441-0000-0000-0000-00000000000' || n)::uuid, m, 2);
    perform seed_done(('5c444442-0000-0000-0000-00000000000' || n)::uuid, m, 1);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
-- As schools.sql leaves them on a real project.
revoke all on schools, school_staff, school_members, school_rivalries, school_month_scores,
              school_awards, school_rivalry_results, school_top_students
  from anon, authenticated;

create temp table codes (school text primary key, join_code text, staff_code text);
grant all on codes to app_user;

set role app_user;

-- ---------- prices ----------
do $$
begin
  perform become(null);
  perform ok('anyone can ask the price: 250 students is a small school at $29',
    (school_price_quote(250)->>'band') = 'small' and (school_price_quote(250)->>'monthly_cents')::int = 2900);
  perform ok('300 is still small, 301 is medium at $59',
    (school_price_quote(300)->>'band') = 'small' and (school_price_quote(301)->>'monthly_cents')::int = 5900);
  perform ok('801 is large at $99', (school_price_quote(801)->>'monthly_cents')::int = 9900);
  perform ok('1501 is very large at $149', (school_price_quote(1501)->>'monthly_cents')::int = 14900);
  perform ok('a year costs ten months', (school_price_quote(500)->>'yearly_cents')::int = 59000);
  perform ok('a size of nothing gets no price', (school_price_quote(0)->>'reason') = 'bad_size');
end $$;

-- ---------- signing schools up ----------
do $$
declare r jsonb;
begin
  perform become(null);
  perform ok('signing a school up needs a sign-in',
    (register_school('Oakridge', 'North Valley', 'Springfield', 420, 'Ms Lane')->>'reason') = 'not_signed_in');

  perform become('5c111111-0000-0000-0000-0000000000f1');
  perform ok('a child''s sign-in CANNOT sign a school up',
    (register_school('Kid School', 'North Valley', 'Springfield', 420, 'Me')->>'reason') = 'not_an_adult');

  perform become('5c111111-0000-0000-0000-00000000000a');
  r := register_school('Oakridge Elementary', 'North Valley', 'Springfield', 420, 'Ms Lane');
  perform ok('a principal can sign their school up', (r->>'ok')::boolean);
  perform ok('and is told its price, by size: 420 students is medium',
    (r->'price'->>'band') = 'medium');
  perform ok('with a six-letter code for parents and an eight-letter one for staff',
    length(r->>'join_code') = 6 and length(r->>'staff_code') = 8);
  insert into codes values ('a', r->>'join_code', r->>'staff_code');
  perform ok('the same person cannot sign up a second school',
    (register_school('Oakridge Two', 'North Valley', '', 100, 'Ms Lane')->>'reason') = 'already_staff');

  perform become('5c111111-0000-0000-0000-00000000000b');
  perform ok('a size of zero is refused',
    (register_school('Pine Hill', 'North Valley', '', 0, 'Mr Fir')->>'reason') = 'bad_size');
  r := register_school('Pine Hill School', '  north   valley ', 'Shelbyville', 900, 'Mr Fir');
  perform ok('a second school in the same district, however it was typed', (r->>'ok')::boolean);
  insert into codes values ('b', r->>'join_code', r->>'staff_code');

  perform become('5c111111-0000-0000-0000-00000000000c');
  r := register_school('Totally Real Academy', 'North Valley', '', 50, 'Someone');
  insert into codes values ('c', r->>'join_code', r->>'staff_code');

  perform become('5c111111-0000-0000-0000-0000000000a1');
  perform ok('a teacher joins with the staff code',
    (join_school_staff((select staff_code from codes where school = 'a'), 'Mr Ray')->>'ok')::boolean);
  r := school_overview()->'school';
  perform ok('and sees the parents'' code', (r->>'join_code') = (select join_code from codes where school = 'a'));
  perform ok('but not the staff code, which is the admin''s to hand out', r->'staff_code' = 'null'::jsonb);
end $$;

-- ---------- families join ----------
do $$
declare n int; r jsonb;
begin
  perform become('5c111111-0000-0000-0000-0000000000f1');
  perform ok('a child CANNOT put themselves in a school',
    (join_school('5c444441-0000-0000-0000-000000000001',
                 (select join_code from codes where school = 'a'))->>'reason') = 'not_a_parent');

  perform become('5c111111-0000-0000-0000-00000000000a');
  perform ok('a school CANNOT add a child',
    (join_school('5c444441-0000-0000-0000-000000000001',
                 (select join_code from codes where school = 'a'))->>'reason') = 'not_a_parent');

  perform become('5c111111-0000-0000-0000-000000000001');
  perform ok('a bad code is refused',
    (join_school('5c444441-0000-0000-0000-000000000001', 'ZZZZZZ')->>'reason') = 'no_such_code');
  perform ok('a parent CANNOT put someone else''s child in a school',
    (join_school('5c444442-0000-0000-0000-000000000001',
                 (select join_code from codes where school = 'a'))->>'reason') = 'not_your_child');
  r := join_school('5c444441-0000-0000-0000-000000000001',
                   lower((select join_code from codes where school = 'a')), true);
  perform ok('a parent puts their child in, code typed in lower case, sharing the name',
    (r->>'ok')::boolean and (r->'school'->>'name') = 'Oakridge Elementary');
  for n in 2..5 loop
    perform join_school(('5c444441-0000-0000-0000-00000000000' || n)::uuid,
                        (select join_code from codes where school = 'a'));
  end loop;
  perform ok('a child is in one school at a time',
    (join_school('5c444441-0000-0000-0000-000000000001',
                 (select join_code from codes where school = 'b'))->>'reason') = 'already_in_one');

  perform become('5c111111-0000-0000-0000-000000000002');
  for n in 1..5 loop
    perform join_school(('5c444442-0000-0000-0000-00000000000' || n)::uuid,
                        (select join_code from codes where school = 'b'), true);
  end loop;

  perform become('5c111111-0000-0000-0000-000000000003');
  perform ok('a family can join an unchecked school',
    (join_school('5c444443-0000-0000-0000-000000000001',
                 (select join_code from codes where school = 'c'), true)->>'ok')::boolean);
end $$;

-- The operator checks schools A and B are real; nobody checks C. And, as the
-- table owner, back-date everyone's joining so last month counts for them.
reset role;
select verify_school(id, true) from schools where name in ('Oakridge Elementary', 'Pine Hill School');
update school_members set joined_at = now() - interval '3 months';
set role app_user;

-- ---------- nothing is readable directly ----------
do $$
begin
  begin
    perform 1 from schools limit 1;
    perform ok('schools CANNOT be read directly', false);
  exception when insufficient_privilege then
    perform ok('schools CANNOT be read directly', true);
  end;
  begin
    perform 1 from school_members limit 1;
    perform ok('nor the list of who is in which school', false);
  exception when insufficient_privilege then
    perform ok('nor the list of who is in which school', true);
  end;
  begin
    perform school_kid_points((select null::uuid), current_date);
    perform ok('the per-child points function CANNOT be called from a browser', false);
  exception when insufficient_privilege then
    perform ok('the per-child points function CANNOT be called from a browser', true);
  end;
end $$;

-- ---------- the league ----------
do $$
declare r jsonb; s jsonb;
begin
  perform become('5c111111-0000-0000-0000-000000000001');
  r := school_league();
  s := r->'schools';
  perform ok('a parent sees their child''s district league', (r->>'ok')::boolean);
  perform ok('with the two checked schools, and not the unchecked one',
    jsonb_array_length(s) = 2
    and not exists (select 1 from jsonb_array_elements(s) e where e->>'name' = 'Totally Real Academy'));
  perform ok('ranked by average per student: A (2.0) above B (1.0)',
    (s->0->>'name') = 'Oakridge Elementary' and (s->0->>'score')::numeric = 2.0
    and (s->1->>'score')::numeric = 1.0 and (s->0->>'you')::boolean);
  perform ok('a league row is a name, a town and numbers, and nothing else',
    (select bool_and(key in ('name','city','score','students','ranked','you'))
       from jsonb_object_keys(s->0) key));

  perform become('5c111111-0000-0000-0000-00000000000c');
  r := school_league();
  perform ok('an unchecked school sees where it would stand, unranked',
    exists (select 1 from jsonb_array_elements(r->'schools') e
             where e->>'name' = 'Totally Real Academy' and (e->>'you')::boolean
               and not (e->>'ranked')::boolean));
  perform ok('it cannot challenge anyone',
    (challenge_school((select null::uuid))->>'reason') = 'not_verified_yet');

  perform become('5c111111-0000-0000-0000-000000000003');
  perform ok('nobody can look at a league their family has no part in',
    (school_league(gen_random_uuid())->>'reason') = 'not_your_school');
end $$;

-- ---------- rivals ----------
do $$
declare v_b uuid; v_r uuid; r jsonb;
begin
  perform become('5c111111-0000-0000-0000-00000000000a');
  r := district_schools('pine');
  perform ok('an admin can find a school in their district to challenge',
    jsonb_array_length(r->'schools') = 1 and (r->'schools'->0->>'name') = 'Pine Hill School');
  perform ok('the unchecked school is not offered',
    jsonb_array_length(district_schools('')->'schools') = 1);
  v_b := (r->'schools'->0->>'id')::uuid;

  perform become('5c111111-0000-0000-0000-0000000000a1');
  perform ok('a teacher CANNOT start a rivalry; that is the admin''s call',
    (challenge_school(v_b)->>'reason') = 'not_school_admin');

  perform become('5c111111-0000-0000-0000-00000000000a');
  r := challenge_school(v_b);
  perform ok('an admin challenges a rival school', (r->>'ok')::boolean);
  v_r := (r->>'rivalry_id')::uuid;
  perform ok('and cannot challenge the same school twice',
    (challenge_school(v_b)->>'reason') = 'already_rivals');

  perform become('5c111111-0000-0000-0000-00000000000b');
  perform ok('the rival sees the challenge waiting',
    (school_overview()->'school'->>'challenges_in')::int = 1);
  perform ok('and accepts it', (answer_challenge(v_r, true)->>'ok')::boolean);
  perform ok('a challenge cannot be answered twice',
    (answer_challenge(v_r, false)->>'reason') = 'no_such_challenge');

  perform become('5c111111-0000-0000-0000-000000000002');
  r := my_schools()->'children'->0->'school'->'rivalries'->0;
  perform ok('a parent sees the rivalry, by name and score',
    (r->'rival'->>'name') = 'Oakridge Elementary' and (r->>'status') = 'active'
    and (r->>'their_score')::numeric = 2.0);
end $$;

-- ---------- closing last month ----------
do $$
begin
  begin
    perform settle_school_month((date_trunc('month', now()) - interval '1 month')::date);
    perform ok('a browser CANNOT close a month and crown a champion', false);
  exception when insufficient_privilege then
    perform ok('a browser CANNOT close a month and crown a champion', true);
  end;
  begin
    perform verify_school((select null::uuid), true);
    perform ok('a browser CANNOT mark a school as checked', false);
  exception when insufficient_privilege then
    perform ok('a browser CANNOT mark a school as checked', true);
  end;
end $$;

reset role;
-- The rivalry has run since before last month.
update school_rivalries set answered_at = now() - interval '2 months';
do $$
declare r jsonb; last_m date := (date_trunc('month', now()) - interval '1 month')::date;
begin
  perform ok('a month that has not finished cannot be closed',
    (settle_school_month(current_date)->>'reason') = 'month_not_over');
  r := settle_school_month(last_m);
  perform ok('closing last month crowns one District Champion',
    jsonb_array_length(r->'champions') = 1 and (r->'champions'->0->>'name') = 'Oakridge Elementary');
  perform ok('on a score of 3.4: twenty quests in a day count as eight',
    (r->'champions'->0->>'score')::numeric = 3.4);
  perform ok('closing the same month again crowns nobody twice',
    jsonb_array_length(settle_school_month(last_m)->'champions') = 0
    and (select count(*) from school_awards) = 1);
  perform ok('the rivalry''s month is recorded as a win for A',
    (select count(*) from school_rivalry_results x join schools s on s.id = x.winner_id
      where s.name = 'Oakridge Elementary') = 1);
  perform ok('the unchecked school is scored but never ranked',
    (select not ranked from school_month_scores ms join schools s on s.id = ms.school_id
      where s.name = 'Totally Real Academy'));
  perform ok('each school gets its School Stars, best first',
    (select count(*) from school_top_students t join schools s on s.id = t.school_id
      where s.name = 'Oakridge Elementary') = 5
    and (select t.kid_id from school_top_students t join schools s on s.id = t.school_id
          where s.name = 'Oakridge Elementary' and t.rank = 1) = '5c444441-0000-0000-0000-000000000001');
end $$;
set role app_user;

-- ---------- School Stars, and whose names show ----------
do $$
declare r jsonb;
begin
  perform become('5c111111-0000-0000-0000-000000000001');
  perform ok('families see no Stars until the school has checked them',
    jsonb_array_length(my_schools()->'children'->0->'school'->'stars') = 0);

  perform become('5c111111-0000-0000-0000-00000000000a');
  r := school_overview()->'school'->'stars';
  perform ok('the admin sees the list to check it', jsonb_array_length(r) = 5);
  perform ok('with a first name only where the parent said yes',
    (r->0->>'name') = 'Ava1' and (r->1->>'name') = 'A student');
  perform ok('never a surname', position('Surname' in r::text) = 0);
  perform ok('and the school is now District Champion',
    jsonb_array_length(school_overview()->'school'->'titles') = 1);

  perform become('5c111111-0000-0000-0000-00000000000c');
  perform ok('an unchecked school sees NO names, even with a parent''s yes',
    (school_overview()->'school'->'stars'->0->>'name') = 'A student');

  perform become('5c111111-0000-0000-0000-000000000001');
  perform ok('a parent CANNOT publish the list',
    (publish_top_students(to_char(now() - interval '1 month', 'YYYY-MM'))->>'reason') = 'not_school_admin');

  perform become('5c111111-0000-0000-0000-00000000000a');
  perform ok('the admin publishes it, leaving one place out',
    (publish_top_students(to_char(now() - interval '1 month', 'YYYY-MM'), '{2}')->>'ok')::boolean);

  perform become('5c111111-0000-0000-0000-000000000001');
  r := my_schools()->'children'->0->'school'->'stars';
  perform ok('families now see it, without the place left out',
    jsonb_array_length(r) = 4 and not exists (select 1 from jsonb_array_elements(r) e where (e->>'rank')::int = 2));
  perform ok('and a parent can spot their own children on it',
    (r->0->>'yours')::boolean);

  perform become('5c111111-0000-0000-0000-000000000002');
  r := my_schools()->'children'->0->'school'->'stars';
  perform ok('another school''s parents see their own school''s Stars, not A''s',
    not exists (select 1 from jsonb_array_elements(r) e where e->>'name' like 'Ava%'));

  perform become('5c111111-0000-0000-0000-0000000000f1');
  r := my_schools()->'children';
  perform ok('a child sees only their own school page, not their siblings''',
    jsonb_array_length(r) = 1 and (r->0->>'kid_name') like 'Ava1%');
  perform ok('and sees that they are a School Star',
    (r->0->'school'->'stars'->0->>'you')::boolean);
  perform ok('a child sees no codes and no staff list',
    r->0->'school'->'join_code' is null and r->0->'school'->'staff' is null);

  perform become('5c111111-0000-0000-0000-000000000001');
  perform set_school_name_sharing('5c444441-0000-0000-0000-000000000001', false);
  perform become('5c111111-0000-0000-0000-00000000000a');
  perform ok('when the parent turns sharing off, the name is gone at once',
    (school_overview()->'school'->'stars'->0->>'name') = 'A student');

  perform become('5c111111-0000-0000-0000-000000000002');
  perform ok('a parent CANNOT change sharing for another family''s child',
    not (set_school_name_sharing('5c444441-0000-0000-0000-000000000001', true)->>'ok')::boolean);

  perform become('5c111111-0000-0000-0000-000000000001');
  perform ok('a parent can take their child out', (leave_school('5c444441-0000-0000-0000-000000000001')->>'ok')::boolean);
  perform become('5c111111-0000-0000-0000-00000000000a');
  perform ok('and they come off the Stars list, past months too',
    jsonb_array_length(school_overview()->'school'->'stars') = 4);
end $$;

reset role;

-- ---------- paying ----------
set role app_user;
do $$
declare r jsonb;
begin
  perform become('5c111111-0000-0000-0000-0000000000a1');
  perform ok('a teacher CANNOT start the school''s checkout',
    (school_checkout_info()->>'reason') = 'not_school_admin');
  perform become('5c111111-0000-0000-0000-00000000000a');
  r := school_checkout_info();
  perform ok('the admin can, and the size band comes from the school, not the request',
    (r->>'ok')::boolean and (r->>'band') = 'medium' and not (r->>'has_customer')::boolean);

  begin
    perform apply_school_subscription((r->>'school_id')::uuid, 'active');
    perform ok('a browser CANNOT mark its school as paid', false);
  exception when insufficient_privilege then
    perform ok('a browser CANNOT mark its school as paid', true);
  end;
  begin
    perform unapplied_school_awards();
    perform ok('nor see what free months are owed', false);
  exception when insufficient_privilege then
    perform ok('nor see what free months are owed', true);
  end;
end $$;
reset role;

do $$
declare
  a uuid := (select id from schools where name = 'Oakridge Elementary');
  b uuid := (select id from schools where name = 'Pine Hill School');
  r jsonb;
  before timestamptz;
begin
  -- Separate statements: a stable function in the same expression would read
  -- the table as it was before the write next to it.
  r := attach_school_customer(a, 'cus_school_a');
  perform ok('checkout links the school to its Stripe customer',
    (r->>'ok')::boolean and school_for_customer('cus_school_a') = a);
  perform ok('and never swaps it for somebody else''s',
    not (attach_school_customer(a, 'cus_someone_else')->>'ok')::boolean
    and stripe_customer_for_school(a) = 'cus_school_a');

  perform ok('a paid subscription makes the school active',
    (apply_school_subscription(a, 'active', 'cus_school_a', 'sub_a', 'evt_school_1')->>'status') = 'active');
  perform ok('the same Stripe event twice is applied once',
    (apply_school_subscription(a, 'canceled', null, null, 'evt_school_1')->>'duplicate')::boolean
    and (select status from schools where id = a) = 'active');
  perform ok('a failing card keeps the school playing while Stripe retries',
    (apply_school_subscription(a, 'past_due', null, null, 'evt_school_2')->>'status') = 'active');
  perform ok('a cancelled plan with trial days left goes back to the trial',
    (apply_school_subscription(a, 'canceled', null, null, 'evt_school_3')->>'status') = 'trial');
  update schools set trial_ends_at = now() - interval '1 day' where id = a;
  r := apply_school_subscription(a, 'canceled', null, null, 'evt_school_4');
  perform ok('and with none left, the school sits the league out',
    (r->>'status') = 'lapsed' and not school_is_live(a));
  r := apply_school_subscription(a, 'active', null, null, 'evt_school_5');
  perform ok('paying again brings it back', (r->>'status') = 'active' and school_is_live(a));

  perform set_school_status(b, 'suspended');
  perform ok('no payment lifts the operator''s suspension',
    (apply_school_subscription(b, 'active', 'cus_school_b', 'sub_b', 'evt_school_6')->>'status') = 'suspended');
  perform set_school_status(b, 'trial');

  perform record_school_payment(a, 'evt_school_pay_1', 5900, 'usd');
  perform record_school_payment(a, 'evt_school_pay_1', 5900, 'usd');
  perform ok('a school''s invoice is recorded once, with its amount',
    (select count(*) from billing_events where school_id = a and amount_pence = 5900) = 1);

  -- The free month.
  r := unapplied_school_awards();
  perform ok('the Champion''s free month is waiting to be given',
    jsonb_array_length(r) = 1 and (r->0->>'school_id')::uuid = a
    and (r->0->>'stripe_customer_id') = 'cus_school_a');
  perform ok('a paying Champion gets it as a coupon',
    (mark_school_award_applied(r->0->>'district_key', r->0->>'month_key', 'coupon_free_month')->>'ok')::boolean);
  perform ok('and it is no longer owed', jsonb_array_length(unapplied_school_awards()) = 0);
  perform ok('and it cannot be given twice',
    not (mark_school_award_applied(r->0->>'district_key', r->0->>'month_key', 'coupon_again')->>'ok')::boolean);

  insert into school_awards (district_key, month_key, school_id, score) values ('north valley', '2000-01', b, 1);
  select trial_ends_at into before from schools where id = b;
  perform mark_school_award_applied('north valley', '2000-01', null);
  perform ok('a Champion still on its trial gets thirty more free days instead',
    (select trial_ends_at from schools where id = b) >= before + interval '29 days');
end $$;

-- ---------- a family's data rights cover the school too ----------
set role app_user;
do $$
declare r jsonb;
begin
  perform become('5c111111-0000-0000-0000-000000000002');
  r := export_family_data()->'school_league';
  perform ok('downloading my data includes each child''s school',
    jsonb_array_length(r) = 5 and (r->0->>'school') = 'Pine Hill School'
    and (r->0->>'first_name_shown_to_school')::boolean);
  begin
    perform export_family_school_data('5c222222-0000-0000-0000-000000000001');
    perform ok('nobody can export another family''s school data directly', false);
  exception when insufficient_privilege then
    perform ok('nobody can export another family''s school data directly', true);
  end;
end $$;
reset role;

set role app_user;
do $$
begin
  perform become('5c111111-0000-0000-0000-000000000002');
  perform ok('a parent can delete their account', (delete_family_account('DELETE')->>'ok')::boolean);
end $$;
reset role;
do $$
begin
  perform ok('deleting the account takes the children out of their school',
    not exists (select 1 from school_members where family_id = '5c222222-0000-0000-0000-000000000002'));
  perform ok('and off every School Stars list',
    not exists (select 1 from school_top_students t join kids k on k.id = t.kid_id
                 where k.family_id = '5c222222-0000-0000-0000-000000000002'));
end $$;
