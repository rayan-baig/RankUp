-- ---------------------------------------------------------------------------
-- Every table, generated from the database: one family cannot read, insert,
-- update or delete another family's rows, and the anon key reads nothing.
--
-- The list of tables is NOT written out here. It is read from pg_class, so a
-- table added next month is covered the day it is created, and a table that
-- forgets `enable row level security` fails here rather than in production.
--
-- "Another family's rows" is everything that is not family B's own: a row is
-- B's when one of its uuid columns holds one of B's ids (the family, its
-- adults, its children, their sign-ins). B is created fresh below, so every
-- other row in the database — family A's below, and every earlier test
-- file's families — must be invisible and untouchable to it.
--
-- Deliberate exceptions, and the only ones:
--   consent_notices  readable by any SIGNED-IN account: it is the published
--                    wording of the consent notice, the same text the app
--                    ships, and holds nothing about anybody. Not the anon key.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------- two families, set up as the owner ----------
-- A has a row in every family table, so nothing below passes by being empty.
insert into auth.users (id, email) values
  ('31a00000-0000-4000-8000-0000000000a1', 't31-parent-a@example.com'),
  ('31a00000-0000-4000-8000-0000000000a2', 't31-kid-a@example.com'),
  ('31b00000-0000-4000-8000-0000000000b1', 't31-parent-b@example.com'),
  ('31b00000-0000-4000-8000-0000000000b2', 't31-kid-b@example.com'),
  ('31c00000-0000-4000-8000-0000000000c1', 't31-nobody@example.com');

insert into families (id, name, tier) values
  ('31a00000-0000-4000-8000-00000000000f', 'T31 Family A', 'elite'),
  ('31b00000-0000-4000-8000-00000000000f', 'T31 Family B', 'elite');
insert into parents (id, user_id, family_id, name, is_owner) values
  ('31a00000-0000-4000-8000-0000000000aa', '31a00000-0000-4000-8000-0000000000a1', '31a00000-0000-4000-8000-00000000000f', 'Ada', true),
  ('31b00000-0000-4000-8000-0000000000bb', '31b00000-0000-4000-8000-0000000000b1', '31b00000-0000-4000-8000-00000000000f', 'Bea', true);
select seed_consent('31a00000-0000-4000-8000-00000000000f', '31a00000-0000-4000-8000-0000000000a1');
select seed_consent('31b00000-0000-4000-8000-00000000000f', '31b00000-0000-4000-8000-0000000000b1');
insert into kids (id, family_id, user_id, name) values
  ('31a00000-0000-4000-8000-00000000000c', '31a00000-0000-4000-8000-00000000000f', '31a00000-0000-4000-8000-0000000000a2', 'Alfie'),
  ('31b00000-0000-4000-8000-00000000000c', '31b00000-0000-4000-8000-00000000000f', '31b00000-0000-4000-8000-0000000000b2', 'Bodhi');

