-- ---------------------------------------------------------------------------
-- Gift subscriptions, the database's half (billing.sql).
--
-- "A year of RankUp", bought by somebody with no account and redeemed by a
-- parent with a code. tests/billingwalk.mjs walks it through the real
-- checkout, webhook and redeem endpoint against a stand-in Stripe; this file
-- holds every rule on its own:
--
--   - what the buyer types is checked, and no code exists until it is paid;
--   - the webhook's "paid" makes one code, once, however often it arrives,
--     and only its hash is kept;
--   - a code works once, for two years, and not after a refund;
--   - five wrong codes an hour for a family, twenty from one address;
--   - redeeming gives 12 months, effective_tier honours it, a second gift
--     stacks on the first;
--   - a family whose paid plan renews is told to turn renewal off first,
--     and one whose plan is ending gets its gift from the day it ends;
--   - a refund in full voids an unused code, and a used one stays used with
--     the decision written down;
--   - a browser can reach none of it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function t55_fam(p_n int) returns uuid language sql immutable as $$
  select ('55f00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t55_user(p_n int) returns uuid language sql immutable as $$
  select ('55a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;
create or replace function t55_hash(p_code text) returns text language sql immutable as $$
  select encode(sha256(convert_to(regexp_replace(upper(p_code), '[^A-Z0-9]', '', 'g'), 'UTF8')), 'hex') $$;

-- A family with a parent, paying for nothing unless told.
create or replace function t55_family(p_n int, p_tier text default 'starter', p_status text default 'none',
                                      p_ends interval default null)
returns uuid language plpgsql as $$
begin
  insert into auth.users (id, email) values (t55_user(p_n), 't55-parent-' || p_n || '@example.com');
  insert into families (id, name, tier, subscription_status, stripe_customer_id, stripe_subscription_id, subscription_ends_at)
  values (t55_fam(p_n), 'T55 Household ' || p_n, p_tier, p_status,
          case when p_status <> 'none' then 'cus_t55_' || p_n end,
          case when p_status <> 'none' then 'sub_t55_' || p_n end,
          case when p_ends is not null then now() + p_ends end);
  insert into parents (user_id, family_id, name, role) values (t55_user(p_n), t55_fam(p_n), 'T55 Parent ' || p_n, 'parent');
  perform seed_consent(t55_fam(p_n), t55_user(p_n));
  return t55_fam(p_n);
end $$;

-- A gift bought and paid for: the order, then Stripe's "paid" with this code.
create or replace function t55_gift(p_plan text, p_code text, p_session text) returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := start_gift_order(p_plan, 'self', 'gift-buyer@example.com', 'Gran', null, null, null);
  perform fulfil_gift_order((v->>'order_id')::uuid, p_session, 'pi_' || p_session, t55_hash(p_code), 4999, 'usd');
  return (v->>'order_id')::uuid;
end $$;

select t55_family(1);
select t55_family(2);
select t55_family(3, 'elite', 'active');                        -- pays, and renews
select t55_family(4, 'standard', 'active', interval '20 days'); -- pays, cancelled, runs 20 more days
select t55_family(5);
select t55_family(6);
select t55_family(7);
select t55_family(8);
select t55_family(9);
select t55_family(10);
select t55_family(11);
select t55_family(12);

-- ---------- what the buyer types ----------
do $$
declare v jsonb; v_id uuid; v_n int;
begin
  v := start_gift_order('elite', 'email', '  Gift-Buyer@Example.com ', 'Gran <b>Jo</b>', 'The  Rivera family',
                        'Family@Example.com', E'Merry\tChristmas!  Love from us all');
  v_id := (v->>'order_id')::uuid;
  perform ok('a gift can be started with no account: an order, and nothing else', (v->>'ok')::boolean and v_id is not null);
  perform ok('no code exists until Stripe says it is paid',
    (select code_hash is null and paid_at is null and expires_at is null from gift_orders where id = v_id));
  perform ok('what was typed is kept plain: trimmed, one space, no markup, emails in lower case',
    (select email = 'gift-buyer@example.com' from gift_buyers where order_id = v_id)
    and (select from_name = 'Gran b Jo /b' and to_name = 'The Rivera family' and to_email = 'family@example.com'
                and message = 'Merry Christmas! Love from us all' from gift_recipients where order_id = v_id),
    (select row_to_json(r)::text from gift_recipients r where order_id = v_id));
  perform ok('a recipient''s details are not given a delete date until it is paid for (an unpaid order goes whole)',
    (select keep_until is null from gift_recipients where order_id = v_id));

  begin
    update gift_orders set code_hash = t55_hash('NOTPAIDATALL') where id = v_id;
    perform ok('a code cannot be put on an order that was not paid for', false);
  exception when check_violation then
    perform ok('a code cannot be put on an order that was not paid for', true);
  end;

  perform ok('a plan that is not Standard or Elite Pass is refused',
    start_gift_order('starter', 'self', 'b@example.com')->>'reason' = 'bad_plan');
  perform ok('how it is given must be email or self',
    start_gift_order('elite', 'post', 'b@example.com')->>'reason' = 'bad_delivery');
  perform ok('the buyer''s email must be an email',
    start_gift_order('elite', 'self', 'not an email')->>'reason' = 'bad_email');
  perform ok('emailing the gift needs the recipient''s email',
    start_gift_order('elite', 'email', 'b@example.com', 'Gran', 'Them', null)->>'reason' = 'no_recipient_email');
  perform ok('and a real one',
    start_gift_order('elite', 'email', 'b@example.com', 'Gran', 'Them', 'nope@')->>'reason' = 'bad_recipient_email');
  perform ok('names are at most 60 characters',
    start_gift_order('elite', 'self', 'b@example.com', repeat('a', 61))->>'reason' = 'name_too_long');
  perform ok('the message is at most 200 characters',
    start_gift_order('elite', 'self', 'b@example.com', 'Gran', null, null, repeat('a', 201))->>'reason' = 'message_too_long');
  perform ok('and 200 is fine',
    (start_gift_order('elite', 'self', 'b@example.com', 'Gran', null, null, repeat('a', 200))->>'ok')::boolean);
  perform ok('a rude word in the message is refused (the Theme Genesis list)',
    start_gift_order('elite', 'self', 'b@example.com', 'Gran', null, null, 'have a sh1t year')->>'reason' = 'rude_words');
  perform ok('or in a name',
    start_gift_order('elite', 'self', 'b@example.com', 'Bastard', null, null, 'hi')->>'reason' = 'rude_words');
  perform ok('a link in the message is refused: RankUp''s email is not a way to send somebody a link',
    start_gift_order('elite', 'self', 'b@example.com', 'Gran', null, null, 'see www.example.com')->>'reason' = 'no_links'
    and start_gift_order('elite', 'self', 'b@example.com', 'Gran', null, null, 'go to https://x.test')->>'reason' = 'no_links'
    and start_gift_order('elite', 'self', 'b@example.com', 'Gran', null, null, 'write to me@example.com')->>'reason' = 'no_links');

  -- Ten an hour from one address, then `too_many_gifts`; others carry on.
  for v_n in 1..10 loop perform start_gift_order('elite', 'self', 'b@example.com', null, null, null, null, 't55-one-address'); end loop;
  perform ok('at most 10 gifts are started an hour from one address, because the page needs no account',
    start_gift_order('elite', 'self', 'b@example.com', null, null, null, null, 't55-one-address')->>'reason' = 'too_many_gifts');
  perform ok('another address is not held up by it',
    (start_gift_order('elite', 'self', 'b@example.com', null, null, null, null, 't55-another-address')->>'ok')::boolean);
  perform ok('the address is kept only as the key the server made, and only to count',
    (select count(*) = 11 from gift_checkout_attempts where ip_key in ('t55-one-address', 't55-another-address')));

  -- 2,000 orders an hour across everybody, then `busy`.
  select count(*) into v_n from gift_orders where created_at > now() - interval '1 hour';
  insert into gift_orders (plan, delivery) select 'standard', 'self' from generate_series(1, greatest(0, 2000 - v_n));
  perform ok('and at most 2,000 an hour across everybody',
    start_gift_order('elite', 'self', 'b@example.com')->>'reason' = 'busy');
  delete from gift_orders where id in (select id from gift_orders where created_at > now() - interval '1 hour'
                                         and paid_at is null and id <> v_id
                                         and not exists (select 1 from gift_buyers b where b.order_id = gift_orders.id));
end $$;

-- ---------- paid: one code, once ----------
do $$
declare v jsonb; v_id uuid; v_first jsonb; v_again jsonb; v_other jsonb; v_row gift_orders;
begin
  v := start_gift_order('elite', 'email', 'paid-buyer@example.com', 'Gran', 'The Riveras', 'riveras@example.com', 'Enjoy');
  v_id := (v->>'order_id')::uuid;
  v_first := fulfil_gift_order(v_id, 'cs_t55_paid', 'pi_t55_paid', t55_hash('PAIDCODE2345'), 7999, 'usd');
  select * into v_row from gift_orders where id = v_id;
  perform ok('Stripe''s "paid" makes the code, keeping its hash and never the code',
    (v_first->>'ok')::boolean and v_row.code_hash = t55_hash('PAIDCODE2345')
    and position('PAIDCODE2345' in (select row_to_json(o)::text from gift_orders o where id = v_id)) = 0, v_first::text);
  perform ok('it can be used for two years from purchase',
    v_row.expires_at between now() + interval '2 years' - interval '1 minute' and now() + interval '2 years');
  perform ok('and the webhook is handed what it needs for the emails',
    v_first->>'buyer_email' = 'paid-buyer@example.com' and v_first->>'to_email' = 'riveras@example.com'
    and v_first->>'delivery' = 'email' and v_first->>'plan' = 'elite' and not (v_first->>'receipt_sent')::boolean, v_first::text);
  perform ok('the recipient''s details now go in 30 days, and the buyer''s email when the code runs out',
    (select keep_until between now() + interval '29 days' and now() + interval '31 days' from gift_recipients where order_id = v_id)
    and (select keep_until = v_row.expires_at from gift_buyers where order_id = v_id));

  v_again := fulfil_gift_order(v_id, 'cs_t55_paid', 'pi_t55_paid', t55_hash('PAIDCODE2345'), 7999, 'usd');
  perform ok('Stripe sending it again changes nothing, and says the code worked out is the one kept',
    (v_again->>'duplicate')::boolean and (v_again->>'code_matches')::boolean
    and (select code_hash = v_row.code_hash and paid_at = v_row.paid_at from gift_orders where id = v_id), v_again::text);
  perform ok('a replay with a different code (a changed secret) does not replace the one sold, and says so',
    (fulfil_gift_order(v_id, 'cs_t55_paid', 'pi_t55_paid', t55_hash('OTHERCODE234'))->>'code_matches')::boolean = false
    and (select code_hash = v_row.code_hash from gift_orders where id = v_id));
  perform ok('the money is counted once, against no family',
    (select count(*) = 1 and sum(amount_pence) = 7999 and bool_and(family_id is null)
       from billing_events where stripe_event = 'gift:cs_t55_paid'));
  perform ok('one order is paid by one checkout',
    fulfil_gift_order(v_id, 'cs_t55_someone_else', 'pi_x', t55_hash('PAIDCODE2345'))->>'reason' = 'other_session');
  perform ok('an order that does not exist makes no code',
    fulfil_gift_order(gen_random_uuid(), 'cs_t55_nothing', 'pi_x', t55_hash('NOORDER23456'))->>'reason' = 'no_order');
  perform ok('nor does a request without a proper hash',
    fulfil_gift_order(v_id, 'cs_t55_paid', 'pi_x', 'PAIDCODE2345')->>'reason' = 'bad_request');

  perform ok('the receipt is marked sent', (mark_gift_sent(v_id, 'receipt')->>'ok')::boolean);
  perform ok('and only the receipt', (select receipt_sent_at is not null and gift_sent_at is null from gift_orders where id = v_id));
  perform ok('and the gift email', (mark_gift_sent(v_id, 'gift')->>'ok')::boolean);
  perform ok('which is kept', (select gift_sent_at is not null from gift_orders where id = v_id));
  perform ok('nothing else can be marked', mark_gift_sent(v_id, 'other')->>'reason' = 'bad_which');
  perform ok('a replay after both were sent tells the webhook not to send them again',
    (fulfil_gift_order(v_id, 'cs_t55_paid', 'pi_t55_paid', t55_hash('PAIDCODE2345')) @> '{"receipt_sent": true, "gift_sent": true}'));
end $$;

-- ---------- redeeming: 12 months, once ----------
do $$
declare v jsonb; v_until timestamptz;
begin
  perform t55_gift('elite', 'ELITE2345678', 'cs_t55_e1');
  perform ok('before: Starter', effective_tier(t55_fam(1)) = 'starter');
  v := redeem_gift_code(t55_fam(1), 'elite-2345-678', 'ip-home');
  select gift_until into v_until from families where id = t55_fam(1);
  perform ok('a parent redeems the code, typed in any case and with dashes, and gets the plan',
    (v->>'ok')::boolean and v->>'tier' = 'elite' and effective_tier(t55_fam(1)) = 'elite', v::text);
  perform ok('for 12 months from today',
    v_until between now() + interval '12 months' - interval '1 minute' and now() + interval '12 months'
    and (select gift_starts_at <= now() and tier = 'starter' from families where id = t55_fam(1)));
  perform ok('Stripe''s column is untouched: the gift sits beside what the family pays for',
    (select tier = 'starter' and subscription_status = 'none' from families where id = t55_fam(1)));
  perform ok('the order records who used it and when',
    (select redeemed_by = t55_fam(1) and redeemed_at is not null from gift_orders where stripe_session = 'cs_t55_e1'));
  perform ok('a used code is used for everyone, the same family included',
    redeem_gift_code(t55_fam(2), 'ELITE2345678', 'ip-2')->>'reason' = 'used'
    and redeem_gift_code(t55_fam(1), 'ELITE2345678', 'ip-home')->>'reason' = 'used'
    and effective_tier(t55_fam(2)) = 'starter');
  perform ok('a code nobody sold is no code', redeem_gift_code(t55_fam(2), 'ZZZZ2222ZZZZ', 'ip-2')->>'reason' = 'bad_code');
  perform ok('nor is a short one', redeem_gift_code(t55_fam(2), 'ABC', 'ip-2')->>'reason' = 'bad_code');
  perform ok('a family that does not exist is refused', redeem_gift_code(gen_random_uuid(), 'ZZZZ2222ZZZZ')->>'reason' = 'no_family');

  -- Two years from purchase.
  perform t55_gift('standard', 'OLDCODE23456', 'cs_t55_old');
  update gift_orders set expires_at = now() - interval '1 second' where stripe_session = 'cs_t55_old';
  perform ok('a code past its two years has expired', redeem_gift_code(t55_fam(5), 'OLDCODE23456', 'ip-5')->>'reason' = 'expired'
    and effective_tier(t55_fam(5)) = 'starter');
end $$;

-- ---------- the plan check honours gift_until ----------
do $$
begin
  update families set gift_tier = 'standard', gift_starts_at = now() - interval '13 months', gift_until = now() - interval '1 second'
   where id = t55_fam(6);
  perform ok('a gift that ended is not a plan any more', effective_tier(t55_fam(6)) = 'starter');
  update families set gift_until = now() + interval '1 day' where id = t55_fam(6);
  perform ok('one still running is', effective_tier(t55_fam(6)) = 'standard');
  update families set gift_starts_at = now() + interval '1 day', gift_until = now() + interval '366 days' where id = t55_fam(6);
  perform ok('one that has not started yet is not, yet', effective_tier(t55_fam(6)) = 'starter');
  update families set tier = 'elite', gift_starts_at = now() - interval '1 day' where id = t55_fam(6);
  perform ok('a Standard gift never lowers an Elite family', effective_tier(t55_fam(6)) = 'elite');
  update families set tier = 'starter', gift_tier = null, gift_starts_at = null, gift_until = null where id = t55_fam(6);

  -- Starter is one child; a gift plan is a real plan for the second.
  insert into kids (family_id, name) values (t55_fam(1), 'T55 First');
  insert into kids (family_id, name) values (t55_fam(1), 'T55 Second');
  perform ok('a gift of Elite Pass lets a Starter family add a second child', (select count(*) = 2 from kids where family_id = t55_fam(1)));
end $$;

-- ---------- stacking ----------
do $$
declare v jsonb; v_before timestamptz; v_after timestamptz;
begin
  perform t55_gift('standard', 'STACK2345678', 'cs_t55_stack');
  select gift_until into v_before from families where id = t55_fam(1);
  v := redeem_gift_code(t55_fam(1), 'STACK2345678', 'ip-home');
  select gift_until into v_after from families where id = t55_fam(1);
  -- Each gift keeps its own plan for its own 12 months, the better first:
  -- the Elite Pass year running now, then the Standard year after it.
  perform ok('a second gift is 12 more months, after the first', (v->>'stacked')::boolean
    and (v->>'until')::timestamptz = v_before + interval '12 months', v::text);
  perform ok('the Elite Pass year runs first, to the day it was going to end',
    v_after = v_before and (select gift_tier = 'elite' from families where id = t55_fam(1))
    and effective_tier(t55_fam(1)) = 'elite');
  perform ok('then the Standard year: Standard, not Elite Pass, for its 12 months',
    (select gift_then_tier = 'standard' and gift_then_until = v_before + interval '12 months'
       from families where id = t55_fam(1)));
  perform ok('still started: the first gift runs now', (select gift_starts_at <= now() from families where id = t55_fam(1)));
end $$;

-- ---------- a family that already pays ----------
do $$
declare v jsonb; v_ends timestamptz;
begin
  perform t55_gift('elite', 'PAYING234567', 'cs_t55_paying');
  v := redeem_gift_code(t55_fam(3), 'PAYING234567', 'ip-3');
  perform ok('a paid plan that will renew: told to turn renewal off first, so the card is never charged for gift time',
    v->>'reason' = 'subscription_renews', v::text);
  perform ok('and the code is not spent, nor counted as a wrong guess',
    (select redeemed_at is null from gift_orders where stripe_session = 'cs_t55_paying')
    and not exists (select 1 from gift_redeem_attempts where family_id = t55_fam(3)));

  select subscription_ends_at into v_ends from families where id = t55_fam(4);
  v := redeem_gift_code(t55_fam(4), 'PAYING234567', 'ip-4');
  perform ok('a paid plan already cancelled: the gift starts the day it ends, and runs 12 months from then',
    (v->>'ok')::boolean and (select gift_starts_at = v_ends and gift_until = v_ends + interval '12 months'
                               from families where id = t55_fam(4)), v::text);
  perform ok('until then the family keeps the plan it paid for (the gift is Elite, it paid for Standard)',
    effective_tier(t55_fam(4)) = 'standard');
  update families set subscription_ends_at = now() - interval '1 second', subscription_status = 'canceled',
                      tier = 'starter', stripe_subscription_id = null,
                      gift_starts_at = now() - interval '1 second' where id = t55_fam(4);
  perform ok('and when it ends, the gift takes over', effective_tier(t55_fam(4)) = 'elite');
end $$;

-- ---------- too many tries ----------
do $$
declare i int; v_good text := 'GOODCODE2345';
begin
  perform t55_gift('elite', v_good, 'cs_t55_good');
  for i in 1..5 loop perform redeem_gift_code(t55_fam(7), 'WRONG' || i || 'ABCDEF', 'ip-7'); end loop;
  perform ok('five wrong codes in an hour, and the family must wait, even with a real code',
    redeem_gift_code(t55_fam(7), v_good, 'ip-7')->>'reason' = 'too_many_tries'
    and (select redeemed_at is null from gift_orders where stripe_session = 'cs_t55_good'));
  update gift_redeem_attempts set tried_at = now() - interval '61 minutes' where family_id = t55_fam(7);

  -- Twenty wrong codes from one address, five from each of four families.
  for i in 1..20 loop
    perform redeem_gift_code(t55_fam(9 + (i - 1) / 5), 'BRUTE' || lpad(i::text, 7, 'A'), 'ip-one-address');
  end loop;
  perform ok('twenty wrong codes from one address, and that address must wait, whichever family it says it is',
    redeem_gift_code(t55_fam(8), v_good, 'ip-one-address')->>'reason' = 'too_many_tries');
  perform ok('another address is not held up by it', (redeem_gift_code(t55_fam(7), v_good, 'ip-7')->>'ok')::boolean);
  perform ok('and the family has its gift', effective_tier(t55_fam(7)) = 'elite');
  perform ok('only codes that did not work count: a family''s right one is kept as ok',
    (select count(*) = 1 from gift_redeem_attempts where family_id = t55_fam(7) and ok));
end $$;

-- ---------- refunds ----------
do $$
declare v jsonb; v_unused uuid; v_used uuid; v_early uuid;
begin
  v_unused := t55_gift('elite', 'REFUND234567', 'cs_t55_refund');
  perform ok('a partial refund is goodwill and changes nothing',
    apply_gift_refund('pi_cs_t55_refund', 'ch_t55_part', false)->>'ignored' = 'partial_refund'
    and (select voided_at is null from gift_orders where id = v_unused));
  v := apply_gift_refund('pi_cs_t55_refund', 'ch_t55_full', true);
  perform ok('a refund in full of an unused code voids it, and says why',
    v->>'outcome' = 'refunded_unused' and (select voided_at is not null and refund_note = 'refunded_unused' from gift_orders where id = v_unused), v::text);
  perform ok('it then cannot be redeemed', redeem_gift_code(t55_fam(8), 'REFUND234567', 'ip-8')->>'reason' = 'refunded');
  perform ok('the same refund again acts once', (apply_gift_refund('pi_cs_t55_refund', 'ch_t55_full', true)->>'duplicate')::boolean);

  v_used := (select id from gift_orders where stripe_session = 'cs_t55_e1');
  v := apply_gift_refund('pi_cs_t55_e1', 'ch_t55_used', true);
  perform ok('a used code stays used: the family keeps its year, and the decision is written down',
    v->>'outcome' = 'refunded_after_use'
    and (select voided_at is null and redeemed_at is not null and refund_note = 'refunded_after_use' from gift_orders where id = v_used)
    and effective_tier(t55_fam(1)) = 'elite', v::text);

  perform ok('a payment that is not a gift''s is left to the family and school rules',
    apply_gift_refund('pi_some_plan', 'ch_plan', true) = '{"ok": true, "gift": false}'::jsonb
    and apply_gift_refund(null, 'ch_plan', true) = '{"ok": true, "gift": false}'::jsonb);

  -- Refunded before Stripe's "paid" reached the webhook.
  v := start_gift_order('standard', 'self', 'early@example.com');
  v_early := (v->>'order_id')::uuid;
  update gift_orders set payment_intent = 'pi_t55_early' where id = v_early;
  perform ok('a refund that arrives before the payment is recorded is remembered',
    apply_gift_refund('pi_t55_early', 'ch_t55_early', true)->>'outcome' = 'refunded_before_code');
  perform ok('and no code is ever made for it',
    fulfil_gift_order(v_early, 'cs_t55_early', 'pi_t55_early', t55_hash('EARLY2345678'))->>'reason' = 'voided'
    and (select code_hash is null from gift_orders where id = v_early));
end $$;

-- ---------- a browser reaches none of it ----------
do $$
declare f text; v_open text[] := '{}'; v_seen int;
begin
  foreach f in array array[
    'start_gift_order(text,text,text,text,text,text,text,text)', 'fulfil_gift_order(uuid,text,text,text,integer,text)',
    'gift_order_details(uuid)', 'mark_gift_sent(uuid,text)', 'redeem_gift_code(uuid,text,text)',
    'apply_gift_refund(text,text,boolean)', 'gift_plain(text,integer)', 'gift_email_ok(text)']
  loop
    if has_function_privilege('anon', to_regprocedure(f), 'execute')
       or has_function_privilege('authenticated', to_regprocedure(f), 'execute')
       or has_function_privilege('public', to_regprocedure(f), 'execute') then
      v_open := v_open || f;
    end if;
  end loop;
  perform ok('every gift function is the server''s alone: not public, anon or authenticated',
    cardinality(v_open) = 0, array_to_string(v_open, ', '));
  perform ok('row level security is on for every gift table, with no policy',
    (select bool_and(relrowsecurity) from pg_class where relname in ('gift_orders', 'gift_buyers', 'gift_recipients', 'gift_redeem_attempts', 'gift_checkout_attempts'))
    and not exists (select 1 from pg_policies where tablename like 'gift\_%'));

  -- A parent of a family with a gift, signed in, asking directly.
  perform become(t55_user(1));
  set local role app_user;
  begin
    select count(*) into v_seen from gift_orders;
  exception when insufficient_privilege then v_seen := 0;
  end;
  perform ok('a signed-in parent sees no gift order, not even the one they used', v_seen = 0);
  begin
    perform redeem_gift_code(t55_fam(1), 'ELITE2345678', null);
    perform ok('nor can a browser redeem a code without the server''s limits', false);
  exception when insufficient_privilege then
    perform ok('nor can a browser redeem a code without the server''s limits', true);
  end;
  begin
    update families set gift_until = now() + interval '10 years' where id = t55_fam(1);
    perform ok('nor write its own gift end date', false);
  exception when insufficient_privilege then
    perform ok('nor write its own gift end date', true);
  end;
  perform ok('billing_status tells the parent''s plan screen about the gift',
    (billing_status()->>'gift_tier') = 'elite' and billing_status()->>'gift_until' is not null);
  reset role;
  perform become(null);
end $$;

drop function t55_gift(text, text, text);
drop function t55_family(int, text, text, interval);
drop function t55_hash(text);
drop function t55_user(int);
drop function t55_fam(int);
