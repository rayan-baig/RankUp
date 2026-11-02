-- ---------------------------------------------------------------------------
-- A deleted family's Stripe subscription.
--
-- The claim: deleting the account cannot lose the subscription. The deletion
-- queues it for cancellation in the same transaction that removes the family,
-- the queue holds no family id and nothing a browser can read, a row is done
-- only when the server says Stripe confirmed, and one that waits is retried,
-- reported, and never cleaned away. The Stripe calls themselves are in
-- tests/api.mjs, against a stand-in Stripe.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('e3011111-1111-4111-8111-111111111111', 'paying-deleter@example.com'),
  ('e3022222-2222-4222-8222-222222222222', 'free-deleter@example.com'),
  ('e3033333-3333-4333-8333-333333333333', 'still-here@example.com');
insert into families (id, name, tier, subscription_status, stripe_customer_id, stripe_subscription_id) values
  ('e3010000-0000-4000-8000-0000000000f1', 'Paying Then Deleting', 'elite', 'active', 'cus_sql_deleter', 'sub_sql_deleter'),
  ('e3020000-0000-4000-8000-0000000000f2', 'Never Paid', 'starter', 'none', null, null),
  ('e3030000-0000-4000-8000-0000000000f3', 'Still Here', 'standard', 'active', 'cus_sql_present', 'sub_sql_present');
insert into parents (user_id, family_id, name) values
  ('e3011111-1111-4111-8111-111111111111', 'e3010000-0000-4000-8000-0000000000f1', 'Payer'),
  ('e3022222-2222-4222-8222-222222222222', 'e3020000-0000-4000-8000-0000000000f2', 'Free'),
  ('e3033333-3333-4333-8333-333333333333', 'e3030000-0000-4000-8000-0000000000f3', 'Here');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;

do $$
declare res jsonb;
begin
  perform become('e3011111-1111-4111-8111-111111111111');
  res := delete_family_account('not yet');
  perform ok('a deletion without the typed confirmation is refused', res->>'reason' = 'confirmation_required');
end $$;
reset role;
do $$
begin
  perform ok('(nothing was queued by the refusal)',
    not exists (select 1 from billing_cancellations where family_key = billing_family_key('e3010000-0000-4000-8000-0000000000f1')));
end $$;
set role app_user;

-- ---------- the deletion queues the subscription, in the same call ----------
do $$
declare res jsonb;
begin
  perform become('e3011111-1111-4111-8111-111111111111');
  res := delete_family_account('DELETE');
  perform ok('a paying family can delete its account', (res->>'ok')::boolean, res::text);
  perform ok('and is told its billing is queued for cancellation, with its own family id for the server',
    res->>'billing' = 'cancel_queued' and res->>'family_id' = 'e3010000-0000-4000-8000-0000000000f1', res::text);
end $$;

-- ---------- a browser can see none of it ----------
do $$
begin
  perform become('e3033333-3333-4333-8333-333333333333');
  perform ok('a signed-in parent sees no row of the queue, even with table grants',
    (select count(*) from billing_cancellations) = 0);
  begin
    perform pending_billing_cancellations();
    raise exception 'FAIL a browser listed the Stripe ids waiting to be cancelled';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a browser CANNOT list what is waiting to be cancelled (%)', left(sqlerrm, 30);
  end;
  begin
    perform finish_billing_cancellation(1, true);
    raise exception 'FAIL a browser marked a cancellation done';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a browser CANNOT mark a cancellation done (%)', left(sqlerrm, 30);
  end;
  begin
    perform billing_family_gone('e3010000-0000-4000-8000-0000000000f1', null, 'sub_x', true);
    raise exception 'FAIL a browser queued a cancellation';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a browser CANNOT queue a cancellation (%)', left(sqlerrm, 30);
  end;
end $$;
reset role;

