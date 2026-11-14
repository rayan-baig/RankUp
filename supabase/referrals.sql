-- ---------------------------------------------------------------------------
-- Referrals.
--
-- Run after schema.sql and billing.sql (it reads the Stripe columns billing.sql
-- keeps on a family).
--
-- Two rewards, at two different moments, for two different families:
--
--   - The family who ARRIVES gets trial time (30 days of Standard) when its
--     child finishes a first chore that a parent accepts. Not at sign-up:
--     paying for signups is how a referral programme turns into a farm, and a
--     first approved chore costs the farmer a real chore, done on a child's
--     phone and accepted by a parent.
--
--   - The family who INVITED gets one free month of its plan when the family
--     it brought starts paying: on that family's first paid invoice, monthly
--     or yearly (earn_referral_reward, below). A first chore used to pay the
--     inviting family 30 days too; a reward for a household that has paid is
--     the one the owner chose, and paying both would be paying twice for one
--     friend.
--
-- The free month is real money, so its rules are written down here and
-- nowhere else: never for inviting yourself (the same family, the same parent
-- email, the same Stripe customer), once per invited family, at most twelve a
-- year, and withdrawn if the paying family's first payment is handed back in
-- full within 14 days and the month has not been used yet.
-- ---------------------------------------------------------------------------

-- Who invited whom. One row per invited family, so a family can be referred
-- exactly once and the second person to send them a code gets nothing —
-- deliberately, because otherwise a code is worth re-claiming forever.
create table if not exists referrals (
  invited_family_id  uuid primary key references families(id) on delete cascade,
  referrer_family_id uuid not null references families(id) on delete cascade,
  created_at         timestamptz not null default now(),
  -- Null until the invited family's first chore is approved. Until then this
  -- row is a claim, not a debt.
  qualified_at       timestamptz,
  constraint referrals_not_self check (invited_family_id <> referrer_family_id)
);

create index if not exists referrals_referrer_idx on referrals (referrer_family_id);

-- No policies, on purpose. A browser never reads this table directly: every
-- read goes through my_referrals(), which is security definer and answers only
-- about the caller's own family. RLS on with no policy is the safe default —
-- it denies everything until something deliberately allows it.
alter table referrals enable row level security;

-- How long each side gets. One number, in one place, so the SQL and the share
-- text can never drift apart — the app asks for this rather than hardcoding
-- "30 days" into a sentence a child will read out loud.
create or replace function referral_reward_days()
returns int language sql immutable as $$ select 30 $$;

revoke execute on function referral_reward_days() from public, anon, authenticated;

/**
 * A family's invite code.
 *
 * Derived from the family id rather than stored: there is no code table to
 * keep in step, no collision to handle, and a code cannot be rotated out from
 * under a message someone already sent. Base32 without the characters that get
 * misread aloud — no O/0, no I/1 — because these get spelled out in a
 * playground.
 */
create or replace function referral_code_for(p_family_id uuid)
returns text language plpgsql immutable as $$
declare
  v_hash  bigint;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_out   text := '';
  i       int;
begin
  if p_family_id is null then return null; end if;
  -- A stable 30-bit number from the uuid. hashtextextended is seeded, so this
  -- is the same answer on every call and on every machine.
  v_hash := abs(hashtextextended(p_family_id::text, 0)) % 1073741824;
  for i in 1..6 loop
    v_out := substr(v_chars, (v_hash % 32)::int + 1, 1) || v_out;
    v_hash := v_hash / 32;
  end loop;
  return v_out;
end $$;

-- Not granted: it takes an arbitrary family id, and a code is the one thing
-- about another household a stranger should not be able to ask for.
revoke execute on function referral_code_for(uuid) from public, anon, authenticated;

-- The caller's own code, which is the only one a browser may have.
create or replace function my_referral_code()
returns text language sql stable security definer set search_path = public as $$
  select referral_code_for(current_family_id());
$$;

grant execute on function my_referral_code() to authenticated;

-- ---------------------------------------------------------------------------
-- What the free month needs to remember, on the referral it belongs to.
--
-- One row per invited family already, so "one reward per invited family" is
-- the primary key rather than a rule somebody has to remember. Every column
-- is written by the Stripe webhook through the functions below, never by a
-- browser (the table has no policy at all).
-- ---------------------------------------------------------------------------

