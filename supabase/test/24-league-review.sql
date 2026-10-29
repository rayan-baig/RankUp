-- ---------------------------------------------------------------------------
-- The School League, after review.
--
-- Each block here is a problem a review found and reproduced, kept as a test
-- so it stays fixed: a child listed twice in the Stars after a second
-- settlement, a cancelled plan that came back as paid, an old subscription's
-- cancellation lapsing a school that was still paying, a staff code that could
-- not be shut out, rivalries won by one keen child, a school that had stopped
-- paying still shown as ranked, and a supporter (a grandparent who can look
-- in) able to delete the family.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('6d111111-0000-0000-0000-00000000000a', 'review-admin@example.com'),
  ('6d111111-0000-0000-0000-00000000000b', 'review-admin-b@example.com'),
  ('6d111111-0000-0000-0000-0000000000a1', 'review-teacher@example.com'),
  ('6d111111-0000-0000-0000-000000000001', 'review-parent@example.com'),
  ('6d111111-0000-0000-0000-000000000002', 'review-parent-two@example.com'),
  ('6d111111-0000-0000-0000-0000000000e1', 'review-supporter@example.com');

insert into families (id, name, tier) values
  ('6d222222-0000-0000-0000-000000000001', 'The Reviews', 'standard'),
  ('6d222222-0000-0000-0000-000000000002', 'The Seconds', 'standard');
insert into parents (user_id, family_id, name, role) values
  ('6d111111-0000-0000-0000-000000000001', '6d222222-0000-0000-0000-000000000001', 'Rae', 'parent'),
  ('6d111111-0000-0000-0000-000000000002', '6d222222-0000-0000-0000-000000000002', 'Sol', 'parent'),
  ('6d111111-0000-0000-0000-0000000000e1', '6d222222-0000-0000-0000-000000000001', 'Gran', 'supporter');
select seed_consent('6d222222-0000-0000-0000-000000000001', '6d111111-0000-0000-0000-000000000001');
select seed_consent('6d222222-0000-0000-0000-000000000002', '6d111111-0000-0000-0000-000000000002');

-- Six children in one family for school R, one in another for school Q.
insert into kids (id, family_id, name)
select ('6d444441-0000-0000-0000-00000000000' || n)::uuid, '6d222222-0000-0000-0000-000000000001', 'Kid' || n
  from generate_series(1, 6) n;
insert into kids (id, family_id, name) values
  ('6d444442-0000-0000-0000-000000000001', '6d222222-0000-0000-0000-000000000002', 'Solo');
insert into quests (id, family_id, kid_id, title)
select ('6d555555-0000-0000-0000-' || lpad(row_number() over (order by k.id)::text, 12, '0'))::uuid,
       k.family_id, k.id, 'Tidy'
  from kids k where k.family_id::text like '6d222222-%';

-- Last month: KidN finishes N chores on N different days, so the order is
-- Kid6, Kid5, ... Kid1. Solo does twenty, over twenty days.
do $$
declare m timestamptz := date_trunc('month', now()) - interval '1 month'; n int; d int;
begin
  for n in 1..6 loop
    for d in 1..n loop
      insert into submissions (family_id, quest_id, kid_id, status, decided_at)
      select k.family_id, q.id, k.id, 'approved', m + make_interval(days => d)
        from kids k join quests q on q.kid_id = k.id
       where k.id = ('6d444441-0000-0000-0000-00000000000' || n)::uuid;
    end loop;
  end loop;
  for d in 1..20 loop
    insert into submissions (family_id, quest_id, kid_id, status, decided_at)
    select k.family_id, q.id, k.id, 'approved', m + make_interval(days => d)
      from kids k join quests q on q.kid_id = k.id where k.id = '6d444442-0000-0000-0000-000000000001';
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
revoke all on schools, school_staff, school_members, school_rivalries, school_month_scores,
              school_awards, school_rivalry_results, school_top_students
  from anon, authenticated;
create temp table rcodes (school text primary key, join_code text, staff_code text);
grant all on rcodes to app_user;

set role app_user;
do $$
declare r jsonb; n int;
begin
  perform become('6d111111-0000-0000-0000-00000000000a');
  r := register_school('Review Primary', 'Review District', 'Testville', 400, 'Ms Rev');
  insert into rcodes values ('r', r->>'join_code', r->>'staff_code');
  perform become('6d111111-0000-0000-0000-00000000000b');
  r := register_school('Quiet School', 'Review District', 'Testville', 120, 'Mr Q');
  insert into rcodes values ('q', r->>'join_code', r->>'staff_code');

  perform become('6d111111-0000-0000-0000-000000000001');
  for n in 1..6 loop
    perform join_school(('6d444441-0000-0000-0000-00000000000' || n)::uuid,
                        (select join_code from rcodes where school = 'r'), true);
  end loop;
  perform become('6d111111-0000-0000-0000-000000000002');
  perform join_school('6d444442-0000-0000-0000-000000000001', (select join_code from rcodes where school = 'q'));
  perform become('6d111111-0000-0000-0000-0000000000a1');
  perform join_school_staff((select staff_code from rcodes where school = 'r'), 'Mr Teach');
