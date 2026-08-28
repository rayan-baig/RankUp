-- ---------------------------------------------------------------------------
-- Guilds: the consent rules, and what a member can and cannot see.
--
-- This is the feature that puts a child in contact with children in other
-- families, so these checks matter more than any other in the suite.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('91111111-1111-1111-1111-111111111111', 'g-parent-a@example.com'),
  ('92222222-2222-2222-2222-222222222222', 'g-parent-b@example.com'),
  ('93333333-3333-3333-3333-333333333333', null),  -- kid A's device
  ('94444444-4444-4444-4444-444444444444', null),  -- kid B's device
  ('95555555-5555-5555-5555-555555555555', 'g-stranger@example.com');

insert into families (id, name, tier) values
  ('9a000000-0000-0000-0000-000000000001', 'Guild Family A', 'standard'),
  ('9b000000-0000-0000-0000-000000000002', 'Guild Family B', 'standard'),
  ('9c000000-0000-0000-0000-000000000003', 'Stranger Family', 'standard');
insert into parents (user_id, family_id, name) values
  ('91111111-1111-1111-1111-111111111111', '9a000000-0000-0000-0000-000000000001', 'Parent A'),
  ('92222222-2222-2222-2222-222222222222', '9b000000-0000-0000-0000-000000000002', 'Parent B'),
  ('95555555-5555-5555-5555-555555555555', '9c000000-0000-0000-0000-000000000003', 'Stranger');
insert into kids (id, family_id, user_id, name, xp) values
  ('9d000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001',
   '93333333-3333-3333-3333-333333333333', 'Amy', 300),
  ('9d000000-0000-0000-0000-000000000002', '9b000000-0000-0000-0000-000000000002',
   '94444444-4444-4444-4444-444444444444', 'Bo', 150);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

set role app_user;

do $$
declare
  res   jsonb;
  guild uuid;
  code  text;
begin
  -- ---------- creating ----------
  perform become('93333333-3333-3333-3333-333333333333');   -- Amy's own device
  begin
    perform create_guild('9d000000-0000-0000-0000-000000000001', 'Kid Made This');
    raise exception 'FAIL a kid created a guild on their own';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a kid CANNOT create a guild on their own (%)', left(sqlerrm, 34);
  end;

  perform become('91111111-1111-1111-1111-111111111111');   -- Amy's parent
  res := create_guild('9d000000-0000-0000-0000-000000000001', 'The Bookworms');
  perform ok('a parent can create a guild for their kid', (res->>'ok')::boolean);
  guild := (res->>'guild_id')::uuid;
  code := res->>'invite_code';
  perform ok('it comes with a readable invite code', code ~ '^[A-Z2-9]{6}$');
  -- guild_members has no read policy on purpose, so peek as the owner to check
  -- internal state. Nothing in the app reads this table directly.
  set local role postgres;
  perform ok('the founder is active straight away',
    (select status from guild_members where guild_id = guild
      and kid_id = '9d000000-0000-0000-0000-000000000001') = 'active');
  set local role app_user;

  -- ---------- joining needs BOTH parents ----------
  perform become('94444444-4444-4444-4444-444444444444');   -- Bo's own device
  res := request_guild_join('9d000000-0000-0000-0000-000000000002', code);
  perform ok('a kid can ASK to join', (res->>'ok')::boolean and res->>'status' = 'awaiting_approval');
  set local role postgres;
  perform ok('asking does not make them a member',
    (select status from guild_members where guild_id = guild
      and kid_id = '9d000000-0000-0000-0000-000000000002') = 'invited');
  set local role app_user;

  -- Still acting as Bo's device: a pending member gets nothing.
  perform ok('a pending member cannot read the roster',
    ((guild_roster(guild, '9d000000-0000-0000-0000-000000000002'))->>'ok')::boolean = false);

  begin
    perform guild_roster(guild, '9d000000-0000-0000-0000-000000000001');
    raise exception 'FAIL one kid read the roster as another kid';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a kid CANNOT call the roster as a different kid (%)', left(sqlerrm, 24);
  end;

  perform become('93333333-3333-3333-3333-333333333333');   -- back to Amy's device
  perform ok('a pending member is NOT on the roster',
    not exists (
      select 1 from jsonb_array_elements(
        (guild_roster(guild, '9d000000-0000-0000-0000-000000000001'))->'members') m
       where m->>'name' = 'Bo'));

  -- Only one parent so far.
  perform become('92222222-2222-2222-2222-222222222222');   -- Bo's parent
  res := approve_guild_member(guild, '9d000000-0000-0000-0000-000000000002');
  perform ok('one parent alone does not admit the child', res->>'status' = 'awaiting_approval');

  -- The same parent again must not be able to complete it on their own.
  res := approve_guild_member(guild, '9d000000-0000-0000-0000-000000000002');
  perform ok('the same parent approving twice still does not admit them',
    res->>'status' = 'awaiting_approval');

  -- An unrelated parent must not be able to wave them in.
  perform become('95555555-5555-5555-5555-555555555555');
  begin
    perform approve_guild_member(guild, '9d000000-0000-0000-0000-000000000002');
    raise exception 'FAIL an unrelated parent approved a membership';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS an unrelated parent CANNOT approve a membership';
  end;

  -- Now the guild owner's parent agrees too.
  perform become('91111111-1111-1111-1111-111111111111');
  res := approve_guild_member(guild, '9d000000-0000-0000-0000-000000000002');
  perform ok('with BOTH parents agreed, the child joins', res->>'status' = 'active');
  perform ok('and now appears on the roster',
    exists (
      select 1 from jsonb_array_elements(
        (guild_roster(guild, '9d000000-0000-0000-0000-000000000001'))->'members') m
       where m->>'name' = 'Bo'));
