-- ---------------------------------------------------------------------------
-- Parent Alliances and the monthly discount.
--
-- The prize is real money off a real bill, so the claims worth testing are the
-- ones an attacker would go for: that a family cannot report its own score,
-- cannot be in two alliances at once, cannot take a seat that does not exist,
-- and — the expensive one — that running the monthly job twice does not pay
-- twice. Also that a Starter family cannot reach any of it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('1a111111-0000-0000-0000-000000000001', 'ally-a@example.com'),
  ('1a111111-0000-0000-0000-000000000002', 'ally-b@example.com'),
  ('1a111111-0000-0000-0000-000000000003', 'ally-c@example.com');

insert into families (id, name, tier) values
  ('1a222222-0000-0000-0000-000000000001', 'The Alphas',  'elite'),
  ('1a222222-0000-0000-0000-000000000002', 'The Bravos',  'elite'),
  ('1a222222-0000-0000-0000-000000000003', 'The Charlies', 'starter');

insert into parents (user_id, family_id, name) values
  ('1a111111-0000-0000-0000-000000000001', '1a222222-0000-0000-0000-000000000001', 'Ana'),
  ('1a111111-0000-0000-0000-000000000002', '1a222222-0000-0000-0000-000000000002', 'Ben'),
  ('1a111111-0000-0000-0000-000000000003', '1a222222-0000-0000-0000-000000000003', 'Cara');

select seed_consent('1a222222-0000-0000-0000-000000000001', '1a111111-0000-0000-0000-000000000001');
select seed_consent('1a222222-0000-0000-0000-000000000002', '1a111111-0000-0000-0000-000000000002');
select seed_consent('1a222222-0000-0000-0000-000000000003', '1a111111-0000-0000-0000-000000000003');

insert into kids (id, family_id, name) values
  ('1a444444-0000-0000-0000-000000000001', '1a222222-0000-0000-0000-000000000001', 'Alma'),
  ('1a444444-0000-0000-0000-000000000002', '1a222222-0000-0000-0000-000000000002', 'Bo');

insert into quests (id, family_id, kid_id, title) values
  ('1a555555-0000-0000-0000-000000000001', '1a222222-0000-0000-0000-000000000001',
   '1a444444-0000-0000-0000-000000000001', 'Bins'),
  ('1a555555-0000-0000-0000-000000000002', '1a222222-0000-0000-0000-000000000002',
   '1a444444-0000-0000-0000-000000000002', 'Dishes');

-- Alma's family finishes three quests this month; Bo's finishes one. Ana should
-- therefore win the month, and Ben should not.
insert into submissions (family_id, quest_id, kid_id, status, decided_at)
select '1a222222-0000-0000-0000-000000000001', '1a555555-0000-0000-0000-000000000001',
       '1a444444-0000-0000-0000-000000000001', 'approved', date_trunc('month', now()) + interval '2 days'
from generate_series(1, 3);
insert into submissions (family_id, quest_id, kid_id, status, decided_at) values
  ('1a222222-0000-0000-0000-000000000002', '1a555555-0000-0000-0000-000000000002',
   '1a444444-0000-0000-0000-000000000002', 'approved', date_trunc('month', now()) + interval '3 days');
-- A rejected one, and one decided last month: neither should count.
insert into submissions (family_id, quest_id, kid_id, status, decided_at) values
  ('1a222222-0000-0000-0000-000000000002', '1a555555-0000-0000-0000-000000000002',
   '1a444444-0000-0000-0000-000000000002', 'rejected', date_trunc('month', now()) + interval '4 days'),
  ('1a222222-0000-0000-0000-000000000002', '1a555555-0000-0000-0000-000000000002',
   '1a444444-0000-0000-0000-000000000002', 'approved', date_trunc('month', now()) - interval '5 days');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
revoke all on alliances from anon, authenticated;
revoke all on alliance_members from anon, authenticated;
revoke all on alliance_results from anon, authenticated;

set role app_user;

do $$
declare
  v_code  text;
  v_res   jsonb;
  v_stand jsonb;
  v_month date := date_trunc('month', now())::date;
