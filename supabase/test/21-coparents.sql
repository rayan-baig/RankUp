-- ---------------------------------------------------------------------------
-- A second adult in the family.
--
-- The rules worth having a test for are the ones about power: who can invite,
-- who can remove whom, and what a second adult can do to the first. A family
-- with two grown-ups in it is a family where one of them can now be locked out
-- by the other, and that must not be possible from a browser.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('6b111111-1111-1111-1111-111111111111', 'coparent-owner@example.com'),
  ('6b111111-1111-1111-1111-111111111112', 'coparent-second@example.com'),
  ('6b111111-1111-1111-1111-111111111113', 'coparent-stranger@example.com'),
  ('6b111111-1111-1111-1111-111111111114', 'coparent-third@example.com');

insert into families (id, name) values
  ('6b222222-0000-0000-0000-000000000001', 'The Two-House Family'),
  ('6b222222-0000-0000-0000-000000000002', 'Some Other Family');

insert into parents (user_id, family_id, name, is_owner) values
  ('6b111111-1111-1111-1111-111111111111', '6b222222-0000-0000-0000-000000000001', 'Owner', true),
  ('6b111111-1111-1111-1111-111111111113', '6b222222-0000-0000-0000-000000000002', 'Stranger', true);

select seed_consent('6b222222-0000-0000-0000-000000000001', '6b111111-1111-1111-1111-111111111111');

insert into kids (id, family_id, name) values
  ('6b333333-0000-0000-0000-000000000001', '6b222222-0000-0000-0000-000000000001', 'Kit');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- inviting ----------
