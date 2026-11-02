-- ---------------------------------------------------------------------------
-- Coins never go below zero, and rewards are paid for once.
--
-- Every path that takes coins away is tried with more than the child has:
-- the shop, the Sunday Market, the Currency Tax, and the database itself
-- (the floor under all of them). Then the awkward orders: a purchase whose
-- reward a parent deleted while it was on its way, a purchase retried after
-- that, and "Mark given" sent twice. Two phones at once — real concurrency,
-- which one SQL session cannot show — is tests/rewardraces.mjs.
--
-- Then the billing rows the webhook writes: every status Stripe sends is
-- storable, and the refund function is the webhook's alone.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('80111111-0000-0000-0000-00000000000a', 'mf-parent@example.com'),
  ('80111111-0000-0000-0000-00000000000b', 'mf-coparent@example.com'),
  ('80111111-0000-0000-0000-0000000000c1', 'mf-kid-device@example.com');
insert into families (id, name, tier) values ('80222222-0000-0000-0000-00000000000a', 'Money Floor', 'standard');
insert into parents (user_id, family_id, name, role) values
  ('80111111-0000-0000-0000-00000000000a', '80222222-0000-0000-0000-00000000000a', 'Pat', 'parent'),
  ('80111111-0000-0000-0000-00000000000b', '80222222-0000-0000-0000-00000000000a', 'Lee', 'parent');
select seed_consent('80222222-0000-0000-0000-00000000000a', '80111111-0000-0000-0000-00000000000a');
insert into kids (id, family_id, name, user_id) values
  ('80444444-0000-0000-0000-0000000000a1', '80222222-0000-0000-0000-00000000000a', 'Mia', '80111111-0000-0000-0000-0000000000c1');
update kids set coins = 40 where id = '80444444-0000-0000-0000-0000000000a1';
insert into rewards (id, family_id, name, cost) values
  ('80777777-0000-0000-0000-000000000001', '80222222-0000-0000-0000-00000000000a', 'Film night', 30),
  ('80777777-0000-0000-0000-000000000002', '80222222-0000-0000-0000-00000000000a', 'Pizza', 25),
  ('80777777-0000-0000-0000-000000000003', '80222222-0000-0000-0000-00000000000a', 'Late bedtime', 5);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

create or replace function pg_temp.coins() returns int language sql as $$
  select coins from kids where id = '80444444-0000-0000-0000-0000000000a1' $$;

-- ---------- the floor itself ----------
do $$
begin
  begin
    update kids set coins = -1 where id = '80444444-0000-0000-0000-0000000000a1';
    perform ok('the database itself refuses a negative balance', false);
  exception when check_violation then
    perform ok('the database itself refuses a negative balance', true);
  end;
end $$;

set role app_user;

-- ---------- the shop ----------
do $$
declare r jsonb;
begin
  perform become('80111111-0000-0000-0000-0000000000c1');
  perform ok('40 coins buys the 30-coin film night',
    (redeem_reward('80999999-0000-0000-0000-000000000001', '80777777-0000-0000-0000-000000000001', '80444444-0000-0000-0000-0000000000a1')->>'ok')::boolean);
  -- Two purchases from two phones, each made with 40 coins in view.
  r := redeem_reward('80999999-0000-0000-0000-000000000002', '80777777-0000-0000-0000-000000000002', '80444444-0000-0000-0000-0000000000a1');
  perform ok('the 25-coin pizza bought on the other phone is refused with 10 left',
    not (r->>'ok')::boolean and r->>'reason' = 'insufficient', r::text);
  perform ok('and nothing was taken for it', pg_temp.coins() = 10, pg_temp.coins()::text);
  perform ok('and no redemption recorded for it',
    not exists (select 1 from redemptions where id = '80999999-0000-0000-0000-000000000002'));
  perform ok('the film night, sent again by the first phone, is not charged again',
    (redeem_reward('80999999-0000-0000-0000-000000000001', '80777777-0000-0000-0000-000000000001', '80444444-0000-0000-0000-0000000000a1')->>'repeat')::boolean
    and pg_temp.coins() = 10);
end $$;

-- ---------- the Sunday Market ----------
do $$
declare r jsonb;
begin
  perform become('80111111-0000-0000-0000-0000000000c1');
  r := buy_market_skin('80444444-0000-0000-0000-0000000000a1', 'ember', -500, false, '80999999-0000-0000-0000-000000000010');
  perform ok('a skin dearer than the balance is refused, whatever cost the phone sends',
    not (r->>'ok')::boolean and pg_temp.coins() = 10, r::text);
end $$;

-- ---------- the Currency Tax ----------
do $$
declare r jsonb;
begin
  perform become('80111111-0000-0000-0000-00000000000a');
  r := apply_currency_tax('80444444-0000-0000-0000-0000000000a1', 500, '80999999-0000-0000-0000-000000000020');
  perform ok('a tax of "500%" takes everything and no more', pg_temp.coins() = 0, format('%s, %s', r, pg_temp.coins()));
  r := apply_currency_tax('80444444-0000-0000-0000-0000000000a1', 100, '80999999-0000-0000-0000-000000000021');
  perform ok('a tax on nothing takes nothing', (r->>'amount')::int = 0 and pg_temp.coins() = 0, r::text);
  r := apply_currency_tax('80444444-0000-0000-0000-0000000000a1', -50, '80999999-0000-0000-0000-000000000022');
  perform ok('a negative tax is not a gift', pg_temp.coins() = 0, r::text);