-- ---------- what the queue holds ----------
do $$
declare v billing_cancellations; v_list jsonb;
begin
  perform ok('the family is gone', not exists (select 1 from families where id = 'e3010000-0000-4000-8000-0000000000f1'));
  select * into v from billing_cancellations where stripe_subscription_id = 'sub_sql_deleter';
  perform ok('its subscription and customer are queued', v.id is not null and v.stripe_customer_id = 'cus_sql_deleter'
    and v.done_at is null and v.attempts = 0);
  perform ok('under a fingerprint, not the family id',
    v.family_key = billing_family_key('e3010000-0000-4000-8000-0000000000f1')
    and to_jsonb(v)::text not like '%e3010000-0000-4000-8000-0000000000f1%');

  v_list := pending_billing_cancellations('e3010000-0000-4000-8000-0000000000f1'::uuid);
  perform ok('the server finds it by the family id the deletion gave it',
    jsonb_array_length(v_list) = 1 and v_list->0->>'subscription_id' = 'sub_sql_deleter'
    and v_list->0->>'customer_id' = 'cus_sql_deleter', v_list::text);
  perform ok('or by the Stripe customer',
    jsonb_array_length(pending_billing_cancellations(null, 'cus_sql_deleter')) = 1);
  perform ok('and in the list of everything waiting',
    pending_billing_cancellations() @> jsonb_build_array(jsonb_build_object('subscription_id', 'sub_sql_deleter')));

  -- Stripe not answering: the try is recorded and the row waits.
  perform finish_billing_cancellation(v.id, false, 'Stripe is not answering');
  select * into v from billing_cancellations where id = v.id;
  perform ok('a failed try keeps it waiting, with what went wrong',
    v.done_at is null and v.attempts = 1 and v.last_error = 'Stripe is not answering');
  perform ok('so the next run still finds it',
    jsonb_array_length(pending_billing_cancellations('e3010000-0000-4000-8000-0000000000f1'::uuid)) = 1);
end $$;

-- ---------- waiting more than a day is not healthy ----------
do $$
declare v jsonb;
begin
  update billing_cancellations set queued_at = now() - interval '2 days' where stripe_subscription_id = 'sub_sql_deleter';
  v := health_snapshot();
  perform ok('health reports a cancellation still waiting after a day, and is not ok',
    (v->>'billing_cancellations_overdue')::int = 1 and (v->>'ok')::boolean = false, v::text);
  perform run_retention(14, 90, 2);
  perform ok('the daily clean-up never throws away one still waiting',
    exists (select 1 from billing_cancellations where stripe_subscription_id = 'sub_sql_deleter' and done_at is null));
end $$;

-- ---------- Stripe confirms ----------
do $$
declare v_id bigint; v billing_cancellations;
begin
  select id into v_id from billing_cancellations where stripe_subscription_id = 'sub_sql_deleter';
  perform finish_billing_cancellation(v_id, true);
  select * into v from billing_cancellations where id = v_id;
  perform ok('confirmed: done, with no error left', v.done_at is not null and v.last_error is null and v.attempts = 2);
  perform ok('and no longer waiting', jsonb_array_length(pending_billing_cancellations()) = 0
    and (health_snapshot()->>'billing_cancellations_overdue')::int = 0);
  perform finish_billing_cancellation(v_id, false, 'late failure from a slower run');
  perform ok('a slower run that failed afterwards cannot un-do a confirmed cancellation',
    (select done_at is not null and last_error is null from billing_cancellations where id = v_id));
end $$;

-- ---------- a family that never paid ----------
set role app_user;
do $$
declare res jsonb;
begin
  perform become('e3022222-2222-4222-8222-222222222222');
  res := delete_family_account('DELETE');
  perform ok('a family that never paid deletes with nothing to cancel',
    (res->>'ok')::boolean and res->>'billing' = 'none' and not res ? 'family_id', res::text);
end $$;
reset role;
do $$
begin
  perform ok('it leaves only a marker, already done, with no Stripe ids',
    (select count(*) from billing_cancellations
      where family_key = billing_family_key('e3020000-0000-4000-8000-0000000000f2')
        and done_at is not null and stripe_customer_id is null and stripe_subscription_id is null) = 1);
  perform ok('which is never listed as work to do',
    jsonb_array_length(pending_billing_cancellations('e3020000-0000-4000-8000-0000000000f2'::uuid)) = 0);
end $$;

