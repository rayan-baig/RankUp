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

-- Every table a device keeps a copy of needs its deletions reported, not just
-- the obvious ones. An override that is deleted rather than lifted, or a
-- redemption that goes away, has to disappear from the other phone too — and
-- the only way the other phone ever hears about a row that is gone is the
-- deletions log.
do $$
declare snap jsonb; cut bigint; oid uuid; rid uuid;
begin
  perform become('c1111111-1111-1111-1111-111111111111');

  insert into overrides (family_id, kid_id, kind, reason)
  values ('c2222222-0000-0000-0000-000000000001', 'c4444444-0000-0000-0000-000000000001',
          'tax', 'Left the milk out')
  returning id into oid;

  -- Only the kid themselves may raise a redemption, and only the database owner
  -- may remove one, so both ends of this pair are done with the role swapped.
  set local role postgres;
  insert into redemptions (family_id, kid_id, name, cost)
  values ('c2222222-0000-0000-0000-000000000001', 'c4444444-0000-0000-0000-000000000001',
          'Movie night', 50)
  returning id into rid;
  set local role app_user;
  perform become('c1111111-1111-1111-1111-111111111111');

  cut := (family_snapshot(0)->>'server_rev')::bigint;

  delete from overrides where id = oid;
  snap := family_snapshot(cut);
  perform ok('a deleted override is reported as a deletion',
    exists (
      select 1 from jsonb_array_elements(snap->'deletions') d
       where d->>'table_name' = 'overrides' and (d->>'row_id')::uuid = oid));

  set local role postgres;
  delete from redemptions where id = rid;
  set local role app_user;
  perform become('c1111111-1111-1111-1111-111111111111');
  snap := family_snapshot(cut);
  perform ok('a deleted redemption is reported as a deletion',
    exists (
      select 1 from jsonb_array_elements(snap->'deletions') d
       where d->>'table_name' = 'redemptions' and (d->>'row_id')::uuid = rid));
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

-- A child changing how their own app looks.
--
-- Their theme and their equipped skin live in the kids row, which only a parent
-- may write. So the choice never reached the server and the next pull handed
-- the old row straight back: the kid picked a theme and watched it snap back
-- within seconds. set_kid_look is the narrow way through.
do $$
declare res jsonb;
begin
  set local role postgres;
  update kids set skins = '["ember"]'::jsonb, theme_id = 'default', coins = 500
   where id = 'c4444444-0000-0000-0000-000000000001';
  set local role app_user;

  -- The child, on their own paired phone.
  perform become('c3333333-3333-3333-3333-333333333333');
  res := set_kid_look('c4444444-0000-0000-0000-000000000001', 'nebula', 'gold', 'confetti', 'ember', 320);
  perform ok('a child can change their own theme', (res->>'ok')::boolean = true);
  perform ok('and it really is stored',
    (select theme_id from kids where id = 'c4444444-0000-0000-0000-000000000001') = 'nebula'
    and (select skin_id from kids where id = 'c4444444-0000-0000-0000-000000000001') = 'ember'
    and (select profile_frame from kids where id = 'c4444444-0000-0000-0000-000000000001') = 'gold');

  -- The one cosmetic with a price on it.
  res := set_kid_look('c4444444-0000-0000-0000-000000000001', null, null, null, 'gilded', null);
  perform ok('a skin they do not own cannot be worn',
    (res->>'ok')::boolean = false and res->>'reason' = 'not_owned');
  perform ok('and the one they do own is still on',
    (select skin_id from kids where id = 'c4444444-0000-0000-0000-000000000001') = 'ember');

  -- Empty string takes it off; null leaves it alone. Those are not the same.
  res := set_kid_look('c4444444-0000-0000-0000-000000000001', 'aurora', null, null, '', null);
  perform ok('an empty skin takes it off',
    (select skin_id from kids where id = 'c4444444-0000-0000-0000-000000000001') is null);
  perform ok('while the fields not mentioned are left alone',
    (select profile_frame from kids where id = 'c4444444-0000-0000-0000-000000000001') = 'gold');

  -- The reason the kids table is closed to children in the first place.
  perform ok('none of this moved a balance',
    (select coins from kids where id = 'c4444444-0000-0000-0000-000000000001') = 500);
