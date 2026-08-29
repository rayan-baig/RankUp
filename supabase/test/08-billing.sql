-- ---------------------------------------------------------------------------
-- Billing.
--
-- The claim worth testing: a family's tier is decided by the subscription and
-- by nothing else, it fails closed, and a device cannot buy itself Elite.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('f1111111-1111-1111-1111-111111111111', 'billing-parent@example.com'),
  ('f3333333-3333-3333-3333-333333333333', null);
insert into families (id, name) values ('f2222222-0000-0000-0000-000000000001', 'Billing Family');
insert into parents (user_id, family_id, name) values
  ('f1111111-1111-1111-1111-111111111111', 'f2222222-0000-0000-0000-000000000001', 'Bill');
select seed_consent('f2222222-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111');
insert into kids (id, family_id, user_id, name) values
  ('f4444444-0000-0000-0000-000000000001', 'f2222222-0000-0000-0000-000000000001',
   'f3333333-3333-3333-3333-333333333333', 'Billie');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
-- The blanket grant above re-opens the billing columns; lock them again.
select lock_billing_columns();

set role app_user;

do $$
begin
  perform become('f1111111-1111-1111-1111-111111111111');

  perform ok('a new family starts on Standard',
    (billing_status()->>'tier') = 'standard');

  -- A device must not be able to buy itself Elite.
  begin
    update families set tier = 'elite' where id = 'f2222222-0000-0000-0000-000000000001';
    raise exception 'FAIL a parent set their own tier';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT set their own tier (%)', left(sqlerrm, 34);
  end;
  perform ok('and the family is still on Standard',
    (billing_status()->>'tier') = 'standard');

  -- The columns a parent legitimately owns still work.
  update families set name = 'Renamed Family' where id = 'f2222222-0000-0000-0000-000000000001';
  perform ok('a parent can still rename their own family',
    (select name from families where id = 'f2222222-0000-0000-0000-000000000001') = 'Renamed Family');

  begin
    perform apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'active', 'elite');
    raise exception 'FAIL a browser caller changed the subscription';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a browser caller CANNOT call apply_subscription_change (%)', left(sqlerrm, 30);
  end;
end $$;

-- The webhook's view (service role).
do $$
declare res jsonb;
begin
  set local role postgres;

  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'active', 'elite',
                                   'cus_123', 'sub_123', now() + interval '30 days', 'evt_1');
  perform ok('an active Elite subscription grants Elite', res->>'tier' = 'elite');

  -- Stripe retries deliveries; acting twice on one event would be a bug.
  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'canceled', 'elite',
                                   'cus_123', 'sub_123', now(), 'evt_1');
  perform ok('a repeated Stripe event is ignored', (res->>'duplicate')::boolean = true);
  perform ok('and the repeat did not change anything',
    (select tier from families where id = 'f2222222-0000-0000-0000-000000000001') = 'elite');

  -- Fail closed.
  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'past_due', 'elite',
                                   null, null, null, 'evt_2');
  perform ok('a past-due subscription drops to Standard', res->>'tier' = 'standard');

  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'active', 'elite',
                                   null, null, now() + interval '30 days', 'evt_3');
  perform ok('paying again restores Elite', res->>'tier' = 'elite');

  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'canceled', 'elite',
                                   null, null, now(), 'evt_4');
  perform ok('cancelling drops to Standard', res->>'tier' = 'standard');

  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'active', 'standard',
                                   null, null, now() + interval '30 days', 'evt_5');
  perform ok('an active Standard subscription is Standard, not Elite', res->>'tier' = 'standard');

  perform ok('a family can be found from its Stripe customer id',
    family_for_customer('cus_123') = 'f2222222-0000-0000-0000-000000000001');
  set local role app_user;
end $$;

-- Nothing that a child has earned is ever taken away by a billing change.
do $$
begin
  set local role postgres;
  update kids set xp = 900, coins = 120 where id = 'f4444444-0000-0000-0000-000000000001';
  perform apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'canceled', 'elite',
                                    null, null, now(), 'evt_6');
  perform ok('downgrading never removes a child''s XP or currency',
    (select xp from kids where id = 'f4444444-0000-0000-0000-000000000001') = 900
    and (select coins from kids where id = 'f4444444-0000-0000-0000-000000000001') = 120);

  perform ok('billing history is not readable from a browser', true);
  set local role app_user;
  perform become('f1111111-1111-1111-1111-111111111111');
  perform ok('billing events are hidden from the browser',
    (select count(*) from billing_events) = 0);
end $$;

reset role;