-- The family-owned tables, for both families: B needs rows of its own so that
-- "move my own row onto A's child" can be tried.
do $$
declare f record;
begin
  for f in select * from (values
      ('31a00000-0000-4000-8000-00000000000f'::uuid, '31a00000-0000-4000-8000-00000000000c'::uuid, '31a00000-0000-4000-8000-0000000000aa'::uuid, 'a'),
      ('31b00000-0000-4000-8000-00000000000f'::uuid, '31b00000-0000-4000-8000-00000000000c'::uuid, '31b00000-0000-4000-8000-0000000000bb'::uuid, 'b')) v(fam, kid, parent, tag)
  loop
    insert into quests (id, family_id, kid_id, title) values (overlay(f.fam::text placing 'e1' from 35)::uuid, f.fam, f.kid, 'T31 quest ' || f.tag);
    insert into submissions (id, family_id, quest_id, kid_id, status)
      values (overlay(f.fam::text placing 'e2' from 35)::uuid, f.fam, overlay(f.fam::text placing 'e1' from 35)::uuid, f.kid, 'pending');
    insert into rewards (id, family_id, name, cost) values (overlay(f.fam::text placing 'e3' from 35)::uuid, f.fam, 'T31 reward', 10);
    insert into redemptions (id, family_id, reward_id, kid_id, name, cost)
      values (overlay(f.fam::text placing 'e4' from 35)::uuid, f.fam, overlay(f.fam::text placing 'e3' from 35)::uuid, f.kid, 'T31 reward', 10);
    insert into notes (id, family_id, kid_id, author, body) values (overlay(f.fam::text placing 'e5' from 35)::uuid, f.fam, f.kid, 'parent', 'T31 note');
    insert into overrides (id, family_id, kid_id, applied_by, kind, reason)
      values (overlay(f.fam::text placing 'e6' from 35)::uuid, f.fam, f.kid, f.parent, 'tax', 'T31');
    insert into family_goals (family_id, name, target_xp) values (f.fam, 'T31 goal', 500);
    insert into events (family_id, kid_id, type) values (f.fam, f.kid, 'quest_approved');
    insert into allowance_entries (family_id, kid_id, pence, kind) values (f.fam, f.kid, 100, 'gift');
    insert into reminder_schedules (family_id, role, kid_id, at_local) values (f.fam, 'kid', f.kid, '18:00');
    insert into digest_sends (family_id, week_key) values (f.fam, '2026-W01');
    insert into trial_reminder_sends (family_id, kind, trial_ends_at) values (f.fam, 'three_days', now());
    insert into push_sends (family_id) values (f.fam);
    insert into crash_reports (family_id, where_at, message) values (f.fam, 'T31', 'T31');
    insert into rpc_receipts (id, kid_id, fn, result) values (gen_random_uuid(), f.kid, 'T31', '{}');
  end loop;
end $$;
insert into push_subscriptions (endpoint, keys, family_id, kid_id, user_id, role) values
  ('https://push.example/t31-a', '{}', '31a00000-0000-4000-8000-00000000000f', null, '31a00000-0000-4000-8000-0000000000a1', 'parent');
-- A school, and its month's email, which no family may see.
insert into schools (id, name, district, district_key, student_count, size_band) values
  ('31a00000-0000-4000-8000-0000000005c1', 'T31 School', 'T31 District', 't31 district', 10, 'small');
insert into school_month_emails (school_id, month_key) values ('31a00000-0000-4000-8000-0000000005c1', '2026-01');
-- The server's error log, what the error report remembers, and the daily
-- usage counts: none of them is any family's, and none may be read by one.
insert into server_errors (where_at, message) values ('t31', 'T31');
insert into error_report_kinds (fingerprint) values ('t31');
insert into error_report_sends (kinds) values ('[]');
select usage_bump('help_views');
-- A tombstone in `deletions`, the way a real delete leaves one.
insert into quests (id, family_id, kid_id, title) values
  ('31a00000-0000-4000-8000-0000000000d1', '31a00000-0000-4000-8000-00000000000f', '31a00000-0000-4000-8000-00000000000c', 'T31 deleted');
delete from quests where id = '31a00000-0000-4000-8000-0000000000d1';

-- Supabase grants every table to anon and authenticated by default; the SQL
-- files' own revokes are deliberately undone here, so row level security is
-- the ONLY thing standing in the way. That is the worst case, and the one a
-- forgotten revoke would leave.
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

/*
 * The check, for one caller. Runs as the owner to read what is there, then
 * as the caller to try it. Every write is made inside a block that is rolled
 * back whatever happens, so a hole found here damages nothing.
 *
 * Returns the failures; the caller of this prints them and fails.
 */
create or replace function t31_tenancy(p_role text, p_user uuid, p_own uuid[], p_victim_kid uuid,
                                       p_own_family uuid, p_label text)
returns text[] language plpgsql as $$
declare
  t        record;
  v_pred   text;
  v_cols   text;
  v_upd    text;
  v_sample jsonb;
  v_n      bigint;
  v_fails  text[] := '{}';
  v_tables int := 0;
  v_state  text;
  v_msg    text;
  v_readable_exceptions text[] := case when p_role = 'anon' then '{}'::text[] else array['consent_notices'] end;
