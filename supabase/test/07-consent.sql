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
-- The blanket grant above re-opens the billing columns; lock them again.
select lock_billing_columns();

-- has_valid_consent is the database's own (the trigger on `kids` asks it) and
-- is not callable from a browser, so these checks ask it through a helper
-- only the test role may run.
create or replace function t07_consent_on_file(p uuid) returns boolean
language sql security definer set search_path = public as $$ select has_valid_consent(p) $$;
revoke execute on function t07_consent_on_file(uuid) from public;
grant execute on function t07_consent_on_file(uuid) to app_user;

set role app_user;

do $$
declare res jsonb;
begin
  perform become('d1111111-1111-1111-1111-111111111111');

  perform ok('a new family has no consent on file',
    t07_consent_on_file('d2222222-0000-0000-0000-000000000001') = false);

  -- The gate.
  begin
    insert into kids (family_id, name) values ('d2222222-0000-0000-0000-000000000001', 'Too Early');
    raise exception 'FAIL a child was created without consent';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a child CANNOT be created without consent (%)', left(sqlerrm, 44);
  end;

  -- A signature is required, and it has to be a real one.
  res := record_parental_consent('2026-11', 'payment_card', ' ');
  perform ok('an empty signature is refused', res->>'reason' = 'signature_required');

  res := record_parental_consent('does-not-exist', 'payment_card', 'Dana Example');
  perform ok('consent to an unpublished notice version is refused',
    res->>'reason' = 'unknown_version');

  -- The notice in force is the one a new parent signs.
  perform ok('the notice new parents are shown is 2026-11', current_consent_version() = '2026-11');
  res := record_parental_consent('2026-01', 'payment_card', 'Dana Example');
  perform ok('a NEW consent to the superseded 2026-01 wording is refused, and names the current one',
    res->>'reason' = 'outdated_version' and res->>'current' = '2026-11');
  perform ok('and records nothing',
    not exists (select 1 from parental_consents where family_id = 'd2222222-0000-0000-0000-000000000001'));

  res := record_parental_consent('2026-11', 'payment_card', 'Dana Example');
  perform ok('a parent can give consent', (res->>'ok')::boolean);
  perform ok('and it is now on file',
    t07_consent_on_file('d2222222-0000-0000-0000-000000000001'));

  insert into kids (family_id, name) values ('d2222222-0000-0000-0000-000000000001', 'Dot');
  perform ok('with consent, a child can be created',
    exists (select 1 from kids where name = 'Dot'));

  perform ok('the exact wording agreed to is kept, by version',
    (select version from parental_consents
      where family_id = 'd2222222-0000-0000-0000-000000000001') = '2026-11');
end $$;

-- The two published notices: what each says, and that neither can be edited.
do $$
declare v_old text; v_new text;
begin
  select body into v_old from consent_notices where version = '2026-01';
  select body into v_new from consent_notices where version = '2026-11';
  perform ok('2026-01 is still there, word for word as parents signed it (photographs, the AI check)',
    v_old like '%Photographs your child takes in the app%' and v_old like '%AI photo check%'
    and v_old like '%Anthropic%');
  perform ok('2026-11 says RankUp takes no photographs',
    v_new like '%RankUp never takes, sends or keeps photographs.%');
  perform ok('2026-11 mentions no AI check, no Anthropic, and no photograph taken in the app',
    v_new not like '%AI %' and v_new not ilike '%Anthropic%' and v_new not ilike '%photo check%'
    and v_new not ilike '%takes in the app%' and v_new not ilike '%proof%');
  perform ok('2026-11 was published after 2026-01',
    (select published_at from consent_notices where version = '2026-11')
      >= (select published_at from consent_notices where version = '2026-01'));
  -- As the owner: a browser cannot reach the table to try (no update policy).
  set local role postgres;
  begin
    update consent_notices set body = 'rewritten' where version = '2026-01';
    raise exception 'FAIL a published notice was rewritten';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a published notice CANNOT be rewritten, even by the owner (%)', left(sqlerrm, 40);
  end;
  perform ok('so 2026-01 is unchanged', (select body from consent_notices where version = '2026-01') = v_old);
end $$;
reset role;
-- Applying consent.sql again (the upgrade path) changes neither notice.
\ir ../consent.sql
set role app_user;
do $$
begin
  perform ok('re-applying the schema leaves 2026-01 and 2026-11 as they were, and 2026-11 current',
    (select count(*) from consent_notices) = 2 and current_consent_version() = '2026-11'
    and (select body from consent_notices where version = '2026-01') like '%AI photo check%');
end $$;

-- A family that signed 2026-01 before 2026-11 was published. Removing
-- photographs collects less, so its consent stands: nobody is asked again.
reset role;
insert into auth.users (id, email) values ('d8888888-8888-8888-8888-888888888888', 'signed-old@example.com');
insert into families (id, name) values ('d8888888-0000-0000-0000-0000000000f1', 'Signed The Old Notice');
insert into parents (user_id, family_id, name)
values ('d8888888-8888-8888-8888-888888888888', 'd8888888-0000-0000-0000-0000000000f1', 'Early');
insert into parental_consents (family_id, parent_id, version, method, signed_name, granted_at)
select 'd8888888-0000-0000-0000-0000000000f1', id, '2026-01', 'payment_card', 'Early Parent', now() - interval '200 days'
  from parents where user_id = 'd8888888-8888-8888-8888-888888888888';
