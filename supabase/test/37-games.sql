-- ---------------------------------------------------------------------------
-- The games' state that has to be the same on every phone.
--
-- Block Craft's dragon fight is worked out on each phone from the chores, and
-- it starts no earlier than the moment the child chose Block Craft. That
-- moment is kept on the child's row and stamped by the database alone, so
-- every phone starts the fight in the same place.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('37a11111-1111-1111-1111-111111111111', 'games-parent@example.com'),
  ('37a33333-3333-3333-3333-333333333333', null);
insert into families (id, name, tier) values
  ('37a22222-0000-0000-0000-000000000001', 'Games Family', 'standard');
insert into parents (user_id, family_id, name) values
  ('37a11111-1111-1111-1111-111111111111', '37a22222-0000-0000-0000-000000000001', 'Gem');
select seed_consent('37a22222-0000-0000-0000-000000000001', '37a11111-1111-1111-1111-111111111111');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- when the theme was chosen ----------
do $$
declare v_first timestamptz; v_after timestamptz; v_snap jsonb;
begin
  insert into kids (id, family_id, user_id, name, theme_id, theme_chosen_at) values
    ('37a44444-0000-0000-0000-000000000001', '37a22222-0000-0000-0000-000000000001',
     '37a33333-3333-3333-3333-333333333333', 'Gus', 'apex', '2001-01-01');
  select theme_chosen_at into v_first from kids where id = '37a44444-0000-0000-0000-000000000001';
  perform ok('a new child''s theme is stamped by the database, not by what was sent',
    v_first > now() - interval '1 minute', v_first::text);

  -- Make the stamp visibly old, as if chosen long ago.
  alter table kids disable trigger kids_stamp_theme_chosen;
  update kids set theme_chosen_at = now() - interval '30 days' where id = '37a44444-0000-0000-0000-000000000001';
  alter table kids enable trigger kids_stamp_theme_chosen;

  set local role app_user;
  perform become('37a11111-1111-1111-1111-111111111111');
  update kids set name = 'Gussie', theme_chosen_at = now()
   where id = '37a44444-0000-0000-0000-000000000001';
  perform ok('a parent''s phone cannot move it, and renaming the child leaves it alone',
    (select theme_chosen_at from kids where id = '37a44444-0000-0000-0000-000000000001') < now() - interval '29 days');

  perform become('37a33333-3333-3333-3333-333333333333');
  perform set_kid_look('37a44444-0000-0000-0000-000000000001', 'blockcraft', null, null, null, null);
  select theme_chosen_at into v_after from kids where id = '37a44444-0000-0000-0000-000000000001';
  perform ok('the child choosing Block Craft on their own phone stamps the moment',
    v_after > now() - interval '1 minute', v_after::text);

  perform become('37a11111-1111-1111-1111-111111111111');
  v_snap := family_snapshot(0);
  perform ok('and every phone in the family is sent the same moment',
    (select (k->>'theme_chosen_at')::timestamptz from jsonb_array_elements(v_snap->'kids') k
      where (k->>'id')::uuid = '37a44444-0000-0000-0000-000000000001') = v_after);

  perform set_kid_look('37a44444-0000-0000-0000-000000000001', 'blockcraft', null, null, null, null);
  perform ok('choosing the same theme again does not restart the fight',
    (select theme_chosen_at from kids where id = '37a44444-0000-0000-0000-000000000001') = v_after);
  set local role postgres;
end $$;