end $$;
reset role;

select verify_school(id, true) from schools where district_key = 'review district';
update school_members set joined_at = now() - interval '3 months'
 where school_id in (select id from schools where district_key = 'review district');
-- An active rivalry between them since before last month.
insert into school_rivalries (challenger_id, rival_id, status, answered_at)
select r.id, q.id, 'active', now() - interval '2 months'
  from schools r, schools q where r.name = 'Review Primary' and q.name = 'Quiet School';

-- ---------- settling twice never lists a child twice ----------
do $$
declare
  rp uuid := (select id from schools where name = 'Review Primary');
  last_m date := (date_trunc('month', now()) - interval '1 month')::date;
  last_k text := to_char(date_trunc('month', now()) - interval '1 month', 'YYYY-MM');
begin
  perform settle_school_month(last_m);
  perform ok('the first settlement lists all six',
    (select count(*) from school_top_students where school_id = rp and month_key = last_k) = 6);

  -- Kid5 (second place) leaves; the month is closed again.
  delete from school_members where kid_id = '6d444441-0000-0000-0000-000000000005';
  delete from school_top_students where kid_id = '6d444441-0000-0000-0000-000000000005';
  perform settle_school_month(last_m);
  perform ok('a second settlement does not move anyone into the gap, or list anyone twice',
    (select count(*) from school_top_students where school_id = rp and month_key = last_k) = 5
    and (select count(distinct kid_id) from school_top_students where school_id = rp and month_key = last_k) = 5);

  perform ok('a rivalry with a school too small to rank has no result that month',
    not exists (select 1 from school_rivalry_results x join school_rivalries r on r.id = x.rivalry_id
                 where r.challenger_id = rp));
end $$;

-- ---------- subscriptions ----------
do $$
declare rp uuid := (select id from schools where name = 'Review Primary'); r jsonb;
begin
  update schools set trial_ends_at = now() - interval '1 day' where id = rp;
  perform apply_school_subscription(rp, 'active', 'cus_rev', 'sub_new', 'evt_rev_1');
  r := apply_school_subscription(rp, 'canceled', 'cus_rev', 'sub_old', 'evt_rev_2');
  perform ok('cancelling an OLD subscription leaves a paying school paying',
    (r->>'ignored') = 'not_current_subscription'
    and (select status from schools where id = rp) = 'active');

  perform apply_school_subscription(rp, 'canceled', 'cus_rev', 'sub_new', 'evt_rev_3');
  perform ok('cancelling the current one ends the plan and forgets the subscription',
    (select status = 'lapsed' and stripe_subscription_id is null from schools where id = rp));

  perform set_school_status(rp, 'suspended');
  perform ok('so lifting a suspension cannot hand back a paid plan nobody is paying for',
    (unsuspend_school(rp)->>'status') = 'lapsed');

  perform apply_school_subscription(rp, 'active', 'cus_rev_new', 'sub_newer', 'evt_rev_4');
  perform ok('a new subscription on a new customer becomes the school''s customer',
    stripe_customer_for_school(rp) = 'cus_rev_new');
end $$;

set role app_user;
do $$
begin
  perform become('6d111111-0000-0000-0000-00000000000a');
  perform ok('a school already paying cannot start a second checkout',
    (school_checkout_info()->>'reason') = 'already_paying');
end $$;
reset role;

-- ---------- a school that has stopped paying is not ranked ----------
update schools set status = 'lapsed', stripe_subscription_id = null, trial_ends_at = now() - interval '1 day'
 where name = 'Review Primary';
set role app_user;
do $$
declare r jsonb;
begin
  perform become('6d111111-0000-0000-0000-00000000000a');
  r := school_overview()->'school';
  perform ok('a lapsed school is not shown as ranked', not (r->>'ranked')::boolean and r->'district_rank' = 'null'::jsonb);
  perform ok('nor ranked in its own league table',
    not exists (select 1 from jsonb_array_elements(school_league()->'schools') e
                 where (e->>'you')::boolean and (e->>'ranked')::boolean));
end $$;
reset role;

-- ---------- staff ----------
update schools set status = 'trial', trial_ends_at = now() + interval '10 days' where name = 'Review Primary';
set role app_user;
do $$
declare v_ref uuid;
begin
  perform become('6d111111-0000-0000-0000-0000000000a1');
  perform ok('a teacher sees no other staff member''s reference',
    not exists (select 1 from jsonb_array_elements(school_overview()->'school'->'staff') e
                 where e->'ref' <> 'null'::jsonb));
  perform ok('and cannot remove anyone',
    (remove_school_staff('6d111111-0000-0000-0000-00000000000a')->>'reason') = 'not_school_admin');

  perform become('6d111111-0000-0000-0000-00000000000a');
  select (e->>'ref')::uuid into v_ref
    from jsonb_array_elements(school_overview()->'school'->'staff') e where e->>'name' = 'Mr Teach';
  perform ok('the admin cannot remove themselves this way',
    (remove_school_staff('6d111111-0000-0000-0000-00000000000a')->>'reason') = 'not_yourself');
  perform ok('but can remove a teacher', (remove_school_staff(v_ref)->>'ok')::boolean);
  perform ok('nobody on another school''s staff can be removed from here',
    (remove_school_staff('6d111111-0000-0000-0000-00000000000b')->>'reason') = 'not_on_staff');

  perform become('6d111111-0000-0000-0000-0000000000a1');
  perform ok('the removed teacher sees the school no more', (school_overview()->'school') = 'null'::jsonb);

  -- Size, once checked.
  perform become('6d111111-0000-0000-0000-00000000000a');
  perform ok('a checked school cannot move itself to a cheaper size band',
    (update_school_size(100)->>'reason') = 'smaller_contact_us');
  perform ok('but can correct itself upwards', (update_school_size(1000)->'price'->>'band') = 'large');
