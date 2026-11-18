-- ---------------------------------------------------------------------------
-- Billing.
--
-- Run after schema.sql.
--
-- THE RULE: a family's tier is written by Stripe's webhook and by nothing else.
--
-- If a device could set its own `tier` column, every Elite feature would be one
-- edited request away from free, and a lapsed subscription would never actually
-- lapse. So the column is server-owned: the client never pushes it (see
-- SERVER_OWNED in src/lib/sync/shadow.js), and the function that writes it is
-- revoked from PUBLIC so only the webhook, holding the service role key, can
-- call it.
--
-- It also fails CLOSED. Anything other than a currently-good subscription
-- resolves to Standard.
-- ---------------------------------------------------------------------------

alter table families add column if not exists subscription_ends_at timestamptz;
alter table families add column if not exists billing_discount_percent int not null default 0;

/*
 * Every status Stripe gives a subscription, plus two of ours.
 *
 * The column used to allow only five of Stripe's eight, so a renewal that
 * failed for good ("unpaid"), a first payment that never cleared
 * ("incomplete", "incomplete_expired") or a trial that ended with no card on
 * file ("paused") made the update below throw. The webhook answered 500,
 * Stripe retried for three days, and the family kept whatever plan it had
 * before — Elite, for a paused trial — because the change that should have
 * dropped it could never be written. "refunded" is a payment handed back in
 * full (apply_charge_refund); "unknown" is a status Stripe adds after this
 * was written, stored as such rather than refused.
 */
alter table families drop constraint if exists families_subscription_status_check;
alter table families add constraint families_subscription_status_check
  check (subscription_status in ('none','trialing','active','past_due','canceled','unpaid',
                                 'incomplete','incomplete_expired','paused','refunded','unknown'));

create table if not exists billing_events (
  id           bigserial primary key,
  family_id    uuid references families(id) on delete set null,
  stripe_event text unique,
  type         text not null,
  payload      jsonb,
  received_at  timestamptz not null default now()
);

alter table billing_events enable row level security;
-- No policy: billing history is not readable from a browser.

/**
 * Apply a subscription change. Called only by the Stripe webhook.
 *
 * `p_stripe_event` makes this idempotent. Stripe retries deliveries, and
 * without a uniqueness check a retry could downgrade a family that had already
 * resubscribed.
 */
-- When the newest Stripe event applied to this family was created. Stripe does
-- not deliver events in order, and retries any it did not hear back from.
alter table families add column if not exists billing_event_at timestamptz;
-- The plan a family last paid for, so a parent dropped to Starter by a failed
-- or refunded payment is told which plan stopped, not just that one did.
alter table families add column if not exists last_paid_tier text;
-- Monthly or yearly, as the webhook last read it from the subscription's
-- price. Only a monthly plan can be paused or take the half-price month: a
-- month of pause on a yearly plan stops no payment, and half off "the next
-- invoice" of a yearly plan is half a year.
alter table families add column if not exists billing_cycle text check (billing_cycle in ('month', 'year'));
-- When the family took the one half-price month (claim_save_offer). Once per
-- family, ever: it is never cleared once Stripe has applied it.
alter table families add column if not exists save_offer_used_at timestamptz;

/*
 * One count for the owner's console (usage_bump, health.sql): a plan paused,
 * saved or cancelled. A count must never be the thing that stops a plan
 * changing, so a database without this version's health.sql yet simply
 * counts nothing.
 */
