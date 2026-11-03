-- ---------------------------------------------------------------------------
-- A reward's weekly limit, held by the database.
--
-- A parent can say a reward may be taken at most so many times a week by each
-- child. The app checks first, so a child is told before spending; this is
-- the check that cannot be got round: redeem_reward counts the child's own
-- redemptions of that reward over the last seven days, under the child's row
-- lock, so purchases queued on a phone with no signal are refused when they
-- arrive if they would go over it. Two phones at once is
-- tests/rewardlimits.mjs.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('42111111-0000-4000-8000-00000000000a', 'rl-parent@example.com'),
  ('42111111-0000-4000-8000-0000000000c1', null),
  ('42111111-0000-4000-8000-0000000000c2', null);
insert into families (id, name, tier) values ('42222222-0000-4000-8000-00000000000a', 'Reward Limits', 'standard');
insert into parents (user_id, family_id, name, role) values
  ('42111111-0000-4000-8000-00000000000a', '42222222-0000-4000-8000-00000000000a', 'Pat', 'parent');
select seed_consent('42222222-0000-4000-8000-00000000000a', '42111111-0000-4000-8000-00000000000a');
insert into kids (id, family_id, name, user_id) values
  ('42444444-0000-4000-8000-0000000000a1', '42222222-0000-4000-8000-00000000000a', 'Mia', '42111111-0000-4000-8000-0000000000c1'),
  ('42444444-0000-4000-8000-0000000000a2', '42222222-0000-4000-8000-00000000000a', 'Leo', '42111111-0000-4000-8000-0000000000c2');
update kids set coins = 100 where family_id = '42222222-0000-4000-8000-00000000000a';
insert into rewards (id, family_id, name, cost, weekly_limit) values
  ('42777777-0000-4000-8000-000000000001', '42222222-0000-4000-8000-00000000000a', 'Half an hour of screen time', 10, 2),
  ('42777777-0000-4000-8000-000000000002', '42222222-0000-4000-8000-00000000000a', 'Pick the film', 10, null);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

create or replace function pg_temp.coins(k uuid) returns int language sql as $$ select coins from kids where id = k $$;

set role app_user;

do $$
declare
  mia uuid := '42444444-0000-4000-8000-0000000000a1';
  leo uuid := '42444444-0000-4000-8000-0000000000a2';
  screen uuid := '42777777-0000-4000-8000-000000000001';
  film uuid := '42777777-0000-4000-8000-000000000002';
  first_id uuid := gen_random_uuid();
  r jsonb;
begin
  perform become('42111111-0000-4000-8000-0000000000c1');
  r := redeem_reward(first_id, screen, mia);
  perform ok('the first of two this week is bought', (r->>'ok')::boolean, r::text);
  r := redeem_reward(gen_random_uuid(), screen, mia);
  perform ok('and the second', (r->>'ok')::boolean, r::text);
  r := redeem_reward(gen_random_uuid(), screen, mia);
  perform ok('a third in the same week is refused, and says why',
    (r->>'ok')::boolean = false and r->>'reason' = 'weekly_limit' and (r->>'limit')::int = 2, r::text);
  perform ok('and costs nothing', pg_temp.coins(mia) = 80, pg_temp.coins(mia)::text);
  perform ok('nothing is recorded for it', (select count(*) from redemptions where kid_id = mia and reward_id = screen) = 2);

  -- The first purchase sent again because its answer was lost: it already
  -- happened, so it is not a third, and it is not charged twice.
  r := redeem_reward(first_id, screen, mia);
  perform ok('a purchase retried after it landed is not counted again', (r->>'ok')::boolean and (r->>'repeat')::boolean, r::text);
  perform ok('nor charged again', pg_temp.coins(mia) = 80);

  r := redeem_reward(gen_random_uuid(), film, mia);
  perform ok('a reward with no limit is not held to one', (r->>'ok')::boolean, r::text);

  -- Each child has their own week.
  perform become('42111111-0000-4000-8000-0000000000c2');
  r := redeem_reward(gen_random_uuid(), screen, leo);
  perform ok('a brother has his own two', (r->>'ok')::boolean, r::text);

  -- A parent buying it for the child counts against the same limit.
  perform become('42111111-0000-4000-8000-00000000000a');
  r := redeem_reward(gen_random_uuid(), screen, mia);
  perform ok('the limit holds when a parent buys it for the child too', r->>'reason' = 'weekly_limit', r::text);
end $$;

-- A week later the oldest has dropped out of the seven days.
set role postgres;
update redemptions set created_at = now() - interval '7 days 1 minute'
 where id = (select id from redemptions where kid_id = '42444444-0000-4000-8000-0000000000a1'
              and reward_id = '42777777-0000-4000-8000-000000000001' order by created_at limit 1);
set role app_user;

do $$
declare
  mia uuid := '42444444-0000-4000-8000-0000000000a1';
  screen uuid := '42777777-0000-4000-8000-000000000001';
  r jsonb;
begin
  perform become('42111111-0000-4000-8000-0000000000c1');
  r := redeem_reward(gen_random_uuid(), screen, mia);
  perform ok('seven days after the first, one more can be had', (r->>'ok')::boolean, r::text);
  r := redeem_reward(gen_random_uuid(), screen, mia);
  perform ok('and only one', r->>'reason' = 'weekly_limit', r::text);
end $$;

-- ---------- who sets it, and to what ----------
do $$
declare
  screen uuid := '42777777-0000-4000-8000-000000000001';
  mia uuid := '42444444-0000-4000-8000-0000000000a1';
  r jsonb;
begin
  -- A child cannot lift their own limit.
  perform become('42111111-0000-4000-8000-0000000000c1');
  update rewards set weekly_limit = 50 where id = screen;
  perform ok('a child cannot change a reward''s limit',
    (select weekly_limit from rewards where id = screen) = 2);
  update rewards set weekly_limit = null where id = screen;
  perform ok('nor take it away', (select weekly_limit from rewards where id = screen) = 2);

  perform become('42111111-0000-4000-8000-00000000000a');
  begin
    update rewards set weekly_limit = 0 where id = screen;
    perform ok('a limit of none a week is refused (no limit is null)', false);
  exception when check_violation then
    perform ok('a limit of none a week is refused (no limit is null)', true);
  end;
  begin
    update rewards set weekly_limit = 51 where id = screen;
    perform ok('as is more than fifty', false);
  exception when check_violation then
    perform ok('as is more than fifty', true);
  end;

  update rewards set weekly_limit = 3 where id = screen;
  perform ok('a parent can raise it', (select weekly_limit from rewards where id = screen) = 3);
  perform become('42111111-0000-4000-8000-0000000000c1');
  r := redeem_reward(gen_random_uuid(), screen, mia);
  perform ok('which the next purchase is held to', (r->>'ok')::boolean, r::text);

  perform become('42111111-0000-4000-8000-00000000000a');
  update rewards set weekly_limit = null where id = screen;
  perform become('42111111-0000-4000-8000-0000000000c1');
  r := redeem_reward(gen_random_uuid(), screen, mia);
  perform ok('and can take it off again', (r->>'ok')::boolean, r::text);
end $$;

set role postgres;
