-- ---------------------------------------------------------------------------
-- Referrals, and the farming they have to survive.
--
-- The whole design rests on one choice — the reward lands on a first APPROVED
-- CHORE, not on a signup — so most of what is checked here is the set of
-- things a determined person would try if it paid on signup instead.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('4a111111-1111-1111-1111-111111111111', 'referrer@example.com'),
  ('4a111111-1111-1111-1111-111111111112', 'invited@example.com'),
  ('4a111111-1111-1111-1111-111111111113', 'oldtimer@example.com');

insert into families (id, name, tier, created_at) values
  ('4a222222-0000-0000-0000-000000000001', 'Referrer Family', 'starter', now()),
  ('4a222222-0000-0000-0000-000000000002', 'Invited Family',  'starter', now()),
  -- Signed up two years ago. Not new, and that matters below.
  ('4a222222-0000-0000-0000-000000000003', 'Old Family', 'starter', now() - interval '2 years');

insert into parents (user_id, family_id, name) values
  ('4a111111-1111-1111-1111-111111111111', '4a222222-0000-0000-0000-000000000001', 'Ref'),
  ('4a111111-1111-1111-1111-111111111112', '4a222222-0000-0000-0000-000000000002', 'Inv'),
  ('4a111111-1111-1111-1111-111111111113', '4a222222-0000-0000-0000-000000000003', 'Old');

select seed_consent('4a222222-0000-0000-0000-000000000001', '4a111111-1111-1111-1111-111111111111');
select seed_consent('4a222222-0000-0000-0000-000000000002', '4a111111-1111-1111-1111-111111111112');
select seed_consent('4a222222-0000-0000-0000-000000000003', '4a111111-1111-1111-1111-111111111113');

insert into kids (id, family_id, name) values
  ('4a333333-0000-0000-0000-000000000002', '4a222222-0000-0000-0000-000000000002', 'Ivy');

insert into quests (id, family_id, kid_id, title, xp, done_means) values
  ('4a444444-0000-0000-0000-000000000001', '4a222222-0000-0000-0000-000000000002',
   '4a333333-0000-0000-0000-000000000002', 'Feed the cat', 20, 'Bowl full'),
  ('4a444444-0000-0000-0000-000000000002', '4a222222-0000-0000-0000-000000000002',
   '4a333333-0000-0000-0000-000000000002', 'Tidy up', 20, 'Floor clear');

insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('4a555555-0000-0000-0000-000000000001', '4a222222-0000-0000-0000-000000000002',
   '4a444444-0000-0000-0000-000000000001', '4a333333-0000-0000-0000-000000000002', 'pending'),
  ('4a555555-0000-0000-0000-000000000002', '4a222222-0000-0000-0000-000000000002',
   '4a444444-0000-0000-0000-000000000002', '4a333333-0000-0000-0000-000000000002', 'pending');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- a code is a code ----------
