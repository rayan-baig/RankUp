-- ---------------------------------------------------------------------------
-- Pocket money.
--
-- This is the one number in the app that leaves the app: somebody actually
-- hands it over. So the tests here are less about arithmetic and more about
-- who can write a line — a child who can add to their own pot is a child
-- inventing money their parent then pays.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('7c111111-1111-1111-1111-111111111111', 'pocket-parent@example.com'),
  ('7c111111-1111-1111-1111-111111111112', 'pocket-kid@example.com'),
  ('7c111111-1111-1111-1111-111111111113', 'pocket-other@example.com');

insert into families (id, name) values
  ('7c222222-0000-0000-0000-000000000001', 'The Paying Family'),
  ('7c222222-0000-0000-0000-000000000002', 'Another Family');

insert into parents (user_id, family_id, name) values
  ('7c111111-1111-1111-1111-111111111111', '7c222222-0000-0000-0000-000000000001', 'Pat'),
  ('7c111111-1111-1111-1111-111111111113', '7c222222-0000-0000-0000-000000000002', 'Nosy');

select seed_consent('7c222222-0000-0000-0000-000000000001', '7c111111-1111-1111-1111-111111111111');
select seed_consent('7c222222-0000-0000-0000-000000000002', '7c111111-1111-1111-1111-111111111113');

insert into kids (id, family_id, user_id, name) values
  ('7c333333-0000-0000-0000-000000000001', '7c222222-0000-0000-0000-000000000001',
   '7c111111-1111-1111-1111-111111111112', 'Mo');

-- One paid chore, one unpaid one. Most chores are not paid and that must stay
-- the boring default.
insert into quests (id, family_id, kid_id, title, xp, pence, done_means) values
  ('7c444444-0000-0000-0000-000000000001', '7c222222-0000-0000-0000-000000000001',
   '7c333333-0000-0000-0000-000000000001', 'Wash the car', 55, 500, 'No streaks'),
  ('7c444444-0000-0000-0000-000000000002', '7c222222-0000-0000-0000-000000000001',
   '7c333333-0000-0000-0000-000000000001', 'Make your bed', 15, 0, 'Duvet flat');

insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('7c555555-0000-0000-0000-000000000001', '7c222222-0000-0000-0000-000000000001',
   '7c444444-0000-0000-0000-000000000001', '7c333333-0000-0000-0000-000000000001', 'pending'),
  ('7c555555-0000-0000-0000-000000000002', '7c222222-0000-0000-0000-000000000001',
   '7c444444-0000-0000-0000-000000000002', '7c333333-0000-0000-0000-000000000001', 'pending');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- approving a paid chore pays it ----------
set role app_user;
do $$
begin
  perform become('7c111111-1111-1111-1111-111111111111');
  perform approve_submission('7c555555-0000-0000-0000-000000000001', 55, 11, 'spotless');

  set local role postgres;
  perform ok('approving a paid chore puts the money in the pot',
    (select coalesce(sum(pence), 0) from allowance_entries
      where kid_id = '7c333333-0000-0000-0000-000000000001') = 500);
  perform ok('and the line says which chore it was',
    (select note from allowance_entries
      where submission_id = '7c555555-0000-0000-0000-000000000001') = 'Wash the car');
  set local role app_user;

  -- The ordinary case: a chore worth no money leaves no line at all.
  perform become('7c111111-1111-1111-1111-111111111111');
  perform approve_submission('7c555555-0000-0000-0000-000000000002', 15, 3, '');
  set local role postgres;
  perform ok('a chore worth nothing writes no line',
    (select count(*) from allowance_entries
      where kid_id = '7c333333-0000-0000-0000-000000000001') = 1);
  set local role app_user;
end $$;

-- ---------- and pays it exactly once ----------
--
-- The important one. An outbox that replays, two parents tapping at the same
-- moment, a retried request: none of them may pay a second time.
do $$
begin
  set local role postgres;
  perform credit_allowance('7c555555-0000-0000-0000-000000000001');
  perform credit_allowance('7c555555-0000-0000-0000-000000000001');
  perform credit_allowance('7c555555-0000-0000-0000-000000000001');
  perform ok('crediting the same chore again pays nothing more',
    (select coalesce(sum(pence), 0) from allowance_entries
      where kid_id = '7c333333-0000-0000-0000-000000000001') = 500);
  set local role app_user;
