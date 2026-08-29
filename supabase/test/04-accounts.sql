-- ---------------------------------------------------------------------------
-- Signing up: the first family a brand-new account creates.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'newcomer@example.com'),
  ('e2222222-2222-2222-2222-222222222222', 'second@example.com');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
-- The blanket grant above re-opens the billing columns; lock them again.
select lock_billing_columns();

set role app_user;

do $$
declare res jsonb; fam uuid;
begin
  perform become(null);
  begin
    perform create_family('Nobody', 'Nobody');
    raise exception 'FAIL a signed-out caller created a family';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a signed-out caller CANNOT create a family';
  end;

  perform become('e1111111-1111-1111-1111-111111111111');
  res := create_family('The Newcomers', 'Alex');
  perform ok('a new account can create its family', (res->>'ok')::boolean = true);
  fam := (res->>'family_id')::uuid;

  perform ok('the creator is a parent of it',
    exists (select 1 from parents where user_id = 'e1111111-1111-1111-1111-111111111111'
              and family_id = fam));

  res := create_family('Another', 'Alex');
  perform ok('creating a second family is refused', (res->>'ok')::boolean = false);

  -- A second, unrelated account must not see any of it.
  perform become('e2222222-2222-2222-2222-222222222222');
  perform ok('an unrelated account sees none of that family',
    (select count(*) from families where id = fam) = 0);
end $$;

reset role;