begin
  for t in
    select c.oid::regclass as rel, c.relname, c.relkind, c.relrowsecurity
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
     order by c.relname
  loop
    v_tables := v_tables + 1;
    execute 'set local role postgres';
    perform become(null);

    if t.relkind in ('r', 'p') and not t.relrowsecurity then
      v_fails := v_fails || format('%s: row level security is OFF', t.relname);
      continue;
    end if;

    -- "Mine": any uuid column holding one of the caller's ids.
    select coalesce(string_agg(format('x.%I = any(%L::uuid[])', attname, p_own), ' or '), 'false')
      into v_pred
      from pg_attribute
     where attrelid = t.rel and attnum > 0 and not attisdropped and atttypid = 'uuid'::regtype;
    v_pred := format('not coalesce(%s, false)', v_pred);

    -- Something to be refused, or the test proves nothing.
    execute format('select count(*) from %s x where %s', t.rel, v_pred) into v_n;
    if v_n = 0 then
      v_fails := v_fails || format('%s: has no other family''s rows to test against — add a fixture', t.relname);
      continue;
    end if;
    execute format('select to_jsonb(x) from %s x where %s limit 1', t.rel, v_pred) into v_sample;
    -- Every column, so the row is a faithful copy of somebody else's.
    select string_agg(quote_ident(attname), ', ' order by attnum)
      into v_cols
      from pg_attribute
     where attrelid = t.rel and attnum > 0 and not attisdropped and attgenerated = '';
    -- A column the caller may write, if there is one; the update is a no-op
    -- value, so a "success" is measured by rows touched, not by damage.
    select quote_ident(attname) into v_upd
      from pg_attribute
     where attrelid = t.rel and attnum > 0 and not attisdropped and attgenerated = ''
       and has_column_privilege(p_role, t.rel, attname, 'UPDATE')
     order by attnum limit 1;

    execute format('set local role %I', p_role);
    perform become(p_user);

    -- READ
    begin
      execute format('select count(*) from %s x where %s', t.rel, v_pred) into v_n;
      if v_n > 0 and not t.relname = any (v_readable_exceptions) then
        v_fails := v_fails || format('%s: READ %s of other families'' rows', t.relname, v_n);
      end if;
    exception when insufficient_privilege then null;
    end;

    if t.relkind not in ('r', 'p') then continue; end if;

    -- UPDATE
    if v_upd is not null then
      begin
        execute format('update %s x set %s = x.%s where %s', t.rel, v_upd, v_upd, v_pred);
        get diagnostics v_n = row_count;
        raise exception using errcode = 'T3101', message = v_n::text;
      exception
        when sqlstate 'T3101' then
          if sqlerrm::bigint > 0 then
            v_fails := v_fails || format('%s: UPDATED %s of other families'' rows', t.relname, sqlerrm);
          end if;
        when others then null;  -- refused outright
      end;
    end if;

    -- DELETE
    begin
      execute format('delete from %s x where %s', t.rel, v_pred);
      get diagnostics v_n = row_count;
      raise exception using errcode = 'T3101', message = v_n::text;
    exception
      when sqlstate 'T3101' then
        if sqlerrm::bigint > 0 then
          v_fails := v_fails || format('%s: DELETED %s of other families'' rows', t.relname, sqlerrm);
        end if;
      when others then null;
    end;

    -- INSERT a copy of another family's row. Row level security is checked
    -- before uniqueness, NOT NULL, CHECK and foreign keys, so any error other
    -- than "refused" (42501) means the policy let it through.
    begin
      execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1)',
                     t.rel, v_cols, v_cols, t.rel) using v_sample;
      raise exception using errcode = 'T3101', message = 'inserted';
    exception
      when sqlstate 'T3101' then
        v_fails := v_fails || format('%s: INSERTED a row as another family', t.relname);
      when insufficient_privilege then null;
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
        if v_state <> 'P0001' then
          v_fails := v_fails || format('%s: an insert as another family got past row level security (%s %s)',
                                       t.relname, v_state, left(v_msg, 60));
        end if;
    end;
  end loop;

  /*
   * Moving a row of one's OWN family onto another family's child.
   *
   * Every table that has both a family and a child. The row stays in B's
   * family, so the family check alone lets it through — and then it is a
   * chore, note or penalty about family A's child, which A's child's School
   * League points, guild roster and history all read by child.
   */
  if p_victim_kid is not null then
    for t in
      select c.oid::regclass as rel, c.relname
        from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
         and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'family_id' and not a.attisdropped)
         and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'kid_id' and not a.attisdropped)
       order by c.relname
    loop
      execute 'set local role postgres';
      perform become(null);
      execute format('select to_jsonb(x) from %s x where x.family_id = %L limit 1', t.rel, p_own_family) into v_sample;
      if v_sample is null then continue; end if;
      v_sample := v_sample || jsonb_build_object('kid_id', p_victim_kid);
      if v_sample ? 'id' then v_sample := v_sample || jsonb_build_object('id', gen_random_uuid()); end if;
      select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
        from pg_attribute where attrelid = t.rel and attnum > 0 and not attisdropped and attgenerated = '';

      execute format('set local role %I', p_role);
      perform become(p_user);
      begin
        execute format('update %s x set kid_id = %L where x.family_id = %L', t.rel, p_victim_kid, p_own_family);
        -- Counted as the owner, and by what is now there rather than by rows
        -- touched: a guard trigger may have quietly put the child back.
        execute 'set local role postgres';
        execute format('select count(*) from %s x where x.family_id = %L and x.kid_id = %L',
                       t.rel, p_own_family, p_victim_kid) into v_n;
        raise exception using errcode = 'T3101', message = v_n::text;
      exception
        when sqlstate 'T3101' then
          if sqlerrm::bigint > 0 then
            v_fails := v_fails || format('%s: moved its own row onto another family''s child', t.relname);
          end if;
        when others then null;
      end;
      begin
        execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1)',
                       t.rel, v_cols, v_cols, t.rel) using v_sample;
        raise exception using errcode = 'T3101', message = 'inserted';
      exception
        when sqlstate 'T3101' then
          v_fails := v_fails || format('%s: added a row about another family''s child', t.relname);
        when others then null;
      end;
    end loop;
  end if;

  execute 'set local role postgres';
  perform become(null);
  raise notice '  (% tables and views checked as %)', v_tables, p_label;
  return v_fails;
