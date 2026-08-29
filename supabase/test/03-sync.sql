-- ---------------------------------------------------------------------------
-- family_snapshot: does "what changed since I last looked?" actually work, and
-- does it stay inside the caller's own family?
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('c1111111-1111-1111-1111-111111111111', 'sync-parent@example.com'),
  ('c3333333-3333-3333-3333-333333333333', 'sync-kid@example.com');
insert into families (id, name) values
  ('c2222222-0000-0000-0000-000000000001', 'Sync Family');
insert into parents (user_id, family_id, name) values
  ('c1111111-1111-1111-1111-111111111111', 'c2222222-0000-0000-0000-000000000001', 'Sync Parent');
select seed_consent('c2222222-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111');

insert into kids (id, family_id, user_id, name) values
  ('c4444444-0000-0000-0000-000000000001', 'c2222222-0000-0000-0000-000000000001',
   'c3333333-3333-3333-3333-333333333333', 'Sam');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
-- The blanket grant above re-opens the billing columns; lock them again.
select lock_billing_columns();

set role app_user;

do $$
declare
  snap  jsonb;
  cut   bigint;
  qid   uuid;
begin
  perform become('c1111111-1111-1111-1111-111111111111');

  snap := family_snapshot(0);
  perform ok('a full snapshot returns this family''s kid',
    jsonb_array_length(snap->'kids') = 1
    and snap->'kids'->0->>'name' = 'Sam');
  perform ok('a full snapshot does NOT leak other families',
    not exists (
      select 1 from jsonb_array_elements(snap->'families') f
       where f->>'id' <> 'c2222222-0000-0000-0000-000000000001'));

  cut := (snap->>'server_rev')::bigint;

  snap := family_snapshot(cut);
  perform ok('an up-to-date device gets nothing back',
    jsonb_array_length(snap->'kids') = 0 and jsonb_array_length(snap->'quests') = 0);

  -- The parent assigns something after that cutoff.
  insert into quests (family_id, kid_id, title, xp, done_means)
  values ('c2222222-0000-0000-0000-000000000001', 'c4444444-0000-0000-0000-000000000001',
          'Feed the cat', 20, 'Bowl has food')
  returning id into qid;

  snap := family_snapshot(cut);
  perform ok('a new quest appears in the next snapshot',
    jsonb_array_length(snap->'quests') = 1
    and snap->'quests'->0->>'title' = 'Feed the cat');
  perform ok('unchanged rows are not re-sent',
    jsonb_array_length(snap->'kids') = 0);

  -- An edit must come through as well as an insert.
  cut := (snap->>'server_rev')::bigint;
  update quests set title = 'Feed the cat twice' where id = qid;
  snap := family_snapshot(cut);
  perform ok('an edited quest comes through on its revision',
    jsonb_array_length(snap->'quests') = 1
    and snap->'quests'->0->>'title' = 'Feed the cat twice');

  -- A deletion has to be visible, or the other device shows it forever.
  cut := (snap->>'server_rev')::bigint;
  delete from quests where id = qid;
  snap := family_snapshot(cut);
  perform ok('a deleted quest is reported as a deletion',
    jsonb_array_length(snap->'deletions') = 1
    and snap->'deletions'->0->>'table_name' = 'quests'
    and (snap->'deletions'->0->>'row_id')::uuid = qid);
end $$;

-- A kid calling the same function must see their own rows, not the family's.
do $$
declare snap jsonb;
begin
  perform become('c1111111-1111-1111-1111-111111111111');
  insert into quests (family_id, kid_id, title, xp)
  values ('c2222222-0000-0000-0000-000000000001', 'c4444444-0000-0000-0000-000000000001', 'Kid visible', 10);

  perform become('c3333333-3333-3333-3333-333333333333');
  snap := family_snapshot(0);
  perform ok('a kid''s snapshot includes their own quests',
    jsonb_array_length(snap->'quests') >= 1);
  perform ok('a kid''s snapshot is still scoped to their family',
    not exists (
      select 1 from jsonb_array_elements(snap->'kids') k
       where k->>'family_id' <> 'c2222222-0000-0000-0000-000000000001'));
end $$;

-- An outsider gets nothing at all.
do $$
declare snap jsonb;
begin
  perform become('11111111-1111-1111-1111-111111111111'); -- Parent A, a different family
  snap := family_snapshot(0);
  perform ok('another family''s parent sees none of this family''s kids',
    not exists (
      select 1 from jsonb_array_elements(coalesce(snap->'kids', '[]'::jsonb)) k
       where k->>'id' = 'c4444444-0000-0000-0000-000000000001'));
end $$;

reset role;
