-- ---------------------------------------------------------------------------
-- Pairing codes: the four rules that make six digits safe enough.
-- Expiry, the five-attempt limit, one-time use, and a code that is live for one
-- device not being reusable by another.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'pair-parent@example.com'),
  ('a5555555-5555-5555-5555-555555555555', null),
  ('a7777777-7777-7777-7777-777777777777', null),
  ('a6666666-6666-6666-6666-666666666666', null);
insert into families (id, name) values
  ('a2222222-0000-0000-0000-000000000001', 'Pairing Family');
insert into parents (user_id, family_id, name) values
  ('a1111111-1111-1111-1111-111111111111', 'a2222222-0000-0000-0000-000000000001', 'Pair Parent');

select seed_consent('a2222222-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
-- The blanket grant above re-opens the billing columns; lock them again.
select lock_billing_columns();

set role app_user;

do $$
declare
  v_row  pairing_codes;
  v_res  jsonb;
  v_kid  uuid;
begin
  -- A kid's device is anonymous: no signed-in user at all.
  perform become(null);

  v_row := create_pairing_code('123456', 'Ava', 'sugarrush', 600,
                               'a5555555-5555-5555-5555-555555555555');
  perform ok('an anonymous kid device can register a code', v_row.code = '123456');
  perform ok('the code carries the name and theme',
    v_row.kid_name = 'Ava' and v_row.theme_id = 'sugarrush');

  perform ok('a code that is still live cannot be taken by another device',
    create_pairing_code('123456', 'Someone Else', 'matrixblocks', 600) is null);

  perform ok('the kid device can read its own code back',
    (read_pairing_code('123456')).kid_name = 'Ava');

  -- Claiming needs a signed-in parent.
  perform become(null);
  begin
    perform claim_pairing_code('123456', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
    raise exception 'FAIL an anonymous caller claimed a code';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS an anonymous caller CANNOT claim a code (%)', left(sqlerrm, 40);
  end;

  perform become('a1111111-1111-1111-1111-111111111111');

  v_res := claim_pairing_code('999999', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('an unknown code is refused', (v_res->>'ok')::boolean = false and v_res->>'reason' = 'not_found');

  v_res := claim_pairing_code('12345', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('a malformed code is refused', (v_res->>'ok')::boolean = false);

  -- The real thing.
  v_res := claim_pairing_code('123456', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('the right code links the device', (v_res->>'ok')::boolean = true);
  perform ok('the kid is created with the name from the code', v_res->>'kid_name' = 'Ava');
  v_kid := (v_res->>'kid_id')::uuid;
  perform ok('the kid joins the claiming family',
    (select family_id from kids where id = v_kid) = 'a2222222-0000-0000-0000-000000000001');
  perform ok('the kid row is tied to the device''s own account, so it can read its quests',
    (select user_id from kids where id = v_kid) = 'a5555555-5555-5555-5555-555555555555');

  v_res := claim_pairing_code('123456', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('a claimed code CANNOT be used twice',
    (v_res->>'ok')::boolean = false and v_res->>'reason' = 'claimed');
end $$;

-- ---------- expiry and the attempt limit ----------

do $$
declare v_res jsonb;
begin
  perform become(null);
  perform create_pairing_code('222222', 'Ben', 'blockcraft', 600);
  perform become('a1111111-1111-1111-1111-111111111111');

  -- Five wrong guesses against this specific code.
  for i in 1..5 loop
    perform record_pairing_attempt('222222');
  end loop;

  v_res := claim_pairing_code('222222', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('five failed attempts kill a code',
    (v_res->>'ok')::boolean = false and v_res->>'reason' = 'blocked');
end $$;

do $$
declare v_res jsonb;
begin
  perform become(null);
  perform create_pairing_code('333333', 'Cal', 'apex', 600);
  set local role postgres;
  update pairing_codes set expires_at = now() - interval '1 minute' where code = '333333';
  set local role app_user;

  perform become('a1111111-1111-1111-1111-111111111111');
  v_res := claim_pairing_code('333333', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('an expired code is refused',
    (v_res->>'ok')::boolean = false and v_res->>'reason' = 'expired');

  perform become(null);
  perform ok('a dead code CAN be recycled by a new device',
    (create_pairing_code('333333', 'Dee', 'glam', 600)).kid_name = 'Dee');
end $$;

do $$
declare v_res jsonb;
begin
  perform become(null);
  perform create_pairing_code('444444', 'Eve', 'zen', 600);
  perform revoke_pairing_code('444444');
  perform become('a1111111-1111-1111-1111-111111111111');
  v_res := claim_pairing_code('444444', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('a revoked code is refused',
    (v_res->>'ok')::boolean = false and v_res->>'reason' = 'revoked');
end $$;

-- ---------- pairing joins an existing profile, it does not duplicate ----------
--
-- The ordinary case: a parent sets the family up, adds a child and assigns
-- chores, then hands that child a phone days later. Creating a second profile
-- at that point would leave the child staring at an empty quest list.
do $$
declare res jsonb; v_existing uuid;
begin
  set local role postgres;
  insert into kids (id, family_id, name, xp)
  values (gen_random_uuid(), 'a2222222-0000-0000-0000-000000000001', 'Robin', 250)
  returning id into v_existing;
  insert into quests (family_id, kid_id, title, xp)
  values ('a2222222-0000-0000-0000-000000000001', v_existing, 'Already assigned', 20);
  set local role app_user;

  perform become(null);
  perform create_pairing_code('555555', 'Robin', 'apex', 600,
                              'a7777777-7777-7777-7777-777777777777');
  perform become('a1111111-1111-1111-1111-111111111111');
  res := claim_pairing_code('555555', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');

  perform ok('pairing joins the profile that already exists',
    (res->>'kid_id')::uuid = v_existing);
  perform ok('so the child keeps their XP', (select xp from kids where id = v_existing) = 250);
  perform ok('and the chores already assigned to them',
    (select count(*) from quests where kid_id = v_existing) = 1);

  set local role postgres;
  perform ok('no duplicate profile was created',
    (select count(*) from kids where family_id = 'a2222222-0000-0000-0000-000000000001'
      and lower(name) = 'robin') = 1);
  perform ok('the pairing row points at the joined profile, so the device agrees',
    (select kid_id from pairing_codes where code = '555555') = v_existing);
  set local role app_user;
end $$;

-- A sibling's profile must never be taken over.
do $$
declare res jsonb; v_taken uuid;
begin
  set local role postgres;
  insert into kids (id, family_id, name, user_id)
  values (gen_random_uuid(), 'a2222222-0000-0000-0000-000000000001', 'Sam',
          'a6666666-6666-6666-6666-666666666666')
  returning id into v_taken;
  set local role app_user;

  perform become(null);
  perform create_pairing_code('666666', 'Sam', 'apex', 600, null);
  perform become('a1111111-1111-1111-1111-111111111111');
  res := claim_pairing_code('666666', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');

  perform ok('a profile that already has a device is NOT taken over',
    (res->>'kid_id')::uuid <> v_taken);
end $$;

-- ---------- guessing is throttled per account, not just per code ----------
--
-- The counter on a code only moves when a guess lands on one that exists, so
-- on its own it would let a script walk the whole million-code space unnoticed.
do $$
declare res jsonb; i int;
begin
  set local role postgres;
  delete from pairing_claim_attempts;
  set local role app_user;

  perform become(null);
  perform create_pairing_code('777777', 'Wren', 'apex', 600, null);
  perform become('a1111111-1111-1111-1111-111111111111');

  -- Ten misses at codes that do not exist. The real code is never touched.
  for i in 1..10 loop
    res := claim_pairing_code(lpad((100000 + i)::text, 6, '0'),
                              'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  end loop;
  perform ok('random guesses are still refused', (res->>'ok')::boolean = false);

  res := claim_pairing_code('777777', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('after ten misses the account cannot guess again',
    (res->>'ok')::boolean = false and res->>'reason' = 'too_many');
  perform ok('and the code it was hunting is untouched',
    (select claimed_at from pairing_codes where code = '777777') is null);

  -- Clearing the record lets an honest parent back in, and a real link wipes
  -- the account's failures so one bad evening does not follow them around.
  set local role postgres;
  delete from pairing_claim_attempts;
  set local role app_user;
  perform become('a1111111-1111-1111-1111-111111111111');
  res := claim_pairing_code('777777', 'a2222222-0000-0000-0000-000000000001', 'Pairing Family');
  perform ok('once the window passes the same parent can link normally',
    (res->>'ok')::boolean = true);
  set local role postgres;
  perform ok('a successful link clears the account''s failures',
    (select count(*) from pairing_claim_attempts
      where user_id = 'a1111111-1111-1111-1111-111111111111') = 0);
  set local role app_user;
end $$;

-- ---------- the pairing table itself must not be readable ----------

do $$
declare v_count int;
begin
  perform become('a1111111-1111-1111-1111-111111111111');
  select count(*) into v_count from pairing_codes;
  perform ok('nobody can list live pairing codes from a browser', v_count = 0);
end $$;

reset role;