-- The invited family's first paid invoice: when, which, and the payment ids
-- it was paid with (a refund or a dispute names the charge or the payment,
-- never the invoice). Set once and never again, whatever happens after.
alter table referrals add column if not exists paid_at       timestamptz;
alter table referrals add column if not exists paid_invoice  text;
alter table referrals add column if not exists paid_refs     text[] not null default '{}';
-- Payments of the invited family handed back in full or disputed before any
-- invoice was counted. Stripe does not deliver in order: a refund can arrive
-- before the "invoice paid" it undoes, and that invoice must then not count.
alter table referrals add column if not exists reversed_refs text[] not null default '{}';
/*
 * The reward itself.
 *
 *   owed       earned; the inviting family pays, and the credit is on its way
 *              to its Stripe account (the webhook adds it, then marks it)
 *   banked     earned; the inviting family is on Starter (or its trial) and
 *              pays nothing yet, so there is nothing to take a month off. It
 *              waits, and becomes a credit the moment the family subscribes.
 *   applied    on the family's Stripe account as credit: one month at the
 *              price of the plan it pays for, off its next invoice
 *   withdrawn  taken back: the paying family's first payment was refunded in
 *              full (or disputed) within 14 days, and the month was unused
 *   blocked    never given: self-referral, the yearly cap, or a first payment
 *              already refunded before it was counted (reward_note says which)
 */
alter table referrals add column if not exists reward_state        text;
alter table referrals add column if not exists reward_note         text;
alter table referrals add column if not exists reward_at           timestamptz;
alter table referrals add column if not exists reward_amount       int;
alter table referrals add column if not exists reward_currency     text;
alter table referrals add column if not exists reward_tier         text;
alter table referrals add column if not exists reward_cycle        text;
alter table referrals add column if not exists reward_credit       text;
alter table referrals add column if not exists reward_reversal     text;
alter table referrals add column if not exists reward_applied_at   timestamptz;
alter table referrals add column if not exists reward_withdrawn_at timestamptz;
-- When a parent of the inviting family saw "You earned a free month". Once a
-- family, on whichever phone looks first.
alter table referrals add column if not exists reward_seen_at      timestamptz;

alter table referrals drop constraint if exists referrals_reward_state_check;
alter table referrals add constraint referrals_reward_state_check
  check (reward_state in ('owed', 'banked', 'applied', 'withdrawn', 'blocked'));

-- The yearly cap counts a family's rewards over the last 365 days.
create index if not exists referrals_reward_idx on referrals (referrer_family_id, reward_at);

-- Twelve free months a year, at most, however many friends pay. Past that a
-- referral programme is a way of never paying.
create or replace function referral_reward_cap()
returns int language sql immutable as $$ select 12 $$;

revoke execute on function referral_reward_cap() from public, anon, authenticated;

-- How long a refund of the paying family's first payment can take an unused
-- free month back. After that the month stands. One number, which the card
-- reads too.
create or replace function referral_refund_days()
returns int language sql immutable as $$ select 14 $$;

revoke execute on function referral_refund_days() from public, anon, authenticated;

/*
 * An email address as a person, not as a string: case and spaces ignored, and
 * a "+tag" dropped, because name+2@example.com reaches the same inbox as
 * name@example.com and is the cheapest second account there is.
 */
create or replace function referral_email_key(p_email text)
returns text language sql immutable as $$
  select nullif(regexp_replace(lower(trim(coalesce(p_email, ''))), '\+[^@]*@', '@'), '');
$$;

revoke execute on function referral_email_key(text) from public, anon, authenticated;

/**
 * Is the inviting family the invited one under another name?
 *
 *   'same_family'    the same family
 *   'same_email'     a parent of each has the same email address
 *   'same_customer'  both pay through the same Stripe customer (also when the
 *                    invited family's paying customer is the inviter's)
 *   null             two households
 *
 * Asked when a code is claimed and again when the reward is earned, because
 * the Stripe customer only exists by then.
 */
create or replace function referral_same_household(p_referrer uuid, p_invited uuid, p_customer text default null)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if p_referrer is null or p_invited is null then return null; end if;
  if p_referrer = p_invited then return 'same_family'; end if;
  if exists (
       select 1
         from parents a join auth.users ua on ua.id = a.user_id,
              parents b join auth.users ub on ub.id = b.user_id
        where a.family_id = p_referrer and a.role = 'parent'
          and b.family_id = p_invited and b.role = 'parent'
          and referral_email_key(ua.email) = referral_email_key(ub.email)) then
    return 'same_email';
  end if;
  if exists (
       select 1 from families r, families i
        where r.id = p_referrer and i.id = p_invited and r.stripe_customer_id is not null
          and (r.stripe_customer_id = i.stripe_customer_id or r.stripe_customer_id = p_customer)) then
    return 'same_customer';
  end if;
  return null;
