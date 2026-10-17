-- ---------------------------------------------------------------------------
-- Charity Week.
--
-- Run after billing.sql.
--
-- The calendar week containing 22 June, every year, when every penny the app takes goes to
-- charity. This file is the part that makes that a fact rather than a slogan:
-- a total computed from the payments that actually happened, which can be
-- read off at the end of the week and handed over.
--
-- It deliberately does NOT move money. Nothing here pays a charity; paying is
-- a bank transfer somebody makes, and a system that claimed to do it
-- automatically would be lying about something too important to be wrong
-- about. What it does is make the amount impossible to argue with.
-- ---------------------------------------------------------------------------

/*
 * What a payment was worth, so the week can be totalled.
 *
 * billing_events already records every Stripe event, but only as the raw
 * payload — and digging an amount out of nested JSON differs per event type,
 * which is exactly the sort of thing that is wrong by a factor of a hundred
 * at the moment it matters. The webhook pulls the number out once, in minor
 * units, and it is stored plainly.
 *
 * Null means "no money moved" — a subscription cancelling, a trial starting.
 * Those are real events and belong in the log; they are simply not revenue.
 */
alter table billing_events add column if not exists amount_pence int;
alter table billing_events add column if not exists currency text;

create index if not exists billing_events_received_idx
  on billing_events (received_at);

-- The Monday of the calendar week that 22 June falls in. date_trunc('week')
-- is ISO, so its weeks already start on Monday; doing it this way means the
-- window is a week as people keep them rather than seven days hanging off a
-- date, and it matches charityWindow() in src/lib/charity.js exactly.
create or replace function charity_week_start(p_year int)
returns timestamptz language sql immutable as $$
  select date_trunc('week', make_timestamptz(p_year, 6, 22, 0, 0, 0, 'UTC') at time zone 'UTC')
         at time zone 'UTC';
$$;

/**
 * Is this instant inside the week?
 *
 * Half-open: the end is the first instant NOT in it, which is the only way to
 * say "seven whole days" without an argument about the final second. UTC on
 * both sides so a family in Auckland and one in Vancouver are in the week at
 * the same moment rather than on their own local Monday.
 */
create or replace function in_charity_week(p_at timestamptz default now())
returns boolean language sql stable as $$
  -- The week can start in the month before its anchor, so check the
  -- neighbouring years too rather than assuming it sits inside its own.
  select exists (
    select 1
      from generate_series(
             extract(year from p_at at time zone 'UTC')::int - 1,
             extract(year from p_at at time zone 'UTC')::int + 1
           ) as y
     where p_at >= charity_week_start(y)
       and p_at <  charity_week_start(y) + interval '7 days'
  );
$$;

/**
 * What the week raised.
 *
 * Summed from the events themselves rather than from a running counter, so
 * there is no number to drift: re-run it a year later and it still gives the
 * same answer, because it is reading the same rows.
 *
 * Grouped by currency and never converted. Adding pounds to dollars at
 * whatever rate happened to be in a variable is how a charity total becomes
 * indefensible; two lines that are each exactly right beat one that is
 * approximately right.
 */
create or replace function charity_week_total(p_year int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_year  int := coalesce(p_year, extract(year from now() at time zone 'UTC')::int);
  v_from  timestamptz := charity_week_start(v_year);
  v_to    timestamptz := v_from + interval '7 days';
begin
  return jsonb_build_object(
    'year', v_year,
    'from', v_from,
    'to', v_to,
    'running', now() >= v_from and now() < v_to,
    'finished', now() >= v_to,
    'totals', coalesce((
      select jsonb_agg(jsonb_build_object('currency', c, 'pence', p, 'payments', n)
                     order by p desc)
        from (
          select coalesce(currency, 'GBP') as c,
                 sum(amount_pence)::bigint as p,
                 count(*)                  as n
            from billing_events
           where received_at >= v_from
             and received_at <  v_to
             and amount_pence is not null
             and amount_pence > 0
           group by coalesce(currency, 'GBP')
        ) s
    ), '[]'::jsonb),
    'families', (
      select count(distinct family_id) from billing_events
       where received_at >= v_from and received_at < v_to
         and amount_pence is not null and amount_pence > 0
    )
  );
end $$;

/*
 * Not granted to browsers. The total is a company figure, published
 * deliberately once the week is over, not something a signed-in parent reads
 * live out of the database — and `count(distinct family_id)` is a subscriber
 * count, which is nobody else's business.
 */
revoke execute on function charity_week_total(int) from public;
revoke execute on function charity_week_start(int) from public;


/**
 * Log a payment, and nothing else.
 *
 * apply_subscription_change is about what a family is entitled to; a
 * recurring charge is about money. Those happen at different moments and the
 * existing function was never recording an amount, so a Charity Week total
 * built on it would have been almost entirely zero — the subscription events
 * carry a status, not a price.
 *
 * Idempotent on the Stripe event id, like everything else the webhook calls:
 * Stripe retries, and a retried invoice must not be counted twice in a total
 * somebody is about to hand to a charity.
 */
create or replace function record_payment(
  p_family_id uuid,
  p_stripe_event text,
  p_type text,
  p_amount_pence int,
  p_currency text default 'GBP'
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_stripe_event is null then
    return jsonb_build_object('ok', false, 'reason', 'no_event_id');
  end if;

  begin
    insert into billing_events (family_id, stripe_event, type, payload,
                                amount_pence, currency)
    values (p_family_id, p_stripe_event, coalesce(p_type, 'payment'),
            jsonb_build_object('type', p_type),
            nullif(p_amount_pence, 0), upper(coalesce(p_currency, 'GBP')));
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end;

  return jsonb_build_object('ok', true, 'charity_week', in_charity_week(now()));
end $$;

-- Service role only, like the rest of billing. A browser that could log a
-- payment could inflate the charity total.
revoke execute on function record_payment(uuid, text, text, int, text) from public;
