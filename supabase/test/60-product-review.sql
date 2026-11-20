-- ---------------------------------------------------------------------------
-- Fixes from the product review (0.22.0).
--
--   - The money sign: US dollars unless a parent chooses another, and the old
--     British-pound default moved to dollars for families who never chose
--     (upgrade_family_currency), never for one who did (set_family_currency).
--   - Linking a child's phone with a code the PARENT makes for one child
--     (create_child_link_code, redeem_child_link_code): the phone types only
--     the code, so it can never make a second profile from a misspelt name,
--     and the world is the parent's choice.
--   - The old way round (the phone makes the code): the parent's choice of
--     world wins over the phone's pick when the phone joins a profile.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function t60_user(p_n int) returns uuid language sql immutable as $$
  select ('60a00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid $$;

-- 1 parent, 2 supporter, 3 other family's parent, 4-9 anonymous phones.
insert into auth.users (id, email)
select t60_user(n), case when n <= 3 then 't60-user-' || n || '@example.com' end from generate_series(1, 9) n;

insert into families (id, name, tier) values
  ('60b00000-0000-4000-8000-000000000001', 'Review Family', 'standard'),
  ('60b00000-0000-4000-8000-000000000002', 'Other Review Family', 'standard'),
  ('60b00000-0000-4000-8000-000000000003', 'Chose Pounds', 'standard');
insert into parents (user_id, family_id, name, role) values
  (t60_user(1), '60b00000-0000-4000-8000-000000000001', 'Sam', 'parent'),
  (t60_user(2), '60b00000-0000-4000-8000-000000000001', 'Gran', 'supporter'),
  (t60_user(3), '60b00000-0000-4000-8000-000000000002', 'Lee', 'parent');
select seed_consent('60b00000-0000-4000-8000-000000000001', t60_user(1));
insert into kids (id, family_id, name, theme_id) values
  ('60c00000-0000-4000-8000-000000000001', '60b00000-0000-4000-8000-000000000001', 'Ava', 'blockcraft'),
  ('60c00000-0000-4000-8000-000000000002', '60b00000-0000-4000-8000-000000000001', 'Noah', 'sugarrush'),
  ('60c00000-0000-4000-8000-000000000003', '60b00000-0000-4000-8000-000000000001', 'Mia', 'blockcraft');

-- ---------- the money sign ----------
do $$
declare moved int;
begin
  perform ok('a new family is in US dollars',
    (select currency from families where id = '60b00000-0000-4000-8000-000000000001') = 'USD');
  -- Two families as they were before 0.22.0: both on the old default, one of
  -- them having chosen it on purpose since.
  update families set currency = 'GBP', currency_chosen = false where id = '60b00000-0000-4000-8000-000000000002';
  update families set currency = 'GBP', currency_chosen = true where id = '60b00000-0000-4000-8000-000000000003';
  moved := upgrade_family_currency();
  perform ok('the upgrade moves a family that never chose from pounds to dollars',
    (select currency from families where id = '60b00000-0000-4000-8000-000000000002') = 'USD');
  perform ok('and never a family that chose pounds',
    (select currency from families where id = '60b00000-0000-4000-8000-000000000003') = 'GBP');
  perform ok('it said how many it moved', moved >= 1, moved::text);
  perform ok('run again, it moves nothing', upgrade_family_currency() = 0);
  perform ok('the upgrade is the server''s alone',
    not has_function_privilege('anon', 'upgrade_family_currency()', 'execute')
    and not has_function_privilege('authenticated', 'upgrade_family_currency()', 'execute'));
end $$;

set role app_user;
do $$
declare r jsonb;
begin
  perform become(t60_user(1));
  r := set_family_currency('gbp');
  perform ok('a parent can choose pounds', (r->>'ok')::boolean and r->>'currency' = 'GBP', r::text);
  perform ok('and it is marked as chosen, so no upgrade undoes it',
    (select currency_chosen from families where id = '60b00000-0000-4000-8000-000000000001'));
  r := set_family_currency('XYZ');
  perform ok('a currency not on the list is refused', r->>'reason' = 'bad_currency', r::text);
  perform ok('and leaves the choice as it was',
    (select currency from families where id = '60b00000-0000-4000-8000-000000000001') = 'GBP');
  perform become(t60_user(2));
  r := set_family_currency('EUR');
  perform ok('a supporter cannot change it', r->>'reason' = 'not_parent', r::text);
  perform become(t60_user(1));
  perform set_family_currency('USD');
end $$;
reset role;
-- The choice survives the upgrade being run again (the file re-applied).
do $$ begin
  update families set currency = 'GBP' where id = '60b00000-0000-4000-8000-000000000001';
  perform upgrade_family_currency();
  perform ok('a family that chose keeps its choice through the upgrade',
    (select currency from families where id = '60b00000-0000-4000-8000-000000000001') = 'GBP');
end $$;

-- ---------- a code the parent makes for one child ----------
set role app_user;
do $$
declare r jsonb; v_code text; v_code2 text;
begin
  perform become(t60_user(3));
  r := create_child_link_code('60c00000-0000-4000-8000-000000000001');
  perform ok('another family''s parent cannot make a code for this child', r->>'reason' = 'not_parent', r::text);
  perform become(t60_user(2));
  r := create_child_link_code('60c00000-0000-4000-8000-000000000001');
  perform ok('nor can a supporter', r->>'reason' = 'not_parent', r::text);

  perform become(t60_user(1));
  r := create_child_link_code('60c00000-0000-4000-8000-000000000001');
  v_code := r->>'code';
  perform ok('a parent gets six digits for Ava', (r->>'ok')::boolean and v_code ~ '^[0-9]{6}$', r::text);
  perform ok('that run out in ten minutes',
    (r->>'expires_at')::timestamptz between now() + interval '9 minutes' and now() + interval '11 minutes');
  r := create_child_link_code('60c00000-0000-4000-8000-000000000001');
  v_code2 := r->>'code';
  set local role postgres;
  perform ok('a new code for the same child replaces the old one',
    (select count(*) from child_link_codes where kid_id = '60c00000-0000-4000-8000-000000000001' and used_at is null) = 1);
  set local role app_user;

  -- The child's phone, signed in anonymously.
  perform become(null);
  r := redeem_child_link_code(v_code2);
  perform ok('a phone that is not signed in cannot use one', r->>'reason' = 'signed_out', r::text);
  perform become(t60_user(1));
  r := redeem_child_link_code(v_code2);
  perform ok('a parent''s own phone cannot become the child', r->>'reason' = 'device_taken', r::text);

  perform become(t60_user(4));
  r := redeem_child_link_code('12a456');
  perform ok('something that is not six digits matches nothing', r->>'reason' = 'not_found', r::text);
  if v_code is distinct from v_code2 then
    r := redeem_child_link_code(v_code);
    perform ok('the replaced code no longer works', r->>'reason' = 'not_found', r::text);
  end if;
  r := redeem_child_link_code(v_code2);
  perform ok('the phone becomes Ava with the code alone', (r->>'ok')::boolean and r->>'kid_name' = 'Ava', r::text);
  perform ok('in the parent''s world, not one the phone picked', r->>'theme_id' = 'blockcraft', r::text);
  perform ok('with the family''s name for the welcome', r->>'family_name' = 'Review Family', r::text);
  set local role postgres;
  perform ok('and Ava is that phone now',
    (select user_id from kids where id = '60c00000-0000-4000-8000-000000000001') = t60_user(4));
  perform ok('no second Ava was made',
    (select count(*) from kids where family_id = '60b00000-0000-4000-8000-000000000001' and name = 'Ava') = 1);
  set local role app_user;

  perform become(t60_user(5));
  r := redeem_child_link_code(v_code2);
  perform ok('a code works once', r->>'reason' = 'used', r::text);
  perform become(t60_user(4));
  r := redeem_child_link_code(v_code2);
  perform ok('a phone that is already a child cannot use another', r->>'reason' = 'device_taken', r::text);

  perform become(t60_user(1));
  r := create_child_link_code('60c00000-0000-4000-8000-000000000001');
  perform ok('a child who has a phone gets no code until it is unlinked', r->>'reason' = 'already_linked', r::text);
end $$;

-- Expiry, the five tries, and a child linked another way in the meantime.
do $$
declare r jsonb; v_code text;
begin
  perform become(t60_user(1));
  v_code := create_child_link_code('60c00000-0000-4000-8000-000000000002')->>'code';
  set local role postgres;
  update child_link_codes set expires_at = now() - interval '1 second' where code = v_code;
  set local role app_user;
  perform become(t60_user(6));
  r := redeem_child_link_code(v_code);
  perform ok('a code past its ten minutes is refused', r->>'reason' = 'expired', r::text);

  perform become(t60_user(1));
  v_code := create_child_link_code('60c00000-0000-4000-8000-000000000002')->>'code';
  set local role postgres;
  update child_link_codes set attempts = 5 where code = v_code;
  set local role app_user;
  perform become(t60_user(6));
  r := redeem_child_link_code(v_code);
  perform ok('a code tried five times is dead', r->>'reason' = 'blocked', r::text);

  perform become(t60_user(1));
  v_code := create_child_link_code('60c00000-0000-4000-8000-000000000003')->>'code';
  set local role postgres;
  update kids set user_id = t60_user(7) where id = '60c00000-0000-4000-8000-000000000003';
  set local role app_user;
  perform become(t60_user(8));
  r := redeem_child_link_code(v_code);
  perform ok('a code for a child linked meanwhile is refused, not taken over', r->>'reason' = 'already_linked', r::text);
  set local role postgres;
  perform ok('and the child keeps their phone',
    (select user_id from kids where id = '60c00000-0000-4000-8000-000000000003') = t60_user(7));
  set local role app_user;
end $$;

-- Guessing: every failed try counts against the phone, ten in ten minutes.
do $$
declare r jsonb; i int;
begin
  perform become(t60_user(9));
  for i in 1..10 loop
    r := redeem_child_link_code(lpad(i::text, 6, '0'));
  end loop;
  r := redeem_child_link_code('999998');
  perform ok('a phone guessing codes is stopped', r->>'reason' = 'too_many', r::text);
  perform ok('the table cannot be read from a browser',
    not exists (select 1 from child_link_codes));
end $$;
reset role;

-- ---------- the old way round: the parent's world wins ----------
set role app_user;
do $$
declare v_row pairing_codes; r jsonb;
begin
  set local role postgres;
  update kids set user_id = null where id = '60c00000-0000-4000-8000-000000000002';
  set local role app_user;
  perform become(t60_user(6));
  v_row := create_pairing_code('606060', 'noah', 'apexroyale', 600, t60_user(6));
  perform become(t60_user(1));
  r := claim_pairing_code('606060', '60b00000-0000-4000-8000-000000000001', 'Review Family');
  perform ok('the phone joins Noah''s profile', (r->>'ok')::boolean and r->>'kid_id' = '60c00000-0000-4000-8000-000000000002', r::text);
  perform ok('and keeps the world the parent chose, not the phone''s pick',
    r->>'theme_id' = 'sugarrush'
    and (select theme_id from kids where id = '60c00000-0000-4000-8000-000000000002') = 'sugarrush', r::text);
end $$;
reset role;
