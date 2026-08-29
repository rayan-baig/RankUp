-- ---------------------------------------------------------------------------
-- Push subscriptions are capabilities: whoever holds an endpoint can make that
-- phone buzz. These checks are about making sure nobody can collect them.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'n-parent@example.com'),
  ('b3333333-3333-3333-3333-333333333333', null);
insert into families (id, name) values ('b2222222-0000-0000-0000-000000000001', 'Notify Family');
insert into parents (user_id, family_id, name) values
  ('b1111111-1111-1111-1111-111111111111', 'b2222222-0000-0000-0000-000000000001', 'Nina');
select seed_consent('b2222222-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111');

insert into kids (id, family_id, user_id, name) values
  ('b4444444-0000-0000-0000-000000000001', 'b2222222-0000-0000-0000-000000000001',
   'b3333333-3333-3333-3333-333333333333', 'Nico');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
-- The blanket grant above re-opens the billing columns; lock them again.
select lock_billing_columns();

set role app_user;

do $$
declare res jsonb;
begin
  perform become('b1111111-1111-1111-1111-111111111111');
  res := save_push_subscription('https://push.example/parent-1', '{"p256dh":"x","auth":"y"}'::jsonb);
  perform ok('a parent device can register itself', (res->>'ok')::boolean and res->>'role' = 'parent');

  perform become('b3333333-3333-3333-3333-333333333333');
  res := save_push_subscription('https://push.example/kid-1', '{"p256dh":"x","auth":"y"}'::jsonb);
  perform ok('a kid device registers as a kid', (res->>'ok')::boolean and res->>'role' = 'kid');

  perform ok('nobody can list subscriptions from a browser',
    (select count(*) from push_subscriptions) = 0);

  begin
    perform push_targets('b2222222-0000-0000-0000-000000000001', 'parent');
    raise exception 'FAIL a browser caller read push endpoints';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a browser caller CANNOT read push endpoints (%)', left(sqlerrm, 34);
  end;

  -- Removing only ever affects your own device.
  perform become('b3333333-3333-3333-3333-333333333333');
  perform delete_push_subscription('https://push.example/parent-1');
  set local role postgres;
  perform ok('one device CANNOT unregister another',
    exists (select 1 from push_subscriptions where endpoint = 'https://push.example/parent-1'));
  set local role app_user;

  perform delete_push_subscription('https://push.example/kid-1');
  set local role postgres;
  perform ok('a device can unregister itself',
    not exists (select 1 from push_subscriptions where endpoint = 'https://push.example/kid-1'));

  perform ok('the server can look up who to notify',
    (select count(*) from push_targets('b2222222-0000-0000-0000-000000000001', 'parent')) = 1);
  set local role app_user;
end $$;

reset role;
