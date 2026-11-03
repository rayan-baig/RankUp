-- ---------------------------------------------------------------------------
-- A plan's whole life, one Stripe event at a time, as the webhook calls it.
--
-- tests/billingwalk.mjs walks the same life through the real webhook under
-- workerd. This file holds the database's half on its own: a period refunded
-- in full stays refunded when Stripe goes on saying "active" for it, a plan
-- cancelled in the portal says when it stops, a plan that has ended says it
-- ended now (not at the end of the period it would have run to), and a
-- school's plan is protected from late news and from a refund as a family's
-- is.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into families (id, name, tier) values ('41f00000-0000-4000-8000-000000000001', 'Walk Family', 'starter');

-- ---------- a family ----------
do $$
declare
  f uuid := '41f00000-0000-4000-8000-000000000001';
  r jsonb;
  t0 timestamptz := now() - interval '40 days';
  p1 timestamptz := now() + interval '20 days';
  row families;
begin
  r := apply_subscription_change(f, 'active', 'elite', 'cus_walk', 'sub_walk', p1, 'evt_walk_1',
                                 '{"type":"customer.subscription.created"}', t0);
  select * into row from families where id = f;
  perform ok('subscribed: Elite, active, renewing at the end of the period',
    row.tier = 'elite' and row.subscription_status = 'active' and row.subscription_renews_at = p1
    and row.subscription_ends_at is null, row::text);

  -- A refund of this period, in full.
  r := apply_charge_refund(f, 'ch_walk_1', 'pi_walk_1', true, t0 + interval '1 day', t0);
  select * into row from families where id = f;
  perform ok('refunded in full: Starter, and the period it refunded is kept',
    row.tier = 'starter' and row.subscription_status = 'refunded' and row.subscription_renews_at = p1, row::text);

  -- The parent then cancels in the portal: Stripe says active, cancel at the period end.
  r := apply_subscription_change(f, 'active', 'elite', 'cus_walk', 'sub_walk', p1, 'evt_walk_2',
                                 jsonb_build_object('type', 'customer.subscription.updated', 'cancel_at', p1),
                                 t0 + interval '2 days');
  select * into row from families where id = f;
  perform ok('"active" for the refunded period does not put the plan back for free',
    r->>'ignored' = 'refunded_period' and row.tier = 'starter' and row.subscription_status = 'refunded', r::text || row::text);
  perform ok('but when it stops is still kept', row.subscription_ends_at = p1, row::text);

  -- A renewal is a new period, paid again: the plan comes back.
  r := apply_subscription_change(f, 'active', 'elite', 'cus_walk', 'sub_walk', p1 + interval '30 days', 'evt_walk_3',
                                 '{"type":"customer.subscription.updated"}', t0 + interval '3 days');
  select * into row from families where id = f;
  perform ok('a renewal into a new period puts the plan back',
    row.tier = 'elite' and row.subscription_status = 'active' and row.subscription_ends_at is null, row::text);

  -- Cancelled in the portal, at the period end: still Elite, and it says when it stops.
  r := apply_subscription_change(f, 'active', 'elite', 'cus_walk', 'sub_walk', p1 + interval '30 days', 'evt_walk_4',
                                 jsonb_build_object('type', 'customer.subscription.updated', 'cancel_at', p1 + interval '30 days'),
                                 t0 + interval '4 days');
  select * into row from families where id = f;
  perform ok('cancelled in the portal: still Elite until then, with the date it stops',
    row.tier = 'elite' and row.subscription_status = 'active' and row.subscription_ends_at = p1 + interval '30 days', row::text);

  -- Ended at once: the end is when it ended, not when the period would have.
  r := apply_subscription_change(f, 'canceled', 'elite', 'cus_walk', 'sub_walk', p1 + interval '30 days', 'evt_walk_5',
                                 jsonb_build_object('type', 'customer.subscription.deleted', 'ended_at', t0 + interval '5 days'),
                                 t0 + interval '5 days');
  select * into row from families where id = f;
  perform ok('ended: Starter, and it ended when Stripe ended it',
    row.tier = 'starter' and row.subscription_status = 'canceled'
    and row.subscription_ends_at = t0 + interval '5 days' and row.stripe_subscription_id is null, row::text);

  -- The same refund arriving again, and a late "active" from before it ended.
  r := apply_charge_refund(f, 'ch_walk_1', 'pi_walk_1', true, t0 + interval '1 day', t0);
  perform ok('a replayed refund acts once', (r->>'duplicate')::boolean, r::text);
  r := apply_subscription_change(f, 'active', 'elite', 'cus_walk', 'sub_walk', p1 + interval '30 days', 'evt_walk_late',
                                 '{"type":"customer.subscription.updated"}', t0 + interval '4 days 12 hours');
  select * into row from families where id = f;
  perform ok('a late "active" from before the end does not bring the plan back',
    r->>'ignored' = 'out_of_date' and row.tier = 'starter', r::text);

  -- Subscribing again, for a year.
  r := apply_subscription_change(f, 'active', 'elite', 'cus_walk', 'sub_walk_year', now() + interval '365 days', 'evt_walk_6',
                                 '{"type":"customer.subscription.created"}', t0 + interval '6 days');
  select * into row from families where id = f;
  perform ok('subscribed again for a year: Elite on the new subscription',
    row.tier = 'elite' and row.stripe_subscription_id = 'sub_walk_year', row::text);
  r := apply_subscription_change(f, 'canceled', 'elite', 'cus_walk', 'sub_walk', p1, 'evt_walk_old',
                                 '{"type":"customer.subscription.deleted"}', t0 + interval '7 days');
  perform ok('and the old one ending again changes nothing', (select tier from families where id = f) = 'elite', r::text);