end $$;

revoke execute on function referral_same_household(uuid, uuid, text) from public, anon, authenticated;

/**
 * Claim someone's code as a newly signed-up family.
 *
 * Everything here is a rule about what cannot be farmed:
 *
 *   - a family may be referred once, ever
 *   - a family may not refer itself, nor may a second family made by the same
 *     parent or paying with the same card account
 *   - only a NEW family may claim, where new means "signed up in the last 30
 *     days". Without this, a two-year-old household claims a code the day a
 *     friend joins and both collect, which is a discount for existing
 *     customers dressed up as growth.
 *
 * No reward lands here. This records the claim; qualify_referral() gives the
 * new family its trial when a child does a chore, and earn_referral_reward()
 * gives the inviting family its free month when the new family pays.
 */
create or replace function claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family   uuid := current_family_id();
  v_referrer uuid;
  v_age      interval;
begin
  if v_family is null or not is_parent() then
    raise exception 'only a parent can claim a referral';
  end if;

  if exists (select 1 from referrals where invited_family_id = v_family) then
    return jsonb_build_object('ok', false, 'reason', 'already_referred');
  end if;

  select now() - created_at into v_age from families where id = v_family;
  if v_age > interval '30 days' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_new_family');
  end if;

  -- Find whose code this is by generating every family's code and comparing.
  -- There is no index to use here and there does not need to be: this runs
  -- once per household, ever.
  select f.id into v_referrer
    from families f
   where referral_code_for(f.id) = upper(trim(p_code))
   limit 1;

  if v_referrer is null then
    return jsonb_build_object('ok', false, 'reason', 'no_such_code');
  end if;
  if v_referrer = v_family then
    return jsonb_build_object('ok', false, 'reason', 'own_code');
  end if;
  -- A second family made by the same parent (the same email, give or take a
  -- "+tag") or paying with the same Stripe customer is the same household.
  if referral_same_household(v_referrer, v_family) is not null then
    return jsonb_build_object('ok', false, 'reason', 'same_household');
  end if;

  insert into referrals (invited_family_id, referrer_family_id)
  values (v_family, v_referrer);

  return jsonb_build_object('ok', true, 'days', referral_reward_days());
end $$;

grant execute on function claim_referral(text) to authenticated;

/**
 * The new family's trial, if there is one waiting.
 *
 * Called from approve_submission, which means it runs inside a parent tapping
 * Approve. That is the reason for the exception handler: a referral is a nice
 * extra, and there is no version of this worth failing a child's approval
 * over. If it breaks, the approval still happens and the referral is simply
 * left unqualified.
 *
 * The family who arrived gets its trial for getting as far as a first
 * finished chore. The family who invited is paid later, and differently: a
 * free month when this family starts paying (earn_referral_reward).
 *
 * Idempotent through `qualified_at is null` — the second approved chore gives
 * nothing.
 */
