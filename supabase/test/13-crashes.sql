-- ---------------------------------------------------------------------------
-- Crash reports.
--
-- The thing that must be true: a device stuck in a crash loop cannot fill the
-- database with reports about it. A reporting path that can flood the table is
-- a worse bug than whatever it is reporting.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('8e111111-0000-0000-0000-000000000001', 'crash@example.com');
insert into families (id, name) values ('8e222222-0000-0000-0000-000000000001', 'The Fallers');
insert into parents (user_id, family_id, name) values
  ('8e111111-0000-0000-0000-000000000001', '8e222222-0000-0000-0000-000000000001', 'Cy');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
revoke all on crash_reports from anon, authenticated;

set role app_user;
do $$
declare v jsonb; v_kept int;
begin
  perform become('8e111111-0000-0000-0000-000000000001');

  v := record_crash('/kid/shop', 'rewards.map is not a function', 'at KidShop', 'Mozilla/5.0');
  perform ok('a crash is recorded', (v->>'recorded')::boolean);

  -- A device in a loop: eleven more attempts, only nine of which may land.
  for i in 1..11 loop
    v := record_crash('/kid/shop', 'rewards.map is not a function', '', '');
  end loop;
  perform ok('the eleventh is refused rather than stored',
    (v->>'recorded')::boolean = false and (v->>'reason') = 'rate_limited');
  perform ok('but it still answers ok, so a crash loop is not also an error loop',
    (v->>'ok')::boolean);

  -- A parent must not be able to read other families' crashes, or their own.
  begin
    perform 1 from crash_reports limit 1;
    raise exception 'FAIL a parent read the crash table';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT read the crash table (%)', left(sqlerrm, 30);
  end;
end $$;

reset role;
do $$
begin
  perform ok('exactly ten rows were kept for the hour',
    (select count(*) from crash_reports
      where family_id = '8e222222-0000-0000-0000-000000000001') = 10);
  perform ok('and the message was stored as sent',
    (select message from crash_reports
      where family_id = '8e222222-0000-0000-0000-000000000001' limit 1)
    = 'rewards.map is not a function');
end $$;

-- ---------- signed out, which is when the worst crashes happen ----------
set role app_user;
do $$
declare v jsonb;
begin
  perform become(null);
  v := record_crash('/welcome', 'boom before sign-in', '', '');
  perform ok('a crash before anybody signs in is still recorded',
    (v->>'recorded')::boolean);
end $$;
reset role;
do $$
begin
  perform ok('and it is filed against no family',
    (select count(*) from crash_reports where family_id is null) = 1);
end $$;

-- ---------- retention sweeps them ----------
do $$
declare v jsonb;
begin
  update crash_reports set created_at = now() - interval '200 days'
   where family_id = '8e222222-0000-0000-0000-000000000001';
  v := run_retention(14, 90, 2);
  perform ok('retention clears old crash reports too',
    (v->>'crashes_deleted')::int = 10);
  perform ok('and leaves the recent one alone',
    (select count(*) from crash_reports) = 1);
end $$;
