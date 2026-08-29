-- Test helpers that need the full schema in place. Loaded after consent.sql.
/**
 * Test helper: put consent on file for a family without going through the
 * signed-in parent path. Only for fixtures — the real flow is
 * record_parental_consent, and the trigger on `kids` means no test can create a
 * child without this, which is the point.
 */
create or replace function seed_consent(p_family_id uuid, p_parent_user uuid)
returns void language plpgsql as $$
declare v_parent uuid;
begin
  select id into v_parent from parents where user_id = p_parent_user;
  insert into parental_consents (family_id, parent_id, version, method, signed_name)
  values (p_family_id, v_parent, '2026-01', 'payment_card', 'Test Parent');
end $$;