end $$;

-- ---------- paying it out ----------
do $$
declare res jsonb;
begin
  perform become('7c111111-1111-1111-1111-111111111111');

  res := record_payout('7c333333-0000-0000-0000-000000000001', 200, 'cash');
  perform ok('a parent can record handing money over', (res->>'ok')::boolean = true,
             coalesce(res->>'reason', '?'));
  perform ok('and the pot goes down by exactly that', (res->>'pot')::int = 300);

  -- The slipped decimal point. £50 typed where £5 was meant.
  res := record_payout('7c333333-0000-0000-0000-000000000001', 5000, 'oops');
  perform ok('paying out more than the pot is refused',
    (res->>'ok')::boolean = false and res->>'reason' = 'more_than_the_pot');

  res := record_payout('7c333333-0000-0000-0000-000000000001', 0, '');
  perform ok('nor is nothing an amount',
    (res->>'ok')::boolean = false and res->>'reason' = 'not_an_amount');

  res := record_payout('7c333333-0000-0000-0000-000000000001', -500, 'sneaky');
  perform ok('nor is a negative one, which would be a payout in reverse',
    (res->>'ok')::boolean = false and res->>'reason' = 'not_an_amount');

  res := record_gift('7c333333-0000-0000-0000-000000000001', 1000, 'birthday');
  perform ok('a gift is its own line', (res->>'ok')::boolean = true);
  perform ok('and the pot knows about it',
    (allowance_summary()->'pots'->0->>'pence')::int = 1300);
end $$;

-- ---------- what a child can and cannot do ----------
do $$
declare res jsonb;
begin
  perform become('7c111111-1111-1111-1111-111111111112');

  -- The whole point of showing it to them.
  perform ok('a child can see what they are owed',
    (allowance_summary()->'pots'->0->>'pence')::int = 1300);

  -- And the whole point of the policy.
  begin
    insert into allowance_entries (family_id, kid_id, pence, kind, note)
    values ('7c222222-0000-0000-0000-000000000001',
            '7c333333-0000-0000-0000-000000000001', 9999, 'gift', 'i earned this');
    raise exception 'FAIL a child paid themselves';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a child CANNOT pay themselves (%)', left(sqlerrm, 40);
  end;

  begin
    perform record_payout('7c333333-0000-0000-0000-000000000001', 100, 'me');
    raise exception 'FAIL a child recorded a payout';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a child CANNOT record a payout (%)', left(sqlerrm, 40);
  end;

  begin
    perform record_gift('7c333333-0000-0000-0000-000000000001', 100, 'me');
    raise exception 'FAIL a child gifted themselves';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a child CANNOT gift themselves (%)', left(sqlerrm, 40);
  end;

  -- Raising the price of their own chore would be the long way round to the
  -- same thing, and the existing quest policy should already stop it.
  update quests set pence = 10000 where id = '7c444444-0000-0000-0000-000000000002';
  set local role postgres;
  perform ok('a child CANNOT reprice their own chore',
    (select pence from quests where id = '7c444444-0000-0000-0000-000000000002') = 0);
  set local role app_user;
end $$;

-- ---------- and what another family can ----------
do $$
begin
  perform become('7c111111-1111-1111-1111-111111111113');
  perform ok('another family sees none of it',
    (select count(*) from allowance_entries) = 0);
  perform ok('and their summary is empty rather than somebody else’s',
    jsonb_array_length(allowance_summary()->'entries') = 0);
end $$;

-- ---------- the cap on a single chore ----------
set role postgres;
do $$
begin
  begin
    update quests set pence = 999999 where id = '7c444444-0000-0000-0000-000000000001';
    raise exception 'FAIL a chore was priced at ten thousand pounds';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a slipped finger cannot price a chore at £9999 (%)', left(sqlerrm, 40);
  end;
end $$;
