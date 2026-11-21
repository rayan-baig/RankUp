-- ---------------------------------------------------------------------------
-- Each child's weekly goal, and the daily chore bonus after an acceptance
-- (0.26.0).
--
--   - A parent sets the family's weekly goal (accepted chores a week, 1 to
--     50); it is on the family row, so the sync hands it to a child's phone.
--   - A child's phone, a stranger and an out-of-range number are refused.
--   - The daily chore bonus waits for a parent to accept a chore that day:
--     not for one sent in, not for one sent back, and a chore accepted and
--     then the bonus claimed is paid once.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('62a00000-0000-4000-8000-000000000001', 't62-parent@example.com'),
  ('62a00000-0000-4000-8000-000000000002', null),
  ('62a00000-0000-4000-8000-000000000003', 't62-stranger@example.com');
insert into families (id, name, tier) values ('62b00000-0000-4000-8000-000000000001', 'T62 family', 'starter');
insert into parents (user_id, family_id, name, role) values
  ('62a00000-0000-4000-8000-000000000001', '62b00000-0000-4000-8000-000000000001', 'Pat', 'parent');
select seed_consent('62b00000-0000-4000-8000-000000000001', '62a00000-0000-4000-8000-000000000001');
insert into kids (id, family_id, name, user_id) values
  ('62c00000-0000-4000-8000-000000000001', '62b00000-0000-4000-8000-000000000001', 'Mo', '62a00000-0000-4000-8000-000000000002');
insert into quests (id, family_id, kid_id, title, xp, status) values
  ('62d00000-0000-4000-8000-000000000001', '62b00000-0000-4000-8000-000000000001', '62c00000-0000-4000-8000-000000000001', 'Water the plants', 30, 'submitted');
insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('62e00000-0000-4000-8000-000000000001', '62b00000-0000-4000-8000-000000000001', '62d00000-0000-4000-8000-000000000001',
   '62c00000-0000-4000-8000-000000000001', 'pending');

set role app_user;

-- ---------- the weekly goal ----------
do $$
declare r jsonb;
begin
  perform become('62a00000-0000-4000-8000-000000000001');
  perform ok('a family starts with no goal of its own (the app shows 5)',
             (select weekly_chore_goal from families where id = '62b00000-0000-4000-8000-000000000001') is null);
  r := set_weekly_chore_goal(7);
  perform ok('a parent sets it', (r->>'ok')::boolean, r::text);
  perform ok('and it is on the family row the sync hands to every phone',
             ((family_snapshot(0)->'families'->0)->>'weekly_chore_goal')::int = 7);
  perform ok('0 is refused as bad_goal', set_weekly_chore_goal(0)->>'reason' = 'bad_goal');
  perform ok('51 is refused as bad_goal', set_weekly_chore_goal(51)->>'reason' = 'bad_goal');
  perform ok('no number at all is refused as bad_goal', set_weekly_chore_goal(null)->>'reason' = 'bad_goal');
  perform ok('and the goal is still 7',
             (select weekly_chore_goal from families where id = '62b00000-0000-4000-8000-000000000001') = 7);
  perform become('62a00000-0000-4000-8000-000000000002');
  perform ok('a child''s own phone cannot set it: not_parent', set_weekly_chore_goal(1)->>'reason' = 'not_parent');
  perform become('62a00000-0000-4000-8000-000000000003');
  perform ok('nor somebody in no family: not_parent', set_weekly_chore_goal(1)->>'reason' = 'not_parent');
  perform become('62a00000-0000-4000-8000-000000000001');
  perform ok('still 7', (select weekly_chore_goal from families where id = '62b00000-0000-4000-8000-000000000001') = 7);
end $$;

-- ---------- the daily chore bonus waits for a parent to accept ----------
do $$
declare r jsonb; v_coins int;
begin
  perform become('62a00000-0000-4000-8000-000000000002');
  select coins into v_coins from kids where id = '62c00000-0000-4000-8000-000000000001';
  r := claim_login_bonus('62c00000-0000-4000-8000-000000000001');
  perform ok('"I did it!" tapped, not accepted yet: no bonus', r->>'reason' = 'no_chore_accepted', r::text);
  perform become('62a00000-0000-4000-8000-000000000001');
  perform reject_submission('62e00000-0000-4000-8000-000000000001', 'Not quite');
  perform become('62a00000-0000-4000-8000-000000000002');
  r := claim_login_bonus('62c00000-0000-4000-8000-000000000001');
  perform ok('sent back with a note: still no bonus', r->>'reason' = 'no_chore_accepted', r::text);
  perform ok('and the child''s coins have not moved',
             (select coins from kids where id = '62c00000-0000-4000-8000-000000000001') = v_coins);
end $$;

do $$
declare r jsonb; v_coins int;
begin
  -- Done again and sent again; this time the parent accepts it.
  set local role postgres;
  update quests set status = 'submitted' where id = '62d00000-0000-4000-8000-000000000001';
  insert into submissions (id, family_id, quest_id, kid_id, status) values
    ('62e00000-0000-4000-8000-000000000002', '62b00000-0000-4000-8000-000000000001', '62d00000-0000-4000-8000-000000000001',
     '62c00000-0000-4000-8000-000000000001', 'pending');
  set local role app_user;
  perform become('62a00000-0000-4000-8000-000000000001');
  perform approve_submission('62e00000-0000-4000-8000-000000000002', 0, 0, '');
  perform become('62a00000-0000-4000-8000-000000000002');
  select coins into v_coins from kids where id = '62c00000-0000-4000-8000-000000000001';
  r := claim_login_bonus('62c00000-0000-4000-8000-000000000001');
  perform ok('accepted today: the bonus is paid', (r->>'ok')::boolean, r::text);
  perform ok('five coins', (select coins from kids where id = '62c00000-0000-4000-8000-000000000001') = v_coins + 5);
  perform ok('once', claim_login_bonus('62c00000-0000-4000-8000-000000000001')->>'reason' = 'already_claimed');
end $$;

reset role;