set role app_user;
do $$
begin
  perform become('d8888888-8888-8888-8888-888888888888');
  perform ok('a consent given to 2026-01 is still valid after 2026-11 is published',
    t07_consent_on_file('d8888888-0000-0000-0000-0000000000f1'));
  insert into kids (family_id, name) values ('d8888888-0000-0000-0000-0000000000f1', 'Early Kid');
  perform ok('and that family can still add a child without consenting again',
    exists (select 1 from kids where name = 'Early Kid'));
  perform ok('its record still says 2026-01, the words that parent actually read',
    (select version from parental_consents where family_id = 'd8888888-0000-0000-0000-0000000000f1') = '2026-01');
end $$;

-- Consent belongs to one family and does not cover another.
do $$
begin
  perform become('d5555555-5555-5555-5555-555555555555');
  perform ok('one family''s consent does not cover another',
    t07_consent_on_file('d3333333-0000-0000-0000-000000000002') = false);

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
  perform ok('the export holds no photo or photo-check field, because there are none',
    (dump->'submissions')::text !~ '(photo|ai_verdict|ai_score|ai_report|capture_source)'
    and (dump->'family')::text !~ 'ai_checks');

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
    t07_consent_on_file('d2222222-0000-0000-0000-000000000001') = false);
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

-- Deleting an account that has children in it. The case above has none, and
-- that is how a deletion that failed for every real family went unnoticed:
-- the child's row tried to leave a sync tombstone pointing at the family
-- being deleted, and the foreign key aborted the lot.
reset role;
insert into auth.users (id, email) values ('d7777777-7777-7777-7777-777777777777', 'del-with-kid@example.com');
insert into families (id, name) values ('d7777777-0000-0000-0000-0000000000f1', 'Family With A Child');
insert into parents (user_id, family_id, name)
values ('d7777777-7777-7777-7777-777777777777', 'd7777777-0000-0000-0000-0000000000f1', 'Del');
select seed_consent('d7777777-0000-0000-0000-0000000000f1', 'd7777777-7777-7777-7777-777777777777');
insert into kids (id, family_id, name)
values ('d7777777-0000-0000-0000-0000000000c1', 'd7777777-0000-0000-0000-0000000000f1', 'Kit');
insert into quests (family_id, kid_id, title)
values ('d7777777-0000-0000-0000-0000000000f1', 'd7777777-0000-0000-0000-0000000000c1', 'Bins');
set role app_user;

do $$
declare res jsonb;
begin
  perform become('d7777777-7777-7777-7777-777777777777');
  res := delete_family_account('DELETE');
  perform ok('an account with a child in it can be deleted', (res->>'ok')::boolean);
  set local role postgres;
  perform ok('and the child is really gone',
    not exists (select 1 from kids where id = 'd7777777-0000-0000-0000-0000000000c1'));
  perform ok('with nothing left behind pointing at the family',
    not exists (select 1 from deletions where family_id = 'd7777777-0000-0000-0000-0000000000f1'));
  set local role app_user;
end $$;

-- No photos. A submission carries none, so deciding one has none to destroy,
-- and approving and sending back simply work.
do $$
declare v_sub uuid := gen_random_uuid(); v_stale uuid := gen_random_uuid();
begin
  set local role postgres;
  perform seed_consent('d2222222-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111');
  insert into kids (id, family_id, user_id, name) values
    ('d4444444-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000001',
     null, 'Ret');
  insert into quests (id, family_id, kid_id, title, xp) values
    ('d6666666-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000001',
     'd4444444-0000-0000-0000-000000000001', 'Old chore', 10);
  insert into submissions (id, family_id, quest_id, kid_id, status)
  values (v_sub, 'd2222222-0000-0000-0000-000000000001', 'd6666666-0000-0000-0000-000000000001',
          'd4444444-0000-0000-0000-000000000001', 'pending');
  set local role app_user;

  perform become('d1111111-1111-1111-1111-111111111111');
  perform approve_submission(v_sub, 10, 2, 'nice');
  perform ok('approving a submission works with no photo columns at all',
    (select status from submissions where id = v_sub) = 'approved');

  set local role postgres;
  insert into submissions (id, family_id, quest_id, kid_id, status)
  values (v_stale, 'd2222222-0000-0000-0000-000000000001', 'd6666666-0000-0000-0000-000000000001',
          'd4444444-0000-0000-0000-000000000001', 'pending');
  set local role app_user;

  perform reject_submission(v_stale, 'not quite');
  perform ok('and so does sending one back',
    (select status from submissions where id = v_stale) = 'rejected');
end $$;

reset role;

drop function t07_consent_on_file(uuid);