end $$;
reset role;
update kids set coins = 100 where id = '80444444-0000-0000-0000-0000000000a1';
set role app_user;

-- ---------- a reward deleted while a child buys it offline ----------
do $$
declare r jsonb;
begin
  -- The child's purchase of the pizza landed; the answer was lost.
  perform become('80111111-0000-0000-0000-0000000000c1');
  perform redeem_reward('80999999-0000-0000-0000-000000000030', '80777777-0000-0000-0000-000000000002', '80444444-0000-0000-0000-0000000000a1');
  perform ok('the pizza is bought: 100 -> 75', pg_temp.coins() = 75, pg_temp.coins()::text);

  -- The parent deletes the pizza and the late bedtime.
  perform become('80111111-0000-0000-0000-00000000000a');
  delete from rewards where id in ('80777777-0000-0000-0000-000000000002', '80777777-0000-0000-0000-000000000003');

  perform become('80111111-0000-0000-0000-0000000000c1');
  -- The phone, never having heard back, sends the pizza again.
  r := redeem_reward('80999999-0000-0000-0000-000000000030', '80777777-0000-0000-0000-000000000002', '80444444-0000-0000-0000-0000000000a1');
  perform ok('the retry of a purchase that landed is "already done", not "not found", after the reward is deleted',
    (r->>'ok')::boolean and (r->>'repeat')::boolean, r::text);
  perform ok('so the child is not told the coins are back when they are not', pg_temp.coins() = 75);
  perform ok('and what was bought is still owed, by name and price',
    (select name = 'Pizza' and cost = 25 and reward_id is null and status = 'requested'
       from redemptions where id = '80999999-0000-0000-0000-000000000030'));

  -- A purchase made offline of the late bedtime, which no longer exists.
  r := redeem_reward('80999999-0000-0000-0000-000000000031', '80777777-0000-0000-0000-000000000003', '80444444-0000-0000-0000-0000000000a1');
  perform ok('a purchase of a deleted reward is refused as "reward_gone"',
    not (r->>'ok')::boolean and r->>'reason' = 'reward_gone', r::text);
  perform ok('and costs nothing', pg_temp.coins() = 75);
  perform ok('and records nothing', not exists (select 1 from redemptions where id = '80999999-0000-0000-0000-000000000031'));
end $$;

-- ---------- "Mark given" from two parents ----------
do $$
declare first_at timestamptz; r jsonb;
begin
  perform become('80111111-0000-0000-0000-00000000000a');
  perform ok('one parent marks the pizza given',
    (mark_redemption_given('80999999-0000-0000-0000-000000000030')->>'ok')::boolean);
  select given_at into first_at from redemptions where id = '80999999-0000-0000-0000-000000000030';
  perform become('80111111-0000-0000-0000-00000000000b');
  r := mark_redemption_given('80999999-0000-0000-0000-000000000030');
  perform ok('the other parent''s tap, arriving second, is fine too (no error to show)', (r->>'ok')::boolean, r::text);
  perform ok('it stays given, at the time it was first given',
    (select status = 'given' and given_at = first_at from redemptions where id = '80999999-0000-0000-0000-000000000030'));
  perform ok('and no coins move either way', pg_temp.coins() = 75);
end $$;
reset role;

-- ---------- billing: every status Stripe sends can be written ----------
do $$
declare s text; r jsonb;
begin
  foreach s in array array['trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused','something_new'] loop
    r := apply_subscription_change('80222222-0000-0000-0000-00000000000a', s, 'elite', null, null, null,
                                   'evt_mf_' || s, '{}'::jsonb, null);
    perform ok(format('"%s" is stored, and the plan is %s', s,
                      case when s in ('trialing','active') then 'Elite' else 'Starter' end),
      (select tier = case when s in ('trialing','active') then 'elite' else 'starter' end
              and subscription_status = case when s = 'something_new' then 'unknown' else s end
         from families where id = '80222222-0000-0000-0000-00000000000a'), r::text);
  end loop;
  perform ok('the plan that stopped is remembered for the message',
    (select last_paid_tier = 'elite' from families where id = '80222222-0000-0000-0000-00000000000a'));
end $$;

-- ---------- the refund function is the webhook's alone ----------
set role app_user;
do $$
begin
  perform become('80111111-0000-0000-0000-00000000000a');
  begin
    perform apply_charge_refund('80222222-0000-0000-0000-00000000000a', 'ch_mf', null, true, null);
    perform ok('a parent CANNOT call the refund function', false);
  exception when insufficient_privilege then
    perform ok('a parent CANNOT call the refund function', true);
  end;
  perform ok('and billing_status names the plan that stopped', billing_status()->>'paid_tier' = 'elite');
end $$;
reset role;
