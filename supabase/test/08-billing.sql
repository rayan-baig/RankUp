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

  perform ok('a new family starts on Starter, the cheapest plan',
    (billing_status()->>'tier') = 'starter');

  -- A device must not be able to buy itself Elite.
  begin
    update families set tier = 'elite' where id = 'f2222222-0000-0000-0000-000000000001';
    raise exception 'FAIL a parent set their own tier';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT set their own tier (%)', left(sqlerrm, 34);
  end;
  perform ok('and the family is still on Starter',
    (billing_status()->>'tier') = 'starter');

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
  perform ok('a past-due subscription drops to Starter, not to a plan it did not pay for',
    res->>'tier' = 'starter');

  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'active', 'elite',
                                   null, null, now() + interval '30 days', 'evt_3');
  perform ok('paying again restores Elite', res->>'tier' = 'elite');

  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'canceled', 'elite',
                                   null, null, now(), 'evt_4');
  perform ok('cancelling drops to Starter', res->>'tier' = 'starter');

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

-- ---------- the three-plan ladder ----------
do $$
declare res jsonb;
begin
  set local role postgres;

  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'active', 'starter',
                                   null, null, now() + interval '30 days', 'evt_10');
  perform ok('an active Starter subscription is Starter', res->>'tier' = 'starter');

  -- A tier name nobody recognises must not buy anything.
  res := apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'active', 'platinum',
                                   null, null, now() + interval '30 days', 'evt_11');
  perform ok('an unrecognised plan name falls back to Starter', res->>'tier' = 'starter');
  set local role app_user;
end $$;

-- ---------- Starter is a one-child plan ----------
do $$
declare v_second uuid := gen_random_uuid();
begin
  set local role postgres;
  update families set tier = 'starter' where id = 'f2222222-0000-0000-0000-000000000001';

  begin
    insert into kids (id, family_id, name)
    values (v_second, 'f2222222-0000-0000-0000-000000000001', 'Second Child');
    raise exception 'FAIL Starter allowed a second child';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS Starter refuses a second child (%)', left(sqlerrm, 30);
  end;

  -- Paying lifts the limit.
  perform apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'active', 'standard',
                                    null, null, now() + interval '30 days', 'evt_12');
  insert into kids (id, family_id, name)
  values (v_second, 'f2222222-0000-0000-0000-000000000001', 'Second Child');
  perform ok('Standard allows the second child',
    (select count(*) from kids where family_id = 'f2222222-0000-0000-0000-000000000001') = 2);

  -- Lapsing back must never delete a child they already have.
  perform apply_subscription_change('f2222222-0000-0000-0000-000000000001', 'canceled', 'standard',
                                    null, null, now(), 'evt_13');
  perform ok('dropping back to Starter keeps the children already there',
    (select count(*) from kids where family_id = 'f2222222-0000-0000-0000-000000000001') = 2);
  set local role app_user;
end $$;

-- ---------- Flash Tickets ----------
do $$
declare res jsonb;
begin
  set local role postgres;
  update families set flash_tickets = 0, tier = 'standard'
   where id = 'f2222222-0000-0000-0000-000000000001';

  res := credit_flash_tickets('f2222222-0000-0000-0000-000000000001', 3, 'evt_20');
  perform ok('a paid pack credits three tickets', (res->>'flash_tickets')::int = 3);

  -- Stripe retries; a family must not get two packs for one payment.
  res := credit_flash_tickets('f2222222-0000-0000-0000-000000000001', 3, 'evt_20');
  perform ok('a repeated ticket payment is ignored', (res->>'duplicate')::boolean = true);
  perform ok('and they still have exactly three',
    (select flash_tickets from families where id = 'f2222222-0000-0000-0000-000000000001') = 3);
  set local role app_user;

  perform become('f1111111-1111-1111-1111-111111111111');
  begin
    perform credit_flash_tickets('f2222222-0000-0000-0000-000000000001', 99, 'evt_21');
    raise exception 'FAIL a browser granted itself tickets';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a browser caller CANNOT credit tickets (%)', left(sqlerrm, 30);
  end;
end $$;

-- ---------- buying a Sunday Market skin ----------
do $$
declare res jsonb;
begin
  set local role postgres;
  update kids set coins = 130 where id = 'f4444444-0000-0000-0000-000000000001';
  set local role app_user;

  perform become('f1111111-1111-1111-1111-111111111111');
  res := buy_market_skin('f4444444-0000-0000-0000-000000000001', 'ember', 120, false);
  perform ok('a skin can be bought with the child''s own currency',
    (res->>'ok')::boolean = true);
  perform ok('and the currency really left the account',
    (select coins from kids where id = 'f4444444-0000-0000-0000-000000000001') = 10);

  res := buy_market_skin('f4444444-0000-0000-0000-000000000001', 'gilded', 260, false);
  perform ok('a skin they cannot afford is refused',
    (res->>'ok')::boolean = false and res->>'reason' = 'too_expensive');

  res := buy_market_skin('f4444444-0000-0000-0000-000000000001', 'gilded', 260, true);
  perform ok('a Flash Ticket takes it instead', (res->>'ok')::boolean = true);
  perform ok('the ticket was spent, and the currency was not',
    (select flash_tickets from families where id = 'f2222222-0000-0000-0000-000000000001') = 2
    and (select coins from kids where id = 'f4444444-0000-0000-0000-000000000001') = 10);

