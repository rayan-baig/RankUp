-- ---------------------------------------------------------------------------
-- "Today" is the family's today, not the server's.
--
-- The phone decides whether the daily bonus is there to claim, whether the
-- arcade's daily cap has reset and whether a streak carried on, by its own
-- local date. The database used current_date, which is UTC. For a family west
-- of UTC every evening (or east of it every morning) the two disagree by a
-- day, and then:
--   - a claimed bonus came back stamped with tomorrow's date, so the phone
--     offered it again, paid it on screen and took it back at the next sync;
--   - a child who did a chore every evening lost their streak, because one
--     approval fell before UTC midnight and the next one after it.
--
-- The zone is picked so that, whenever this runs, its date is NOT the UTC
-- date: UTC+14 from 10:00 UTC onwards, UTC-12 before it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('7a111111-0000-0000-0000-00000000000a', 'fd-parent@example.com'),
  ('7a111111-0000-0000-0000-0000000000c1', null);
insert into families (id, name, tier) values
  ('7a222222-0000-0000-0000-00000000000a', 'Day Family', 'standard');
insert into parents (user_id, family_id, name, role) values
  ('7a111111-0000-0000-0000-00000000000a', '7a222222-0000-0000-0000-00000000000a', 'Pat', 'parent');
select seed_consent('7a222222-0000-0000-0000-00000000000a', '7a111111-0000-0000-0000-00000000000a');
insert into kids (id, family_id, name, user_id) values
  ('7a444444-0000-0000-0000-0000000000a1', '7a222222-0000-0000-0000-00000000000a', 'Ava',
   '7a111111-0000-0000-0000-0000000000c1');

create temp table fd_zone as
  select case when extract(hour from now() at time zone 'UTC') >= 10
              then 'Pacific/Kiritimati' else 'Etc/GMT+12' end as tz;
create function pg_temp.fd_tz() returns text language sql stable as $$ select tz from fd_zone $$;
create function pg_temp.fd_today() returns date language sql stable as $$
  select (now() at time zone pg_temp.fd_tz())::date $$;

-- The family has saved a reminder, so the server knows its zone.
update families set timezone = pg_temp.fd_tz() where id = '7a222222-0000-0000-0000-00000000000a';

-- A child on a four-day streak whose last approved chore was yesterday, where
-- they live, and whose arcade cap was used up yesterday.
update kids set streak_count = 4, streak_last_day = pg_temp.fd_today() - 1,
                play_tokens = 3, game_day = pg_temp.fd_today() - 1, game_coins_today = 15
 where id = '7a444444-0000-0000-0000-0000000000a1';

insert into quests (id, family_id, kid_id, title, xp) values
  ('7a555555-0000-0000-0000-000000000001', '7a222222-0000-0000-0000-00000000000a',
   '7a444444-0000-0000-0000-0000000000a1', 'Feed the cat', 30);
insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('7a666666-0000-0000-0000-000000000001', '7a222222-0000-0000-0000-00000000000a',
   '7a555555-0000-0000-0000-000000000001', '7a444444-0000-0000-0000-0000000000a1', 'pending');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant select on fd_zone to anon, authenticated, app_user;
select lock_billing_columns();

set role app_user;

do $$ begin
  perform ok('the zone chosen really does disagree with UTC today',
             pg_temp.fd_today() <> (now() at time zone 'UTC')::date, pg_temp.fd_tz());
end $$;

-- ---------- the daily bonus is stamped with the family's day ----------
do $$
declare res jsonb;
begin
  perform become('7a111111-0000-0000-0000-0000000000c1');
  res := claim_login_bonus('7a444444-0000-0000-0000-0000000000a1');
  perform ok('the bonus is paid', (res->>'ok')::boolean, res::text);
  perform ok('and recorded as claimed on the day the phone sees',
             (select last_login_bonus from kids where id = '7a444444-0000-0000-0000-0000000000a1') = pg_temp.fd_today(),
             (select last_login_bonus from kids where id = '7a444444-0000-0000-0000-0000000000a1')::text
               || ' vs ' || pg_temp.fd_today()::text);
  res := claim_login_bonus('7a444444-0000-0000-0000-0000000000a1');
  perform ok('a second claim the same day is refused', res->>'reason' = 'already_claimed', res::text);
end $$;

