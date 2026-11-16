-- ---------------------------------------------------------------------------
-- Pilots, the report for the school office, and houses (schools.sql, the
-- section of that name at its end).
--
-- The claims worth testing:
--   - a pilot code is made by the operator alone, holds only a hash, is
--     single use and has a date it must be used by;
--   - a school's trial becomes a pilot of the code's length, and a pilot
--     NEVER adds to a paid plan: a school paying by itself or through its
--     district is told so, and the code is left unused;
--   - one pilot per school, 5 wrong codes an hour per sign-in;
--   - the reminder 14 days before a pilot ends, once, to the admins only;
--   - the report: totals that add up, the daily cap, the busiest week, the
--     kinds of chore, and no numbers for fewer than 5 students, for the
--     whole school or a house;
--   - houses: named by the admin, chosen by a parent, totals only, and the
--     students left over never a small enough group to work out by
--     subtraction;
--   - "Request a pilot" is rate limited apart from "Get a quote";
--   - retention, and nothing here reachable from a browser that should not be.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function t58_user(p_n int) returns uuid language sql immutable as $$
  select ('58a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t58_kid(p_n int) returns uuid language sql immutable as $$
  select ('58c00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t58_hash(p_code text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_code, 'UTF8')), 'hex') $$;

-- 1 the admin of Example Academy, 2 a teacher there, 3 a parent, 4 a child's
-- phone, 5 a signed-in stranger, 6 the admin of a school that pays, 7 the
-- admin of a school its district pays for, 8 the admin of a suspended
-- school, 9 the admin of a school whose trial ran out, 10 another parent.
insert into auth.users (id, email)
select t58_user(n), 't58-user-' || n || '@example.com' from generate_series(1, 10) n;

insert into schools (id, name, district, district_key, city, student_count, size_band, join_code, staff_code,
                     status, verified, trial_ends_at, created_at) values
  ('58b00000-0000-4000-8000-00000000000a', 'Example Academy', 'T58 District', 't58 district', 'Exampleton', 420, 'medium',
   'T58JNA', 'T58STAFA', 'trial', true, now() + interval '5 days', now() - interval '30 days'),
  ('58b00000-0000-4000-8000-00000000000b', 'Paying Prep', 'T58 District', 't58 district', 'Exampleton', 200, 'small',
   'T58JNB', 'T58STAFB', 'active', true, now() - interval '1 day', now() - interval '60 days'),
  ('58b00000-0000-4000-8000-00000000000c', 'District Day School', 'T58 District', 't58 district', 'Exampleton', 200, 'small',
   'T58JNC', 'T58STAFC', 'trial', true, now() + interval '10 days', now() - interval '20 days'),
  ('58b00000-0000-4000-8000-00000000000d', 'Suspended School', 'T58 District', 't58 district', 'Exampleton', 200, 'small',
   'T58JND', 'T58STAFD', 'suspended', true, now() + interval '10 days', now() - interval '20 days'),
  ('58b00000-0000-4000-8000-00000000000e', 'Lapsed Lyceum', 'T58 District', 't58 district', 'Exampleton', 1200, 'large',
   'T58JNE', 'T58STAFE', 'lapsed', true, now() - interval '3 days', now() - interval '40 days');
update schools set stripe_subscription_id = 'sub_t58_paying', stripe_customer_id = 'cus_t58_paying'
 where id = '58b00000-0000-4000-8000-00000000000b';
insert into school_staff (user_id, school_id, name, role) values
  (t58_user(1), '58b00000-0000-4000-8000-00000000000a', 'Ms Example', 'admin'),
  (t58_user(2), '58b00000-0000-4000-8000-00000000000a', 'Mr Teacher', 'teacher'),
  (t58_user(6), '58b00000-0000-4000-8000-00000000000b', 'Ms Paying', 'admin'),
  (t58_user(7), '58b00000-0000-4000-8000-00000000000c', 'Mr District', 'admin'),
  (t58_user(8), '58b00000-0000-4000-8000-00000000000d', 'Ms Suspended', 'admin'),
  (t58_user(9), '58b00000-0000-4000-8000-00000000000e', 'Dr Lapsed', 'admin');
-- The district that pays for District Day School: a plan set up by hand.
insert into districts (id, name, district_key, status, paid_all) values
  ('58d00000-0000-4000-8000-000000000001', 'T58 Unified', 't58 district', 'active', true);
insert into district_schools (school_id, district_id) values
  ('58b00000-0000-4000-8000-00000000000c', '58d00000-0000-4000-8000-000000000001');

-- Twelve children of one family at Example Academy, three of another at
-- Lapsed Lyceum. Their names and their chores' words must never reach a school.
insert into families (id, name, tier) values
  ('58f00000-0000-4000-8000-000000000001', 'The Quillons', 'standard'),
  ('58f00000-0000-4000-8000-000000000002', 'The Marrowbys', 'standard');
insert into parents (user_id, family_id, name) values
  (t58_user(3), '58f00000-0000-4000-8000-000000000001', 'Quentin'),
  (t58_user(10), '58f00000-0000-4000-8000-000000000002', 'Marjory');
select seed_consent('58f00000-0000-4000-8000-000000000001', t58_user(3));
select seed_consent('58f00000-0000-4000-8000-000000000002', t58_user(10));
insert into kids (id, family_id, name)
select t58_kid(n), case when n <= 12 then '58f00000-0000-4000-8000-000000000001'::uuid else '58f00000-0000-4000-8000-000000000002'::uuid end,
       'Zephyrine' || n || ' Quillon'
  from generate_series(1, 15) n;
update kids set user_id = t58_user(4) where id = t58_kid(1);
insert into school_members (kid_id, school_id, family_id, joined_at)
select t58_kid(n), '58b00000-0000-4000-8000-00000000000a', '58f00000-0000-4000-8000-000000000001', now() - interval '30 days'
  from generate_series(1, 12) n;
insert into school_members (kid_id, school_id, family_id, joined_at)
select t58_kid(n), '58b00000-0000-4000-8000-00000000000e', '58f00000-0000-4000-8000-000000000002', now() - interval '30 days'
  from generate_series(13, 15) n;

create temp table t58 (k text primary key, v text);

-- ---------- the operator makes pilot codes ----------
do $$
declare r jsonb;
begin
  r := create_school_pilot(t58_hash('PILOTAAAA2'), '  Example   Academy ', 90, now() + interval '60 days');
  perform ok('the operator makes a 90-day pilot code for a school', (r->>'ok')::boolean and r->>'label' = 'Example Academy'
    and (r->>'days')::int = 90, r::text);
  insert into t58 values ('code_a', r->>'id');
  perform ok('only its hash is kept, never the code',
    (select code_hash from school_pilots where id = (r->>'id')::uuid) = t58_hash('PILOTAAAA2')
    and not exists (select 1 from school_pilots where code_hash like '%PILOT%' or label like '%PILOTAAAA2%'));
  perform ok('a hash that is not one is refused', create_school_pilot('PILOTAAAA2', 'Example Academy', 90, now() + interval '1 day')->>'reason' = 'bad_code_hash');
  perform ok('it needs a label: who it is for', create_school_pilot(t58_hash('X1'), 'E', 90, now() + interval '1 day')->>'reason' = 'bad_label');
  perform ok('a pilot is 14 to 365 days', create_school_pilot(t58_hash('X2'), 'Example Academy', 7, now() + interval '1 day')->>'reason' = 'bad_days'
    and create_school_pilot(t58_hash('X3'), 'Example Academy', 400, now() + interval '1 day')->>'reason' = 'bad_days');
  perform ok('and the code is used by a date in the coming year',
    create_school_pilot(t58_hash('X4'), 'Example Academy', 90, now() - interval '1 day')->>'reason' = 'bad_expiry'
    and create_school_pilot(t58_hash('X5'), 'Example Academy', 90, now() + interval '2 years')->>'reason' = 'bad_expiry');
  perform ok('the same code twice is refused', create_school_pilot(t58_hash('PILOTAAAA2'), 'Again', 90, now() + interval '1 day')->>'reason' = 'code_taken');

  insert into t58 values ('code_b', create_school_pilot(t58_hash('PILOTBBBB2'), 'Second school', 120, now() + interval '60 days')->>'id');
  insert into t58 values ('code_old', create_school_pilot(t58_hash('PILOTOLD22'), 'Too late', 90, now() + interval '1 hour')->>'id');
  update school_pilots set code_expires_at = now() - interval '1 day' where id = (select v from t58 where k = 'code_old')::uuid;
  insert into t58 values ('code_spare', create_school_pilot(t58_hash('PILOTSPAR2'), 'Spare', 60, now() + interval '30 days')->>'id');
end $$;

-- ---------- a school's admin uses one ----------
do $$
declare
  r jsonb;
  v_before timestamptz;
  n int;
begin
  perform become(null);
  perform ok('using a pilot code needs a sign-in', redeem_school_pilot('PILOTAAAA2')->>'reason' = 'not_school_admin');
  perform become(t58_user(5));
  perform ok('a stranger cannot use one', redeem_school_pilot('PILOTAAAA2')->>'reason' = 'not_school_admin');
  perform become(t58_user(2));
  perform ok('nor a teacher: the admin decides', redeem_school_pilot('PILOTAAAA2')->>'reason' = 'not_school_admin');

  perform become(t58_user(1));
  perform ok('a code that does not exist is refused', redeem_school_pilot('NOTACODE22')->>'reason' = 'bad_code');
  perform ok('and one that ran out', redeem_school_pilot('PILOTOLD22')->>'reason' = 'expired');
  perform redeem_school_pilot('WRONGCODE3');
  perform redeem_school_pilot('WRONGCODE4');
  perform redeem_school_pilot('short');
  perform ok('five that did not work in an hour, then wait, even with the right one',
    redeem_school_pilot('PILOTAAAA2')->>'reason' = 'too_many_tries');
  delete from school_pilot_attempts where user_id = t58_user(1);

  r := redeem_school_pilot(' pilot-aaaa2 ');
  perform ok('the admin types it, any case, with a dash, and the trial becomes a 90-day pilot', (r->>'ok')::boolean
    and (r->>'days')::int = 90, r::text);
  perform ok('from today: it ends in 90 days',
    (select abs(extract(epoch from trial_ends_at - (now() + interval '90 days'))) < 5 and status = 'trial'
       from schools where id = '58b00000-0000-4000-8000-00000000000a'));
  perform ok('the code is used, by this school',
    (select school_id from school_pilots where id = (select v from t58 where k = 'code_a')::uuid) = '58b00000-0000-4000-8000-00000000000a'
    and (select ends_at from school_pilots where id = (select v from t58 where k = 'code_a')::uuid)
        = (select trial_ends_at from schools where id = '58b00000-0000-4000-8000-00000000000a'));
  perform ok('one pilot per school', redeem_school_pilot('PILOTBBBB2')->>'reason' = 'already_piloted');
  perform ok('and the school''s page says so, for its staff',
    (school_overview()->'school'->'pilot'->>'days')::int = 90
    and school_overview()->'school'->'pilot'->>'ends_at' is not null);
  perform become(t58_user(3));
  perform ok('a family sees no pilot on the school''s card',
    not ((my_schools()->'children'->0->'school') ? 'pilot'));

  -- Single use: another school's admin, with the same code.
  perform become(t58_user(9));
  perform ok('a code already used is refused for anyone else', redeem_school_pilot('PILOTAAAA2')->>'reason' = 'used');

  -- Never on top of a paid plan.
  perform become(t58_user(6));
  select trial_ends_at into v_before from schools where id = '58b00000-0000-4000-8000-00000000000b';
  perform ok('a school that pays is told so, and nothing is added to its plan',
    redeem_school_pilot('PILOTBBBB2')->>'reason' = 'already_paying'
    and (select trial_ends_at = v_before and status = 'active' from schools where id = '58b00000-0000-4000-8000-00000000000b'));
  perform ok('and the code is left for somebody else',
    (select redeemed_at is null from school_pilots where id = (select v from t58 where k = 'code_b')::uuid));
  perform ok('nor is that counted as a wrong guess', not exists (select 1 from school_pilot_attempts where user_id = t58_user(6)));
  -- Paying by card during its trial: Stripe's "trialing" makes the school active.
  update schools set status = 'trial', stripe_subscription_id = 'sub_t58_trialing' where id = '58b00000-0000-4000-8000-00000000000b';
  perform ok('nor a school that has started a plan which bills after its trial',
    redeem_school_pilot('PILOTBBBB2')->>'reason' = 'already_paying');
  update schools set status = 'active', stripe_subscription_id = 'sub_t58_paying' where id = '58b00000-0000-4000-8000-00000000000b';
  perform become(t58_user(7));
  perform ok('a school its district pays for is told so too', redeem_school_pilot('PILOTBBBB2')->>'reason' = 'district_pays');
  perform become(t58_user(8));
  perform ok('a suspended school cannot use one', redeem_school_pilot('PILOTBBBB2')->>'reason' = 'suspended');

  -- A school whose trial ran out, never paid: back in, for the pilot.
  perform become(t58_user(9));
  r := redeem_school_pilot('PILOTBBBB2');
  perform ok('a school whose trial ran out starts a 120-day pilot, and is in the league again',
    (r->>'ok')::boolean and (select status from schools where id = '58b00000-0000-4000-8000-00000000000e') = 'trial'
    and school_is_live('58b00000-0000-4000-8000-00000000000e'), r::text);
  perform become(null);

  select count(*) into n from jsonb_array_elements(operator_school_pilots()) e where e->>'label' in ('Example Academy', 'Second school', 'Too late', 'Spare');
  perform ok('the operator''s list has every code', n = 4, n::text);
  perform ok('and how each stands: running, waiting, expired',
    (select e->>'state' from jsonb_array_elements(operator_school_pilots()) e where e->>'label' = 'Example Academy') = 'running'
    and (select e->>'state' from jsonb_array_elements(operator_school_pilots()) e where e->>'label' = 'Spare') = 'waiting'
    and (select e->>'state' from jsonb_array_elements(operator_school_pilots()) e where e->>'label' = 'Too late') = 'expired'
    and (select e->'school'->>'name' from jsonb_array_elements(operator_school_pilots()) e where e->>'label' = 'Second school') = 'Lapsed Lyceum'
    and (select e->>'ends_at' from jsonb_array_elements(operator_school_pilots()) e where e->>'label' = 'Second school') is not null);
  r := withdraw_school_pilot((select v from t58 where k = 'code_spare')::uuid);
  perform ok('a code nobody used can be taken back', (r->>'ok')::boolean
    and not exists (select 1 from school_pilots where id = (select v from t58 where k = 'code_spare')::uuid), r::text);
  perform ok('one that was used cannot: it is the record of the pilot',
    withdraw_school_pilot((select v from t58 where k = 'code_a')::uuid)->>'reason' = 'not_withdrawable');
end $$;

-- ---------- the reminder, 14 days before ----------
do $$
declare
  r jsonb;
  pid uuid := (select v from t58 where k = 'code_a')::uuid;
  mine jsonb;
begin
  perform ok('a pilot ending in 90 days is not due a reminder',
    not exists (select 1 from jsonb_array_elements(due_pilot_reminders()->'reminders') e where (e->>'pilot_id')::uuid = pid));
  update schools set trial_ends_at = now() + interval '13 days' where id = '58b00000-0000-4000-8000-00000000000a';
  select e into mine from jsonb_array_elements(due_pilot_reminders()->'reminders') e where (e->>'pilot_id')::uuid = pid;
  perform ok('13 days before the end, it is due', mine is not null and (mine->>'days_left')::int = 13, coalesce(mine::text, 'none'));
  perform ok('to the school''s admins only, never a teacher or a family',
    mine->'recipients' = '["t58-user-1@example.com"]'::jsonb, mine->>'recipients');
  perform ok('with the price for the school''s size and the day it ends',
    (mine->'price'->>'monthly_cents')::int = 5900 and mine->>'ends_local' ~ '^[A-Z][a-z]+ \d{1,2} [A-Z][a-z]+ \d{4}$', mine::text);
  perform ok('and nothing about any child', mine::text !~ 'Zephyrine|Quillon');
  perform ok('claimed once', claim_pilot_reminder(pid) and not claim_pilot_reminder(pid));
  perform ok('and not listed while claimed',
    not exists (select 1 from jsonb_array_elements(due_pilot_reminders()->'reminders') e where (e->>'pilot_id')::uuid = pid));
  perform finish_pilot_reminder(pid, false);
  perform ok('a send that failed gives it back for the next run', claim_pilot_reminder(pid));
  perform finish_pilot_reminder(pid, true);
  perform ok('sent: never again', not claim_pilot_reminder(pid)
    and not exists (select 1 from jsonb_array_elements(due_pilot_reminders()->'reminders') e where (e->>'pilot_id')::uuid = pid));
  -- A pilot whose school chose a plan: no reminder.
  update school_pilots set reminder_sent_at = null where school_id = '58b00000-0000-4000-8000-00000000000e';
  update schools set trial_ends_at = now() + interval '5 days', status = 'active', stripe_subscription_id = 'sub_t58_lyceum'
   where id = '58b00000-0000-4000-8000-00000000000e';
  perform ok('a school that has chosen a plan is not reminded',
    not exists (select 1 from jsonb_array_elements(due_pilot_reminders()->'reminders') e where e->>'name' = 'Lapsed Lyceum'));
  perform ok('and the operator sees it is paying',
    (select e->>'state' from jsonb_array_elements(operator_school_pilots()) e where e->>'label' = 'Second school') = 'paying');
  update schools set status = 'trial', stripe_subscription_id = null, trial_ends_at = now() - interval '1 hour'
   where id = '58b00000-0000-4000-8000-00000000000e';
  perform ok('and one whose pilot is over shows as ended',
    (select e->>'state' from jsonb_array_elements(operator_school_pilots()) e where e->>'label' = 'Second school') = 'ended');
  update schools set trial_ends_at = now() + interval '80 days' where id = '58b00000-0000-4000-8000-00000000000a';
end $$;

-- ---------- houses: named by the admin ----------
do $$
declare r jsonb; n int;
begin
  perform become(t58_user(2));
  perform ok('a teacher cannot name houses', add_school_group('Red')->>'reason' = 'not_school_admin');
  perform become(t58_user(1));
  r := add_school_group('  Red   House ');
  perform ok('the admin adds a house, its name tidied', (r->>'ok')::boolean and r->>'name' = 'Red House', r::text);
  insert into t58 values ('red', r->>'id');
  insert into t58 values ('blue', add_school_group('Blue House')->>'id');
  insert into t58 values ('green', add_school_group('Green House')->>'id');
  perform ok('two houses cannot share a name, whatever the case', add_school_group('red house')->>'reason' = 'group_name_taken');
  perform ok('a name needs letters', add_school_group('   ')->>'reason' = 'bad_group_name');
  perform ok('and children read it, so no rude words', add_school_group('Shit house')->>'reason' = 'bad_group_name');
  perform ok('nor anything like markup', add_school_group('<b>Red</b>')->>'reason' = 'bad_group_name');
  for n in 4 .. 12 loop perform add_school_group('Spare ' || n); end loop;
  perform ok('twelve at most', add_school_group('Thirteenth')->>'reason' = 'too_many_groups');
  delete from school_groups where school_id = '58b00000-0000-4000-8000-00000000000a' and name like 'Spare %';

  r := rename_school_group((select v from t58 where k = 'green')::uuid, 'Green Team');
  perform ok('renamed', (r->>'ok')::boolean
    and (select name from school_groups where id = (select v from t58 where k = 'green')::uuid) = 'Green Team', r::text);
  perform ok('not to a name another house has', rename_school_group((select v from t58 where k = 'green')::uuid, 'BLUE HOUSE')->>'reason' = 'group_name_taken');
  perform ok('nor to nothing', rename_school_group((select v from t58 where k = 'green')::uuid, '')->>'reason' = 'bad_group_name');
  perform ok('and only the school''s own houses', rename_school_group(gen_random_uuid(), 'X')->>'reason' = 'no_such_group'
    and remove_school_group(gen_random_uuid())->>'reason' = 'no_such_group');
  perform become(t58_user(9));
  perform ok('another school''s admin cannot touch them',
    rename_school_group((select v from t58 where k = 'red')::uuid, 'Ours now')->>'reason' = 'no_such_group'
    and remove_school_group((select v from t58 where k = 'red')::uuid)->>'reason' = 'no_such_group');
  perform become(t58_user(1));
  perform ok('"House" or "Class", nothing else', set_school_group_kind('team')->>'reason' = 'bad_group_kind');
  r := set_school_group_kind('class');
  perform ok('the school calls them classes', (r->>'ok')::boolean
    and school_overview()->'school'->'houses'->>'kind' = 'class', r::text);
  perform set_school_group_kind('house');
  perform become(t58_user(2));
  perform ok('which only the admin decides', set_school_group_kind('class')->>'reason' = 'not_school_admin'
    and remove_school_group((select v from t58 where k = 'red')::uuid)->>'reason' = 'not_school_admin'
    and rename_school_group((select v from t58 where k = 'red')::uuid, 'X')->>'reason' = 'not_school_admin');
end $$;

-- ---------- houses: chosen by a parent ----------
do $$
declare n int; r jsonb;
begin
  perform become(t58_user(4));
  perform ok('a child cannot choose their own house', set_kid_school_group(t58_kid(1), (select v from t58 where k = 'red')::uuid)->>'reason' = 'not_a_parent');
  perform become(t58_user(10));
  perform ok('nor can another family''s parent', set_kid_school_group(t58_kid(1), (select v from t58 where k = 'red')::uuid)->>'reason' = 'not_in_one');
  perform ok('and a house from another school is not one', set_kid_school_group(t58_kid(13), (select v from t58 where k = 'red')::uuid)->>'reason' = 'no_such_group');
  perform become(t58_user(3));
  for n in 1 .. 6 loop perform set_kid_school_group(t58_kid(n), (select v from t58 where k = 'red')::uuid); end loop;
  for n in 7 .. 11 loop perform set_kid_school_group(t58_kid(n), (select v from t58 where k = 'blue')::uuid); end loop;
  r := set_kid_school_group(t58_kid(12), (select v from t58 where k = 'green')::uuid);
  perform ok('the parent puts each child in a house', (r->>'ok')::boolean
    and (select count(*) from school_members where group_id = (select v from t58 where k = 'red')::uuid) = 6, r::text);
  perform ok('and sees which, for each child',
    (select c->>'group_id' from jsonb_array_elements(my_schools()->'children') c where (c->>'kid_id')::uuid = t58_kid(12))
      = (select v from t58 where k = 'green'));
  perform ok('a child in no school has no house', set_kid_school_group(gen_random_uuid(), null)->>'reason' = 'not_in_one');
end $$;

-- ---------- chores, for the report and the board ----------
-- Red (children 1-6): child 1 has ten accepted in one day (eight count),
-- 2 to 6 two each, all at noon eight days ago, all kitchen.
-- Blue (7-11): 7, 8, 9 one each twenty days ago (bedroom); 10 a chore still
-- waiting, 11 nothing. Green (12): one an hour ago (pets).
do $$
declare n int; q uuid; d timestamptz := date_trunc('day', now() - interval '8 days') + interval '12 hours';
begin
  for n in 1 .. 12 loop
    insert into quests (id, family_id, kid_id, title, category)
    values (('58e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '58f00000-0000-4000-8000-000000000001', t58_kid(n),
            'Secret chore words ' || n,
            case when n <= 6 then 'kitchen' when n <= 11 then 'bedroom' else 'pets' end);
  end loop;
  q := '58e00000-0000-4000-8000-000000000001';
  insert into submissions (family_id, quest_id, kid_id, status, decided_at, note)
  select '58f00000-0000-4000-8000-000000000001', q, t58_kid(1), 'approved', d + make_interval(mins => i), 'typed by a child'
    from generate_series(1, 10) i;
  for n in 2 .. 6 loop
    insert into submissions (family_id, quest_id, kid_id, status, decided_at)
    select '58f00000-0000-4000-8000-000000000001', ('58e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, t58_kid(n),
           'approved', d + make_interval(mins => i) from generate_series(1, 2) i;
  end loop;
  for n in 7 .. 9 loop
    insert into submissions (family_id, quest_id, kid_id, status, decided_at)
    values ('58f00000-0000-4000-8000-000000000001', ('58e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, t58_kid(n),
            'approved', now() - interval '20 days');
  end loop;
  insert into submissions (family_id, quest_id, kid_id, status)
  values ('58f00000-0000-4000-8000-000000000001', '58e00000-0000-4000-8000-000000000010', t58_kid(10), 'pending');
  insert into submissions (family_id, quest_id, kid_id, status, decided_at)
  values ('58f00000-0000-4000-8000-000000000001', '58e00000-0000-4000-8000-000000000012', t58_kid(12), 'approved', now() - interval '1 hour');
  -- Before the school signed up: not the pilot's.
  insert into submissions (family_id, quest_id, kid_id, status, decided_at)
  values ('58f00000-0000-4000-8000-000000000001', '58e00000-0000-4000-8000-000000000011', t58_kid(11), 'approved', now() - interval '45 days');
end $$;

-- ---------- the report ----------
do $$
declare
  r jsonb;
  g jsonb;
begin
  perform become(t58_user(2));
  perform ok('the report is the admin''s', school_pilot_report()->>'reason' = 'not_school_admin');
  perform become(t58_user(5));
  perform ok('and nobody else''s', school_pilot_report()->>'reason' = 'not_school_admin');
  perform become(t58_user(1));
  r := school_pilot_report();
  perform ok('the admin opens the report, any time during the pilot', (r->>'ok')::boolean and r->>'kind' = 'pilot'
    and r->'school'->>'name' = 'Example Academy' and not (r->>'over')::boolean, r::text);
  perform ok('12 students taking part', (r->'totals'->>'shown')::boolean and (r->'totals'->>'students')::int = 12, r->>'totals');
  perform ok('10 of them did at least one chore: 83%', (r->'totals'->>'active')::int = 10 and (r->'totals'->>'share_pct')::int = 83);
  perform ok('22 chores done, at most eight a day each, none before the school signed up, none still waiting',
    (r->'totals'->>'chores')::int = 22, r->>'totals');
  perform ok('1.8 per student', (r->'totals'->>'average')::numeric = 1.8);
  perform ok('the busiest week is the one eight days ago, with 18',
    (r->'busiest_week'->>'starts')::date = date_trunc('week', (now() - interval '8 days') at time zone 'UTC')::date
    and (r->'busiest_week'->>'chores')::int = 18, r->>'busiest_week');
  perform ok('the most popular kinds: kitchen, then bedroom, then pets',
    r->'kinds' = '[{"kind": "kitchen", "share_pct": 83}, {"kind": "bedroom", "share_pct": 13}, {"kind": "pets", "share_pct": 4}]'::jsonb,
    r->>'kinds');
  perform ok('ending with the price for its size', (r->'price'->>'monthly_cents')::int = 5900 and r->'price'->>'label' = 'Medium school');

  -- Green House has one child, so it shows nothing. Blue has five, but the
  -- school's total less Red and Blue would then be that one child's
  -- numbers: so Blue is not shown either.
  perform ok('a house of one shows no numbers',
    not (select (e->>'shown')::boolean from jsonb_array_elements(r->'groups'->'groups') e where e->>'name' = 'Green Team')
    and not ((select e from jsonb_array_elements(r->'groups'->'groups') e where e->>'name' = 'Green Team') ? 'chores'));
  perform ok('and Blue, with five, is hidden too, or school less Red less Blue would be that one child',
    not (select (e->>'shown')::boolean from jsonb_array_elements(r->'groups'->'groups') e where e->>'name' = 'Blue House'));
  select e into g from jsonb_array_elements(r->'groups'->'groups') e where e->>'name' = 'Red House';
  perform ok('Red: 6 students, all of them did a chore, 18 chores, 3.0 each',
    (g->>'shown')::boolean and (g->>'students')::int = 6 and (g->>'share_pct')::int = 100
    and (g->>'chores')::int = 18 and (g->>'average')::numeric = 3.0, g::text);
  perform ok('never a child: no name, nothing typed, no chore''s words',
    r::text !~ 'Zephyrine|Quillon|typed by a child|Secret chore' and r::text !~ '58c00000');

  perform become(t58_user(3));
  perform set_kid_school_group(t58_kid(12), (select v from t58 where k = 'red')::uuid);
  perform become(t58_user(1));
  r := school_pilot_report();
  perform ok('with the child moved to Red, nobody is left over: Red and Blue both show',
    (select bool_and((e->>'shown')::boolean) from jsonb_array_elements(r->'groups'->'groups') e where e->>'name' in ('Red House', 'Blue House')));
  select e into g from jsonb_array_elements(r->'groups'->'groups') e where e->>'name' = 'Blue House';
  perform ok('Blue: 5 students, 60% did a chore, 3 chores, 0.6 each',
    (g->>'students')::int = 5 and (g->>'share_pct')::int = 60 and (g->>'chores')::int = 3 and (g->>'average')::numeric = 0.6, g::text);
  perform ok('best average first', r->'groups'->'groups'->0->>'name' = 'Red House' and r->'groups'->'groups'->2->>'name' = 'Green Team'
    and not (r->'groups'->'groups'->2->>'shown')::boolean);

  -- The board on the school's page reads the same totals, for this month.
  perform ok('the league board on the school''s page has the houses',
    school_overview()->'school'->'houses'->>'kind' = 'house'
    and jsonb_array_length(school_overview()->'school'->'houses'->'groups') = 3);
  perform become(t58_user(4));
  perform ok('and so does a student''s own school page, with no child in it',
    jsonb_array_length(my_schools()->'children'->0->'school'->'houses'->'groups') = 3
    and (my_schools()->'children'->0->'school'->'houses')::text !~ 'Zephyrine|Quillon');

  perform become(t58_user(1));
  r := remove_school_group((select v from t58 where k = 'green')::uuid);
  perform ok('a house removed leaves its children in the school, in no house', (r->>'ok')::boolean
    and not exists (select 1 from school_groups where id = (select v from t58 where k = 'green')::uuid)
    and (select count(*) from school_members where school_id = '58b00000-0000-4000-8000-00000000000a') = 12);
  perform become(t58_user(3));
  perform set_kid_school_group(t58_kid(12), null);
  perform ok('a parent can take their child out of a house', (select group_id from school_members where kid_id = t58_kid(12)) is null);
end $$;

do $$
declare g jsonb;
begin
  -- Child 12 in no house now: one left over again, so Blue hides again.
  g := school_group_totals('58b00000-0000-4000-8000-00000000000a', now() - interval '30 days', now());
  perform ok('one child in no house: Blue hides again, Red still shows',
    (select (e->>'shown')::boolean from jsonb_array_elements(g) e where e->>'name' = 'Red House')
    and not (select (e->>'shown')::boolean from jsonb_array_elements(g) e where e->>'name' = 'Blue House'), g::text);
  -- Whatever the houses, the students left over are never 1 to 4.
  perform ok('what is hidden is never a group of 1 to 4 students',
    (select 12 - coalesce(sum((e->>'students')::int), 0) from jsonb_array_elements(g) e where (e->>'shown')::boolean) not between 1 and 4);
end $$;

-- ---------- a school too small to show ----------
do $$
declare r jsonb;
begin
  perform become(t58_user(9));
  r := school_pilot_report();
  perform ok('three students taking part: no numbers at all, only how many joined',
    (r->>'ok')::boolean and not (r->'totals'->>'shown')::boolean and (r->'totals'->>'students')::int = 3
    and not (r->'totals' ? 'chores') and r->'busiest_week' = 'null'::jsonb and r->'kinds' = '[]'::jsonb, r::text);
  perform ok('it still says what the school would pay', (r->'price'->>'monthly_cents')::int = 9900);
  perform ok('the pilot is over, and the report says so', (r->>'over')::boolean);
  perform become(t58_user(7));
  r := school_pilot_report();
  perform ok('a school on its ordinary trial gets the report too', r->>'kind' = 'trial' and (r->>'paid')::boolean, r::text);
  perform become(null);
end $$;

-- ---------- "Request a pilot" is rate limited, apart from quotes ----------
do $$
declare n int;
begin
  delete from district_quote_attempts;
  perform ok('a request is noted', (record_pilot_request('t58-ip-a')->>'ok')::boolean);
  perform record_pilot_request('t58-ip-a');
  perform record_pilot_request('t58-ip-a');
  perform ok('three an hour from one place, then wait', record_pilot_request('t58-ip-a')->>'reason' = 'too_many_requests');
  perform ok('and a quote from the same place is not held up by them', (record_district_quote('t58-ip-a')->>'ok')::boolean);
  perform ok('nothing but a mark is kept', (select count(*) from district_quote_attempts where kind = 'pilot') = 3
    and (select count(*) from district_quote_attempts where kind = 'quote') = 1);
  for n in 1 .. 30 loop perform record_pilot_request('t58-ip-' || n); end loop;
  perform ok('thirty an hour in all', record_pilot_request('t58-ip-new')->>'reason' = 'busy');
  delete from district_quote_attempts;
end $$;

-- ---------- retention ----------
do $$
declare r jsonb;
begin
  insert into school_pilot_attempts (user_id, tried_at) values (t58_user(5), now() - interval '3 days'), (t58_user(5), now());
  insert into school_pilots (id, code_hash, label, days, code_expires_at, created_at) values
    ('58a10000-0000-4000-8000-000000000001', t58_hash('OLDUNUSED1'), 'Old unused', 90, now() - interval '100 days', now() - interval '200 days'),
    ('58a10000-0000-4000-8000-000000000002', t58_hash('NEWUNUSED1'), 'Recent unused', 90, now() - interval '10 days', now() - interval '60 days');
  update school_pilots set ends_at = now() - interval '400 days', redeemed_at = now() - interval '490 days'
   where school_id = '58b00000-0000-4000-8000-00000000000e';
  r := run_retention();
  perform ok('codes typed that did not work go after two days',
    (select count(*) from school_pilot_attempts where user_id = t58_user(5)) = 1, r::text);
  perform ok('a code nobody used goes 90 days after it could no longer be used',
    not exists (select 1 from school_pilots where id = '58a10000-0000-4000-8000-000000000001')
    and exists (select 1 from school_pilots where id = '58a10000-0000-4000-8000-000000000002'));
  perform ok('a pilot a year after it ended; one running is kept',
    not exists (select 1 from school_pilots where school_id = '58b00000-0000-4000-8000-00000000000e')
    and exists (select 1 from school_pilots where school_id = '58b00000-0000-4000-8000-00000000000a')
    and (r->>'pilots_deleted')::int >= 2, r::text);
  perform ok('and the school is never deleted with it', exists (select 1 from schools where id = '58b00000-0000-4000-8000-00000000000e'));
end $$;

-- ---------- what a browser can reach ----------
do $$
begin
  perform ok('the admin''s and the parent''s, signed in only',
    has_function_privilege('authenticated', 'redeem_school_pilot(text)', 'execute')
    and has_function_privilege('authenticated', 'school_pilot_report()', 'execute')
    and has_function_privilege('authenticated', 'add_school_group(text)', 'execute')
    and has_function_privilege('authenticated', 'set_kid_school_group(uuid,uuid)', 'execute')
    and not has_function_privilege('anon', 'redeem_school_pilot(text)', 'execute')
    and not has_function_privilege('anon', 'school_pilot_report()', 'execute')
    and not has_function_privilege('anon', 'set_kid_school_group(uuid,uuid)', 'execute'));
  perform ok('making, listing and taking back codes, the reminders and the request marks are the server''s',
    not has_function_privilege('authenticated', 'create_school_pilot(text,text,integer,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'operator_school_pilots()', 'execute')
    and not has_function_privilege('authenticated', 'withdraw_school_pilot(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'due_pilot_reminders(timestamptz)', 'execute')
    and not has_function_privilege('anon', 'record_pilot_request(text)', 'execute')
    and not has_function_privilege('authenticated', 'school_group_totals(uuid,timestamptz,timestamptz)', 'execute'));
  perform ok('and the new tables have row level security on',
    (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relrowsecurity
      and c.relname in ('school_groups', 'school_pilots', 'school_pilot_attempts')) = 3);
end $$;

-- Tidy up: the app's tests run against this database afterwards.
delete from school_pilots where label in ('Example Academy', 'Second school', 'Too late', 'Spare', 'Recent unused');
delete from districts where id = '58d00000-0000-4000-8000-000000000001';
delete from schools where id::text like '58b00000-%';
delete from families where id::text like '58f00000-%';
delete from school_pilot_attempts where user_id in (select t58_user(n) from generate_series(1, 10) n);
delete from auth.users where id in (select t58_user(n) from generate_series(1, 10) n);
drop function t58_user(int);
drop function t58_kid(int);
drop function t58_hash(text);