-- ---------- what the webhook is told ----------
do $$
declare v_fate text;
begin
  perform ok('a family that exists is "present"',
    billing_family_gone('e3030000-0000-4000-8000-0000000000f3', 'cus_sql_present', 'sub_sql_present', true) = 'present');
  perform ok('as is one found only by its customer',
    billing_family_gone(null, 'cus_sql_present', null, true) = 'present');
  perform ok('a family id nobody ever had is "unknown", and nothing is queued',
    billing_family_gone('e30fffff-0000-4000-8000-000000000000', 'cus_sql_stranger', 'sub_sql_stranger', true) = 'unknown'
    and not exists (select 1 from billing_cancellations where stripe_subscription_id = 'sub_sql_stranger'));

  -- A checkout page opened before the deletion and paid after it: a new
  -- subscription for a family that no longer exists.
  v_fate := billing_family_gone('e3020000-0000-4000-8000-0000000000f2', 'cus_sql_late', 'sub_sql_late', true);
  perform ok('a deleted family is "deleted"', v_fate = 'deleted');
  perform ok('and a live subscription for it is queued to be cancelled',
    jsonb_array_length(pending_billing_cancellations('e3020000-0000-4000-8000-0000000000f2'::uuid)) = 1
    and pending_billing_cancellations('e3020000-0000-4000-8000-0000000000f2'::uuid)->0->>'subscription_id' = 'sub_sql_late');
  perform ok('news about it is recognised by its customer too',
    billing_family_gone(null, 'cus_sql_late', null, false) = 'deleted');
  perform billing_family_gone('e3020000-0000-4000-8000-0000000000f2', 'cus_sql_late', 'sub_sql_late', true);
  perform ok('the same news twice queues it once',
    (select count(*) from billing_cancellations where stripe_subscription_id = 'sub_sql_late') = 1);
  perform billing_family_gone('e3020000-0000-4000-8000-0000000000f2', 'cus_sql_late', 'sub_sql_ended', false);
  perform ok('a subscription that has already ended is not queued',
    not exists (select 1 from billing_cancellations where stripe_subscription_id = 'sub_sql_ended'));

  -- Stripe saying a subscription is live after it was confirmed cancelled
  -- (news out of order, or a cancellation that did not hold): tried again.
  perform finish_billing_cancellation((select id from billing_cancellations where stripe_subscription_id = 'sub_sql_late'), true);
  perform billing_family_gone('e3020000-0000-4000-8000-0000000000f2', 'cus_sql_late', 'sub_sql_late', true);
  perform ok('a "done" subscription that Stripe says is still live goes back on the list',
    (select done_at is null from billing_cancellations where stripe_subscription_id = 'sub_sql_late'));
  perform finish_billing_cancellation((select id from billing_cancellations where stripe_subscription_id = 'sub_sql_late'), true);
end $$;

-- ---------- how long any of it is kept ----------
do $$
declare v_marker bigint; v_recent bigint; v_old bigint;
begin
  insert into billing_cancellations (family_key, done_at, queued_at)
  values ('marker-old', now() - interval '8 days', now() - interval '8 days') returning id into v_marker;
  insert into billing_cancellations (family_key, stripe_customer_id, stripe_subscription_id, done_at, queued_at)
  values ('done-recent', 'cus_r', 'sub_r', now() - interval '10 days', now() - interval '10 days') returning id into v_recent;
  insert into billing_cancellations (family_key, stripe_customer_id, stripe_subscription_id, done_at, queued_at)
  values ('done-old', 'cus_o', 'sub_o', now() - interval '31 days', now() - interval '40 days') returning id into v_old;
  update billing_cancellations set queued_at = now() - interval '90 days'
   where family_key = billing_family_key('e3010000-0000-4000-8000-0000000000f1');
  insert into billing_cancellations (family_key, stripe_subscription_id, queued_at)
  values ('still-waiting', 'sub_w', now() - interval '90 days');

  perform run_retention(14, 90, 2);
  perform ok('a marker goes after a week', not exists (select 1 from billing_cancellations where id = v_marker));
  perform ok('a confirmed cancellation is kept for 30 days', exists (select 1 from billing_cancellations where id = v_recent));
  perform ok('and then goes', not exists (select 1 from billing_cancellations where id = v_old));
  perform ok('one still waiting is kept however old it is',
    exists (select 1 from billing_cancellations where family_key = 'still-waiting'));
  perform ok('(and is reported)', (health_snapshot()->>'billing_cancellations_overdue')::int = 1);
  delete from billing_cancellations where family_key in ('still-waiting', 'done-recent');
end $$;