end $$;
reset role;

-- ---------- accepting a challenge respects the three-rival limit ----------
insert into schools (id, name, district, district_key, student_count, size_band, verified) values
  ('6d777777-0000-0000-0000-000000000001', 'Other One', 'Review District', 'review district', 50, 'small', true),
  ('6d777777-0000-0000-0000-000000000002', 'Other Two', 'Review District', 'review district', 50, 'small', true),
  ('6d777777-0000-0000-0000-000000000003', 'Other Three', 'Review District', 'review district', 50, 'small', true);
-- Quiet School already has one active rivalry (with Review Primary); two more.
insert into school_rivalries (challenger_id, rival_id, status, answered_at)
select o.id, q.id, 'active', now() from schools o, schools q
 where o.name in ('Other One', 'Other Two') and q.name = 'Quiet School';
insert into school_rivalries (challenger_id, rival_id, status)
select o.id, q.id, 'pending' from schools o, schools q
 where o.name = 'Other Three' and q.name = 'Quiet School';
set role app_user;
do $$
begin
  perform become('6d111111-0000-0000-0000-00000000000b');
  perform ok('a school with three rivals cannot be pulled into a fourth by accepting',
    (answer_challenge((select id from jsonb_to_recordset(school_overview()->'school'->'rivalries')
                         as x(id uuid, status text) where status = 'pending' limit 1), true)->>'reason')
    = 'too_many_rivals');
end $$;
reset role;

-- ---------- what billing needs to give a free month ----------
insert into school_awards (district_key, month_key, school_id, score)
select 'review district', '2001-01', id, 1 from schools where name = 'Review Primary';
do $$
begin
  perform ok('a free month owed is priced at the school''s own monthly price',
    exists (select 1 from jsonb_array_elements(unapplied_school_awards()) e
             where e->>'month_key' = '2001-01' and (e->>'monthly_cents')::int = 9900));
end $$;

-- ---------- a supporter is not a parent ----------
set role app_user;
do $$
declare v_sub uuid;
begin
  perform become('6d111111-0000-0000-0000-0000000000e1');
  begin
    perform export_family_data();
    perform ok('a supporter CANNOT download the family''s data', false);
  exception when raise_exception then
    perform ok('a supporter CANNOT download the family''s data', true);
  end;
  begin
    perform delete_family_account('DELETE');
    perform ok('a supporter CANNOT delete the family', false);
  exception when raise_exception then
    perform ok('a supporter CANNOT delete the family', true);
  end;
  begin
    perform revoke_parental_consent('not mine to withdraw');
    perform ok('a supporter CANNOT withdraw consent (which deletes the children)', false);
  exception when raise_exception then
    perform ok('a supporter CANNOT withdraw consent (which deletes the children)', true);
  end;
end $$;
reset role;

insert into submissions (id, family_id, quest_id, kid_id, status)
select '6d888888-0000-0000-0000-000000000001', k.family_id, q.id, k.id, 'pending'
  from kids k join quests q on q.kid_id = k.id where k.id = '6d444441-0000-0000-0000-000000000001';
set role app_user;
do $$
begin
  perform become('6d111111-0000-0000-0000-0000000000e1');
  begin
    perform reject_submission('6d888888-0000-0000-0000-000000000001', 'no');
    perform ok('a supporter CANNOT send a child''s work back', false);
  exception when raise_exception then
    perform ok('a supporter CANNOT send a child''s work back', true);
  end;
end $$;
reset role;

do $$
begin
  perform ok('and the family, its children and its consent are all still there',
    exists (select 1 from families where id = '6d222222-0000-0000-0000-000000000001')
    and (select count(*) from kids where family_id = '6d222222-0000-0000-0000-000000000001') = 6
    and exists (select 1 from parental_consents where family_id = '6d222222-0000-0000-0000-000000000001'
                                                  and revoked_at is null));
end $$;

-- ---------- a suspended school is nobody's champion ----------
insert into school_awards (district_key, month_key, school_id, score)
select 'review district', '2099-01', id, 99 from schools where name = 'Other One';
update schools set status = 'suspended' where name = 'Other One';
set role app_user;
do $$
begin
  perform become('6d111111-0000-0000-0000-00000000000b');
  perform ok('a suspended school is not shown as the district''s champion',
    coalesce(school_league()->'champion'->>'name', '') <> 'Other One');
end $$;
reset role;