set role app_user;
do $$
declare res jsonb; code text;
begin
  perform become('6b111111-1111-1111-1111-111111111111');

  res := create_parent_invite();
  perform ok('a parent can invite another adult', (res->>'ok')::boolean = true,
             coalesce(res->>'reason', '?'));
  code := res->>'code';
  perform ok('the code is six readable characters',
    code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$', code);

  -- A supporter is a different thing and its read rules are not written yet.
  -- Better a refusal than handing a stranger a family's proof photos.
  res := create_parent_invite('supporter');
  perform ok('supporter invitations are refused until the supporter side exists',
    (res->>'ok')::boolean = false and res->>'reason' = 'role_not_available');

  perform ok('and the invitation shows up for the family',
    (family_adults()->'invites'->0->>'code') = code);
end $$;

-- ---------- joining ----------
do $$
declare res jsonb; code text;
begin
  set local role postgres;
  select c.code into code from parent_invites c
   where family_id = '6b222222-0000-0000-0000-000000000001' and claimed_at is null;
  set local role app_user;

  -- A wrong code tells you nothing about whether it exists.
  perform become('6b111111-1111-1111-1111-111111111112');
  res := claim_parent_invite('ZZZZZZ', 'Second');
  perform ok('a code nobody owns is refused',
    (res->>'ok')::boolean = false and res->>'reason' = 'no_such_code');

  res := claim_parent_invite(code, 'Second');
  perform ok('the right code puts them in the family', (res->>'ok')::boolean = true,
             coalesce(res->>'reason', '?'));
  perform ok('and they land in the RIGHT family',
    res->>'family_id' = '6b222222-0000-0000-0000-000000000001');

  -- One-time use, like every other code in this app.
  perform become('6b111111-1111-1111-1111-111111111114');
  res := claim_parent_invite(code, 'Third');
  perform ok('the same invitation cannot be used twice',
    (res->>'ok')::boolean = false and res->>'reason' = 'already_used');

  -- Somebody who already has a family of their own.
  perform become('6b111111-1111-1111-1111-111111111113');
  res := claim_parent_invite(code, 'Stranger');
  perform ok('a parent of another family cannot join this one',
    (res->>'ok')::boolean = false and res->>'reason' = 'already_in_family');
end $$;

-- ---------- what the second parent can actually do ----------
do $$
declare v_sub uuid;
begin
  set local role postgres;
  insert into quests (id, family_id, kid_id, title, xp, done_means)
  values ('6b444444-0000-0000-0000-000000000001', '6b222222-0000-0000-0000-000000000001',
          '6b333333-0000-0000-0000-000000000001', 'Sweep the step', 20, 'No leaves');
  insert into submissions (id, family_id, quest_id, kid_id, status)
  values ('6b555555-0000-0000-0000-000000000001', '6b222222-0000-0000-0000-000000000001',
          '6b444444-0000-0000-0000-000000000001', '6b333333-0000-0000-0000-000000000001', 'pending')
  returning id into v_sub;
  set local role app_user;

  -- The whole point: the second parent is a parent.
  perform become('6b111111-1111-1111-1111-111111111112');
  perform approve_submission(v_sub, 20, 4, 'well done');

  set local role postgres;
  perform ok('the second parent can approve a chore, which is the point',
    (select status from submissions where id = v_sub) = 'approved');
  perform ok('and the child was actually paid',
    (select xp from kids where id = '6b333333-0000-0000-0000-000000000001') = 20);
  set local role app_user;

  perform become('6b111111-1111-1111-1111-111111111112');
  perform ok('both adults are listed',
    jsonb_array_length(family_adults()->'adults') = 2);
end $$;

-- ---------- and what they cannot ----------
do $$
declare res jsonb; owner_id uuid;
begin
  set local role postgres;
  select id into owner_id from parents
   where user_id = '6b111111-1111-1111-1111-111111111111';
  set local role app_user;

  perform become('6b111111-1111-1111-1111-111111111112');

  res := remove_adult(owner_id);
  perform ok('a second parent cannot remove the owner',
    (res->>'ok')::boolean = false and res->>'reason' = 'not_the_owner');

  -- The policy, not the function: a browser writing the table directly.
  begin
    delete from parents where id = owner_id;
    if (select count(*) from parents
         where family_id = '6b222222-0000-0000-0000-000000000001') < 2 then
      raise exception 'FAIL a second parent deleted the owner straight from the table';
    end if;
    raise notice '  PASS deleting the owner from the table does nothing';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS deleting the owner from the table is refused (%)', left(sqlerrm, 40);
  end;

  -- Promoting yourself is the other way to take over a household.
  begin
    update parents set is_owner = true where user_id = auth.uid();
    if (select is_owner from parents where user_id = auth.uid()) then
      raise exception 'FAIL a second parent made themselves the owner';
    end if;
    raise notice '  PASS making yourself the owner does nothing';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS making yourself the owner is refused (%)', left(sqlerrm, 40);
  end;

  -- Editing your own name is the one thing that should work.
  update parents set name = 'Second Parent' where user_id = auth.uid();
  perform ok('but they can change their own name',
    (select name from parents where user_id = auth.uid()) = 'Second Parent');
end $$;

-- ---------- the owner can remove them ----------
do $$
declare res jsonb; second_id uuid;
begin
  set local role postgres;
  select id into second_id from parents
   where user_id = '6b111111-1111-1111-1111-111111111112';
  set local role app_user;

  perform become('6b111111-1111-1111-1111-111111111111');
  res := remove_adult(second_id);
  perform ok('the owner can remove a second adult', (res->>'ok')::boolean = true,
             coalesce(res->>'reason', '?'));

  res := remove_adult((select id from parents where user_id = auth.uid()));
  perform ok('and cannot remove themselves, leaving nobody in charge',
    (res->>'ok')::boolean = false and res->>'reason' = 'cannot_remove_owner');
end $$;

-- ---------- the cap, and guessing ----------
do $$
declare res jsonb; i int; code text;
begin
  perform become('6b111111-1111-1111-1111-111111111111');

  -- One adult plus five live invitations is six seats.
  for i in 1..5 loop
    res := create_parent_invite();
    perform ok('invitation ' || i || ' of five is allowed', (res->>'ok')::boolean = true,
               coalesce(res->>'reason', '?'));
  end loop;
  res := create_parent_invite();
  perform ok('a seventh seat is refused, so a family cannot become a classroom',
    (res->>'ok')::boolean = false and res->>'reason' = 'too_many_adults');

  -- Guessing is budgeted against the account, not the code, so walking the
  -- space does not work even against codes that do not exist.
  perform become('6b111111-1111-1111-1111-111111111114');
  for i in 1..10 loop
    res := claim_parent_invite('QQQQQ' || substr('23456789', 1 + (i % 8), 1), 'Guesser');
  end loop;
  perform ok('ten wrong guesses stop the account guessing',
    (res->>'ok')::boolean = false and res->>'reason' = 'too_many');
end $$;

-- ---------- a browser cannot reach past the functions ----------
do $$
begin
  perform become('6b111111-1111-1111-1111-111111111111');
  perform ok('the invitations table is not readable from a browser',
    (select count(*) from parent_invites) = 0);
end $$;

set role postgres;
