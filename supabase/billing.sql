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
           else null end
   where id = p_family_id;

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
    'has_subscription', v_family.stripe_subscription_id is not null
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
