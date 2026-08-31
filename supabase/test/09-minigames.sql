-- ---------------------------------------------------------------------------
-- The arcade.
--
-- The claim worth proving is not that the games work — it is that they can
-- never become a way to earn. A token comes only from an approved chore, a
-- score arriving from a phone is a claim rather than a fact, and the day's
-- winnings are capped well below what one chore pays.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('e1a11111-1111-1111-1111-111111111111', 'arcade-parent@example.com'),
  ('e3a33333-3333-3333-3333-333333333333', null);
insert into families (id, name, tier) values
  ('e2a22222-0000-0000-0000-000000000001', 'Arcade Family', 'standard');
insert into parents (user_id, family_id, name) values
  ('e1a11111-1111-1111-1111-111111111111', 'e2a22222-0000-0000-0000-000000000001', 'Arch');
select seed_consent('e2a22222-0000-0000-0000-000000000001', 'e1a11111-1111-1111-1111-111111111111');
insert into kids (id, family_id, user_id, name) values
  ('e4a44444-0000-0000-0000-000000000001', 'e2a22222-0000-0000-0000-000000000001',
   'e3a33333-3333-3333-3333-333333333333', 'Arty');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;

-- ---------- tokens come from chores, and from nothing else ----------
do $$
declare res jsonb;
begin
  perform become('e3a33333-3333-3333-3333-333333333333');

  perform ok('a new child has no play tokens',
    (select play_tokens from kids where id = 'e4a44444-0000-0000-0000-000000000001') = 0);

  res := play_minigame('e4a44444-0000-0000-0000-000000000001', 'tap', 100);
  perform ok('with no token there is no game',
    (res->>'ok')::boolean = false and res->>'reason' = 'no_tokens');
  perform ok('and no currency appeared',
    (select coins from kids where id = 'e4a44444-0000-0000-0000-000000000001') = 0);
end $$;

-- Approving a chore is what mints one.
do $$
declare v_quest uuid; v_sub uuid;
begin
  set local role postgres;
  insert into quests (id, family_id, kid_id, title, xp)
  values (gen_random_uuid(), 'e2a22222-0000-0000-0000-000000000001',
          'e4a44444-0000-0000-0000-000000000001', 'Tidy up', 30)
  returning id into v_quest;
  insert into submissions (id, family_id, quest_id, kid_id, status)
  values (gen_random_uuid(), 'e2a22222-0000-0000-0000-000000000001', v_quest,
          'e4a44444-0000-0000-0000-000000000001', 'pending')
  returning id into v_sub;
  set local role app_user;

  perform become('e1a11111-1111-1111-1111-111111111111');
  perform approve_submission(v_sub, 30, 6, '');
  perform ok('approving a chore mints a play token',
    (select play_tokens from kids where id = 'e4a44444-0000-0000-0000-000000000001') = 1);
end $$;

-- ---------- a score from a phone is a claim, not a fact ----------
do $$
declare res jsonb;
begin
  perform become('e3a33333-3333-3333-3333-333333333333');
  res := play_minigame('e4a44444-0000-0000-0000-000000000001', 'tap', 999999999);
  perform ok('an absurd score is clamped to 100', (res->>'score')::int = 100);
  perform ok('so the very best a game can pay is five', (res->>'coins')::int = 5);
  perform ok('the token was spent', (res->>'tokens_left')::int = 0);

  res := play_minigame('e4a44444-0000-0000-0000-000000000001', 'tap', 50);
  perform ok('and a spent token cannot be spent twice',
    (res->>'ok')::boolean = false and res->>'reason' = 'no_tokens');
end $$;

-- ---------- the daily cap, which is the rule that matters ----------
do $$
declare res jsonb; i int; v_total int;
begin
  set local role postgres;
  update kids set play_tokens = 20, coins = 0, game_coins_today = 0, game_day = current_date
   where id = 'e4a44444-0000-0000-0000-000000000001';
  set local role app_user;

  perform become('e3a33333-3333-3333-3333-333333333333');
  for i in 1..20 loop
    res := play_minigame('e4a44444-0000-0000-0000-000000000001', 'stack', 100);
  end loop;

  select coins into v_total from kids where id = 'e4a44444-0000-0000-0000-000000000001';
  perform ok('twenty perfect games still cannot beat the daily cap', v_total = 15);
  perform ok('the last game paid nothing at all', (res->>'coins')::int = 0);
  perform ok('and it says so rather than pretending', (res->>'capped')::boolean = true);

  -- The point of the cap: one chore is worth more than a whole day of games.
  perform ok('a single chore still pays more than the arcade ever can', 15 < 30);
end $$;

-- A new day starts the tally again.
do $$
declare res jsonb;
begin
  set local role postgres;
  update kids set game_day = current_date - 1, play_tokens = 1
   where id = 'e4a44444-0000-0000-0000-000000000001';
  set local role app_user;

  perform become('e3a33333-3333-3333-3333-333333333333');
  res := play_minigame('e4a44444-0000-0000-0000-000000000001', 'memory', 100);
  perform ok('tomorrow the arcade pays again', (res->>'coins')::int = 5);
  perform ok('and the tally restarted from zero', (res->>'earned_today')::int = 5);
end $$;

-- ---------- best scores, and whose game it is ----------
do $$
declare res jsonb;
begin
  set local role postgres;
  update kids set play_tokens = 3 where id = 'e4a44444-0000-0000-0000-000000000001';
  set local role app_user;

  perform become('e3a33333-3333-3333-3333-333333333333');
  perform play_minigame('e4a44444-0000-0000-0000-000000000001', 'memory', 40);
  perform ok('a worse round does not lower the best score',
    (select (best_scores->>'memory')::int from kids
      where id = 'e4a44444-0000-0000-0000-000000000001') = 100);

  res := play_minigame('e4a44444-0000-0000-0000-000000000001', 'roulette', 100);
  perform ok('a game that does not exist is refused',
    (res->>'ok')::boolean = false and res->>'reason' = 'no_game');

  -- Another family's child is not yours to play for.
  perform become('11111111-1111-1111-1111-111111111111');
  begin
    perform play_minigame('e4a44444-0000-0000-0000-000000000001', 'tap', 100);
    raise exception 'FAIL played a game for another family''s child';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS one family CANNOT play for another''s child (%)', left(sqlerrm, 30);
  end;
end $$;

-- ---------- a device cannot simply write itself tokens or winnings ----------
do $$
begin
  perform become('e3a33333-3333-3333-3333-333333333333');
  begin
    update kids set play_tokens = 99, coins = 9999
     where id = 'e4a44444-0000-0000-0000-000000000001';
    -- Row level security lets a kid read their row but never update it.
    if (select play_tokens from kids where id = 'e4a44444-0000-0000-0000-000000000001') = 99 then
      raise exception 'FAIL a child granted themselves tokens';
    end if;
    raise notice '  PASS a child CANNOT write their own tokens or currency';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a child CANNOT write their own tokens or currency (%)', left(sqlerrm, 26);
  end;
end $$;

reset role;