end $$;

-- ---------- a school ----------
insert into schools (id, name, district, district_key, student_count, size_band, status, trial_ends_at)
values ('41500000-0000-4000-8000-000000000001', 'Walk School', 'Walk District', 'walk district', 250, 'small', 'trial',
        now() - interval '1 day');

do $$
declare
  s uuid := '41500000-0000-4000-8000-000000000001';
  r jsonb;
  t0 timestamptz := now() - interval '40 days';
  p1 timestamptz := now() + interval '20 days';
  row schools;
begin
  r := apply_school_subscription(s, 'active', 'cus_ws', 'sub_ws', 'evt_ws_1', '{}', t0, p1);
  select * into row from schools where id = s;
  perform ok('a school subscribes: in the league, and Stripe''s status kept',
    row.status = 'active' and row.billing_status = 'active' and row.billing_period_end = p1, row::text);

  r := apply_school_subscription(s, 'past_due', 'cus_ws', 'sub_ws', 'evt_ws_2', '{}', t0 + interval '1 day', p1);
  select * into row from schools where id = s;
  perform ok('a failed card keeps it playing, and says past due',
    row.status = 'active' and row.billing_status = 'past_due', row::text);

  r := apply_school_subscription(s, 'active', 'cus_ws', 'sub_ws', 'evt_ws_3', '{}', t0 + interval '2 days', p1);
  r := apply_school_refund(s, 'ch_ws_1', false, t0 + interval '3 days', t0);
  perform ok('a partial refund changes nothing', r->>'ignored' = 'partial_refund'
    and (select status from schools where id = s) = 'active', r::text);
  r := apply_school_refund(s, null, true, t0 + interval '3 days', t0);
  perform ok('a refund naming no charge is refused', r->>'reason' = 'no_charge', r::text);
  r := apply_school_refund('41500000-0000-4000-8000-0000000000ff', 'ch_ws_x', true, t0, t0);
  perform ok('as is one for a school that is not here', r->>'reason' = 'no_school', r::text);

  r := apply_school_refund(s, 'ch_ws_1', true, t0 + interval '3 days', t0);
  select * into row from schools where id = s;
  perform ok('refunded in full: out of the league (its trial is over), and it says refunded',
    row.status = 'lapsed' and row.billing_status = 'refunded' and not school_is_live(s), row::text);
  r := apply_school_refund(s, 'ch_ws_1', true, t0 + interval '3 days', t0);
  perform ok('once, however often it arrives', (r->>'duplicate')::boolean, r::text);

  r := apply_school_subscription(s, 'active', 'cus_ws', 'sub_ws', 'evt_ws_4',
                                 jsonb_build_object('cancel_at', p1), t0 + interval '4 days', p1);
  select * into row from schools where id = s;
  perform ok('"active" for the refunded period does not put it back in the league',
    r->>'ignored' = 'refunded_period' and row.status = 'lapsed' and row.billing_ends_at = p1, r::text);

  r := apply_school_subscription(s, 'canceled', 'cus_ws', 'sub_ws', 'evt_ws_5',
                                 jsonb_build_object('ended_at', t0 + interval '5 days'), t0 + interval '5 days', p1);
  select * into row from schools where id = s;
  perform ok('ended: lapsed, with no subscription left', row.status = 'lapsed' and row.billing_status = 'canceled'
    and row.stripe_subscription_id is null and row.billing_ends_at = t0 + interval '5 days', row::text);

  r := apply_school_subscription(s, 'active', 'cus_ws', 'sub_ws', 'evt_ws_late', '{}', t0 + interval '4 days 12 hours', p1);
  select * into row from schools where id = s;
  perform ok('a late "active" from before it ended is out of date, and the school stays out',
    r->>'ignored' = 'out_of_date' and row.status = 'lapsed', r::text);

  r := apply_school_subscription(s, 'active', 'cus_ws', 'sub_ws_year', 'evt_ws_6', '{}', t0 + interval '6 days', now() + interval '365 days');
  select * into row from schools where id = s;
  perform ok('paying again for a year puts it back', row.status = 'active' and row.stripe_subscription_id = 'sub_ws_year'
    and row.billing_status = 'active' and school_is_live(s), row::text);

  -- An earlier period refunded, after a later invoice was paid.
  insert into billing_events (school_id, stripe_event, type, received_at)
  values (s, 'invoice:in_ws_year', 'school:invoice_paid', now());
  r := apply_school_refund(s, 'ch_ws_old', true, now(), now() - interval '30 days');
  perform ok('refunding an earlier period leaves the one paid for standing',
    r->>'ignored' = 'earlier_period' and (select status from schools where id = s) = 'active', r::text);
end $$;

-- ---------- nobody but the webhook ----------
grant usage on schema public to anon, authenticated;
set role app_user;
do $$
begin
  begin
    perform apply_school_refund('41500000-0000-4000-8000-000000000001', 'ch_browser', true);
    raise exception 'FAIL a browser refunded a school';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a browser caller CANNOT call apply_school_refund (%)', left(sqlerrm, 30);
  end;
end $$;
set role postgres;
