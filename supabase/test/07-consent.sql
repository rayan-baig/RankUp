-- ---------------------------------------------------------------------------
-- Parental consent.
--
-- The claim being tested is strong and worth testing hard: a child's row
-- CANNOT exist without consent on file. Not "the app won't let you" — the
-- database won't, on every path in.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111', 'consent-parent@example.com'),
  ('d5555555-5555-5555-5555-555555555555', 'consent-other@example.com');
insert into families (id, name) values
  ('d2222222-0000-0000-0000-000000000001', 'Consent Family'),
  ('d3333333-0000-0000-0000-000000000002', 'Other Family');
insert into parents (user_id, family_id, name) values
  ('d1111111-1111-1111-1111-111111111111', 'd2222222-0000-0000-0000-000000000001', 'Dana'),
  ('d5555555-5555-5555-5555-555555555555', 'd3333333-0000-0000-0000-000000000002', 'Other');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

set role app_user;

do $$
declare res jsonb;
begin
  perform become('d1111111-1111-1111-1111-111111111111');

  perform ok('a new family has no consent on file',
    has_valid_consent('d2222222-0000-0000-0000-000000000001') = false);

  -- The gate.
  begin
    insert into kids (family_id, name) values ('d2222222-0000-0000-0000-000000000001', 'Too Early');
    raise exception 'FAIL a child was created without consent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a child CANNOT be created without consent (%)', left(sqlerrm, 44);
  end;

  -- A signature is required, and it has to be a real one.
  res := record_parental_consent('2026-01', 'payment_card', ' ');
  perform ok('an empty signature is refused', res->>'reason' = 'signature_required');

  res := record_parental_consent('does-not-exist', 'payment_card', 'Dana Example');
  perform ok('consent to an unpublished notice version is refused',
    res->>'reason' = 'unknown_version');

  res := record_parental_consent('2026-01', 'payment_card', 'Dana Example');
  perform ok('a parent can give consent', (res->>'ok')::boolean);
  perform ok('and it is now on file',
    has_valid_consent('d2222222-0000-0000-0000-000000000001'));

  insert into kids (family_id, name) values ('d2222222-0000-0000-0000-000000000001', 'Dot');
  perform ok('with consent, a child can be created',
    exists (select 1 from kids where name = 'Dot'));

  perform ok('the exact wording agreed to is kept, by version',
    (select version from parental_consents
      where family_id = 'd2222222-0000-0000-0000-000000000001') = '2026-01');
end $$;

-- Consent belongs to one family and does not cover another.
do $$
begin
  perform become('d5555555-5555-5555-5555-555555555555');
  perform ok('one family''s consent does not cover another',
    has_valid_consent('d3333333-0000-0000-0000-000000000002') = false);

  begin
    insert into kids (family_id, name) values ('d3333333-0000-0000-0000-000000000002', 'Nope');
    raise exception 'FAIL another family created a child on borrowed consent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS another family CANNOT create a child on borrowed consent';
  end;
end $$;

-- Export and deletion: the rights a parent actually has.
do $$
declare dump jsonb; res jsonb;
begin
  perform become('d1111111-1111-1111-1111-111111111111');

  dump := export_family_data();
  perform ok('a parent can download everything held about their family',
    jsonb_array_length(dump->'children') = 1 and dump->'family'->>'name' = 'Consent Family');
  perform ok('the export records what was consented to',
    jsonb_array_length(dump->'consents') = 1);
  perform ok('the export references photos rather than inlining them',
    not (dump->'submissions')::text like '%photo_data%');

  perform become('d5555555-5555-5555-5555-555555555555');
  dump := export_family_data();
  perform ok('an export never reaches another family',
    jsonb_array_length(coalesce(dump->'children', '[]'::jsonb)) = 0);

  -- Withdrawing consent must actually delete the child, not just flag it.
  perform become('d1111111-1111-1111-1111-111111111111');
  res := revoke_parental_consent('changed my mind');
  perform ok('withdrawing consent reports what it deleted', (res->>'children_deleted')::int = 1);
  perform ok('the child is really gone',
    not exists (select 1 from kids where name = 'Dot'));
  perform ok('and consent is no longer on file',
    has_valid_consent('d2222222-0000-0000-0000-000000000001') = false);
end $$;

-- Deleting the account.
do $$
declare res jsonb;
begin
  perform become('d5555555-5555-5555-5555-555555555555');
  res := delete_family_account('yes please');
  perform ok('deleting an account needs the exact confirmation',
    res->>'reason' = 'confirmation_required');

  res := delete_family_account('DELETE');
  perform ok('with it, the account is deleted', (res->>'ok')::boolean);

  set local role postgres;
  perform ok('the family is really gone',
    not exists (select 1 from families where id = 'd3333333-0000-0000-0000-000000000002'));
  set local role app_user;
end $$;

-- Photo retention.
do $$
declare v_cleared int; v_sub uuid := gen_random_uuid();
begin
  set local role postgres;
  perform seed_consent('d2222222-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111');
  insert into kids (id, family_id, name) values
    ('d4444444-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000001', 'Ret');
  insert into quests (id, family_id, kid_id, title, xp) values
    ('d6666666-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000001',
     'd4444444-0000-0000-0000-000000000001', 'Old chore', 10);
  insert into submissions (id, family_id, quest_id, kid_id, status, decided_at, photo_data)
  values (v_sub, 'd2222222-0000-0000-0000-000000000001', 'd6666666-0000-0000-0000-000000000001',
          'd4444444-0000-0000-0000-000000000001', 'approved', now() - interval '40 days', 'base64...');

  v_cleared := purge_reviewed_photos(30);
  perform ok('reviewed photos older than the retention window are purged', v_cleared = 1);
  perform ok('and the photo really is gone',
    (select photo_data from submissions where id = v_sub) is null);

  -- A pending submission must keep its photo: the parent has not looked yet.
  insert into submissions (id, family_id, quest_id, kid_id, status, photo_data)
  values (gen_random_uuid(), 'd2222222-0000-0000-0000-000000000001',
          'd6666666-0000-0000-0000-000000000001', 'd4444444-0000-0000-0000-000000000001',
          'pending', 'still needed');
  perform ok('a photo still waiting for review is never purged',
    purge_reviewed_photos(30) = 0);
  set local role app_user;
end $$;

reset role;