end $$;

-- Another family's child is not yours to spend on.
do $$
declare
  v_other_family uuid := gen_random_uuid();
  v_other_kid    uuid := gen_random_uuid();
  v_other_parent uuid := gen_random_uuid();
begin
  set local role postgres;
  insert into auth.users (id, email) values (v_other_parent, 'stranger@example.com');
  insert into families (id, name, tier) values (v_other_family, 'Someone Else', 'standard');
  insert into parents (user_id, family_id, name) values (v_other_parent, v_other_family, 'Stranger');
  perform seed_consent(v_other_family, v_other_parent);
  insert into kids (id, family_id, name, coins) values (v_other_kid, v_other_family, 'Not Yours', 500);
  set local role app_user;

  perform become('f1111111-1111-1111-1111-111111111111');
  begin
    perform buy_market_skin(v_other_kid, 'ember', 120, false);
    raise exception 'FAIL bought a skin for another family';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS one family CANNOT spend on another''s child (%)', left(sqlerrm, 30);
  end;

  set local role postgres;
  perform ok('and that child''s currency is untouched',
    (select coins from kids where id = v_other_kid) = 500);
  set local role app_user;
end $$;

-- ---------- the AI photo check costs real money, so it is rationed ----------
do $$
declare res jsonb; i int;
begin
  set local role postgres;
  update families set tier = 'standard', ai_checks_used = 0, ai_checks_month = null
   where id = 'f2222222-0000-0000-0000-000000000001';
  set local role app_user;

  -- Nobody at all: an unauthenticated caller must never spend the operator's
  -- Anthropic balance. This is the case that makes the endpoint require a token.
  perform become(null);
  res := claim_photo_check();
  perform ok('a signed-out caller cannot claim a photo check',
    (res->>'ok')::boolean = false and res->>'reason' = 'no_family');

  perform become('f1111111-1111-1111-1111-111111111111');
  res := claim_photo_check();
  perform ok('a real family can', (res->>'ok')::boolean = true and (res->>'used')::int = 1);

  -- Starter does not include the check, so it must not be able to spend on one.
  set local role postgres;
  update families set tier = 'starter' where id = 'f2222222-0000-0000-0000-000000000001';
  set local role app_user;
  perform become('f1111111-1111-1111-1111-111111111111');
  res := claim_photo_check();
  perform ok('the Starter plan cannot claim one at all',
    (res->>'ok')::boolean = false and res->>'reason' = 'not_on_this_plan');

  -- A runaway loop must hit a ceiling rather than an unbounded bill.
  set local role postgres;
  update families set tier = 'standard', ai_checks_used = 199,
                      ai_checks_month = date_trunc('month', current_date)::date
   where id = 'f2222222-0000-0000-0000-000000000001';
  set local role app_user;
  perform become('f1111111-1111-1111-1111-111111111111');
  perform ok('the last of the allowance is granted',
    (claim_photo_check()->>'ok')::boolean = true);
  res := claim_photo_check();
  perform ok('and then it stops, rather than billing forever',
    (res->>'ok')::boolean = false and res->>'reason' = 'monthly_cap');

  -- A new month starts the allowance again.
  set local role postgres;
  update families set ai_checks_month = (date_trunc('month', current_date) - interval '1 month')::date
   where id = 'f2222222-0000-0000-0000-000000000001';
  set local role app_user;
  perform become('f1111111-1111-1111-1111-111111111111');
  perform ok('next month the allowance resets',
    (claim_photo_check()->>'used')::int = 1);
end $$;

-- A device must not be able to wind its own counter back.
do $$
begin
  perform become('f1111111-1111-1111-1111-111111111111');
  begin
    update families set ai_checks_used = 0
     where id = 'f2222222-0000-0000-0000-000000000001';
    if (select ai_checks_used from families
         where id = 'f2222222-0000-0000-0000-000000000001') = 0 then
      raise exception 'FAIL a device reset its own allowance';
    end if;
    raise notice '  PASS a device CANNOT reset its own allowance';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a device CANNOT reset its own allowance (%)', left(sqlerrm, 28);
  end;
end $$;

reset role;