do $$
declare a text; b text;
begin
  a := referral_code_for('4a222222-0000-0000-0000-000000000001');
  b := referral_code_for('4a222222-0000-0000-0000-000000000002');

  perform ok('a code is six characters', length(a) = 6, a);
  perform ok('from an alphabet with no O/0 or I/1 in it',
    a ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$', a);
  perform ok('two families do not share one', a <> b, a || ' / ' || b);
  perform ok('and asking twice gives the same answer again',
    a = referral_code_for('4a222222-0000-0000-0000-000000000001'), a);
end $$;

-- ---------- claiming ----------
set role app_user;
do $$
declare res jsonb; code text; own text;
begin
  -- Both codes are worked out as the owner: referral_code_for is revoked from
  -- browsers on purpose, and calling it below would prove nothing except that
  -- the revoke is missing.
  set local role postgres;
  code := referral_code_for('4a222222-0000-0000-0000-000000000001');
  own  := referral_code_for('4a222222-0000-0000-0000-000000000002');
  set local role app_user;

  perform become('4a111111-1111-1111-1111-111111111112');
  perform ok('a parent can read their own code, and it is their own',
    my_referral_code() = own, my_referral_code() || ' vs ' || own);

  res := claim_referral(code);
  perform ok('a new family can claim a code', (res->>'ok')::boolean = true);
  perform ok('and is told how long it is worth', (res->>'days')::int = 30);

  -- Every remaining rule is a way this would be farmed.
  res := claim_referral(code);
  perform ok('but only once, ever',
    (res->>'ok')::boolean = false and res->>'reason' = 'already_referred');

  perform become('4a111111-1111-1111-1111-111111111111');
  res := claim_referral(code);
  perform ok('nobody claims their own code',
    (res->>'ok')::boolean = false and res->>'reason' = 'own_code');

  res := claim_referral('ZZZZZZ');
  perform ok('a code nobody owns buys nothing',
    (res->>'ok')::boolean = false and res->>'reason' = 'no_such_code');

  -- The one that turns a growth programme into a discount for people who
  -- already pay: an established household claiming a friend's code.
  perform become('4a111111-1111-1111-1111-111111111113');
  res := claim_referral(code);
  perform ok('a two-year-old household is not a new signup',
    (res->>'ok')::boolean = false and res->>'reason' = 'not_a_new_family');
end $$;

-- ---------- nothing is paid until a chore is finished ----------
set role postgres;
do $$
begin
  perform ok('claiming alone pays the referrer nothing',
    effective_tier('4a222222-0000-0000-0000-000000000001') = 'starter');
  perform ok('and pays the invited family nothing either',
    effective_tier('4a222222-0000-0000-0000-000000000002') = 'starter');
  perform ok('the claim is on file, unqualified',
    (select qualified_at is null from referrals
      where invited_family_id = '4a222222-0000-0000-0000-000000000002'));
end $$;

-- ---------- the first approved chore pays both sides ----------
set role app_user;
do $$
begin
  perform become('4a111111-1111-1111-1111-111111111112');
  perform approve_submission('4a555555-0000-0000-0000-000000000001', 20, 4, 'nice');
end $$;

set role postgres;
do $$
declare ends_first timestamptz;
begin
  perform ok('a finished chore pays the family who invited them',
    effective_tier('4a222222-0000-0000-0000-000000000001') = 'standard');
  perform ok('and the family who arrived',
    effective_tier('4a222222-0000-0000-0000-000000000002') = 'standard');
  perform ok('for the month it promised',
    (select trial_ends_at from families where id = '4a222222-0000-0000-0000-000000000001')
      > now() + interval '29 days');
  perform ok('the referral is marked paid',
    (select qualified_at is not null from referrals
      where invited_family_id = '4a222222-0000-0000-0000-000000000002'));

  -- Idempotence. A household doing chores every day must not mint a month
  -- every day.
  select trial_ends_at into ends_first
    from families where id = '4a222222-0000-0000-0000-000000000001';
  set local role app_user;
  perform become('4a111111-1111-1111-1111-111111111112');
  perform approve_submission('4a555555-0000-0000-0000-000000000002', 20, 4, 'again');
  set local role postgres;
  perform ok('the second chore pays nothing more',
    (select trial_ends_at from families where id = '4a222222-0000-0000-0000-000000000001')
      = ends_first);
end $$;

-- ---------- what a browser may and may not call ----------
set role app_user;
do $$
begin
  perform become('4a111111-1111-1111-1111-111111111111');

  perform ok('a parent can see what their invites have come to',
    (my_referrals()->>'qualified')::int = 1);
  perform ok('and their own code is in it',
    length(my_referrals()->>'code') = 6);

  begin
    perform qualify_referral('4a222222-0000-0000-0000-000000000001');
    raise exception 'FAIL a browser paid itself a referral';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a browser CANNOT pay itself (%)', left(sqlerrm, 40);
  end;

  begin
    perform referral_code_for('4a222222-0000-0000-0000-000000000003');
    raise exception 'FAIL a parent read another household''s code';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT read another household''s code (%)', left(sqlerrm, 40);
  end;
end $$;

set role postgres;