create or replace function count_plan_change(p_metric text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform usage_bump(p_metric);
exception when others then
  null;
end $$;
revoke execute on function count_plan_change(text) from public, anon, authenticated;

/**
 * A gift redeemed while a cancelled paid plan ran to its end waits for that
 * end (redeem_gift_code). When the paid plan really ends sooner (a refund in
 * full, a cancel at once), the gift starts then instead, and every date of
 * it moves the same amount earlier, so the family has all of it and never a
 * day on Starter in between. Never before the gift was redeemed, nor later
 * than it would have started.
 */
create or replace function start_waiting_gift(p_family_id uuid, p_ended_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_fam   families;
  v_at    timestamptz;
  v_shift interval;
begin
  select * into v_fam from families where id = p_family_id for update;
  if not found or v_fam.gift_starts_at is null then return; end if;
  v_at := greatest(least(coalesce(p_ended_at, now()), now()),
                   coalesce((select max(redeemed_at) from gift_orders where redeemed_by = p_family_id), '-infinity'));
  if v_at >= v_fam.gift_starts_at then return; end if;
  v_shift := v_fam.gift_starts_at - v_at;
  update families
     set gift_starts_at = v_at,
         gift_until = gift_until - v_shift,
         gift_then_until = gift_then_until - v_shift
   where id = p_family_id;
end $$;
revoke execute on function start_waiting_gift(uuid, timestamptz) from public, anon, authenticated;

drop function if exists apply_subscription_change(uuid, text, text, text, text, timestamptz, text, jsonb);
create or replace function apply_subscription_change(
  p_family_id uuid,
  p_status text,
  p_tier text,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_period_end timestamptz default null,
  p_stripe_event text default null,
  p_payload jsonb default '{}'::jsonb,
  p_event_created timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tier text;
  v_fam  families;
  v_status text := case when p_status in ('trialing','active','past_due','canceled','unpaid','incomplete',
                                          'incomplete_expired','paused','refunded')
                        then p_status else 'unknown' end;
begin
  if p_stripe_event is not null then
    begin
      insert into billing_events (family_id, stripe_event, type, payload,
                                  amount_pence, currency)
      values (p_family_id, p_stripe_event, p_status, p_payload,
              -- Pulled out once, here, rather than dug out of nested JSON at
              -- the moment somebody is totalling Charity Week. Null when no
              -- money moved, which is a real event but not revenue.
              nullif(p_payload->>'amount_pence', '')::int,
              nullif(p_payload->>'currency', ''));
    exception when unique_violation then
      -- Already handled. Stripe retries; we do not act twice.
      return jsonb_build_object('ok', true, 'duplicate', true);
    end;
  end if;

  select * into v_fam from families where id = p_family_id for update;

  -- News about a subscription that is not the family's current one (an old
  -- plan being cancelled after a new one started) changes nothing. Before
  -- this, the old plan's cancellation dropped a paying Elite family to
  -- Starter.
  if p_subscription_id is not null and v_fam.stripe_subscription_id is not null
     and p_subscription_id <> v_fam.stripe_subscription_id
     and p_status not in ('active', 'trialing') then
    return jsonb_build_object('ok', true, 'ignored', 'not_current_subscription', 'tier', v_fam.tier);
  end if;
  -- And news older than what has already been applied is out of date: a late
  -- "payment failed" must not undo the payment that came after it.
  if p_event_created is not null and v_fam.billing_event_at is not null
     and p_event_created < v_fam.billing_event_at then
    return jsonb_build_object('ok', true, 'ignored', 'out_of_date', 'tier', v_fam.tier);
  end if;

  -- A period refunded in full stays refunded. A refund does not cancel the
  -- subscription at Stripe, which goes on sending "active" for it: when the
  -- parent then cancelled in the portal (an update that still says active),
  -- the family was put straight back on the plan it had just been refunded
  -- for, free until the period ended. Only a new period (a renewal, which
  -- charges the card again) or a different subscription brings the plan back.
  -- What the event says about the end date is still kept, so the plan screen
  -- can say when it stops.
  if v_fam.subscription_status = 'refunded' and p_status in ('active', 'trialing')
     and (p_subscription_id is null or p_subscription_id = v_fam.stripe_subscription_id)
     and (p_period_end is null
          or (v_fam.subscription_renews_at is not null and p_period_end <= v_fam.subscription_renews_at)) then
    update families
       set billing_event_at = greatest(billing_event_at, p_event_created),
           subscription_ends_at = nullif(p_payload->>'cancel_at', '')::timestamptz
     where id = p_family_id;
    return jsonb_build_object('ok', true, 'ignored', 'refunded_period', 'tier', v_fam.tier);
  end if;

  -- A plan cancelled, for the owner's console: once when it is set to stop
  -- (cancelled in the portal, running to its end), or once when it ends with
  -- no warning (cancelled at once). Replays never reach here.
  if (p_status in ('active', 'trialing') and nullif(p_payload->>'cancel_at', '') is not null
      and v_fam.subscription_ends_at is null)
     or (p_status = 'canceled' and v_fam.subscription_ends_at is null
         and v_fam.subscription_status in ('active', 'trialing', 'past_due')) then
    perform count_plan_change('plans_cancelled');
  end if;

  -- Fail closed: an unpaid subscription drops to the cheapest plan, never to a
  -- plan it did not pay for. An unrecognised tier name is treated the same way.
  v_tier := case
    when p_status not in ('active', 'trialing') then 'starter'
    when p_tier = 'elite' then 'elite'
    when p_tier = 'standard' then 'standard'
    else 'starter'
  end;

  update families
     set tier = v_tier,
         last_paid_tier = case when v_tier <> 'starter' then v_tier else coalesce(nullif(tier, 'starter'), last_paid_tier) end,
         subscription_status = v_status,
         stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
         -- Forgotten once the plan has ended, so a new subscription is
         -- accepted as the current one.
         stripe_subscription_id = case when p_status in ('canceled', 'unpaid', 'incomplete_expired') then null
                                       else coalesce(p_subscription_id, stripe_subscription_id) end,
         billing_event_at = greatest(billing_event_at, p_event_created),
         -- A refund names no period (apply_charge_refund passes none): the
         -- period it refunded is kept, so the rule above can tell a renewal
         -- from more news about the period that was handed back.
         subscription_renews_at = case when p_status = 'refunded' then subscription_renews_at else p_period_end end,
         -- When the plan stops. Ended: the moment Stripe ended it, which is
         -- now for a plan cancelled at once, not the end of the period it
         -- would have run to (the plan screen said "It runs until" a date
         -- for a family already on Starter). Still running but cancelled in
         -- the portal: the date it will stop, so the parent is told.
         subscription_ends_at = case
           when p_status in ('canceled', 'unpaid')
             then coalesce(nullif(p_payload->>'ended_at', '')::timestamptz, p_period_end)
           when p_status in ('active', 'trialing')
             then nullif(p_payload->>'cancel_at', '')::timestamptz
           else null end,
         -- Monthly or yearly, from the price Stripe charges (the webhook
         -- reads it); kept as it was when an event does not say.
         billing_cycle = case when p_payload->>'cycle' in ('month', 'year') then p_payload->>'cycle'
                              else billing_cycle end
   where id = p_family_id;

  -- A gift waiting for this paid plan to end starts the day it really
  -- ended: a refund or a cancel at once ends it before the date the gift
  -- was told to wait for.
  if p_status in ('canceled', 'unpaid', 'incomplete_expired', 'refunded') then
    perform start_waiting_gift(p_family_id,
      case when p_status = 'refunded' then now()
           else coalesce(nullif(p_payload->>'ended_at', '')::timestamptz, now()) end);
  end if;

  -- A pause (pause_collection), as Stripe sees it, or the plan ending under
  -- one. Only subscription events say either; a refund says neither.
  if p_payload ? 'paused_until' or p_status in ('canceled', 'unpaid', 'incomplete_expired') then
    perform sync_plan_pause(p_family_id, nullif(p_payload->>'paused_until', '')::timestamptz,
                            p_status in ('active', 'trialing', 'past_due'), p_event_created);
  end if;

  return jsonb_build_object('ok', true, 'tier', v_tier);
end $$;

/**
 * Starter is a one-child plan.
 *
 * Enforced in the database rather than the screen because the tier column is
 * written by Stripe's webhook and read by everything. It fires only on INSERT,
 * so a family that lapses to Starter keeps the children it already has — it
 * simply cannot add another until it pays for one.
 */
create or replace function enforce_kid_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tier text; v_count int;
begin
  select effective_tier(new.family_id) into v_tier;
  if v_tier is distinct from 'starter' then return new; end if;
  select count(*) into v_count from kids where family_id = new.family_id;
  if v_count >= 1 then
    raise exception 'the Starter plan covers one child — upgrade to add another';
  end if;
  return new;
end $$;

drop trigger if exists kids_enforce_limit on kids;
create trigger kids_enforce_limit before insert on kids
  for each row execute function enforce_kid_limit();

/*
 * The AI photo check is gone, and with it the monthly allowance that capped
 * what it could spend. RankUp takes no photos. Dropped rather than left
 * callable: a function nothing calls is still a way in.
 *
 * Safe to re-run: each line does nothing when the thing is already gone.
 */
drop function if exists claim_photo_check();
drop function if exists refund_photo_check(uuid);
drop function if exists refund_photo_check();
drop table if exists photo_check_claims;
alter table families drop column if exists ai_checks_month;
alter table families drop column if exists ai_checks_used;

/**
 * Credit a pack of Flash Tickets after a one-off payment.
 *
 * Same rule as a subscription change: idempotent on Stripe's event id, because
 * Stripe retries a webhook it did not hear back from and a family must not get
 * two packs for one payment. No grant to anon or authenticated — a browser
 * saying "the payment worked" is not evidence that it did.
 */
create or replace function credit_flash_tickets(
  p_family_id uuid,
  p_count int,
  p_stripe_event text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_left int;
begin
  if p_count is null or p_count <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_count');
  end if;

  if p_stripe_event is not null then
    begin
      insert into billing_events (family_id, stripe_event, type, payload,
                                  amount_pence, currency)
      values (p_family_id, p_stripe_event, 'flash_tickets', p_payload,
              nullif(p_payload->>'amount_pence', '')::int,
              nullif(p_payload->>'currency', ''));
    exception when unique_violation then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end;
  end if;

  update families set flash_tickets = flash_tickets + p_count
   where id = p_family_id
  returning flash_tickets into v_left;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_family');
  end if;
  return jsonb_build_object('ok', true, 'flash_tickets', v_left);
end $$;

revoke execute on function credit_flash_tickets(uuid, int, text, jsonb) from public, anon, authenticated;

/**
 * Buy a Sunday Market skin.
 *
 * Cosmetics only, so nothing here can change XP or levelling — but the currency
 * and the ticket count are still real balances, and a device must not be able
 * to set either. The kid's own client calls this; the function decides whether
 * they could afford it.
 */
drop function if exists buy_market_skin(uuid, text, int, boolean);
create or replace function buy_market_skin(
  p_kid_id uuid,
  p_skin_id text,
  p_cost int,
  p_use_ticket boolean default false,
  p_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_kid kids; v_family families; v_cost int := 0; v_prior jsonb;
begin
  select * into v_kid from kids where id = p_kid_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_kid'); end if;

  -- The caller must be this child, or a parent in their family.
  if not exists (select 1 from kids where id = p_kid_id and user_id = auth.uid())
     and not exists (select 1 from parents where user_id = auth.uid() and family_id = v_kid.family_id and role = 'parent') then
    raise exception 'not allowed to buy for this child';
  end if;

  select * into v_family from families where id = v_kid.family_id for update;

  -- Sent again because the phone never heard back.
  v_prior := rpc_receipt(p_request_id, p_kid_id);
  if v_prior is not null then return v_prior; end if;
  -- And a skin already owned is never charged for twice, whatever the id.
  if coalesce(v_kid.skins, '[]'::jsonb) ? p_skin_id then
    update kids set skin_id = p_skin_id where id = p_kid_id;
    return jsonb_build_object('ok', true, 'skin_id', p_skin_id, 'tickets_spent', 0, 'owned', true);
  end if;

  /*
   * What anything costs is decided here, not by the caller.
   *
   * Mirrored from MARKET_SKINS and RARITY in src/data/marketSkins.js, and
   * supabase/test/08-billing.sql checks the two agree.
   *
   * The ticket price was computed here from the start and the comment said
   * why — and then the coins branch below spent `p_cost` straight from the
   * request. A paired child's own device is an authorised caller here, so a
   * negative cost passed `coins < p_cost` and then SUBTRACTED a negative:
   * one HTTP request from a phone minted unlimited currency, permanently,
   * server-side. p_cost is now ignored entirely; the parameter stays only so
   * that older clients still calling with it do not break.
   */
  v_cost := case when p_use_ticket then
    case p_skin_id
      when 'ember'   then 1
      when 'tide'    then 1
      when 'orchard' then 2
      when 'circuit' then 2
      when 'dusk'    then 2
      when 'gilded'  then 3
      else 0
    end
  else
    case p_skin_id
      when 'ember'   then 120
      when 'tide'    then 120
      when 'orchard' then 150
      when 'circuit' then 150
      when 'dusk'    then 200
      when 'gilded'  then 260
      else 0
    end
  end;
  if v_cost = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_skin');
  end if;

  if p_use_ticket then
    if v_family.flash_tickets < v_cost then
      return jsonb_build_object('ok', false, 'reason', 'no_tickets', 'needed', v_cost);
    end if;
    update families set flash_tickets = flash_tickets - v_cost where id = v_family.id;
  else
    if v_kid.coins < v_cost then
      return jsonb_build_object('ok', false, 'reason', 'too_expensive', 'needed', v_cost);
    end if;
    update kids set coins = coins - v_cost where id = p_kid_id;
  end if;

  -- Hand over the thing they just paid for.
  --
  -- This function took the coins and stopped there. The skin existed only in
  -- the browser's own copy of the row, and `skins` lives in the kids table,
  -- which a child's device is not allowed to write — so the next pull, seconds
  -- later, handed back a row without it. The child paid 120 coins and watched
  -- the skin disappear, with no way to get either back.
  update kids
     set skins = case when skins ? p_skin_id then skins else skins || to_jsonb(p_skin_id) end,
         -- Buying it puts it on. The app has always behaved this way locally.
         skin_id = p_skin_id
   where id = p_kid_id;

  insert into events (family_id, kid_id, type, meta)
  values (v_kid.family_id, p_kid_id, 'skin_bought',
          jsonb_build_object('skin', p_skin_id, 'ticket', p_use_ticket));

  return keep_rpc_receipt(p_request_id, p_kid_id, 'buy_market_skin',
                          jsonb_build_object('ok', true, 'skin_id', p_skin_id, 'tickets_spent', v_cost));
end $$;

grant execute on function buy_market_skin(uuid, text, int, boolean, uuid) to authenticated;

/**
 * A payment handed back. Called only by the Stripe webhook, on charge.refunded.
 *
 * Two kinds of charge can be refunded, and they are told apart by the payment
 * itself rather than by guessing from the amount:
 *
 *   - a Flash Ticket pack, recognised by the payment its credit recorded
 *     (credit_flash_tickets keeps it in the payload). The pack's tickets go
 *     back, or as many as are left: a family that has already spent some is
 *     not pushed below zero, and the column would refuse it anyway.
 *   - anything else is the plan. A refund in full means the period was not
 *     paid for, so the family drops to Starter exactly as for an unpaid
 *     renewal, with the status "refunded" so the plan screen can say so.
 *
 * A partial refund is goodwill on a payment that stands, and changes nothing.
 * So does a refund of an earlier period's payment, recognised by a later
 * invoice having been paid more than a week after the refunded charge: the
 * period the family is in now is paid for. Keyed on the charge, so a replayed event, or a second partial refund event
 * for the same charge after it was refunded in full, acts once.
 */
drop function if exists apply_charge_refund(uuid, text, text, boolean, timestamptz);
create or replace function apply_charge_refund(
  p_family_id uuid,
  p_charge_id text,
  p_payment_intent text default null,
  p_full boolean default false,
  p_event_created timestamptz default null,
  p_charge_created timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_credit billing_events;
  v_count  int;
  v_before int;
  v_left   int;
begin
  if not coalesce(p_full, false) then
    return jsonb_build_object('ok', true, 'ignored', 'partial_refund');
  end if;
  if p_charge_id is null or p_family_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_charge');
  end if;

  select * into v_credit from billing_events
   where family_id = p_family_id and type = 'flash_tickets'
     and p_payment_intent is not null and payload->>'payment_intent' = p_payment_intent
   limit 1;

  if v_credit.id is null then
    if p_charge_created is not null and exists (
         select 1 from billing_events
          where family_id = p_family_id and stripe_event like 'invoice:%'
            and received_at > p_charge_created + interval '7 days') then
      return jsonb_build_object('ok', true, 'ignored', 'earlier_period');
    end if;
    return apply_subscription_change(p_family_id, 'refunded', 'starter', null, null, null,
                                     'refund:' || p_charge_id, jsonb_build_object('type', 'charge.refunded'),
                                     p_event_created);
  end if;

  begin
    insert into billing_events (family_id, stripe_event, type, payload)
    values (p_family_id, 'refund:' || p_charge_id, 'flash_tickets_refunded',
            jsonb_build_object('payment_intent', p_payment_intent));
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end;

  v_count := greatest(0, coalesce(nullif(v_credit.payload->>'count', '')::int, 0));
  select flash_tickets into v_before from families where id = p_family_id for update;
  update families set flash_tickets = greatest(0, flash_tickets - v_count)
   where id = p_family_id
  returning flash_tickets into v_left;
  return jsonb_build_object('ok', true, 'kind', 'tickets', 'taken', v_before - v_left, 'flash_tickets', v_left);
end $$;

revoke execute on function apply_charge_refund(uuid, text, text, boolean, timestamptz, timestamptz) from public, anon, authenticated;

/**
 * The Stripe customer for a family. Server-side only — it is not secret, but
 * there is no reason for a browser to hold it either.
 */
create or replace function stripe_customer_for_family(p_family_id uuid)
returns text
language sql security definer set search_path = public as $$
  select stripe_customer_id from families where id = p_family_id;
$$;

/** Look up a family from its Stripe customer id, for webhook events that only carry that. */
create or replace function family_for_customer(p_customer_id text)
returns uuid
language sql security definer set search_path = public as $$
  select id from families where stripe_customer_id = p_customer_id limit 1;
$$;

/** Remember the customer id at checkout, so later webhooks can find the family. */
create or replace function attach_stripe_customer(p_family_id uuid, p_customer_id text)
returns void
language sql security definer set search_path = public as $$
  update families set stripe_customer_id = p_customer_id where id = p_family_id;
$$;

/** What the billing screen needs. Readable by a parent of the family only. */
create or replace function billing_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_family families;
begin
  -- A parent's, not a supporter's: checkout and the billing portal both start
  -- from this, and a supporter must not be able to cancel the family's plan.
  select f.* into v_family from families f
    join parents p on p.family_id = f.id
   where p.user_id = auth.uid() and p.role = 'parent';
  if not found then return jsonb_build_object('ok', false); end if;

  return jsonb_build_object(
    'ok', true,
    'family_id', v_family.id,
    'tier', v_family.tier,
    'status', v_family.subscription_status,
    'paid_tier', v_family.last_paid_tier,
    'renews_at', v_family.subscription_renews_at,
    'ends_at', v_family.subscription_ends_at,
    'discount_percent', v_family.billing_discount_percent,
    'has_customer', v_family.stripe_customer_id is not null,
    -- Checkout carries what is left of the in-app trial onto the card.
    'trial_ends_at', v_family.trial_ends_at,
    'has_subscription', v_family.stripe_subscription_id is not null,
    -- A gift plan (redeem_gift_code): checkout starts a paid plan's first
    -- charge on the day it ends, so a gift year is never paid for twice.
    'gift_tier', v_family.gift_tier,
    'gift_starts_at', v_family.gift_starts_at,
    'gift_until', v_family.gift_until,
    -- A second gift of the other plan, after the first (redeem_gift_code).
    'gift_then_tier', v_family.gift_then_tier,
    'gift_then_until', v_family.gift_then_until,
    -- A pause (start_plan_pause): when billing starts again, or null.
    'paused_until', case when v_family.paused_until > now() then v_family.paused_until end,
    -- Monthly or yearly: only a monthly plan is offered a pause, the
    -- half-price month and "Switch to yearly".
    'cycle', v_family.billing_cycle,
    -- The half-price month has been taken (once per family, ever), and
    -- whether it was in the last 31 days, when a pause would void it.
    'save_offer_used', v_family.save_offer_used_at is not null,
    'save_offer_recent', coalesce(v_family.save_offer_used_at > now() - interval '31 days', false)
  );
end $$;

/**
 * Lock the billing columns.
 *
 * Row level security decides WHICH ROWS you may touch, not which columns — so
 * the policy that lets a parent update their own family also let them set
 * `tier = 'elite'`. Column-level grants are the tool for that, and this is
 * wrapped in a function so it can be re-applied after anything that issues a
 * blanket GRANT (Supabase's defaults do, and so do the tests).
 */
create or replace function lock_billing_columns() returns void
language plpgsql as $$
begin
  -- A table-wide UPDATE grant covers every column, and a column-level REVOKE
  -- cannot carve a hole in it. The only way to restrict columns is to drop the
  -- table-wide grant and re-grant the specific ones that are safe.
  execute 'revoke update on families from anon, authenticated';
  execute 'grant update (name, parent_theme_id) on families to anon, authenticated';
end $$;

select lock_billing_columns();

grant execute on function billing_status() to authenticated;
grant execute on function lock_billing_columns() to postgres;
-- Written by the webhook only. Postgres grants EXECUTE to PUBLIC on a new
-- function automatically, and Supabase grants it to anon and authenticated by
-- name as well, so these are revoked from all three.
revoke execute on function apply_subscription_change(uuid, text, text, text, text, timestamptz, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function family_for_customer(text) from public, anon, authenticated;
revoke execute on function stripe_customer_for_family(uuid) from public, anon, authenticated;
revoke execute on function attach_stripe_customer(uuid, text) from public, anon, authenticated;

/*
 * Cancelling a deleted family's subscription. The queue is
 * billing_cancellations (consent.sql, next to the deletion that fills it); the
 * Stripe calls are api/_shared/cancelBilling.js. Service role only: a
 * browser has no business reading Stripe ids or marking a cancellation done.
 */

/**
 * What is still to be cancelled: everything waiting, or one deleted family's
 * (by its id, which the deletion handed the server function) or one Stripe
 * customer's. Rows with nothing to cancel are only markers and never listed.
 */
create or replace function pending_billing_cancellations(
  p_family_id uuid default null,
  p_customer_id text default null,
  p_limit int default 50
) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'customer_id', c.stripe_customer_id,
           'subscription_id', c.stripe_subscription_id,
           'attempts', c.attempts) order by c.queued_at, c.id), '[]'::jsonb)
    from (select * from billing_cancellations
           where done_at is null
             and (stripe_customer_id is not null or stripe_subscription_id is not null)
             and (p_family_id is null or family_key = billing_family_key(p_family_id))
             and (p_customer_id is null or stripe_customer_id = p_customer_id)
           order by queued_at, id
           limit greatest(1, least(coalesce(p_limit, 50), 500))) c;
$$;

/**
 * Record how a try went. Done only on Stripe's confirmation; a failure keeps
 * the row waiting, with what went wrong, for the next run.
 */
create or replace function finish_billing_cancellation(p_id bigint, p_ok boolean, p_error text default null)
returns void
language sql security definer set search_path = public as $$
  update billing_cancellations
     set attempts = attempts + 1,
         last_try_at = now(),
         last_error = case when p_ok then null else left(coalesce(p_error, 'failed'), 300) end,
         done_at = case when p_ok then now() else null end
   where id = p_id and done_at is null;
$$;

/**
 * Is this Stripe news about a family that has deleted its account?
 *
 *   'present'  the family exists; handle the event as usual.
 *   'deleted'  it deleted its account. A live subscription named here is
 *              added to the queue (a checkout paid after the deletion, or one
 *              the deletion did not know of), for the webhook to cancel.
 *   'unknown'  no such family, and no sign it ever deleted itself here.
 *
 * Asked by the webhook before any write, because every billing write keys on
 * the family and a family that is gone made each one fail, so Stripe retried
 * the event for days, including the "subscription cancelled" this deletion
 * itself causes.
 */
create or replace function billing_family_gone(
  p_family_id uuid,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_live boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if p_family_id is not null and exists (select 1 from families where id = p_family_id) then
    return 'present';
  end if;
  if p_customer_id is not null and exists (select 1 from families where stripe_customer_id = p_customer_id) then
    return 'present';
  end if;

  select family_key into v_key from billing_cancellations
   where (p_family_id is not null and family_key = billing_family_key(p_family_id))
      or (p_customer_id is not null and stripe_customer_id = p_customer_id)
   order by queued_at desc limit 1;
  if v_key is null then return 'unknown'; end if;

  if p_live and (p_subscription_id is not null or p_customer_id is not null) then
    insert into billing_cancellations (family_key, stripe_customer_id, stripe_subscription_id)
    values (v_key, p_customer_id, p_subscription_id)
    on conflict (family_key, (coalesce(stripe_subscription_id, ''))) do update
      set done_at = null,
          stripe_customer_id = coalesce(billing_cancellations.stripe_customer_id, excluded.stripe_customer_id);
  end if;
  return 'deleted';
end $$;

revoke execute on function pending_billing_cancellations(uuid, text, int) from public, anon, authenticated;
revoke execute on function finish_billing_cancellation(bigint, boolean, text) from public, anon, authenticated;
revoke execute on function billing_family_gone(uuid, text, text, boolean) from public, anon, authenticated;

-- ===========================================================================
-- Gifts: "a year of RankUp", bought by somebody with no account for a family.
--
-- docs/PAYMENTS.md, "Gift subscriptions", has the whole story. In short:
--
--   1. The buyer fills in the Give page. /api/gift-checkout keeps what they
--      typed (start_gift_order) and sends them to Stripe Checkout, a one-time
--      payment at the yearly price. No code exists yet.
--   2. Stripe's webhook says the checkout is paid. Only then is a code made
--      (fulfil_gift_order), and the database is handed its hash, never the
--      code itself. The webhook emails the buyer the code, and the recipient
--      too if the buyer asked.
--   3. A parent types the code in Parent Mode (/api/redeem-gift, which calls
--      redeem_gift_code). The family gets that plan for 12 months from that
--      day, as families.gift_tier / gift_until, which effective_tier honours
--      beside the paid plan and the trial.
--
-- Every function here is the server's: revoked from public, anon and
-- authenticated, and every table has row level security on with no policy,
-- so a browser can neither read a code's hash nor anybody's email.
-- ===========================================================================

/*
 * One row per gift, from the moment the buyer is sent to Stripe.
 *
 * Until Stripe confirms payment a row has no code (the check below), so a
 * code that was never sold cannot exist. An unpaid row is deleted by
 * retention after 14 days, which outlasts a bank payment that clears late.
 */
create table if not exists gift_orders (
  id              uuid primary key default gen_random_uuid(),
  plan            text not null check (plan in ('standard', 'elite')),
  -- 'email': the webhook emails the recipient. 'self': the buyer gives it.
  delivery        text not null check (delivery in ('email', 'self')),
  created_at      timestamptz not null default now(),
  stripe_session  text unique,
  payment_intent  text,
  amount_minor    int,
  currency        text,
  paid_at         timestamptz,
  -- sha256 of the code as typed without dashes or spaces, in hex. The code
  -- itself is never stored: it is worked out by the webhook, emailed, and
  -- gone.
  code_hash       text unique,
  -- Two years after purchase.
  expires_at      timestamptz,
  receipt_sent_at timestamptz,
  gift_sent_at    timestamptz,
  redeemed_at     timestamptz,
  redeemed_by     uuid references families(id) on delete set null,
  -- A refund in full of a code nobody had used yet.
  voided_at       timestamptz,
  -- What a refund decided, in words: refunded_unused, refunded_after_use,
  -- refunded_before_code.
  refund_note     text,
  constraint gift_code_only_when_paid check (code_hash is null or (paid_at is not null and expires_at is not null))
);
create index if not exists gift_orders_payment_intent_idx on gift_orders (payment_intent);
create index if not exists gift_orders_unpaid_idx on gift_orders (created_at) where paid_at is null;
alter table gift_orders enable row level security;

/*
 * The buyer's email, for the receipt and for support, kept until the code
 * runs out (keep_until, set when it is paid for). Apart from the order so
 * retention can delete it on its own day.
 */
create table if not exists gift_buyers (
  order_id   uuid primary key references gift_orders(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  keep_until timestamptz
);
alter table gift_buyers enable row level security;

/*
 * Who it is for and what the buyer said, used only to send the gift and
 * deleted 30 days after it was paid for (keep_until). The buyer's own name
 * here is what the gift email says it is from.
 */
create table if not exists gift_recipients (
  order_id   uuid primary key references gift_orders(id) on delete cascade,
  from_name  text,
  to_name    text,
  to_email   text,
  message    text,
  created_at timestamptz not null default now(),
  keep_until timestamptz
);
alter table gift_recipients enable row level security;

/*
 * Every code typed that did not work, by family and by where it came from,
 * for the limits in redeem_gift_code. `ip_key` is a keyed hash of the
 * address made by the server function (api/redeem-gift.js), never the
 * address. Kept two days.
 */
create table if not exists gift_redeem_attempts (
  id        bigserial primary key,
  family_id uuid references families(id) on delete cascade,
  ip_key    text,
  ok        boolean not null default false,
  tried_at  timestamptz not null default now()
);
create index if not exists gift_redeem_attempts_family_idx on gift_redeem_attempts (family_id, tried_at);
create index if not exists gift_redeem_attempts_ip_idx on gift_redeem_attempts (ip_key, tried_at);
alter table gift_redeem_attempts enable row level security;

/*
 * Every gift checkout started, by where it came from (a keyed hash of the
 * address, made by api/gift-checkout.js, never the address), for the
 * per-address limit in start_gift_order. Kept two days.
 */
create table if not exists gift_checkout_attempts (
  id        bigserial primary key,
  ip_key    text not null,
  tried_at  timestamptz not null default now()
);
create index if not exists gift_checkout_attempts_ip_idx on gift_checkout_attempts (ip_key, tried_at);
alter table gift_checkout_attempts enable row level security;

/** Typed text kept plain: trimmed, one space between words, no control characters or markup. */
create or replace function gift_plain(p_text text, p_max int) returns text
language sql immutable set search_path = public as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]<>]', ' ', 'g'), '\s+', ' ', 'g')), p_max), '');
$$;

/** A real-looking email address, at most 254 characters. */
create or replace function gift_email_ok(p_email text) returns boolean
language sql immutable set search_path = public as $$
  select p_email is not null and length(p_email) <= 254 and p_email ~ '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$';
$$;

/**
 * Keep what the buyer typed, before they are sent to Stripe.
 *
 * Checked here as well as on the page and in the server function: the plan
 * and how it is given, the buyer's email, the recipient's email when the
 * gift is to be emailed, names of at most 60 characters and a message of at
 * most 200, none with a rude word (kid_words_ok, the list Theme Genesis
 * uses), a link or an email address in it. No code is made here.
 *
 * Because the page needs no account: at most 10 started an hour from one
 * address (`too_many_gifts`), so nobody can use up the rest, and 2,000 an
 * hour across everybody (`busy`), enough for a holiday rush and not enough
 * to fill the table.
 */
drop function if exists start_gift_order(text, text, text, text, text, text, text);
create or replace function start_gift_order(
  p_plan text,
  p_delivery text,
  p_buyer_email text,
  p_from_name text default null,
  p_to_name text default null,
  p_to_email text default null,
  p_message text default null,
  p_ip_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_buyer text := lower(btrim(coalesce(p_buyer_email, '')));
  v_to text := nullif(lower(btrim(coalesce(p_to_email, ''))), '');
  v_text text;
begin
  if p_plan is null or p_plan not in ('standard', 'elite') then
    return jsonb_build_object('ok', false, 'reason', 'bad_plan');
  end if;
  if p_delivery is null or p_delivery not in ('email', 'self') then
    return jsonb_build_object('ok', false, 'reason', 'bad_delivery');
  end if;
  if not gift_email_ok(v_buyer) then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;
  if p_delivery = 'email' and v_to is null then
    return jsonb_build_object('ok', false, 'reason', 'no_recipient_email');
  end if;
  if v_to is not null and not gift_email_ok(v_to) then
    return jsonb_build_object('ok', false, 'reason', 'bad_recipient_email');
  end if;
  if length(btrim(coalesce(p_from_name, ''))) > 60 or length(btrim(coalesce(p_to_name, ''))) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_long');
  end if;
  if length(btrim(coalesce(p_message, ''))) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'message_too_long');
  end if;
  foreach v_text in array array[coalesce(p_from_name, ''), coalesce(p_to_name, ''), coalesce(p_message, '')] loop
    if not kid_words_ok(v_text) then
      return jsonb_build_object('ok', false, 'reason', 'rude_words');
    end if;
    if v_text ~* '(https?:|www\.|://|[^\s@]+@[^\s@]+\.[a-z]{2,}|\m[a-z0-9-]+\.(com|net|org|io|co|uk|ru|xyz|info|biz|app|link)\M)' then
      return jsonb_build_object('ok', false, 'reason', 'no_links');
    end if;
  end loop;
  if p_ip_key is not null and (select count(*) from gift_checkout_attempts
       where ip_key = p_ip_key and tried_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_gifts');
  end if;
  if (select count(*) from gift_orders where created_at > now() - interval '1 hour') >= 2000 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  if p_ip_key is not null then
    insert into gift_checkout_attempts (ip_key) values (p_ip_key);
  end if;

  insert into gift_orders (plan, delivery) values (p_plan, p_delivery) returning id into v_id;
  insert into gift_buyers (order_id, email) values (v_id, v_buyer);
  insert into gift_recipients (order_id, from_name, to_name, to_email, message)
  values (v_id, gift_plain(p_from_name, 60), gift_plain(p_to_name, 60), v_to, gift_plain(p_message, 200));
  return jsonb_build_object('ok', true, 'order_id', v_id, 'plan', p_plan);
end $$;

/** What the webhook needs to send the emails, for one order. */
create or replace function gift_order_details(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.id, 'plan', o.plan, 'delivery', o.delivery, 'paid_at', o.paid_at,
    'expires_at', o.expires_at, 'amount_minor', o.amount_minor, 'currency', o.currency,
    'receipt_sent', o.receipt_sent_at is not null, 'gift_sent', o.gift_sent_at is not null,
    'redeemed', o.redeemed_at is not null, 'voided', o.voided_at is not null,
    'buyer_email', b.email, 'from_name', r.from_name, 'to_name', r.to_name,
    'to_email', r.to_email, 'message', r.message)
  from gift_orders o
  left join gift_buyers b on b.order_id = o.id
  left join gift_recipients r on r.order_id = o.id
  where o.id = p_order_id;
$$;

/**
 * Stripe says the gift is paid for: make it a code. Called only by the
 * webhook, and only for a checkout whose payment_status is 'paid'.
 *
 * The webhook works the code out from the checkout session (a keyed hash, so
 * the same session always gives the same code) and passes only its hash, so
 * the database never holds a code anybody could read back. Idempotent on the
 * session: Stripe's two events for one payment (completed, and
 * async_payment_succeeded for a bank payment), its retries and a replay all
 * find the code already made and answer `duplicate`, with `code_matches`
 * saying whether the hash they worked out is the one stored (so the webhook
 * may send the code again if an email did not go). The money is recorded in
 * billing_events once, against no family, beside every other payment.
 */
create or replace function fulfil_gift_order(
  p_order_id uuid,
  p_session_id text,
  p_payment_intent text,
  p_code_hash text,
  p_amount_minor int default null,
  p_currency text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order gift_orders;
begin
  if p_session_id is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  select * into v_order from gift_orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_order');
  end if;
  if v_order.stripe_session is not null and v_order.stripe_session <> p_session_id then
    return jsonb_build_object('ok', false, 'reason', 'other_session');
  end if;
  if v_order.code_hash is not null then
    return gift_order_details(p_order_id)
      || jsonb_build_object('ok', true, 'duplicate', true, 'code_matches', v_order.code_hash = p_code_hash);
  end if;
  -- Refunded before Stripe's "paid" reached us: there is nothing to give.
  if v_order.voided_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'voided');
  end if;

  update gift_orders
     set stripe_session = p_session_id,
         payment_intent = coalesce(p_payment_intent, payment_intent),
         amount_minor = p_amount_minor,
         currency = upper(nullif(p_currency, '')),
         paid_at = now(),
         code_hash = p_code_hash,
         expires_at = now() + interval '2 years'
   where id = p_order_id;
  update gift_buyers set keep_until = now() + interval '2 years' where order_id = p_order_id;
  update gift_recipients set keep_until = now() + interval '30 days' where order_id = p_order_id;

  begin
    insert into billing_events (family_id, stripe_event, type, payload, amount_pence, currency)
    values (null, 'gift:' || p_session_id, 'gift', jsonb_build_object('plan', v_order.plan),
            p_amount_minor, upper(nullif(p_currency, '')));
  exception when unique_violation then
    null;
  end;

  return gift_order_details(p_order_id) || jsonb_build_object('ok', true, 'code_matches', true);
end $$;

/** An email went: the receipt, or the gift to the recipient. Never sent twice after this. */
create or replace function mark_gift_sent(p_order_id uuid, p_which text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_which = 'receipt' then
    update gift_orders set receipt_sent_at = coalesce(receipt_sent_at, now()) where id = p_order_id;
  elsif p_which = 'gift' then
    update gift_orders set gift_sent_at = coalesce(gift_sent_at, now()) where id = p_order_id;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_which');
  end if;
  return jsonb_build_object('ok', found);
end $$;

/**
 * A parent types a gift code. Called only by /api/redeem-gift, which has
 * already checked the caller is a parent (not a supporter, not a child) of
 * `p_family_id`, and passes a keyed hash of where the request came from.
 *
 * Limits, so a code cannot be found by trying: 5 codes that did not work in
 * an hour for one family, and 20 from one address (across every family),
 * then `too_many_tries` until the hour has passed. A code is 12 characters
 * from 31, about 59 bits, so even without the limits guessing is hopeless;
 * with them it is not worth starting.
 *
 * The rules:
 *   - single use: a code that has been redeemed is `used`, for everyone;
 *   - two years from purchase: then `expired`;
 *   - refunded in full before it was used: `refunded`;
 *   - gifts stack: each keeps its own plan for its own 12 months, the
 *     better plan first (Standard + Elite Pass is 12 months of Elite Pass,
 *     then 12 of Standard), from the day the first started or now;
 *   - a family whose paid plan is set to renew is told to turn renewal off
 *     first (`subscription_renews`) and the code is not spent: the gift then
 *     starts the day the paid plan ends, so no day is paid for twice. A paid
 *     plan already cancelled and running to its end: the gift starts at that
 *     end, automatically.
 */
create or replace function redeem_gift_code(p_family_id uuid, p_code text, p_ip_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_family families;
  v_order  gift_orders;
  v_code   text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_start  timestamptz;
  v_until  timestamptz;
  v_tier   text;
  v_stacked boolean := false;
  v_fail   text;
  v_elite  interval;
  v_std    interval;
  v_elite_end timestamptz;
begin
  select * into v_family from families where id = p_family_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_family');
  end if;

  if (select count(*) from gift_redeem_attempts
       where family_id = p_family_id and not ok and tried_at > now() - interval '1 hour') >= 5
     or (p_ip_key is not null and (select count(*) from gift_redeem_attempts
       where ip_key = p_ip_key and not ok and tried_at > now() - interval '1 hour') >= 20) then
    return jsonb_build_object('ok', false, 'reason', 'too_many_tries');
  end if;

  if length(v_code) = 12 then
    select * into v_order from gift_orders
     where code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex')
     for update;
  end if;

  v_fail := case
    when v_order.id is null then 'bad_code'
    when v_order.voided_at is not null then 'refunded'
    when v_order.redeemed_at is not null then 'used'
    when v_order.expires_at <= now() then 'expired'
    else null end;
  if v_fail is not null then
    insert into gift_redeem_attempts (family_id, ip_key, ok) values (p_family_id, p_ip_key, false);
    return jsonb_build_object('ok', false, 'reason', v_fail);
  end if;

  -- A paid plan that will charge the card again. Not a wrong guess, so not
  -- counted against the limit, and the code is left unspent.
  if v_family.stripe_subscription_id is not null
     and v_family.subscription_status in ('active', 'trialing', 'past_due', 'refunded', 'incomplete', 'paused')
     and (v_family.subscription_ends_at is null or v_family.subscription_ends_at <= now()) then
    return jsonb_build_object('ok', false, 'reason', 'subscription_renews');
  end if;

  if coalesce(v_family.gift_then_until, v_family.gift_until) > now() then
    -- Stacked: each gift keeps its own plan for its own 12 months, the
    -- better plan first. What is left of the gifts already there is laid
    -- out again from the same start (now, or the day a paid plan ends):
    -- all the Elite Pass time, then all the Standard time.
    v_stacked := true;
    v_start := greatest(coalesce(v_family.gift_starts_at, now()), now());
    v_elite := interval '0';
    v_std := interval '0';
    if v_family.gift_until > v_start then
      if v_family.gift_tier = 'elite' then
        v_elite := v_elite + (v_family.gift_until - greatest(v_family.gift_starts_at, v_start));
      else
        v_std := v_std + (v_family.gift_until - greatest(v_family.gift_starts_at, v_start));
      end if;
    end if;
    if v_family.gift_then_tier is not null and v_family.gift_then_until > v_start then
      if v_family.gift_then_tier = 'elite' then
        v_elite := v_elite + (v_family.gift_then_until - greatest(v_family.gift_until, v_start));
      else
        v_std := v_std + (v_family.gift_then_until - greatest(v_family.gift_until, v_start));
      end if;
    end if;
    v_elite_end := v_start + v_elite + case when v_order.plan = 'elite' then interval '12 months' else interval '0' end;
    v_until := v_elite_end + v_std + case when v_order.plan = 'standard' then interval '12 months' else interval '0' end;
    if v_elite_end > v_start then
      v_tier := 'elite';
      update families
         set gift_tier = 'elite', gift_starts_at = v_start, gift_until = v_elite_end,
             gift_then_tier = case when v_until > v_elite_end then 'standard' end,
             gift_then_until = case when v_until > v_elite_end then v_until end
       where id = p_family_id;
    else
      v_tier := 'standard';
      update families
         set gift_tier = 'standard', gift_starts_at = v_start, gift_until = v_until,
             gift_then_tier = null, gift_then_until = null
       where id = p_family_id;
    end if;
  else
    -- A paid plan cancelled and still running: the gift begins where it ends.
    v_start := case
      when v_family.subscription_status in ('active', 'trialing') and v_family.subscription_ends_at > now()
        then v_family.subscription_ends_at
      else now() end;
    v_until := v_start + interval '12 months';
    v_tier := v_order.plan;
    update families
       set gift_tier = v_tier, gift_starts_at = v_start, gift_until = v_until,
           gift_then_tier = null, gift_then_until = null
     where id = p_family_id;
  end if;

  update gift_orders set redeemed_at = now(), redeemed_by = p_family_id where id = v_order.id;
  insert into gift_redeem_attempts (family_id, ip_key, ok) values (p_family_id, p_ip_key, true);

  return jsonb_build_object('ok', true, 'plan', v_order.plan, 'tier', v_tier,
                            'starts_at', v_start, 'until', v_until, 'stacked', v_stacked);
end $$;

/**
 * A payment handed back. Asked by the webhook on every charge.refunded
 * before anything else; `gift: false` means it was not a gift's payment and
 * the family and school rules carry on.
 *
 * A refund in full of a code nobody has used makes it void: typing it then
 * says `refunded`. A code already used stays used (the family keeps its
 * year; the money went back by the operator's own choice in Stripe), and
 * that decision is written on the order. A partial refund changes nothing.
 * Acts once per charge, however often Stripe sends it.
 */
create or replace function apply_gift_refund(p_payment_intent text, p_charge_id text, p_full boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order gift_orders;
  v_note  text;
begin
  if p_payment_intent is null then
    return jsonb_build_object('ok', true, 'gift', false);
  end if;
  select * into v_order from gift_orders where payment_intent = p_payment_intent for update;
  if not found then
    return jsonb_build_object('ok', true, 'gift', false);
  end if;
  if not coalesce(p_full, false) then
    return jsonb_build_object('ok', true, 'gift', true, 'ignored', 'partial_refund');
  end if;

  begin
    insert into billing_events (family_id, stripe_event, type, payload)
    values (null, 'gift_refund:' || coalesce(p_charge_id, p_payment_intent), 'gift_refunded',
            jsonb_build_object('order', v_order.id));
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'gift', true, 'duplicate', true);
  end;

  v_note := case
    when v_order.redeemed_at is not null then 'refunded_after_use'
    when v_order.code_hash is null then 'refunded_before_code'
    else 'refunded_unused' end;
  update gift_orders
     set refund_note = v_note,
         voided_at = case when v_note = 'refunded_after_use' then voided_at else coalesce(voided_at, now()) end
   where id = v_order.id;
  return jsonb_build_object('ok', true, 'gift', true, 'outcome', v_note);
end $$;

revoke execute on function gift_plain(text, int) from public, anon, authenticated;
revoke execute on function gift_email_ok(text) from public, anon, authenticated;
revoke execute on function start_gift_order(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function gift_order_details(uuid) from public, anon, authenticated;
revoke execute on function fulfil_gift_order(uuid, text, text, text, int, text) from public, anon, authenticated;
revoke execute on function mark_gift_sent(uuid, text) from public, anon, authenticated;
revoke execute on function redeem_gift_code(uuid, text, text) from public, anon, authenticated;
revoke execute on function apply_gift_refund(text, text, boolean) from public, anon, authenticated;

-- ===========================================================================
-- Pause instead of cancel, and the one half-price month.
--
-- docs/PAYMENTS.md, "Pause instead of cancel", has the whole story. In short:
--
--   1. A parent about to cancel is offered a pause of 1, 2 or 3 months
--      first (monthly plans only). /api/keep-plan asks start_plan_pause,
--      which checks the family may pause and writes it down; then tells
--      Stripe (pause_collection, behavior "void", resuming on that date);
--      then finish_plan_pause says whether Stripe took it. If Stripe did
--      not, the pause is undone as if it never was.
--   2. While paused, Stripe takes no money and effective_tier counts the
--      plan they pay for as the free level. Nothing is deleted: XP, coins,
--      items and every child stay. A trial or a gift still counts.
--   3. Billing starts again by itself on the date (Stripe resumes it, and
--      effective_tier stops counting the pause at that moment whether or not
--      Stripe's news has arrived). Three days before, each parent gets one
--      email (due_pause_reminders, sent by api/send-trial-emails.js).
--   4. Or the parent resumes early (end_plan_pause), or cancels: cancelling
--      is never hidden behind any of this.
--
-- The half-price month is offered once per family, ever (claim_save_offer):
-- a Stripe coupon for 50% off one invoice (STRIPE_SAVE_COUPON).
--
-- Pauses, half-price months and cancellations are counted for the owner's
-- console (usage_daily: plans_paused, plans_saved, plans_cancelled), totals
-- only. Every function here is the server's: revoked from public, anon and
-- authenticated; plan_pauses has row level security on and no policy.
-- ===========================================================================

/*
 * One row per pause. `months` is null for a pause made in Stripe's own
 * dashboard, which the webhook writes down when it hears of it. Kept 90 days
 * after the pause is over (run_retention), long enough to answer a parent's
 * question about it; the family row says whether one is running now.
 */
create table if not exists plan_pauses (
  id                  bigserial primary key,
  family_id           uuid not null references families(id) on delete cascade,
  months              smallint check (months between 1 and 3),
  started_at          timestamptz not null default now(),
  resumes_at          timestamptz not null,
  -- Stripe took it (finish_plan_pause), or the pause came from Stripe.
  confirmed_at        timestamptz,
  -- Resumed early, or the plan ended while paused.
  ended_at            timestamptz,
  -- The reminder three days before billing starts again.
  reminder_claimed_at timestamptz,
  reminder_sent_at    timestamptz
);
-- When the period paid for before the pause would have ended (the renewal
-- date then), so resuming early after a renewal fell inside the pause gives
-- back exactly the days paid for and not used (api/keep-plan.js,
-- plan_pause_credit). Null when it was not known.
alter table plan_pauses add column if not exists paid_until timestamptz;
create index if not exists plan_pauses_family_idx on plan_pauses (family_id, started_at desc);
create index if not exists plan_pauses_due_idx on plan_pauses (resumes_at)
  where ended_at is null and reminder_sent_at is null;
alter table plan_pauses enable row level security;
revoke all on plan_pauses from public, anon, authenticated;

/** The family's Stripe subscription, for the server functions that change it. */
create or replace function stripe_subscription_for_family(p_family_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select stripe_subscription_id from families where id = p_family_id;
$$;

/**
 * May this family pause, and for how long? If so, write it down and say
 * when billing starts again. Called by /api/keep-plan before it asks Stripe.
 *
 * `p_cycle` is the subscription's period as Stripe has it, which the server
 * function reads from the subscription itself; the family row's copy is
 * used when it is not given.
 *
 * Refused:
 *   bad_months       not 1, 2 or 3
 *   no_family        no such family
 *   no_subscription  nothing at Stripe to pause
 *   already_paused   a pause is running
 *   not_active       not an active, paid plan: on a free trial nothing is
 *                    charged yet; behind on a payment, the card comes first
 *   plan_ending      cancelled and running to its end: nothing to pause
 *   not_monthly      a yearly plan (a month of pause stops no payment)
 *   half_price_month the half-price month was taken in the last 31 days: a
 *                    pause now would void the invoice it takes half off
 */
create or replace function start_plan_pause(p_family_id uuid, p_months int, p_cycle text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fam   families;
  v_cycle text;
  v_until timestamptz;
  v_id    bigint;
begin
  if p_months is null or p_months not between 1 and 3 then
    return jsonb_build_object('ok', false, 'reason', 'bad_months');
  end if;
  select * into v_fam from families where id = p_family_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_family');
  end if;
  if v_fam.stripe_subscription_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_subscription');
  end if;
  if v_fam.paused_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'already_paused', 'paused_until', v_fam.paused_until);
  end if;
  if v_fam.subscription_status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  if v_fam.subscription_ends_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'plan_ending');
  end if;
  v_cycle := coalesce(case when p_cycle in ('month', 'year') then p_cycle end, v_fam.billing_cycle);
  if v_cycle is distinct from 'month' then
    return jsonb_build_object('ok', false, 'reason', 'not_monthly');
  end if;
  if v_fam.save_offer_used_at > now() - interval '31 days' then
    return jsonb_build_object('ok', false, 'reason', 'half_price_month');
  end if;

  v_until := now() + make_interval(months => p_months);
  insert into plan_pauses (family_id, months, resumes_at, paid_until)
  values (p_family_id, p_months, v_until,
          case when v_fam.subscription_renews_at > now() then v_fam.subscription_renews_at end)
  returning id into v_id;
  update families set paused_until = v_until, billing_cycle = v_cycle where id = p_family_id;
  return jsonb_build_object('ok', true, 'pause_id', v_id, 'months', p_months, 'resumes_at', v_until,
                            'subscription_id', v_fam.stripe_subscription_id);
end $$;

/**
 * How Stripe answered. Took it: the pause is confirmed, and counted once.
 * Refused or did not answer: the pause is undone, as if it never was (a
 * pause Stripe did make after all reaches the webhook, which writes it down
 * again). A confirmed pause is never undone here.
 */
create or replace function finish_plan_pause(p_pause_id bigint, p_ok boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pause plan_pauses;
begin
  select * into v_pause from plan_pauses where id = p_pause_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pause');
  end if;
  if coalesce(p_ok, false) then
    if v_pause.confirmed_at is null then
      update plan_pauses set confirmed_at = now() where id = p_pause_id;
      perform count_plan_change('plans_paused');
    end if;
    return jsonb_build_object('ok', true, 'resumes_at', v_pause.resumes_at);
  end if;
  if v_pause.confirmed_at is not null then
    return jsonb_build_object('ok', true, 'kept', true);
  end if;
  delete from plan_pauses where id = p_pause_id;
  update families set paused_until = null
   where id = v_pause.family_id and paused_until = v_pause.resumes_at;
  return jsonb_build_object('ok', true, 'undone', true);
end $$;

/**
 * Resume now, before the date: called once Stripe has been told. The pause
 * ends here and billing goes on from the next renewal date.
 */
create or replace function end_plan_pause(p_family_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_fam families;
begin
  select * into v_fam from families where id = p_family_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_family');
  end if;
  if v_fam.paused_until is null or v_fam.paused_until <= now() then
    return jsonb_build_object('ok', false, 'reason', 'not_paused');
  end if;
  update plan_pauses set ended_at = now()
   where family_id = p_family_id and ended_at is null and resumes_at > now();
  update families set paused_until = null where id = p_family_id;
  return jsonb_build_object('ok', true);
end $$;

/**
 * What resuming early has to give back, for /api/keep-plan before it asks
 * Stripe: when the running pause started, and when the period paid for
 * before it would have ended. A renewal that fell inside the pause was
 * voided, so the month running now was never paid for; the days between
 * the two times here were paid for and never used, and come back first.
 */
create or replace function plan_pause_credit(p_family_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('started_at', p.started_at, 'paid_until', p.paid_until)
      from plan_pauses p
     where p.family_id = p_family_id and p.ended_at is null and p.resumes_at > now()
     order by p.started_at desc limit 1), '{}'::jsonb);
$$;

/**
 * What Stripe says about a pause, from a subscription event
 * (apply_subscription_change, after its own checks for replays, old news and
 * another subscription). `p_until` is pause_collection.resumes_at, or null
 * when Stripe says it is not paused; `p_live` is false once the plan ended,
 * which ends any pause with it.
 *
 * Stripe does not deliver in order, so: news from before a pause started
 * does not end it, a pause the app is still telling Stripe about is left to
 * finish_plan_pause, and news from before an early resume does not pause the
 * family again. A pause made in Stripe's dashboard is written down here,
 * with no months, and counted.
 */
create or replace function sync_plan_pause(p_family_id uuid, p_until timestamptz, p_live boolean,
                                           p_event_created timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_open plan_pauses;
begin
  select * into v_open from plan_pauses
   where family_id = p_family_id and ended_at is null and resumes_at > now()
   order by started_at desc limit 1;

  if p_live and p_until > now() then
    if v_open.id is not null then
      -- The date moved (changed in Stripe): the reminder follows it.
      if v_open.resumes_at <> p_until then
        update plan_pauses set resumes_at = p_until, reminder_claimed_at = null, reminder_sent_at = null
         where id = v_open.id;
      end if;
    elsif exists (select 1 from plan_pauses where family_id = p_family_id
                    and ended_at > coalesce(p_event_created, 'infinity'::timestamptz)) then
      -- Resumed early after this news was written.
      return;
    else
      insert into plan_pauses (family_id, months, resumes_at, confirmed_at, paid_until)
      values (p_family_id, null, p_until, now(),
              (select f.subscription_renews_at from families f where f.id = p_family_id and f.subscription_renews_at > now()));
      perform count_plan_change('plans_paused');
    end if;
    update families set paused_until = p_until where id = p_family_id and paused_until is distinct from p_until;
    return;
  end if;

  if v_open.id is not null and p_live then
    -- Older than the pause, or the app is still waiting for Stripe's answer.
    if v_open.started_at > coalesce(p_event_created, 'infinity'::timestamptz) or v_open.confirmed_at is null then
      return;
    end if;
  end if;
  update plan_pauses set ended_at = now()
   where family_id = p_family_id and ended_at is null and resumes_at > now();
  update families set paused_until = null where id = p_family_id and paused_until is not null;
end $$;

/**
 * May this family have the half-price month? If so, mark it taken, before
 * Stripe is asked, so two taps at once cannot both have it. Called by
 * /api/keep-plan; finish_save_offer then says whether Stripe applied it.
 *
 * Refused:
 *   no_family, no_subscription, not_active, plan_ending, not_monthly as for
 *   a pause (half off the next invoice of a yearly plan is half a year);
 *   already_used  this family has had it (once, ever)
 *   paused        nothing is charged during a pause to take half off
 */
create or replace function claim_save_offer(p_family_id uuid, p_cycle text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fam   families;
  v_cycle text;
begin
  select * into v_fam from families where id = p_family_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_family');
  end if;
  if v_fam.save_offer_used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if v_fam.stripe_subscription_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_subscription');
  end if;
  if v_fam.paused_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'paused');
  end if;
  if v_fam.subscription_status is distinct from 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  if v_fam.subscription_ends_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'plan_ending');
  end if;
  v_cycle := coalesce(case when p_cycle in ('month', 'year') then p_cycle end, v_fam.billing_cycle);
  if v_cycle is distinct from 'month' then
    return jsonb_build_object('ok', false, 'reason', 'not_monthly');
  end if;
  update families set save_offer_used_at = now(), billing_cycle = v_cycle where id = p_family_id;
  return jsonb_build_object('ok', true, 'subscription_id', v_fam.stripe_subscription_id, 'claimed_at', now());
end $$;

/**
 * How Stripe answered the half-price month. Applied: counted, and it stays
 * taken for ever. Not applied: given back, so the family can try again.
 */
create or replace function finish_save_offer(p_family_id uuid, p_ok boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_ok, false) then
    if not exists (select 1 from families where id = p_family_id and save_offer_used_at is not null) then
      return jsonb_build_object('ok', false, 'reason', 'not_claimed');
    end if;
    perform count_plan_change('plans_saved');
    return jsonb_build_object('ok', true);
  end if;
  update families set save_offer_used_at = null where id = p_family_id;
  return jsonb_build_object('ok', true, 'given_back', true);
end $$;

/**
 * Which families' billing starts again within three days, with each parent
 * to write to (never a supporter, only an account with an email address).
 * Once per pause: a pause whose date moved is due again for the new date.
 * The job claims each before sending (claim_pause_reminder).
 */
create or replace function due_pause_reminders(p_now timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb;
begin
  with due as (
    select p.id, p.family_id, p.resumes_at, f.tier, coalesce(f.billing_cycle, 'month') as cycle,
           case when is_time_zone(f.timezone) then f.timezone else 'UTC' end as tz
      from plan_pauses p join families f on f.id = p.family_id
     where p.ended_at is null
       and p.reminder_sent_at is null
       and (p.reminder_claimed_at is null or p.reminder_claimed_at < p_now - interval '1 hour')
       and p.resumes_at > p_now
       and p.resumes_at <= p_now + interval '3 days'
       and f.paused_until = p.resumes_at
       and f.stripe_subscription_id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'pause_id', d.id,
           'family_id', d.family_id,
           'paid_tier', d.tier,
           'cycle', d.cycle,
           'resumes_at', d.resumes_at,
           'resumes_local', to_char(d.resumes_at at time zone d.tz, 'FMDay FMDD FMMonth'),
           'recipients', (
             select coalesce(jsonb_agg(jsonb_build_object('email', u.email) order by p.created_at), '[]'::jsonb)
               from parents p join auth.users u on u.id = p.user_id
              where p.family_id = d.family_id and p.role = 'parent'
                and u.email is not null and u.email like '%@%')
         ) order by d.resumes_at), '[]'::jsonb)
    into v_rows
    from due d;
  return jsonb_build_object('ok', true, 'reminders', v_rows);
end $$;

/** Claim one pause's reminder before it is sent: true for the one run that gets it. */
create or replace function claim_pause_reminder(p_pause_id bigint)
returns boolean language sql security definer set search_path = public as $$
  with claimed as (
    update plan_pauses set reminder_claimed_at = now()
     where id = p_pause_id and ended_at is null and reminder_sent_at is null
       and (reminder_claimed_at is null or reminder_claimed_at < now() - interval '1 hour')
    returning 1
  ) select exists (select 1 from claimed);
$$;

/** After the send: sent, so never again for this date; or not, so the next run tries. */
create or replace function finish_pause_reminder(p_pause_id bigint, p_sent boolean)
returns void language sql security definer set search_path = public as $$
  update plan_pauses
     set reminder_sent_at = case when p_sent then coalesce(reminder_sent_at, now()) else reminder_sent_at end,
         reminder_claimed_at = case when p_sent then reminder_claimed_at else null end
   where id = p_pause_id;
$$;

revoke execute on function stripe_subscription_for_family(uuid) from public, anon, authenticated;
revoke execute on function start_plan_pause(uuid, int, text) from public, anon, authenticated;
revoke execute on function finish_plan_pause(bigint, boolean) from public, anon, authenticated;
revoke execute on function end_plan_pause(uuid) from public, anon, authenticated;
revoke execute on function plan_pause_credit(uuid) from public, anon, authenticated;
revoke execute on function sync_plan_pause(uuid, timestamptz, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function claim_save_offer(uuid, text) from public, anon, authenticated;
revoke execute on function finish_save_offer(uuid, boolean) from public, anon, authenticated;
revoke execute on function due_pause_reminders(timestamptz) from public, anon, authenticated;
revoke execute on function claim_pause_reminder(bigint) from public, anon, authenticated;
revoke execute on function finish_pause_reminder(bigint, boolean) from public, anon, authenticated;
