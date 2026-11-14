-- ---------------------------------------------------------------------------
-- The family goal is the family's, not one phone's.
--
-- It used to live only on the phone of the parent who set it: the other parent
-- and the children never saw it. It now travels in family_snapshot, set by
-- set_family_goal, and counts XP from when it was set.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('8a111111-0000-0000-0000-00000000000a', 'goal-parent@example.com'),
  ('8a111111-0000-0000-0000-00000000000b', 'goal-coparent@example.com'),
  ('8a111111-0000-0000-0000-0000000000c1', null),
  ('8a111111-0000-0000-0000-0000000000c2', null),
  ('8a111111-0000-0000-0000-0000000000f1', 'goal-stranger@example.com');
insert into families (id, name, tier) values
  ('8a222222-0000-0000-0000-00000000000a', 'Goal Family', 'standard'),
  ('8a222222-0000-0000-0000-00000000000f', 'Other Family', 'standard');
insert into parents (user_id, family_id, name, role) values
  ('8a111111-0000-0000-0000-00000000000a', '8a222222-0000-0000-0000-00000000000a', 'Pat', 'parent'),
  ('8a111111-0000-0000-0000-00000000000b', '8a222222-0000-0000-0000-00000000000a', 'Robin', 'parent'),
  ('8a111111-0000-0000-0000-0000000000f1', '8a222222-0000-0000-0000-00000000000f', 'Lee', 'parent');
select seed_consent('8a222222-0000-0000-0000-00000000000a', '8a111111-0000-0000-0000-00000000000a');
insert into kids (id, family_id, name, user_id, xp) values
  ('8a444444-0000-0000-0000-0000000000a1', '8a222222-0000-0000-0000-00000000000a', 'Ava',
   '8a111111-0000-0000-0000-0000000000c1', 1500),
  ('8a444444-0000-0000-0000-0000000000a2', '8a222222-0000-0000-0000-00000000000a', 'Jo',
   '8a111111-0000-0000-0000-0000000000c2', 900);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

set role app_user;

-- ---------- a parent sets it; it starts empty ----------
do $$
declare res jsonb; goal jsonb;
begin
  perform become('8a111111-0000-0000-0000-00000000000a');
  res := set_family_goal('Aquarium trip', 2000);
  perform ok('a parent can set the family goal', (res->>'ok')::boolean, res::text);
  goal := family_snapshot(0)->'family_goals'->0;
  perform ok('it is in the family snapshot', goal->>'name' = 'Aquarium trip', coalesce(goal::text, 'none'));
  perform ok('starting from where everybody is, not from zero',
    (goal->>'start_xp')::int = 2400 and (goal->>'progress')::int = 0, goal::text);
end $$;

-- ---------- every device in the family sees it ----------
do $$
declare goal jsonb;
begin
  perform become('8a111111-0000-0000-0000-00000000000b');
  goal := family_snapshot(0)->'family_goals'->0;
  perform ok('the other parent sees it', goal->>'name' = 'Aquarium trip', coalesce(goal::text, 'none'));

  perform become('8a111111-0000-0000-0000-0000000000c2');
  goal := family_snapshot(0)->'family_goals'->0;
  perform ok('so does a child, on their own phone',
    goal->>'name' = 'Aquarium trip' and (goal->>'target_xp')::int = 2000, coalesce(goal::text, 'none'));

  perform become('8a111111-0000-0000-0000-0000000000f1');
  perform ok('another family does not',
    jsonb_array_length(family_snapshot(0)->'family_goals') = 0);
end $$;

-- ---------- progress counts every child's XP, on every phone ----------
reset role;
update kids set xp = xp + 120 where id = '8a444444-0000-0000-0000-0000000000a1';
set role app_user;

do $$
declare goal jsonb;
begin
  -- Jo's phone cannot read Ava's row, so it could never add this up itself.
  perform become('8a111111-0000-0000-0000-0000000000c2');
  goal := family_snapshot(0)->'family_goals'->0;
  perform ok('a sibling''s XP moves the bar on a child''s phone', (goal->>'progress')::int = 120, goal::text);
  perform ok('without showing the sibling''s row',
    jsonb_array_length(family_snapshot(0)->'kids') = 1);
end $$;

-- ---------- a device that is up to date is told when the bar moves ----------
create temp table goal_cut (rev bigint);
grant all on goal_cut to app_user;
do $$
begin
  perform become('8a111111-0000-0000-0000-0000000000c2');
  insert into goal_cut values ((family_snapshot(0)->>'server_rev')::bigint);
  perform ok('an up-to-date phone is not sent the goal again for nothing',
    jsonb_array_length(family_snapshot((select rev from goal_cut))->'family_goals') = 0);
end $$;
reset role;
update kids set xp = xp + 30 where id = '8a444444-0000-0000-0000-0000000000a1';
set role app_user;
do $$
declare goal jsonb;
begin
  perform become('8a111111-0000-0000-0000-0000000000c2');
  goal := family_snapshot((select rev from goal_cut))->'family_goals'->0;
  perform ok('but is sent it when another child earns XP',
    (goal->>'progress')::int = 150, coalesce(goal::text, 'none'));
end $$;

