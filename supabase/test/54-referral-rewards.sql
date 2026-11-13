-- ---------------------------------------------------------------------------
-- The free month for bringing a friend's family, the database's half.
--
-- A family that invites another earns one free month of its plan when the
-- invited family's first invoice is paid. tests/billingwalk.mjs walks it
-- through the real webhook and a stand-in Stripe; this file holds every rule
-- on its own: what counts as a first payment, once per invited family, never
-- for the same household, twelve a year, a refund within 14 days taking an
-- unused month back, a Starter family's month banked until it subscribes, and
-- that a browser can read only counts about its own invites.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- One family, a parent (and optionally a child's phone), paying or not.
create or replace function t54_family(p_n int, p_email text, p_live boolean default false, p_kid boolean default false)
returns uuid language plpgsql as $$
declare
  v_fam  uuid := ('54f00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
  v_user uuid := ('54a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
begin
  insert into auth.users (id, email) values (v_user, p_email);
  insert into families (id, name, tier, stripe_customer_id, stripe_subscription_id, subscription_status)
  values (v_fam, 'T54 Household ' || p_n, case when p_live then 'elite' else 'starter' end,
          case when p_live then 'cus_t54_' || p_n end, case when p_live then 'sub_t54_' || p_n end,
          case when p_live then 'active' else 'none' end);
  insert into parents (user_id, family_id, name, role) values (v_user, v_fam, 'T54 Parent ' || p_n, 'parent');
  perform seed_consent(v_fam, v_user);
  if p_kid then
    insert into auth.users (id) values (('54c00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid);
    insert into kids (family_id, user_id, name)
    values (v_fam, ('54c00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid, 'T54 Kid ' || p_n);
  end if;
  return v_fam;
end $$;

create or replace function t54_fam(p_n int) returns uuid language sql immutable as $$
  select ('54f00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t54_user(p_n int) returns uuid language sql immutable as $$
  select ('54a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t54_ref(p_invited int, p_referrer int) returns void language sql as $$
  insert into referrals (invited_family_id, referrer_family_id) values (t54_fam(p_invited), t54_fam(p_referrer)) $$;
create or replace function t54_row(p_n int) returns referrals language sql as $$
  select * from referrals where invited_family_id = t54_fam(p_n) $$;

-- 1: pays for Elite, invites a lot. 2: on Starter. 3: on Starter too.
select t54_family(1, 'T54-Payer@Example.com', true, true);
select t54_family(2, 't54-starter@example.com');
select t54_family(3, 't54-starter-two@example.com');
-- The invited families.
select t54_family(n, 't54-friend-' || n || '@example.com') from generate_series(10, 24) n;
-- The same parent as family 1 under a "+tag", and one paying with family 1's card account.
select t54_family(30, 't54-payer+second@example.com');
select t54_family(31, 't54-thirty-one@example.com');
-- 40: a family that has paid for the most free months a year allows, and its friends.
select t54_family(40, 't54-capped@example.com', true);
select t54_family(n, 't54-cap-' || n || '@example.com') from generate_series(41, 54) n;
select t54_family(60, 't54-never-invited@example.com');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- claiming: the same household is not a friend ----------
set role app_user;
do $$
declare v_code text; res jsonb;
begin
  set local role postgres;
  v_code := referral_code_for(t54_fam(1));
  set local role app_user;

  perform become(t54_user(10));
  res := claim_referral(v_code);
  perform ok('a friend''s family claims the code', (res->>'ok')::boolean, res::text);

  perform become(t54_user(30));
  res := claim_referral(v_code);
  perform ok('a second family made by the same parent (the same email with a +tag) cannot claim it',
    (res->>'ok')::boolean = false and res->>'reason' = 'same_household', res::text);
end $$;
reset role;

select t54_ref(n, 1) from generate_series(11, 20) n;
select t54_ref(21, 2);
select t54_ref(22, 2);
select t54_ref(23, 3);
-- Claimed before the parent changed their email to match, or with the same
-- card account: both are caught when the reward is decided.
select t54_ref(30, 1);
select t54_ref(31, 1);

-- ---------- what counts as starting to pay ----------
do $$
declare res jsonb; r referrals;
begin
  res := earn_referral_reward(t54_fam(10), 'in_t54_trial', 0, '{}', 'cus_t54_friend10', now());
  perform ok('a trial''s $0 invoice is not paying', res->>'ignored' = 'nothing_paid', res::text);
  perform ok('and leaves nothing behind', (t54_row(10)).paid_invoice is null and (t54_row(10)).reward_state is null);

  res := earn_referral_reward(t54_fam(10), null, 999, '{}');
  perform ok('an invoice with no id is refused', res->>'reason' = 'no_invoice', res::text);

  res := earn_referral_reward(t54_fam(60), 'in_t54_nobody', 999, '{pi_t54_60}');
  perform ok('a family nobody invited earns nobody anything', res->>'ignored' = 'not_referred', res::text);

  res := earn_referral_reward(t54_fam(10), 'in_t54_first', 1599, '{pi_t54_10,ch_t54_10}', 'cus_t54_friend10', now());
  perform ok('the first paid invoice earns the inviting family its month', res->>'state' = 'owed', res::text);
  perform ok('which is owed as a credit, because the inviting family pays',
    (res->>'referrer_family_id')::uuid = t54_fam(1));
  r := t54_row(10);
  perform ok('the invoice and its payment are kept with the referral',
    r.paid_invoice = 'in_t54_first' and r.paid_refs @> '{pi_t54_10,ch_t54_10}' and r.reward_at is not null, r::text);

  res := earn_referral_reward(t54_fam(10), 'in_t54_first', 1599, '{pi_t54_10}', 'cus_t54_friend10', now());
  perform ok('the same invoice again (Stripe sends two events and retries both) is a duplicate',
    (res->>'duplicate')::boolean and res->>'state' = 'owed', res::text);
  res := earn_referral_reward(t54_fam(10), 'in_t54_renewal', 1599, '{pi_t54_10b}', 'cus_t54_friend10', now());
  perform ok('and so is the next month''s: one reward per invited family',
    (res->>'duplicate')::boolean and (t54_row(10)).paid_invoice = 'in_t54_first', res::text);
end $$;

-- ---------- the credit ----------
do $$
declare owed jsonb; res jsonb;
begin
  owed := referral_rewards_owed(t54_fam(1));
  perform ok('the webhook is told one month is owed, and to which Stripe customer',
    jsonb_array_length(owed) = 1 and owed->0->>'customer_id' = 'cus_t54_1'
    and (owed->0->>'invited_family_id')::uuid = t54_fam(10), owed::text);

  res := mark_referral_reward_applied(t54_fam(10), 'cbtxn_t54_1', 1599, 'usd', 'elite', 'month');
  perform ok('once it is on the account it is marked applied', (res->>'applied')::boolean
    and (t54_row(10)).reward_state = 'applied' and (t54_row(10)).reward_amount = 1599
    and (t54_row(10)).reward_currency = 'USD', res::text);
  res := mark_referral_reward_applied(t54_fam(10), 'cbtxn_t54_again', 1599, 'usd', 'elite', 'month');
  perform ok('and marking it again changes nothing', not (res->>'applied')::boolean
    and (t54_row(10)).reward_credit = 'cbtxn_t54_1', res::text);
  perform ok('nothing is owed any more', jsonb_array_length(referral_rewards_owed(t54_fam(1))) = 0);
end $$;

-- ---------- never the same household ----------
do $$
declare res jsonb;
begin
  -- Family 30's parent's email is family 1's with a +tag.
  res := earn_referral_reward(t54_fam(30), 'in_t54_same_email', 1599, '{pi_t54_30}', 'cus_t54_thirty', now());
  perform ok('no free month for inviting yourself by email', res->>'state' = 'blocked' and res->>'why' = 'same_email', res::text);

  res := earn_referral_reward(t54_fam(31), 'in_t54_same_card', 1599, '{pi_t54_31}', 'cus_t54_1', now());
  perform ok('nor by paying with your own Stripe customer', res->>'state' = 'blocked' and res->>'why' = 'same_customer', res::text);

  perform ok('neither is owed', jsonb_array_length(referral_rewards_owed(t54_fam(1))) = 0);
  perform ok('the database says the same family is the same household',
    referral_same_household(t54_fam(1), t54_fam(1)) = 'same_family');
  perform ok('and two different households are not',
    referral_same_household(t54_fam(1), t54_fam(10)) is null);
end $$;

-- ---------- a refund ----------
do $$
declare res jsonb;
begin
  -- 11: the first payment refunded within 14 days, the credit still unused.
  perform earn_referral_reward(t54_fam(11), 'in_t54_11', 1599, '{pi_t54_11,ch_t54_11}', 'cus_t54_friend11', now() - interval '3 days');
  perform mark_referral_reward_applied(t54_fam(11), 'cbtxn_t54_11', 1599, 'usd', 'elite', 'month');
  res := referral_payment_reversed(t54_fam(11), '{ch_t54_11,pi_t54_11}', 'refund', now(), now() - interval '3 days');
  perform ok('a refund of the first payment within 14 days asks for the credit back',
    res->>'action' = 'reverse_credit' and res->>'customer_id' = 'cus_t54_1' and (res->>'amount')::int = 1599, res::text);
  res := finish_referral_withdrawal(t54_fam(11), true, 'refund', 'cbtxn_t54_back_11');
  perform ok('and, the account still holding it, it is withdrawn',
    (t54_row(11)).reward_state = 'withdrawn' and (t54_row(11)).reward_note = 'refund_within_14_days'
    and (t54_row(11)).reward_reversal = 'cbtxn_t54_back_11', (t54_row(11))::text);
  res := referral_payment_reversed(t54_fam(11), '{ch_t54_11}', 'refund', now(), now() - interval '3 days');
  perform ok('the same refund again changes nothing', res->>'ignored' = 'nothing_to_withdraw', res::text);

  -- 12: refunded within 14 days, but the credit has already come off an invoice.
  perform earn_referral_reward(t54_fam(12), 'in_t54_12', 1599, '{pi_t54_12}', 'cus_t54_friend12', now() - interval '10 days');
  perform mark_referral_reward_applied(t54_fam(12), 'cbtxn_t54_12', 1599, 'usd', 'elite', 'month');
  res := referral_payment_reversed(t54_fam(12), '{pi_t54_12}', 'refund', now(), null);
  perform finish_referral_withdrawal(t54_fam(12), false, 'refund');
  perform ok('a month already used is left, and what happened is written down',
    (t54_row(12)).reward_state = 'applied' and (t54_row(12)).reward_note = 'refund_within_14_days_credit_used',
    (t54_row(12))::text);
  res := referral_payment_reversed(t54_fam(12), '{pi_t54_12}', 'refund', now(), null);
  perform ok('and is not asked about twice', res->>'ignored' = 'already_decided', res::text);

  -- 13: refunded 20 days after it was paid.
  perform earn_referral_reward(t54_fam(13), 'in_t54_13', 1599, '{pi_t54_13}', 'cus_t54_friend13', now() - interval '20 days');
  perform mark_referral_reward_applied(t54_fam(13), 'cbtxn_t54_13', 1599, 'usd', 'elite', 'month');
  res := referral_payment_reversed(t54_fam(13), '{pi_t54_13}', 'refund', now(), null);
  perform ok('a refund after 14 days leaves the month, and says so',
    (res->>'kept')::boolean and (t54_row(13)).reward_state = 'applied'
    and (t54_row(13)).reward_note = 'refund_after_14_days', res::text);

  -- 14: a later payment refunded: not the first.
  perform earn_referral_reward(t54_fam(14), 'in_t54_14', 1599, '{pi_t54_14}', 'cus_t54_friend14', now() - interval '2 days');
  res := referral_payment_reversed(t54_fam(14), '{pi_t54_14_later}', 'refund', now(), now() - interval '40 days');
  perform ok('a refund of some other payment has nothing to do with the month',
    res->>'ignored' = 'not_first_payment' and (t54_row(14)).reward_state = 'owed', res::text);
  res := referral_payment_reversed(t54_fam(14), '{}', 'refund', now(), null);
  perform ok('a refund naming no payment is refused', res->>'reason' = 'no_payment', res::text);
  perform credit_flash_tickets(t54_fam(14), 2, 'checkout:cs_t54_14', '{"payment_intent":"pi_t54_flash14","count":2}');
  res := referral_payment_reversed(t54_fam(14), '{ch_t54_flash14,pi_t54_flash14}', 'refund', now(), now() - interval '2 days');
  perform ok('a Flash Ticket pack handed back is not the plan, and leaves the month alone',
    res->>'ignored' = 'not_a_plan_payment' and (t54_row(14)).reward_state = 'owed', res::text);

  -- 15: an owed month (not on the account yet) is simply withdrawn.
  perform earn_referral_reward(t54_fam(15), 'in_t54_15', 1599, '{pi_t54_15}', 'cus_t54_friend15', now() - interval '1 day');
  res := referral_payment_reversed(t54_fam(15), '{pi_t54_15}', 'dispute', now(), null);
  perform ok('a dispute of the first payment withdraws a month still owed',
    (res->>'withdrawn')::boolean and (t54_row(15)).reward_state = 'withdrawn'
    and (t54_row(15)).reward_note = 'dispute_within_14_days', res::text);

  -- 16: the refund arrives before the invoice it undoes (Stripe does not deliver in order).
  res := referral_payment_reversed(t54_fam(16), '{ch_t54_16,pi_t54_16}', 'refund', now(), now());
  perform ok('a refund before the first invoice was counted is remembered', res->>'recorded' = 'before_first_invoice', res::text);
  res := earn_referral_reward(t54_fam(16), 'in_t54_16', 1599, '{pi_t54_16}', 'cus_t54_friend16', now());
  perform ok('and that invoice, arriving late, earns nothing',
    res->>'state' = 'blocked' and res->>'why' = 'payment_reversed', res::text);

  -- 17: an invoice that named no payment; the refund is recognised by when it was made.
  perform earn_referral_reward(t54_fam(17), 'in_t54_17', 1599, '{}', 'cus_t54_friend17', now() - interval '2 days');
  res := referral_payment_reversed(t54_fam(17), '{ch_t54_17}', 'refund', now(), now() - interval '2 days' + interval '5 seconds');
  perform ok('with no payment id on the invoice, a charge made with it is taken to be it',
    (res->>'withdrawn')::boolean, res::text);
end $$;

-- ---------- a Starter family's month waits for a plan ----------
do $$
declare res jsonb; owed jsonb;
begin
  res := earn_referral_reward(t54_fam(21), 'in_t54_21', 999, '{pi_t54_21}', 'cus_t54_friend21', now());
  perform ok('a family on Starter has its month banked, not lost', res->>'state' = 'banked', res::text);
  perform ok('and nothing is credited while it has no plan to take it off',
    jsonb_array_length(referral_rewards_owed(t54_fam(2))) = 0);
  perform ok('Starter is still Starter: a banked month is not a free plan',
    effective_tier(t54_fam(2)) = 'starter');

  -- It subscribes, as the webhook records it.
  perform apply_subscription_change(t54_fam(2), 'active', 'standard', 'cus_t54_2', 'sub_t54_2',
                                    now() + interval '30 days', 'evt_t54_2_sub', '{}', now());
  owed := referral_rewards_owed(t54_fam(2));
  perform ok('the moment it subscribes, the banked month is owed to its new Stripe customer',
    jsonb_array_length(owed) = 1 and owed->0->>'customer_id' = 'cus_t54_2', owed::text);
  perform mark_referral_reward_applied(t54_fam(21), 'cbtxn_t54_21', 999, 'usd', 'standard', 'month');
  perform ok('and is then on the account', (t54_row(21)).reward_state = 'applied');

  -- 23: banked, then the paying family's first payment is refunded within the 14 days.
  perform earn_referral_reward(t54_fam(23), 'in_t54_23', 999, '{pi_t54_23}', 'cus_t54_friend23', now());
  res := referral_payment_reversed(t54_fam(23), '{pi_t54_23}', 'refund', now(), now());
  perform ok('a banked month is withdrawn by a refund within 14 days (it was never used)',
    (res->>'withdrawn')::boolean and res->>'was' = 'banked' and (t54_row(23)).reward_state = 'withdrawn', res::text);
end $$;

-- ---------- twelve a year ----------
do $$
declare res jsonb; n int;
begin
  -- Eleven free months this year, and one from more than a year ago.
  for n in 41..52 loop
    perform t54_ref(n, 40);
    update referrals
       set paid_invoice = 'in_t54_cap_' || n, paid_at = now(), reward_state = 'applied',
           reward_at = case when n = 41 then now() - interval '400 days' else now() - interval '10 days' end
     where invited_family_id = t54_fam(n);
  end loop;
  perform t54_ref(53, 40);
  perform t54_ref(54, 40);

  res := earn_referral_reward(t54_fam(53), 'in_t54_53', 1599, '{pi_t54_53}', 'cus_t54_friend53', now());
  perform ok('the twelfth free month in 365 days is given (one from last year does not count)',
    res->>'state' = 'owed', res::text);
  res := earn_referral_reward(t54_fam(54), 'in_t54_54', 1599, '{pi_t54_54}', 'cus_t54_friend54', now());
  perform ok('the thirteenth is not', res->>'state' = 'blocked' and res->>'why' = 'cap', res::text);
end $$;

-- ---------- what a parent sees, and what a child does not ----------
set role app_user;
do $$
declare mine jsonb; res jsonb; v_names text;
begin
  perform become(t54_user(1));
  mine := my_referrals();
  -- Family 1: thirteen families claimed its code (10-20, 30, 31). Paying, with
  -- a month: 10 (applied), 12 and 13 (applied), 14 and 17... see below.
  perform ok('the parent sees how many families joined with their code',
    (mine->>'claimed')::int = 13, mine::text);
  perform ok('how many of them pay (a refunded or self-referred family is not counted)',
    (mine->>'paying')::int = 4, mine::text);
  perform ok('the free months on the account, on their way, and taken back',
    (mine->>'earned')::int = 3 and (mine->>'pending')::int = 1 and (mine->>'withdrawn')::int = 3
    and (mine->>'banked')::int = 0, mine::text);
  perform ok('and how many it has not been told about yet', (mine->>'unseen')::int = 4, mine::text);

  set local role postgres;
  select string_agg(f.name || ' ' || f.id || ' ' || u.email, ' ') into v_names
    from families f join parents p on p.family_id = f.id join auth.users u on u.id = p.user_id
   where f.id in (select invited_family_id from referrals where referrer_family_id = t54_fam(1));
  set local role app_user;
  perform ok('it holds counts only: no other family''s name, id or email anywhere in it',
    not exists (select 1 from regexp_split_to_table(v_names, ' ') w where length(w) > 5 and position(w in mine::text) > 0)
    and mine::text !~ 'T54 Household|example\.com|54f00000', mine::text);

  res := see_referral_rewards();
  perform ok('seeing "You earned a free month" once is remembered for the family',
    (res->>'ok')::boolean and (my_referrals()->>'unseen')::int = 0);

  -- Starter family 2's month, banked then applied once it subscribed.
  perform become(t54_user(2));
  perform ok('a family whose month was banked and then used sees it as earned',
    (my_referrals()->>'earned')::int = 1 and (my_referrals()->>'banked')::int = 0, my_referrals()::text);

  -- Family 3: its month was banked and then withdrawn.
  perform become(t54_user(3));
  perform ok('and one whose banked month was withdrawn sees that',
    (my_referrals()->>'withdrawn')::int = 1 and (my_referrals()->>'banked')::int = 0, my_referrals()::text);

  -- Family 40, at the cap.
  perform become(t54_user(40));
  perform ok('a family at the cap is told how many it has had this year',
    (my_referrals()->>'this_year')::int = 12 and (my_referrals()->>'capped')::int = 1
    and (my_referrals()->>'cap')::int = 12, my_referrals()::text);

  -- Family 1's child's phone.
  perform become('54c00000-0000-4000-8000-000000000001');
  res := my_referrals();
  perform ok('a child''s phone is told nothing about invites or free months',
    res->>'reason' = 'not_a_parent' and res->>'code' is null and res->>'claimed' is null, res::text);
  res := see_referral_rewards();
  perform ok('and cannot mark anything seen', res->>'reason' = 'not_a_parent', res::text);
end $$;

-- ---------- "Download my data" ----------
do $$
declare d jsonb;
begin
  perform become(t54_user(1));
  d := export_family_data()->'referrals';
  perform ok('the download has the family''s referrals: how many joined and each free month',
    (d->>'families_joined_with_your_code')::int = 13 and jsonb_array_length(d->'free_months') = 10
    and d->>'your_code' = my_referrals()->>'code', d::text);
  perform ok('and never which families they were', d::text !~ 'T54 Household|example\.com|54f00000', d::text);

  perform become(t54_user(10));
  d := export_family_data()->'referrals';
  perform ok('an invited family''s download says it joined with a code, and when it first paid',
    d->'joined_with_a_code'->>'first_payment_at' is not null and d::text !~ '54f00000', d::text);
end $$;
reset role;

-- ---------- the server's alone ----------
do $$
declare f text; v_open text[] := '{}';
begin
  foreach f in array array[
    'earn_referral_reward(uuid,text,integer,text[],text,timestamptz)', 'referral_rewards_owed(uuid)',
    'mark_referral_reward_applied(uuid,text,integer,text,text,text)',
    'referral_payment_reversed(uuid,text[],text,timestamptz,timestamptz)',
    'finish_referral_withdrawal(uuid,boolean,text,text)', 'referral_same_household(uuid,uuid,text)',
    'referral_email_key(text)', 'referral_reward_cap()', 'referral_refund_days()', 'export_family_referral_data(uuid)',
    'qualify_referral(uuid)', 'referral_code_for(uuid)', 'referral_reward_days()']
  loop
    if has_function_privilege('anon', to_regprocedure(f), 'execute')
       or has_function_privilege('authenticated', to_regprocedure(f), 'execute') then
      v_open := v_open || f;
    end if;
  end loop;
  perform ok('every function that gives, banks or takes back a free month is the server''s alone',
    cardinality(v_open) = 0, array_to_string(v_open, ', '));
  perform ok('row level security is on for referrals, with no policy at all',
    (select relrowsecurity from pg_class where oid = 'referrals'::regclass)
    and not exists (select 1 from pg_policies where tablename = 'referrals'));
end $$;

drop function t54_row(int);
drop function t54_ref(int, int);
drop function t54_user(int);
drop function t54_fam(int);
drop function t54_family(int, text, boolean, boolean);