-- A phone can say which zone it is in, which wins over the saved one.
do $$
declare res jsonb;
begin
  set local role postgres;
  update families set timezone = 'UTC' where id = '7a222222-0000-0000-0000-00000000000a';
  update kids set last_login_bonus = null where id = '7a444444-0000-0000-0000-0000000000a1';
  set local role app_user;
  perform become('7a111111-0000-0000-0000-0000000000c1');
  res := claim_login_bonus('7a444444-0000-0000-0000-0000000000a1', 5, pg_temp.fd_tz());
  perform ok('a phone that names its zone gets that zone''s day',
             (select last_login_bonus from kids where id = '7a444444-0000-0000-0000-0000000000a1') = pg_temp.fd_today());
  set local role postgres;
  update families set timezone = pg_temp.fd_tz() where id = '7a222222-0000-0000-0000-00000000000a';
end $$;

-- ---------- the arcade's daily cap resets on the family's day ----------
do $$
declare res jsonb;
begin
  perform become('7a111111-0000-0000-0000-0000000000c1');
  res := play_minigame('7a444444-0000-0000-0000-0000000000a1', 'memory', 100);
  perform ok('yesterday''s cap does not hold today''s game back', (res->>'coins')::int > 0, res::text);
  perform ok('and the game is recorded on the family''s day',
             (select game_day from kids where id = '7a444444-0000-0000-0000-0000000000a1') = pg_temp.fd_today());
end $$;

-- ---------- a streak carries on from yesterday ----------
do $$
begin
  perform become('7a111111-0000-0000-0000-00000000000a');
  perform approve_submission('7a666666-0000-0000-0000-000000000001', 0, 0, '');
  perform ok('a chore approved the day after the last one extends the streak',
             (select streak_count from kids where id = '7a444444-0000-0000-0000-0000000000a1') = 5,
             (select streak_count from kids where id = '7a444444-0000-0000-0000-0000000000a1')::text);
  perform ok('and today is the streak''s last day',
             (select streak_last_day from kids where id = '7a444444-0000-0000-0000-0000000000a1') = pg_temp.fd_today());
end $$;

-- ---------- a streak freeze covers the family's today ----------
do $$
declare res jsonb;
begin
  set local role postgres;
  update kids set streak_freezes = 1, streak_last_day = pg_temp.fd_today() - 2
   where id = '7a444444-0000-0000-0000-0000000000a1';
  set local role app_user;
  perform become('7a111111-0000-0000-0000-0000000000c1');
  res := use_streak_freeze('7a444444-0000-0000-0000-0000000000a1');
  perform ok('a freeze is spent', (res->>'ok')::boolean, res::text);
  perform ok('and marks the family''s today as covered',
             (select streak_last_day from kids where id = '7a444444-0000-0000-0000-0000000000a1') = pg_temp.fd_today());
end $$;

-- ---------- a zone Postgres does not know falls back, never fails ----------
do $$
declare res jsonb;
begin
  set local role postgres;
  update kids set last_login_bonus = null where id = '7a444444-0000-0000-0000-0000000000a1';
  set local role app_user;
  perform become('7a111111-0000-0000-0000-0000000000c1');
  res := claim_login_bonus('7a444444-0000-0000-0000-0000000000a1', 5, 'Mars/Olympus_Mons');
  perform ok('a nonsense zone still pays the bonus', (res->>'ok')::boolean, res::text);
end $$;

-- ---------- a lapsed streak pays nothing ----------
-- The count only resets at the next approval, so the first chore after a
-- week off was paid a streak bonus for a run that had already ended.
do $$
declare v_award jsonb;
begin
  set local role postgres;
  update kids set streak_count = 9, streak_last_day = pg_temp.fd_today() - 5
   where id = '7a444444-0000-0000-0000-0000000000a1';
  insert into quests (id, family_id, kid_id, title, xp) values
    ('7a555555-0000-0000-0000-000000000002', '7a222222-0000-0000-0000-00000000000a',
     '7a444444-0000-0000-0000-0000000000a1', 'Water the plants', 30);
  insert into submissions (id, family_id, quest_id, kid_id, status) values
    ('7a666666-0000-0000-0000-000000000002', '7a222222-0000-0000-0000-00000000000a',
     '7a555555-0000-0000-0000-000000000002', '7a444444-0000-0000-0000-0000000000a1', 'pending');
  v_award := award_for_submission('7a666666-0000-0000-0000-000000000002');
  perform ok('a streak last kept five days ago adds nothing', (v_award->>'xp')::int = 30, v_award::text);
  update kids set streak_last_day = pg_temp.fd_today() - 1 where id = '7a444444-0000-0000-0000-0000000000a1';
  v_award := award_for_submission('7a666666-0000-0000-0000-000000000002');
  perform ok('one kept yesterday still does', (v_award->>'xp')::int = 35, v_award::text);
end $$;