create or replace function qualify_referral(p_family_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_referrer uuid;
begin
  update referrals
     set qualified_at = now()
   where invited_family_id = p_family_id
     and qualified_at is null
  returning referrer_family_id into v_referrer;

  if v_referrer is null then return; end if;

  perform grant_trial(p_family_id, 'standard', referral_reward_days());
exception when others then
  -- Deliberately swallowed. See above.
  return;
end $$;

-- Not granted: a browser calling this is a browser paying itself.
revoke execute on function qualify_referral(uuid) from public, anon, authenticated;

/**
 * The invited family has paid an invoice. Called only by the Stripe webhook,
 * on invoice.paid / invoice.payment_succeeded for a family's plan.
 *
 * Decides the inviting family's free month, once:
 *
 *   - only an invoice that took money counts. A trial's invoice is $0, and a
 *     failed one never arrives here (the webhook only sends paid invoices).
 *   - only the first. The invoice is kept on the referral, and any later
 *     invoice, or the same one again (Stripe sends invoice.paid and
 *     invoice.payment_succeeded for one payment, and retries both), answers
 *     `duplicate` and changes nothing.
 *   - a payment already refunded in full or disputed (the refund arrived
 *     first) does not count, and leaves the reward blocked.
 *   - never to the same household (referral_same_household), never more than
 *     referral_reward_cap() in 365 days.
 *
 * What it does not do is talk to Stripe. It answers 'owed' when the inviting
 * family pays (the webhook then credits one month of that family's plan and
 * calls mark_referral_reward_applied) and 'banked' when it does not (the
 * credit is made when that family subscribes; see referral_rewards_owed).
 */
create or replace function earn_referral_reward(
  p_family_id uuid,
  p_invoice text,
  p_amount int,
  p_refs text[] default '{}',
  p_customer text default null,
  p_paid_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r       referrals;
  v_refs  text[] := array(select distinct x from unnest(coalesce(p_refs, '{}'::text[])) x where nullif(x, '') is not null);
  v_why   text;
  v_state text;
  v_live  boolean;
begin
  if p_family_id is null or nullif(p_invoice, '') is null then
    return jsonb_build_object('ok', false, 'reason', 'no_invoice');
  end if;

  select * into r from referrals where invited_family_id = p_family_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'ignored', 'not_referred');
  end if;
  if r.paid_invoice is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', r.reward_state,
                              'referrer_family_id', r.referrer_family_id);
  end if;
  if coalesce(p_amount, 0) <= 0 then
    return jsonb_build_object('ok', true, 'ignored', 'nothing_paid');
  end if;

  -- One decision at a time per inviting family, so two friends paying in the
  -- same second cannot both slip under the cap.
  perform 1 from families where id = r.referrer_family_id for update;

  if p_invoice = any (r.reversed_refs) or v_refs && r.reversed_refs then
    v_state := 'blocked';
    v_why := 'payment_reversed';
  else
    v_why := referral_same_household(r.referrer_family_id, p_family_id, p_customer);
    if v_why is not null then
      v_state := 'blocked';
    elsif (select count(*) from referrals x
            where x.referrer_family_id = r.referrer_family_id
              and x.reward_state in ('owed', 'banked', 'applied')
              and x.reward_at > now() - interval '365 days') >= referral_reward_cap() then
      v_state := 'blocked';
      v_why := 'cap';
    else
      select stripe_customer_id is not null and stripe_subscription_id is not null
             and subscription_status in ('active', 'trialing', 'past_due')
        into v_live
        from families where id = r.referrer_family_id;
      v_state := case when coalesce(v_live, false) then 'owed' else 'banked' end;
    end if;
  end if;

  update referrals
     set paid_invoice = p_invoice,
         paid_at = coalesce(p_paid_at, now()),
         paid_refs = v_refs,
         reward_state = v_state,
         reward_note = v_why,
         reward_at = now()
   where invited_family_id = p_family_id;

  return jsonb_build_object('ok', true, 'state', v_state, 'why', v_why,
                            'referrer_family_id', r.referrer_family_id);
end $$;

revoke execute on function earn_referral_reward(uuid, text, int, text[], text, timestamptz) from public, anon, authenticated;

/**
 * The free months a family is owed and can be given now: earned, not yet on
 * its Stripe account, and the family has a live subscription to take them off.
 *
 * A banked month (the family was on Starter when it was earned) shows up here
 * the moment the webhook records the family's first subscription, which is
 * how "it comes off your bill when you choose a plan" comes true.
 */
create or replace function referral_rewards_owed(p_family_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'invited_family_id', r.invited_family_id,
           'customer_id', f.stripe_customer_id) order by r.reward_at), '[]'::jsonb)
    from referrals r
    join families f on f.id = r.referrer_family_id
   where r.referrer_family_id = p_family_id
     and r.reward_state in ('owed', 'banked')
     and f.stripe_customer_id is not null
     and f.stripe_subscription_id is not null
     and f.subscription_status in ('active', 'trialing', 'past_due');
$$;

revoke execute on function referral_rewards_owed(uuid) from public, anon, authenticated;