-- ---------- editing keeps progress; a new goal starts again ----------
do $$
declare res jsonb; goal jsonb;
begin
  perform become('8a111111-0000-0000-0000-00000000000b');
  res := set_family_goal('  Aquarium trip ', 2500);
  goal := family_snapshot(0)->'family_goals'->0;
  perform ok('raising the target of the same goal keeps what was earned',
    (goal->>'target_xp')::int = 2500 and (goal->>'progress')::int = 150, goal::text);

  res := set_family_goal('Pizza night', 500);
  goal := family_snapshot(0)->'family_goals'->0;
  perform ok('a different goal starts again',
    goal->>'name' = 'Pizza night' and (goal->>'progress')::int = 0, goal::text);
end $$;

-- ---------- only a parent; nonsense refused ----------
do $$
declare res jsonb;
begin
  perform become('8a111111-0000-0000-0000-0000000000c1');
  res := set_family_goal('Ice cream', 10);
  perform ok('a child cannot set the goal', not (res->>'ok')::boolean, res::text);
  perform ok('and the goal is unchanged',
    (select name from family_goals where family_id = '8a222222-0000-0000-0000-00000000000a') = 'Pizza night');

  -- Nor write the table directly.
  begin
    update family_goals set target_xp = 1 where family_id = '8a222222-0000-0000-0000-00000000000a';
  exception when others then null;
  end;
  perform ok('nor change it directly',
    (select target_xp from family_goals where family_id = '8a222222-0000-0000-0000-00000000000a') = 500);

  perform become('8a111111-0000-0000-0000-0000000000f1');
  res := set_family_goal('Pizza night', 1);
  perform become('8a111111-0000-0000-0000-00000000000a');
  perform ok('another family''s parent sets only their own',
    (select target_xp from family_goals where family_id = '8a222222-0000-0000-0000-00000000000a') = 500);
  perform become('8a111111-0000-0000-0000-0000000000f1');
  res := set_family_goal('', null);   -- clears their own goal, not ours
  perform become('8a111111-0000-0000-0000-00000000000a');
  perform ok('and cannot clear ours',
    exists (select 1 from family_goals where family_id = '8a222222-0000-0000-0000-00000000000a'));

  perform become('8a111111-0000-0000-0000-00000000000a');
  res := set_family_goal('Zoo', 0);
  perform ok('a target of nothing is refused', not (res->>'ok')::boolean, res::text);
end $$;
-- ---------- a goal from before goals were shared goes up once ----------
do $$
declare res jsonb; goal jsonb;
begin
  perform become('8a111111-0000-0000-0000-00000000000a');
  res := set_family_goal('Old phone goal', 3000, 2000);
  perform ok('an old phone''s goal does not overwrite the family''s', (res->>'kept')::boolean, res::text);
  perform ok('which is still the one set since',
    (select name from family_goals where family_id = '8a222222-0000-0000-0000-00000000000a') = 'Pizza night');
end $$;

-- ---------- clearing reaches the other devices ----------
do $$
declare res jsonb; snap jsonb; cut bigint;
begin
  perform become('8a111111-0000-0000-0000-0000000000c1');
  cut := (family_snapshot(0)->>'server_rev')::bigint;

  perform become('8a111111-0000-0000-0000-00000000000a');
  res := set_family_goal(null, null);
  perform ok('a parent can clear it', (res->>'ok')::boolean and (res->>'cleared')::boolean, res::text);

  perform become('8a111111-0000-0000-0000-0000000000c1');
  snap := family_snapshot(cut);
  perform ok('a child''s phone is told it was cleared',
    exists (select 1 from jsonb_array_elements(snap->'deletions') d
             where d->>'table_name' = 'family_goals'
               and d->>'row_id' = '8a222222-0000-0000-0000-00000000000a'), snap::text);
  perform ok('and is sent no goal', jsonb_array_length(snap->'family_goals') = 0);

  -- Now an old phone's goal may go up, held to what the children have.
  perform become('8a111111-0000-0000-0000-00000000000a');
  res := set_family_goal('Old phone goal', 3000, 999999);
  perform ok('with no family goal, an old phone''s goal is taken',
    (select name from family_goals where family_id = '8a222222-0000-0000-0000-00000000000a') = 'Old phone goal');
  perform ok('starting no higher than the XP the children actually have',
    (select start_xp from family_goals where family_id = '8a222222-0000-0000-0000-00000000000a') = 2550);
end $$;

-- ---------- a child removed does not take the family's progress with them ----------
-- The bar is everybody's XP less where it stood when the goal was set, so
-- removing a child took their whole balance off the top and the bar fell to
-- nothing, though the others had earned XP since.
reset role;
update kids set xp = xp + 40 where id = '8a444444-0000-0000-0000-0000000000a1';
set role app_user;
create temp table goal_before (progress int);
grant all on goal_before to app_user;
do $$ begin
  perform become('8a111111-0000-0000-0000-00000000000a');
  insert into goal_before values ((family_snapshot(0)->'family_goals'->0->>'progress')::int);
  perform ok('the bar has moved before anyone is removed', (select progress from goal_before) = 40,
    (select progress from goal_before)::text);
  delete from kids where id = '8a444444-0000-0000-0000-0000000000a2';
  perform ok('removing a child leaves the family''s progress where it was',
    (family_snapshot(0)->'family_goals'->0->>'progress')::int = (select progress from goal_before),
    (family_snapshot(0)->'family_goals'->0)::text);
end $$;

-- ---------- deleting the family takes the goal with it ----------
reset role;
delete from families where id = '8a222222-0000-0000-0000-00000000000a';
do $$ begin
  perform ok('deleting a family with a goal still works, and leaves nothing behind',
    not exists (select 1 from family_goals where family_id = '8a222222-0000-0000-0000-00000000000a'));
end $$;
