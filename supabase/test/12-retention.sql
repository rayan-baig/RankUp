-- ---------------------------------------------------------------------------
-- Retention.
--
-- A job that deletes across every family in the database has exactly two ways
-- to be wrong: it deletes too much, or a customer can call it. Both are tested
-- here, along with the claim that it actually reclaims anything.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('3c111111-0000-0000-0000-000000000001', 'ret-parent@example.com');
insert into families (id, name) values ('3c222222-0000-0000-0000-000000000001', 'The Keepers');
insert into parents (user_id, family_id, name) values
  ('3c111111-0000-0000-0000-000000000001', '3c222222-0000-0000-0000-000000000001', 'Ren');
select seed_consent('3c222222-0000-0000-0000-000000000001', '3c111111-0000-0000-0000-000000000001');
insert into kids (id, family_id, name) values
  ('3c444444-0000-0000-0000-000000000001', '3c222222-0000-0000-0000-000000000001', 'Remy');
insert into quests (id, family_id, kid_id, title) values
  ('3c555555-0000-0000-0000-000000000001', '3c222222-0000-0000-0000-000000000001',
   '3c444444-0000-0000-0000-000000000001', 'Bins');

-- An old undecided submission still holding its photo, and a fresh one.
insert into submissions (id, family_id, quest_id, kid_id, status, submitted_at, photo_data) values
  ('3c666666-0000-0000-0000-000000000001', '3c222222-0000-0000-0000-000000000001',
   '3c555555-0000-0000-0000-000000000001', '3c444444-0000-0000-0000-000000000001',
   'pending', now() - interval '40 days', 'data:image/jpeg;base64,AAAA'),
  ('3c666666-0000-0000-0000-000000000002', '3c222222-0000-0000-0000-000000000001',
   '3c555555-0000-0000-0000-000000000001', '3c444444-0000-0000-0000-000000000001',
   'pending', now() - interval '1 day', 'data:image/jpeg;base64,BBBB');

insert into events (family_id, kid_id, type, created_at) values
  ('3c222222-0000-0000-0000-000000000001', '3c444444-0000-0000-0000-000000000001',
   'quest_approved', now() - interval '200 days'),
  ('3c222222-0000-0000-0000-000000000001', '3c444444-0000-0000-0000-000000000001',
   'quest_approved', now() - interval '3 days');

insert into pairing_codes (code, kid_name, expires_at) values
  ('900001', 'Old',   now() - interval '30 days'),
  ('900002', 'Fresh', now() + interval '10 minutes');

insert into pairing_claim_attempts (user_id, tried_at) values
  ('3c111111-0000-0000-0000-000000000001', now() - interval '3 days'),
  ('3c111111-0000-0000-0000-000000000001', now() - interval '2 minutes');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

-- ---------- a customer cannot run it ----------
set role app_user;
do $$
begin
  perform become('3c111111-0000-0000-0000-000000000001');
  begin
    perform run_retention();
    raise exception 'FAIL a parent ran retention across every family';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a parent CANNOT run retention (%)', left(sqlerrm, 32);
  end;
end $$;
reset role;

-- ---------- it deletes the stale and keeps the recent ----------
do $$
declare v jsonb;
begin
  v := run_retention(14, 90, 2);

  perform ok('the forty-day-old photo is cleared', (v->>'photos_cleared')::int = 1);
  perform ok('and yesterday''s is untouched',
    (select photo_data is not null from submissions
      where id = '3c666666-0000-0000-0000-000000000002'));
  perform ok('the submission itself is kept — only the photo goes',
    (select count(*) from submissions
      where id = '3c666666-0000-0000-0000-000000000001') = 1);

  perform ok('the two-hundred-day-old event is gone', (v->>'events_deleted')::int = 1);
  perform ok('and the three-day-old one is still there',
    (select count(*) from events
      where family_id = '3c222222-0000-0000-0000-000000000001') = 1);

  perform ok('the long-expired pairing code is gone', (v->>'pairing_codes_deleted')::int = 1);
  perform ok('and a live code is not touched',
    (select count(*) from pairing_codes where code = '900002') = 1);

  perform ok('the stale rate-limit mark is gone', (v->>'claim_attempts_deleted')::int = 1);
  perform ok('and the one inside the window is kept',
    (select count(*) from pairing_claim_attempts
      where user_id = '3c111111-0000-0000-0000-000000000001') = 1);
end $$;

-- ---------- running it twice reclaims nothing more ----------
do $$
declare v jsonb;
begin
  v := run_retention(14, 90, 2);
  perform ok('a second run deletes nothing',
    (v->>'photos_cleared')::int = 0 and (v->>'events_deleted')::int = 0
    and (v->>'pairing_codes_deleted')::int = 0);
end $$;

-- ---------- the floors stop a caller wiping live data ----------
do $$
begin
  insert into events (family_id, kid_id, type, created_at) values
    ('3c222222-0000-0000-0000-000000000001', '3c444444-0000-0000-0000-000000000001',
     'quest_approved', now() - interval '2 days');
  -- Asking for zero days would otherwise delete everything, including today.
  perform run_retention(14, 0, 2);
  perform ok('an event from two days ago survives a zero-day request',
    (select count(*) from events
      where family_id = '3c222222-0000-0000-0000-000000000001'
        and created_at > now() - interval '7 days') = 2);
end $$;
