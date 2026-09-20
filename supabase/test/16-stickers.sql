-- ---------------------------------------------------------------------------
-- The sticker a parent puts on an approved chore.
--
-- A child reads this, so it must not be a field anything can write a sentence
-- into. The column takes the eight the product offers and nothing else.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('5a111111-1111-1111-1111-111111111111', 'sticker-parent@example.com');
insert into families (id, name, tier) values
  ('5a222222-0000-0000-0000-000000000001', 'Sticker Family', 'standard');
insert into parents (user_id, family_id, name) values
  ('5a111111-1111-1111-1111-111111111111', '5a222222-0000-0000-0000-000000000001', 'Stick');
select seed_consent('5a222222-0000-0000-0000-000000000001', '5a111111-1111-1111-1111-111111111111');
insert into kids (id, family_id, name) values
  ('5a444444-0000-0000-0000-000000000001', '5a222222-0000-0000-0000-000000000001', 'Sticky');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;

do $$
declare i int;
begin
  set local role postgres;
  for i in 1..3 loop
    insert into quests (id, family_id, kid_id, title, xp, status)
    values (('5a600000-0000-0000-0000-00000000000' || i)::uuid,
            '5a222222-0000-0000-0000-000000000001', '5a444444-0000-0000-0000-000000000001',
            'Chore ' || i, 20, 'submitted');
    insert into submissions (id, family_id, quest_id, kid_id, status)
    values (('5a700000-0000-0000-0000-00000000000' || i)::uuid,
            '5a222222-0000-0000-0000-000000000001',
            ('5a600000-0000-0000-0000-00000000000' || i)::uuid,
            '5a444444-0000-0000-0000-000000000001', 'pending');
  end loop;
  set local role app_user;

  perform become('5a111111-1111-1111-1111-111111111111');

  perform approve_submission('5a700000-0000-0000-0000-000000000001', 0, 0, '', 'proud');
  perform ok('a sticker from the list is kept',
    (select sticker from submissions where id = '5a700000-0000-0000-0000-000000000001') = 'proud');

  -- Dropped, not refused. A sticker is a nicety; an older phone sending one
  -- this version has never heard of must not cost a child their approval.
  perform approve_submission('5a700000-0000-0000-0000-000000000002', 0, 0, '',
                             'call this number: 555 0101');
  perform ok('anything not on the list is dropped',
    (select sticker from submissions where id = '5a700000-0000-0000-0000-000000000002') is null);
  perform ok('and the approval itself still went through',
    (select status from submissions where id = '5a700000-0000-0000-0000-000000000002') = 'approved');

  perform approve_submission('5a700000-0000-0000-0000-000000000003', 0, 0, '');
  perform ok('approving without one is still perfectly normal',
    (select status from submissions where id = '5a700000-0000-0000-0000-000000000003') = 'approved'
    and (select sticker from submissions where id = '5a700000-0000-0000-0000-000000000003') is null);
end $$;

-- A device writing the column directly is refused by the check constraint, so
-- there is no way round the function either.
do $$
begin
  set local role postgres;
  begin
    update submissions set sticker = 'meet me at the park'
     where id = '5a700000-0000-0000-0000-000000000003';
    raise exception 'FAIL arbitrary text was written into a sticker';
  exception when check_violation then
    raise notice '  PASS the column itself refuses anything off the list';
  end;
  set local role app_user;
end $$;

reset role;