begin
  -- ---------- an Elite parent can start one ----------
  perform become('1a111111-0000-0000-0000-000000000001');
  v_res := create_alliance('The Test Alliance');
  perform ok('an Elite parent can start an alliance', (v_res->>'ok')::boolean);
  v_code := v_res->>'invite_code';
  perform ok('and it comes with a six-character invite code', length(v_code) = 6);

  perform ok('the same family cannot start a second one',
    (create_alliance('Another')->>'reason') = 'already_in_one');

  -- ---------- Starter cannot ----------
  perform become('1a111111-0000-0000-0000-000000000003');
  perform ok('a Starter family CANNOT start an alliance',
    (create_alliance('Cheapskates')->>'reason') = 'plan_has_no_alliances');
  perform ok('a Starter family CANNOT join one either',
    (join_alliance(v_code)->>'reason') = 'plan_has_no_alliances');

  -- ---------- joining ----------
  perform become('1a111111-0000-0000-0000-000000000002');
  -- Before joining anything, so this reaches the code lookup rather than
  -- stopping at the "you are already in one" check ahead of it.
  perform ok('a bad code is refused', (join_alliance('ZZZZZZ')->>'reason') = 'no_such_code');
  perform ok('a second Elite family joins with the code', (join_alliance(v_code)->>'ok')::boolean);
  perform ok('and joining twice is refused', (join_alliance(v_code)->>'reason') = 'already_in_one');
end $$;

-- ---------- the standings are computed, not reported ----------
do $$
declare v_stand jsonb; v_rows jsonb;
begin
  perform become('1a111111-0000-0000-0000-000000000002');
  v_stand := alliance_standings();
  v_rows := v_stand->'standings';

  perform ok('both families appear in the standings', jsonb_array_length(v_rows) = 2);
  perform ok('the family with three approvals is top',
    (v_rows->0->>'name') = 'The Alphas' and (v_rows->0->>'score')::int = 3);
  perform ok('a rejected quest does not score, and nor does last month''s',
    (v_rows->1->>'score')::int = 1);
  perform ok('the leaderboard shows names and scores and nothing else',
    (select bool_and(key in ('name','score','you')) from jsonb_object_keys(v_rows->0) key));
end $$;

-- ---------- a family cannot inflate its own score ----------
do $$
begin
  perform become('1a111111-0000-0000-0000-000000000002');
  begin
    insert into submissions (family_id, quest_id, kid_id, status, decided_at)
    values ('1a222222-0000-0000-0000-000000000001', '1a555555-0000-0000-0000-000000000001',
            '1a444444-0000-0000-0000-000000000001', 'approved', now());
    raise exception 'FAIL one family wrote an approval into another''s ledger';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS one family CANNOT write approvals into another''s ledger (%)', left(sqlerrm, 30);
  end;

  begin
    perform settle_alliances(date_trunc('month', now())::date);
    raise exception 'FAIL a parent settled the month themselves';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT settle the month themselves (%)', left(sqlerrm, 30);
  end;
end $$;

-- ---------- settlement, as the job runs it ----------
reset role;
do $$
declare
  v_first  jsonb;
  v_second jsonb;
  v_month  date := date_trunc('month', now())::date;
begin
  v_first := settle_alliances(v_month);
  perform ok('settling the month awards exactly one family', jsonb_array_length(v_first->'awards') = 1);
  perform ok('and it is the family that finished the most quests',
    ((v_first->'awards'->0->>'family_id')::uuid) = '1a222222-0000-0000-0000-000000000001');

  -- The expensive mistake: paying the same discount twice.
  v_second := settle_alliances(v_month);
  perform ok('running the monthly job again awards nothing',
    jsonb_array_length(v_second->'awards') = 0);
  perform ok('and there is still only one award row on file',
    (select count(*) from alliance_results where month_key = to_char(v_month,'YYYY-MM')) = 1);

  perform ok('an award starts out unapplied, so an unpaid one is visible',
    (select applied_at is null from alliance_results where month_key = to_char(v_month,'YYYY-MM')));
  perform mark_alliance_award_applied(
    (select alliance_id from alliance_results where month_key = to_char(v_month,'YYYY-MM')), v_month, 'ALLY20');
  perform ok('and the billing job can mark it applied',
    (select applied_at is not null and stripe_coupon = 'ALLY20'
       from alliance_results where month_key = to_char(v_month,'YYYY-MM')));
end $$;

-- ---------- a month where nobody did anything ----------
do $$
declare v_month date := (date_trunc('month', now()) - interval '6 months')::date;
begin
  perform ok('a month with no approved quests has no winner',
    jsonb_array_length(settle_alliances(v_month)->'awards') = 0);
end $$;

-- ---------- leaving ----------
set role app_user;
do $$
begin
  perform become('1a111111-0000-0000-0000-000000000002');
  perform ok('a family can leave', (leave_alliance()->>'ok')::boolean);
  perform ok('and is then in no alliance',
    (alliance_standings()->'alliance') = 'null'::jsonb);

  perform become('1a111111-0000-0000-0000-000000000001');
  perform ok('the family still in it sees a one-member leaderboard',
    jsonb_array_length(alliance_standings()->'standings') = 1);
end $$;
reset role;