end $$;

-- ---------- what a member can see ----------

do $$
declare guild uuid; roster jsonb;
begin
  set local role postgres;
  select id into guild from guilds where name = 'The Bookworms';
  set local role app_user;
  perform become('94444444-4444-4444-4444-444444444444');   -- Bo
  roster := guild_roster(guild, '9d000000-0000-0000-0000-000000000002');

  perform ok('a member sees the roster', (roster->>'ok')::boolean);
  perform ok('the roster carries only a name, level and weekly XP',
    not exists (
      select 1 from jsonb_array_elements(roster->'members') m
       where m ? 'access_notes' or m ? 'family_id' or m ? 'coins'));
  perform ok('the invite code is hidden from a member who does not own the guild',
    roster->'guild'->>'invite_code' is null);

  perform ok('a guild member still CANNOT read the other family''s kid row',
    (select count(*) from kids where id = '9d000000-0000-0000-0000-000000000001') = 0);
end $$;

-- ---------- chat ----------

do $$
declare guild uuid; res jsonb; msgs jsonb;
begin
  set local role postgres;
  select id into guild from guilds where name = 'The Bookworms';
  set local role app_user;
  perform become('94444444-4444-4444-4444-444444444444');

  res := post_guild_message(gen_random_uuid(), guild, '9d000000-0000-0000-0000-000000000002', 'finished my chores!');
  perform ok('a member can post', (res->>'ok')::boolean);

  res := post_guild_message(gen_random_uuid(), guild, '9d000000-0000-0000-0000-000000000002', 'call me on 07700 900123');
  perform ok('a phone number is refused', res->>'reason' = 'contact_details');

  res := post_guild_message(gen_random_uuid(), guild, '9d000000-0000-0000-0000-000000000002', 'email bo@example.com');
  perform ok('an email address is refused', res->>'reason' = 'contact_details');

  res := post_guild_message(gen_random_uuid(), guild, '9d000000-0000-0000-0000-000000000002', 'look at https://example.com');
  perform ok('a link is refused', res->>'reason' = 'link');

  -- A stranger's kid is not a member and cannot post.
  perform become('95555555-5555-5555-5555-555555555555');
  begin
    perform post_guild_message(gen_random_uuid(), guild, '9d000000-0000-0000-0000-000000000002', 'hello');
    raise exception 'FAIL an outsider posted as another family''s kid';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS an outsider CANNOT post as another family''s kid';
  end;

  -- Reporting hides a message from the other children immediately.
  perform become('93333333-3333-3333-3333-333333333333');
  msgs := guild_messages_for(guild, '9d000000-0000-0000-0000-000000000001');
  perform ok('the good message is visible to the other member',
    jsonb_array_length(msgs->'messages') = 1);

  perform report_guild_message(
    ((msgs->'messages'->0->>'id')::uuid), '9d000000-0000-0000-0000-000000000001');
  msgs := guild_messages_for(guild, '9d000000-0000-0000-0000-000000000001');
  perform ok('a reported message disappears from the chat at once',
    jsonb_array_length(msgs->'messages') = 0);

  perform become('91111111-1111-1111-1111-111111111111');
  perform ok('but a parent can still see what was reported',
    jsonb_array_length(reported_guild_messages()) = 1);
end $$;

-- ---------- capacity and leaving ----------

do $$
declare guild uuid; res jsonb;
begin
  set local role postgres;
  select id into guild from guilds where name = 'The Bookworms';
  set local role app_user;
  set local role postgres;
  perform ok('a Standard guild holds five',
    (select capacity from guilds where id = guild) = 5);
  set local role app_user;

  perform become('92222222-2222-2222-2222-222222222222');
  res := leave_guild(guild, '9d000000-0000-0000-0000-000000000002');
  perform ok('a parent can pull their kid out', (res->>'ok')::boolean);
  perform become('91111111-1111-1111-1111-111111111111');   -- Amy's parent looks
  perform ok('and they leave the roster',
    not exists (
      select 1 from jsonb_array_elements(
        (guild_roster(guild, '9d000000-0000-0000-0000-000000000001'))->'members') m
       where m->>'name' = 'Bo'));
end $$;

reset role;
