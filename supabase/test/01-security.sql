-- ---------------------------------------------------------------------------
-- Does the database actually stop what it claims to stop?
--
-- Every check runs as a NON-superuser, because a superuser bypasses row level
-- security and every test would pass for the wrong reason.
--
-- The rules being proved are the ones the whole game rests on: a kid cannot
-- award themselves XP, cannot rewrite what a quest is worth, and cannot see
-- another family's anything.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ok(label text, condition boolean) returns void
language plpgsql as $$
begin
  if condition then raise notice '  PASS %', label;
  else raise exception 'FAIL %', label; end if;
end $$;

-- Becoming a user is just setting the claim auth.uid() reads.
create or replace function become(u uuid) returns void
language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); $$;

-- ---------- fixtures, created as the owner before RLS is exercised ----------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'parent-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'parent-b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'kid-a@example.com');

insert into families (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Family A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Family B');

insert into parents (user_id, family_id, name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Parent A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'Parent B');

insert into kids (id, family_id, user_id, name, xp, coins) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333', 'Ava', 100, 20),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   null, 'Ben', 50, 5);

insert into quests (id, family_id, kid_id, title, xp, done_means) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', 'Make your bed', 30, 'Duvet flat');

insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'pending');

-- Supabase grants these by default; a bare Postgres does not.
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

set role app_user;

-- ---------- a kid may not pay themselves ----------

do $$ begin
  perform become('33333333-3333-3333-3333-333333333333');

  perform ok('a kid can read their own profile',
    (select count(*) from kids where id = 'cccccccc-0000-0000-0000-000000000001') = 1);

  update kids set xp = 999999 where id = 'cccccccc-0000-0000-0000-000000000001';
  perform ok('a kid CANNOT raise their own XP',
    (select xp from kids where id = 'cccccccc-0000-0000-0000-000000000001') = 100);

  update kids set coins = 999999 where id = 'cccccccc-0000-0000-0000-000000000001';
  perform ok('a kid CANNOT mint their own currency',
    (select coins from kids where id = 'cccccccc-0000-0000-0000-000000000001') = 20);

  update quests set xp = 5000 where id = 'eeeeeeee-0000-0000-0000-000000000001';
  perform ok('a kid CANNOT change what a quest is worth',
    (select xp from quests where id = 'eeeeeeee-0000-0000-0000-000000000001') = 30);

  update submissions set status = 'approved', awarded_xp = 5000
    where id = 'ffffffff-0000-0000-0000-000000000001';
  perform ok('a kid CANNOT approve their own submission',
    (select status from submissions where id = 'ffffffff-0000-0000-0000-000000000001') = 'pending');
end $$;

-- ---------- one family cannot see another ----------

do $$ begin
  perform become('11111111-1111-1111-1111-111111111111');

  perform ok('a parent sees their own kid',
    (select count(*) from kids where family_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1);
  perform ok('a parent CANNOT see another family''s kid',
    (select count(*) from kids where family_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0);
  perform ok('a parent CANNOT see another family''s quests',
    (select count(*) from quests where family_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0);
  perform ok('a parent CANNOT see another family at all',
    (select count(*) from families where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0);

  update kids set name = 'Hacked' where id = 'dddddddd-0000-0000-0000-000000000002';
end $$;

do $$ begin
  perform become(null);
  set local role postgres;
  perform ok('a parent CANNOT rename another family''s kid',
    (select name from kids where id = 'dddddddd-0000-0000-0000-000000000002') = 'Ben');
end $$;

-- ---------- approving is the only way XP moves ----------

set role app_user;

do $$
declare v_xp int;
begin
  perform become('33333333-3333-3333-3333-333333333333');
  begin
    perform approve_submission('ffffffff-0000-0000-0000-000000000001', 500, 100, 'sneaky');
    raise exception 'FAIL a kid was able to call approve_submission';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a kid CANNOT call approve_submission (%)', left(sqlerrm, 48);
  end;

  perform become('22222222-2222-2222-2222-222222222222');
  begin
    perform approve_submission('ffffffff-0000-0000-0000-000000000001', 500, 100, 'wrong family');
    raise exception 'FAIL a parent from another family approved it';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent from ANOTHER family cannot approve (%)', left(sqlerrm, 40);
  end;

  perform become('11111111-1111-1111-1111-111111111111');
  perform approve_submission('ffffffff-0000-0000-0000-000000000001', 45, 9, 'nice work');
  select xp into v_xp from kids where id = 'cccccccc-0000-0000-0000-000000000001';
  perform ok('the right parent CAN approve, and XP moves', v_xp = 145);
  perform ok('the quest is marked approved',
    (select status from quests where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'approved');
  perform ok('the streak advanced',
    (select streak_count from kids where id = 'cccccccc-0000-0000-0000-000000000001') = 1);

  begin
    perform approve_submission('ffffffff-0000-0000-0000-000000000001', 45, 9, 'again');
    raise exception 'FAIL the same submission paid out twice';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS the same submission CANNOT pay out twice (%)', left(sqlerrm, 40);
  end;

  select xp into v_xp from kids where id = 'cccccccc-0000-0000-0000-000000000001';
  perform ok('XP is still 145 after the double-approve attempt', v_xp = 145);
end $$;

reset role;