end $$;

-- And a stranger cannot dress somebody else's child.
do $$
begin
  perform become('11111111-1111-1111-1111-111111111111'); -- a parent of another family
  begin
    perform set_kid_look('c4444444-0000-0000-0000-000000000001', 'clown', null, null, null, null);
    perform ok('another family CANNOT change this child''s look', false);
  exception when others then
    perform ok('another family CANNOT change this child''s look', true);
  end;
end $$;

-- The proof photograph does not ride along in the snapshot.
--
-- It is 96% of the payload when it is in there, and it was being delivered to
-- every device on every sync — including the child's own phone, which took it.
-- The snapshot carries a flag; the picture is fetched once, by the device that
-- is going to draw it.
do $$
declare snap jsonb; sid uuid; row jsonb;
begin
  set local role postgres;
  insert into submissions (id, family_id, quest_id, kid_id, status, photo_data)
  select '0c700000-0000-4000-8000-000000000001',
         'c2222222-0000-0000-0000-000000000001', q.id,
         'c4444444-0000-0000-0000-000000000001', 'pending',
         'data:image/jpeg;base64,' || repeat('A', 80000)
    from quests q where q.family_id = 'c2222222-0000-0000-0000-000000000001' limit 1
  returning id into sid;
  set local role app_user;

  perform become('c1111111-1111-1111-1111-111111111111');
  snap := family_snapshot(0);
  select e into row from jsonb_array_elements(snap->'submissions') e
   where (e->>'id')::uuid = '0c700000-0000-4000-8000-000000000001';

  perform ok('the submission is still in the snapshot', row is not null);
  perform ok('but the photograph is not', not (row ? 'photo_data'));
  perform ok('a flag says there is one to fetch', (row->>'has_photo')::boolean = true);
  perform ok('and the whole snapshot is now small',
    length(snap::text) < 20000, 'it is ' || length(snap::text) || ' bytes');

  perform ok('the parent can fetch the picture itself',
    length(submission_photo('0c700000-0000-4000-8000-000000000001')) > 80000);

  -- The child may fetch their own; row level security is what decides, and
  -- this function adds no new way in.
  perform become('c3333333-3333-3333-3333-333333333333');
  perform ok('the child could fetch their own proof',
    length(submission_photo('0c700000-0000-4000-8000-000000000001')) > 80000);
end $$;

-- And nobody else can.
do $$
begin
  perform become('11111111-1111-1111-1111-111111111111'); -- another family's parent
  perform ok('another family gets nothing for that id',
    submission_photo('0c700000-0000-4000-8000-000000000001') is null);
end $$;

-- A decided chore has no photograph left to hand over, and says so plainly
-- rather than erroring: that is the normal end state for every photo here.
do $$
begin
  set local role postgres;
  update submissions set photo_data = null, photo_deleted_at = now(),
                         status = 'approved'
   where id = '0c700000-0000-4000-8000-000000000001';
  set local role app_user;
  perform become('c1111111-1111-1111-1111-111111111111');
  perform ok('a reviewed photo is simply gone',
    submission_photo('0c700000-0000-4000-8000-000000000001') is null);
  perform ok('and the flag says so too',
    (select (e->>'has_photo')::boolean from jsonb_array_elements(family_snapshot(0)->'submissions') e
      where (e->>'id')::uuid = '0c700000-0000-4000-8000-000000000001') = false);
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

-- A device with no family yet must be handed nothing at all — not even a
-- revision number. This is the bug that made a freshly paired kid's phone open
-- to an empty quest list: it had been polling while it waited, banked the
-- server's current revision, and afterwards only ever asked for writes newer
-- than that.
do $$
declare snap jsonb;
begin
  set local role postgres;
  insert into auth.users (id, email)
  values ('c9999999-9999-9999-9999-999999999999', null)
  on conflict do nothing;
  set local role app_user;

  perform become('c9999999-9999-9999-9999-999999999999');
  snap := family_snapshot(0);
  perform ok('a device belonging to no family is given no snapshot', snap is null);
  perform ok('and so cannot bank a revision to skip past',
    snap is null or snap->>'server_rev' is null);
end $$;

reset role;
