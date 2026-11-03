-- ---------------------------------------------------------------------------
-- No security definer function trusts an id the caller hands it.
--
-- A security definer function runs as the table owner, so row level security
-- does not apply inside it: the function's own checks are all there is. Any
-- such function a browser may call that takes an id — a family, a child, a
-- guild, a chore — is a door into somebody else's family unless it first asks
-- whether the caller belongs on the other side of it.
--
-- Generated from the catalogue, like 31-every-table.sql: every function that
-- is security definer, callable by `anon` or `authenticated`, and takes a
-- uuid. A new one is covered the day it is written.
--
--   1. Its source must ask who the caller is (auth.uid() or one of the
--      helpers built on it). A function that never does cannot be checking.
--   2. It is called, as family B's parent and as family B's child, three ways:
--        - every id is family A's;
--        - the family is B's own and the child is A's ("checked the family,
--          not the child");
--        - the child is B's own and everything else is A's ("checked the
--          child, not the chore / guild / reward").
--      Each call runs in a block that is rolled back. Inside it, family A's
--      rows — every row in every table holding one of A's ids — must be
--      exactly as they were, and the answer must not contain anything of A's.
--   3. The functions the server alone may run (the scheduled jobs, the
--      operator's page, the owner's console, billing) are not callable from a
--      browser at all.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------- family A: the one being reached for ----------
insert into auth.users (id, email) values
  ('32a00000-0000-4000-8000-0000000000a1', 't32-parent-a@example.com'),
  ('32a00000-0000-4000-8000-0000000000a3', 't32-coparent-a@example.com'),
  ('32a00000-0000-4000-8000-0000000000a2', 't32-kid-a@example.com'),
  ('32b00000-0000-4000-8000-0000000000b1', 't32-parent-b@example.com'),
  ('32b00000-0000-4000-8000-0000000000b2', 't32-kid-b@example.com');
insert into families (id, name, tier) values
  ('32a00000-0000-4000-8000-00000000000f', 'Zanzibar household', 'elite'),
  ('32b00000-0000-4000-8000-00000000000f', 'T32 Family B', 'elite');
insert into parents (id, user_id, family_id, name, is_owner, role) values
  ('32a00000-0000-4000-8000-0000000000aa', '32a00000-0000-4000-8000-0000000000a1', '32a00000-0000-4000-8000-00000000000f', 'Zanzibar Owner', true, 'parent'),
  ('32a00000-0000-4000-8000-0000000000ab', '32a00000-0000-4000-8000-0000000000a3', '32a00000-0000-4000-8000-00000000000f', 'Zanzibar Coparent', false, 'parent'),
  ('32b00000-0000-4000-8000-0000000000bb', '32b00000-0000-4000-8000-0000000000b1', '32b00000-0000-4000-8000-00000000000f', 'Bea', true, 'parent');
select seed_consent('32a00000-0000-4000-8000-00000000000f', '32a00000-0000-4000-8000-0000000000a1');
select seed_consent('32b00000-0000-4000-8000-00000000000f', '32b00000-0000-4000-8000-0000000000b1');
insert into kids (id, family_id, user_id, name) values
  ('32a00000-0000-4000-8000-00000000000c', '32a00000-0000-4000-8000-00000000000f', '32a00000-0000-4000-8000-0000000000a2', 'Zanzibar Kid'),
  ('32a00000-0000-4000-8000-00000000000d', '32a00000-0000-4000-8000-00000000000f', null, 'Zanzibar Sibling'),
  ('32b00000-0000-4000-8000-00000000000c', '32b00000-0000-4000-8000-00000000000f', '32b00000-0000-4000-8000-0000000000b2', 'Bodhi');

do $$
declare f record;
begin
  for f in select * from (values
      ('32a00000-0000-4000-8000-00000000000f'::uuid, '32a00000-0000-4000-8000-00000000000c'::uuid, 'Zanzibar', 'ZZA'),
      ('32b00000-0000-4000-8000-00000000000f'::uuid, '32b00000-0000-4000-8000-00000000000c'::uuid, 'T32B', 'BBB')) v(fam, kid, word, code)
  loop
    insert into quests (id, family_id, kid_id, title, xp) values (overlay(f.fam::text placing 'e1' from 35)::uuid, f.fam, f.kid, f.word || ' quest', 30);
    insert into quests (id, family_id, kid_id, title, xp) values (overlay(f.fam::text placing 'e7' from 35)::uuid, f.fam, f.kid, f.word || ' open quest', 30);
    insert into submissions (id, family_id, quest_id, kid_id, status, note)
      values (overlay(f.fam::text placing 'e2' from 35)::uuid, f.fam, overlay(f.fam::text placing 'e1' from 35)::uuid, f.kid, 'pending', f.word || ' note');
    update quests set status = 'submitted' where id = overlay(f.fam::text placing 'e1' from 35)::uuid;
    insert into rewards (id, family_id, name, cost) values (overlay(f.fam::text placing 'e3' from 35)::uuid, f.fam, f.word || ' reward', 1);
    insert into redemptions (id, family_id, reward_id, kid_id, name, cost)
      values (overlay(f.fam::text placing 'e4' from 35)::uuid, f.fam, overlay(f.fam::text placing 'e3' from 35)::uuid, f.kid, f.word || ' reward', 1);
    insert into notes (family_id, kid_id, author, body) values (f.fam, f.kid, 'parent', f.word || ' secret note');
    insert into allowance_entries (family_id, kid_id, pence, kind) values (f.fam, f.kid, 500, 'gift');
    insert into reminder_schedules (family_id, role, kid_id, label, at_local) values (f.fam, 'kid', f.kid, f.word || ' bedtime', '19:00');
    update kids set coins = 500, play_tokens = 3, xp = 100 where id = f.kid;
    -- A guild of their own, the child its leader, with a message in it.
    insert into guilds (id, name, crest, capacity, leader_kid_id, invite_code, owner_family_id)
      values (overlay(f.fam::text placing 'e5' from 35)::uuid, f.word || ' guild', '🛡️', 10, f.kid, f.code || '232', f.fam);
    insert into guild_members (guild_id, kid_id, family_id, role, status, approved_by_own_parent, approved_by_owner)
      values (overlay(f.fam::text placing 'e5' from 35)::uuid, f.kid, f.fam, 'leader', 'active', true, true);
    insert into guild_messages (id, guild_id, kid_id, body)
      values (overlay(f.fam::text placing 'e6' from 35)::uuid, overlay(f.fam::text placing 'e5' from 35)::uuid, f.kid, f.word || ' says hi');
  end loop;
end $$;

-- A school each, in different districts, the parent its admin and the child
-- in it; and a challenge waiting for A's school.
insert into schools (id, name, district, district_key, city, student_count, size_band, join_code, staff_code, status, verified, trial_ends_at) values
  ('32a00000-0000-4000-8000-0000000000e8', 'Zanzibar School', 'T32 District A', 't32 district a', 'Zanzibar Town', 300, 'medium', 'T32JA1', 'T32SA1', 'trial', true, now() + interval '20 days'),
  ('32b00000-0000-4000-8000-0000000000e8', 'T32B School', 'T32 District B', 't32 district b', 'Elsewhere', 300, 'medium', 'T32JB1', 'T32SB1', 'trial', true, now() + interval '20 days'),
  ('32b00000-0000-4000-8000-0000000000e9', 'T32B Rival', 'T32 District A', 't32 district a', 'Elsewhere', 300, 'medium', 'T32JB2', 'T32SB2', 'trial', true, now() + interval '20 days');
insert into school_staff (user_id, school_id, name, role) values
  ('32a00000-0000-4000-8000-0000000000a1', '32a00000-0000-4000-8000-0000000000e8', 'Zanzibar Head', 'admin'),
  ('32b00000-0000-4000-8000-0000000000b1', '32b00000-0000-4000-8000-0000000000e8', 'Bea Head', 'admin');
insert into school_members (kid_id, school_id, family_id, show_name) values
  ('32a00000-0000-4000-8000-00000000000c', '32a00000-0000-4000-8000-0000000000e8', '32a00000-0000-4000-8000-00000000000f', true),
  ('32b00000-0000-4000-8000-00000000000c', '32b00000-0000-4000-8000-0000000000e8', '32b00000-0000-4000-8000-00000000000f', true);
insert into school_rivalries (id, challenger_id, rival_id, status) values
  ('32a00000-0000-4000-8000-0000000000ea', '32b00000-0000-4000-8000-0000000000e9', '32a00000-0000-4000-8000-0000000000e8', 'pending');

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

/** Every row in every table that holds one of these ids, as one fingerprint. */
create or replace function t32_footprint(p_ids uuid[]) returns text language plpgsql as $$
declare t record; v_pred text; v_hash text; v_out text := '';
begin
  for t in select c.oid::regclass as rel from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by c.relname
  loop
    select string_agg(format('x.%I = any(%L::uuid[])', attname, p_ids), ' or ') into v_pred
      from pg_attribute where attrelid = t.rel and attnum > 0 and not attisdropped and atttypid = 'uuid'::regtype;
    continue when v_pred is null;
    execute format('select md5(coalesce(string_agg(to_jsonb(x)::text, ''|'' order by to_jsonb(x)::text), '''')) from %s x where %s',
                   t.rel, v_pred) into v_hash;
    v_out := v_out || t.rel::text || '=' || v_hash || ' ';
  end loop;
  return v_out;
end $$;

/*
 * A value for every argument. Ids come from the map for this pass; anything
 * else is something ordinary, so the call gets as far as its checks. Codes
 * are deliberately wrong: a code is the capability itself, and knowing one is
 * a different question from this file's.
 */
create or replace function t32_call(p_fn regprocedure, p_ids jsonb) returns text language plpgsql as $$
declare
  v_names text[]; v_types oid[]; v_args text[] := '{}'; i int; v_name text; v_type text; v_val text;
  v_sql text; v_retset boolean;
begin
  select proargnames, proargtypes::oid[], proretset into v_names, v_types, v_retset
    from pg_proc where oid = p_fn;
  -- proargtypes is an oidvector, which counts from 0; proargnames from 1.
  for i in 0 .. coalesce(array_length(v_types, 1), 0) - 1 loop
    v_name := v_names[i + 1];
    v_type := format_type(v_types[array_lower(v_types, 1) + i], null);
    v_val := case
      when v_type = 'uuid' then coalesce(
             p_ids ->> regexp_replace(v_name, '^p_', ''),
             p_ids ->> regexp_replace(regexp_replace(v_name, '^p_', ''), '_id$', ''),
             gen_random_uuid()::text)
      when v_type = 'text' then case
             when v_name ~ '(tz|timezone)$' then 'UTC'
             when v_name = 'p_role' then 'kid'
             when v_name ~ 'code$' then '000000'
             when v_name = 'p_skin_id' then 'ember'
             when v_name = 'p_game' then 'stack'
             when v_name = 'p_status' then 'active'
             when v_name = 'p_month_key' then to_char(now() - interval '1 month', 'YYYY-MM')
             else 'T32 text' end
      when v_type in ('integer', 'bigint', 'smallint', 'numeric') then '1'
      when v_type = 'boolean' then 'true'
      when v_type = 'jsonb' then case when v_name = 'p_reminders' then '[]' else '{}' end
      when v_type = 'date' then current_date::text
      when v_type like 'timestamp%' then now()::text
      when v_type like '%[]' then '{}'
      else null end;
    v_args := v_args || format('%I => %L::%s', v_name, v_val, v_type);
  end loop;
  if v_retset then
    v_sql := format('select coalesce(string_agg(to_jsonb(r)::text, '',''), '''') from %s(%s) r',
                    p_fn::regproc, array_to_string(v_args, ', '));
  else
    v_sql := format('select (%s(%s))::text', p_fn::regproc, array_to_string(v_args, ', '));
  end if;
  execute v_sql into v_val;
  return coalesce(v_val, '');
end $$;

-- ---------- 1. every such function asks who is calling ----------
do $$
declare
  f record;
  v_silent text[] := '{}';
  v_count int := 0;
begin
  for f in
    select p.oid::regprocedure as fn, p.prosrc
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosecdef
       and p.prorettype <> 'trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
       and 'uuid'::regtype = any (p.proargtypes::oid[])
     order by p.proname
  loop
    v_count := v_count + 1;
    if f.prosrc !~ '(auth\.uid\(\)|current_family_id\(\)|current_kid_id\(\)|is_parent\(\)|may_act_for_kid\(|current_school_staff\(\)|caller_school_ids\(\)|supporter_family_id\(\))' then
      v_silent := v_silent || f.fn::text;
    end if;
  end loop;
  raise notice '  (% browser-callable security definer functions take an id)', v_count;
  perform ok('every one of them asks who is calling before it uses the id',
             cardinality(v_silent) = 0, 'never asks: ' || array_to_string(v_silent, ', '));
end $$;

-- ---------- 2. and none of them lets family B reach family A ----------
do $$
declare
  a_ids uuid[];
  v_before text;
  v_after text;
  v_result text;
  v_changed boolean;
  v_fails text[] := '{}';
  v_calls int := 0;
  f record;
  pass record;
  caller record;
  v_markers text[] := array['Zanzibar', 'ZZA232'];
  v_m text;
  v_all_a  jsonb := jsonb_build_object(
    'family', '32a00000-0000-4000-8000-00000000000f', 'kid', '32a00000-0000-4000-8000-00000000000c',
    'quest', '32a00000-0000-4000-8000-0000000000e7', 'submission', '32a00000-0000-4000-8000-0000000000e2',
    'reward', '32a00000-0000-4000-8000-0000000000e3', 'redemption', '32a00000-0000-4000-8000-0000000000e4',
    'guild', '32a00000-0000-4000-8000-0000000000e5', 'message', '32a00000-0000-4000-8000-0000000000e6',
    'school', '32a00000-0000-4000-8000-0000000000e8', 'rival', '32a00000-0000-4000-8000-0000000000e8',
    'rivalry', '32a00000-0000-4000-8000-0000000000ea', 'parent', '32a00000-0000-4000-8000-0000000000ab',
    'kid_user', '32a00000-0000-4000-8000-0000000000a2', 'school_id', '32a00000-0000-4000-8000-0000000000e8');
  v_b jsonb := jsonb_build_object(
    'family', '32b00000-0000-4000-8000-00000000000f', 'kid', '32b00000-0000-4000-8000-00000000000c',
    'quest', '32b00000-0000-4000-8000-0000000000e7', 'submission', '32b00000-0000-4000-8000-0000000000e2',
    'reward', '32b00000-0000-4000-8000-0000000000e3', 'redemption', '32b00000-0000-4000-8000-0000000000e4',
    'guild', '32b00000-0000-4000-8000-0000000000e5', 'message', '32b00000-0000-4000-8000-0000000000e6',
    'school', '32b00000-0000-4000-8000-0000000000e8', 'parent', '32b00000-0000-4000-8000-0000000000bb');
begin
  a_ids := array(select value::uuid from jsonb_each_text(v_all_a))
        || array['32a00000-0000-4000-8000-0000000000a1', '32a00000-0000-4000-8000-0000000000a3',
                 '32a00000-0000-4000-8000-0000000000aa', '32a00000-0000-4000-8000-00000000000d']::uuid[];
  v_before := t32_footprint(a_ids);

  for pass in select * from (values
      ('every id is A''s', v_all_a),
      ('B''s family, A''s child', v_b || jsonb_build_object('kid', v_all_a->>'kid')),
      ('B''s child, A''s everything else', v_all_a || jsonb_build_object('kid', v_b->>'kid', 'family', v_b->>'family')))
    as x(label, ids)
  loop
    for caller in select * from (values
        ('B''s parent', '32b00000-0000-4000-8000-0000000000b1'::uuid),
        ('B''s child',  '32b00000-0000-4000-8000-0000000000b2'::uuid)) as y(label, uid)
    loop
      for f in
        select p.oid::regprocedure as fn
          from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.prosecdef
           and p.prorettype <> 'trigger'::regtype
           and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
           and 'uuid'::regtype = any (p.proargtypes::oid[])
         order by p.proname
      loop
        v_calls := v_calls + 1;
        v_result := null;
        v_changed := false;
        begin
          execute 'set local role app_user';
          perform become(caller.uid);
          v_result := t32_call(f.fn, pass.ids);
          execute 'set local role postgres';
          perform become(null);
          v_changed := t32_footprint(a_ids) is distinct from v_before;
          raise exception using errcode = 'T3201', message = 'roll back';
        exception
          when sqlstate 'T3201' then null;
          when others then v_result := null;  -- refused: nothing happened
        end;
        execute 'set local role postgres';
        perform become(null);
        if v_changed then
          v_fails := v_fails || format('%s as %s (%s) CHANGED family A''s rows', f.fn, caller.label, pass.label);
        end if;
        foreach v_m in array v_markers loop
          if position(v_m in coalesce(v_result, '')) > 0 then
            v_fails := v_fails || format('%s as %s (%s) answered with family A''s data: %s',
                                         f.fn, caller.label, pass.label, left(v_result, 120));
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  raise notice '  (% calls made)', v_calls;
  perform ok('no browser-callable security definer function lets family B change family A''s rows, or see them',
             cardinality(v_fails) = 0, array_to_string(v_fails, '; '));
  perform ok('(and family A''s rows really are where they started)', t32_footprint(a_ids) = v_before);
end $$;

-- ---------- the specific ones a sweep could miss ----------
set role app_user;
do $$
declare v_before int;
begin
  -- A parent writing a chore-edit line into their own family about another
  -- family's child. (The trigger that calls this only ever passes its own
  -- row's child; a direct call could pass anybody's.)
  perform become('32b00000-0000-4000-8000-0000000000b1');
  perform log_quest_edit('32b00000-0000-4000-8000-00000000000f', '32a00000-0000-4000-8000-00000000000c', '{}');
  set local role postgres;
  perform ok('a history line cannot be written about another family''s child',
    not exists (select 1 from events where kid_id = '32a00000-0000-4000-8000-00000000000c' and type = 'quest_edited'));
end $$;
reset role;

-- ---------- 3. the server's own functions are not the browser's ----------
do $$
declare
  f text;
  v_open text[] := '{}';
begin
  -- What the scheduled jobs, the operator's page, the owner's console and
  -- the Stripe webhook call with the service key. Each one either crosses
  -- every family (retention, reminders, digests, settlement, the counts) or
  -- changes what someone has paid for.
  foreach f in array array[
    'usage_counts()', 'operator_schools()', 'verify_school(uuid,boolean)', 'set_school_status(uuid,text)',
    'unsuspend_school(uuid)', 'run_retention(integer,integer,integer)',
    'due_reminders(integer)', 'mark_reminder_sent(uuid)', 'due_digests(integer,integer)',
    'mark_digest_sent(uuid,text)', 'family_week_digest(uuid,date)', 'push_targets(uuid,text,uuid)',
    'record_push_failure(text,boolean)', 'claim_push_send(uuid,integer)',
    'claim_guild_request_notice(uuid,uuid,uuid)', 'settle_alliances(date)',
    'settle_school_month(date)', 'unapplied_alliance_awards()', 'unapplied_school_awards()',
    'mark_alliance_award_applied(uuid,date,text)', 'mark_school_award_applied(text,text,text)',
    'apply_subscription_change(uuid,text,text,text,text,timestamptz,text,jsonb,timestamptz)',
    'credit_flash_tickets(uuid,integer,text,jsonb)', 'attach_stripe_customer(uuid,text)',
    'family_for_customer(text)', 'stripe_customer_for_family(uuid)', 'health_snapshot()',
    'record_job_run(text,boolean,text)', 'grant_trial(uuid,text,integer)', 'has_valid_consent(uuid)',
    'is_guild_member(uuid,uuid)', 'pending_billing_cancellations(uuid,text,integer)',
    'finish_billing_cancellation(bigint,boolean,text)', 'billing_family_gone(uuid,text,text,boolean)',
    -- The trial emails' job, and a school's Stripe events.
    'due_trial_reminders()', 'due_trial_reminders_at(timestamptz)',
    'claim_trial_reminder(uuid,text,timestamptz)', 'finish_trial_reminder(uuid,text,boolean)',
    'apply_school_refund(uuid,text,boolean,timestamptz,timestamptz)',
    'apply_school_subscription(uuid,text,text,text,text,jsonb,timestamptz,timestamptz)',
    'record_school_payment(uuid,text,integer,text)', 'attach_school_customer(uuid,text)',
    'stripe_customer_for_school(uuid)', 'school_for_customer(text)',
    'due_digests_at(timestamptz,integer,integer)', 'due_reminders_at(timestamptz,integer)',
    'mark_reminder_sent_at(uuid,timestamptz)', 'claim_digest(uuid,text)']
  loop
    if to_regprocedure(f) is null then
      v_open := v_open || (f || ' (no longer exists — update this list)');
    elsif has_function_privilege('anon', to_regprocedure(f), 'execute')
       or has_function_privilege('authenticated', to_regprocedure(f), 'execute') then
      v_open := v_open || f;
    end if;
  end loop;
  perform ok('the functions only the server may run cannot be called from a browser',
             cardinality(v_open) = 0, array_to_string(v_open, ', '));
end $$;

drop function t32_call(regprocedure, jsonb);
drop function t32_footprint(uuid[]);