/** The credit is on the inviting family's Stripe account. Once. */
create or replace function mark_referral_reward_applied(
  p_invited uuid,
  p_credit text,
  p_amount int,
  p_currency text,
  p_tier text default null,
  p_cycle text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update referrals
     set reward_state = 'applied',
         reward_credit = p_credit,
         reward_amount = p_amount,
         reward_currency = upper(p_currency),
         reward_tier = p_tier,
         reward_cycle = p_cycle,
         reward_applied_at = now()
   where invited_family_id = p_invited
     and reward_state in ('owed', 'banked');
  return jsonb_build_object('ok', true, 'applied', found);
end $$;

revoke execute on function mark_referral_reward_applied(uuid, text, int, text, text, text) from public, anon, authenticated;

/**
 * A payment of an invited family handed back in full, or disputed. Called
 * only by the Stripe webhook, on charge.refunded (in full) and
 * charge.dispute.created.
 *
 *   - before its first invoice was counted: the payment is remembered, so
 *     that invoice, arriving late, does not count (earn_referral_reward)
 *   - the first payment, within 14 days of it: the free month is withdrawn if
 *     it has not been used. Owed or banked, that is simply done here. On the
 *     Stripe account already, the answer says `reverse_credit`, and the
 *     webhook takes the credit back only if the account still holds it, then
 *     calls finish_referral_withdrawal.
 *   - the first payment, later than that: the month stays, and what happened
 *     is written down
 *   - any later payment: nothing to do with the reward
 *
 * The first payment is recognised by its charge or payment id. If the
 * invoice carried neither, a charge made within a day of it is taken to be
 * it.
 */
create or replace function referral_payment_reversed(
  p_family_id uuid,
  p_refs text[],
  p_kind text default 'refund',
  p_at timestamptz default null,
  p_charge_created timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r       referrals;
  v_refs  text[] := array(select distinct x from unnest(coalesce(p_refs, '{}'::text[])) x where nullif(x, '') is not null);
  v_kind  text := case when p_kind = 'dispute' then 'dispute' else 'refund' end;
  v_at    timestamptz := coalesce(p_at, now());
  v_cust  text;
begin
  select * into r from referrals where invited_family_id = p_family_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'ignored', 'not_referred');
  end if;
  if cardinality(v_refs) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_payment');
  end if;
  -- A Flash Ticket pack is not the plan: its refund is apply_charge_refund's
  -- business and has nothing to do with the free month.
  if exists (select 1 from billing_events
              where family_id = p_family_id and type = 'flash_tickets'
                and payload->>'payment_intent' = any (v_refs)) then
    return jsonb_build_object('ok', true, 'ignored', 'not_a_plan_payment');
  end if;

  if r.paid_invoice is null then
    update referrals
       set reversed_refs = array(select distinct x from unnest(reversed_refs || v_refs) x)
     where invited_family_id = p_family_id;
    return jsonb_build_object('ok', true, 'recorded', 'before_first_invoice');
  end if;

  if not (v_refs && (r.paid_refs || r.paid_invoice)
          or (cardinality(r.paid_refs) = 0 and p_charge_created is not null
              and p_charge_created between r.paid_at - interval '1 day' and r.paid_at + interval '1 day')) then
    return jsonb_build_object('ok', true, 'ignored', 'not_first_payment');
  end if;
  if r.reward_state in ('withdrawn', 'blocked') then
    return jsonb_build_object('ok', true, 'ignored', 'nothing_to_withdraw', 'state', r.reward_state);
  end if;
  if r.reward_note is not null then
    -- Already decided by an earlier refund or dispute of the same payment.
    return jsonb_build_object('ok', true, 'ignored', 'already_decided', 'note', r.reward_note);
  end if;

  if v_at > r.paid_at + make_interval(days => referral_refund_days()) then
    update referrals set reward_note = v_kind || '_after_14_days' where invited_family_id = p_family_id;
    return jsonb_build_object('ok', true, 'kept', true, 'note', v_kind || '_after_14_days');
  end if;

  if r.reward_state in ('owed', 'banked') then
    update referrals
       set reward_state = 'withdrawn', reward_withdrawn_at = now(), reward_note = v_kind || '_within_14_days'
     where invited_family_id = p_family_id;
    return jsonb_build_object('ok', true, 'withdrawn', true, 'was', r.reward_state);
  end if;

  select stripe_customer_id into v_cust from families where id = r.referrer_family_id;
  return jsonb_build_object('ok', true, 'action', 'reverse_credit', 'kind', v_kind,
                            'invited_family_id', r.invited_family_id, 'customer_id', v_cust,
                            'credit', r.reward_credit, 'amount', r.reward_amount, 'currency', r.reward_currency);
end $$;

revoke execute on function referral_payment_reversed(uuid, text[], text, timestamptz, timestamptz) from public, anon, authenticated;

/**
 * How taking an applied credit back went: taken back (the account still held
 * it), or left (it had been used on an invoice already), with what happened
 * written down either way.
 */
create or replace function finish_referral_withdrawal(
  p_invited uuid,
  p_reversed boolean,
  p_kind text default 'refund',
  p_reversal text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_kind text := case when p_kind = 'dispute' then 'dispute' else 'refund' end;
begin
  if coalesce(p_reversed, false) then
    update referrals
       set reward_state = 'withdrawn', reward_withdrawn_at = now(), reward_reversal = p_reversal,
           reward_note = v_kind || '_within_14_days'
     where invited_family_id = p_invited and reward_state = 'applied' and reward_note is null;
  else
    update referrals set reward_note = v_kind || '_within_14_days_credit_used'
     where invited_family_id = p_invited and reward_state = 'applied' and reward_note is null;
  end if;
  return jsonb_build_object('ok', true, 'changed', found);
end $$;

revoke execute on function finish_referral_withdrawal(uuid, boolean, text, text) from public, anon, authenticated;

/**
 * What a parent has to show for their invites.
 *
 * Counts, and nothing else: how many families joined with the code, how many
 * of them pay, and what the free months came to. No names, no family ids, no
 * emails, no dates of anybody else's payment — nothing that tells one
 * household anything about another.
 *
 * A parent's only. A child's phone and a supporter get nothing: a reward for
 * bringing in paying customers is not something to put in front of a child.
 */
create or replace function my_referrals()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from parents where user_id = auth.uid() and role = 'parent';
  if v_family is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_parent');
  end if;

  return (
    select jsonb_build_object(
      'ok',        true,
      'code',      referral_code_for(v_family),
      'days',      referral_reward_days(),
      'cap',       referral_reward_cap(),
      'refund_days', referral_refund_days(),
      -- Families who signed up with this family's code.
      'claimed',   count(*),
      'qualified', count(*) filter (where qualified_at is not null),
      -- Of those, how many have started paying.
      'paying',    count(*) filter (where reward_state in ('owed', 'banked', 'applied') or reward_note = 'cap'),
      -- The free months: on the account, on their way, waiting for a plan,
      -- and taken back.
      'earned',    count(*) filter (where reward_state = 'applied'),
      'pending',   count(*) filter (where reward_state = 'owed'),
      'banked',    count(*) filter (where reward_state = 'banked'),
      'withdrawn', count(*) filter (where reward_state = 'withdrawn'),
      'capped',    count(*) filter (where reward_state = 'blocked' and reward_note = 'cap'),
      'this_year', count(*) filter (where reward_state in ('owed', 'banked', 'applied')
                                      and reward_at > now() - interval '365 days'),
      -- Free months nobody in the family has been told about yet.
      'unseen',    count(*) filter (where reward_state in ('owed', 'banked', 'applied') and reward_seen_at is null),
      'referred',  exists (select 1 from referrals where invited_family_id = v_family)
    )
    from referrals where referrer_family_id = v_family
  );
end $$;

grant execute on function my_referrals() to authenticated;

/** "You earned a free month" has been seen: not shown again, on any phone. */
create or replace function see_referral_rewards()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from parents where user_id = auth.uid() and role = 'parent';
  if v_family is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_parent');
  end if;
  update referrals set reward_seen_at = now()
   where referrer_family_id = v_family
     and reward_state in ('owed', 'banked', 'applied')
     and reward_seen_at is null;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function see_referral_rewards() to authenticated;

/**
 * This family's part in referrals, for "Download my data".
 *
 * What is held about the family itself: whether it joined with another
 * family's code (and when its first chore and first payment counted), how
 * many families joined with its own code, and each free month it earned.
 * Never which families those were: they are other households, and their
 * names, ids and emails are theirs.
 *
 * Asked for by name from export_family_data (consent.sql), which runs before
 * this file exists.
 */
create or replace function export_family_referral_data(p_family_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'joined_with_a_code', (select jsonb_build_object('claimed_at', created_at, 'first_chore_at', qualified_at,
                                                     'first_payment_at', paid_at)
                             from referrals where invited_family_id = p_family_id),
    'your_code', referral_code_for(p_family_id),
    'families_joined_with_your_code', (select count(*) from referrals where referrer_family_id = p_family_id),
    'free_months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'decided_at', reward_at, 'state', reward_state, 'note', reward_note,
               'amount', reward_amount, 'currency', reward_currency, 'plan', reward_tier, 'billing', reward_cycle,
               'applied_at', reward_applied_at, 'withdrawn_at', reward_withdrawn_at) order by reward_at)
        from referrals where referrer_family_id = p_family_id and reward_state is not null), '[]'::jsonb)
  );
$$;

revoke execute on function export_family_referral_data(uuid) from public, anon, authenticated;