end $$;

do $$
declare
  v_b uuid[] := array['31b00000-0000-4000-8000-00000000000f', '31b00000-0000-4000-8000-0000000000bb',
                      '31b00000-0000-4000-8000-0000000000b1', '31b00000-0000-4000-8000-00000000000c',
                      '31b00000-0000-4000-8000-0000000000b2']::uuid[];
  v_a_kid uuid := '31a00000-0000-4000-8000-00000000000c';
  v_fails text[];
begin
  v_fails := t31_tenancy('app_user', '31b00000-0000-4000-8000-0000000000b1', v_b, v_a_kid,
                         '31b00000-0000-4000-8000-00000000000f', 'family B''s parent');
  perform ok('family B''s parent cannot read, insert, update or delete any other family''s rows, in any table',
             cardinality(v_fails) = 0, array_to_string(v_fails, '; '));

  v_fails := t31_tenancy('app_user', '31b00000-0000-4000-8000-0000000000b2', v_b, v_a_kid,
                         '31b00000-0000-4000-8000-00000000000f', 'family B''s child');
  perform ok('family B''s child cannot either',
             cardinality(v_fails) = 0, array_to_string(v_fails, '; '));

  v_fails := t31_tenancy('app_user', '31c00000-0000-4000-8000-0000000000c1',
                         array['31c00000-0000-4000-8000-0000000000c1']::uuid[], null, null,
                         'a signed-in account in no family');
  perform ok('nor can a signed-in account that belongs to no family',
             cardinality(v_fails) = 0, array_to_string(v_fails, '; '));

  -- The anon key: Supabase's `anon` role with no sign-in at all.
  v_fails := t31_tenancy('anon', null, '{}'::uuid[], null, null, 'the anon key');
  perform ok('the anon key cannot read (or write) any table directly — not one row of any of them',
             cardinality(v_fails) = 0, array_to_string(v_fails, '; '));
end $$;

-- The exceptions list above is the whole list, and it stays a list of things
-- that hold nobody's data: it has no uuid column to hang a family on.
do $$ begin
  perform ok('the one table any signed-in account may read holds nothing about any family',
    not exists (select 1 from pg_attribute where attrelid = 'consent_notices'::regclass
                 and attnum > 0 and not attisdropped and atttypid = 'uuid'::regtype));
end $$;

drop function t31_tenancy(text, uuid, uuid[], uuid, uuid, text);
