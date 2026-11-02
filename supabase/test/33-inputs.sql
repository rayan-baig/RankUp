-- ---------------------------------------------------------------------------
-- Every function a browser can call holds its input to a size and a range.
--
-- Generated from the catalogue: every function in `public` that `anon` or
-- `authenticated` may execute is called by a family's own parent and own
-- child, with every text argument 100,000 characters long, every number at
-- the largest and then the smallest an int can hold, and every list as long
-- as it can sensibly be made. Ids are the family's own, so each call gets as
-- far as its checks allow.
--
-- Then the whole database is read back:
--   * no text value anywhere is longer than 4,000 characters, and no json
--     value longer than 20,000 (the published consent notices and Stripe's
--     own event payloads are the only exceptions: written by us, not by a
--     browser);
--   * none of the family's numbers has been pushed to an extreme;
--   * no single call has written an unbounded number of rows.
--
-- The same is then tried by writing straight to the tables a parent's phone
-- writes, because that is an input too.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;
-- A call that never finishes is a failure here, not a hung test run.
set statement_timeout = '180s';

insert into auth.users (id, email) values
  ('33f00000-0000-4000-8000-0000000000f1', 't33-parent@example.com'),
  ('33f00000-0000-4000-8000-0000000000f2', 't33-kid@example.com');
insert into families (id, name, tier) values ('33f00000-0000-4000-8000-00000000000f', 'T33 Family', 'elite');
insert into parents (id, user_id, family_id, name, is_owner) values
  ('33f00000-0000-4000-8000-0000000000ff', '33f00000-0000-4000-8000-0000000000f1', '33f00000-0000-4000-8000-00000000000f', 'Fen', true);
select seed_consent('33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-0000000000f1');
insert into kids (id, family_id, user_id, name, coins, play_tokens) values
  ('33f00000-0000-4000-8000-00000000000c', '33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-0000000000f2', 'Fox', 50, 5);
insert into quests (id, family_id, kid_id, title, xp) values
  ('33f00000-0000-4000-8000-0000000000e1', '33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-00000000000c', 'T33 quest', 30),
  ('33f00000-0000-4000-8000-0000000000e7', '33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-00000000000c', 'T33 open quest', 30);
insert into submissions (id, family_id, quest_id, kid_id, status) values
  ('33f00000-0000-4000-8000-0000000000e2', '33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-0000000000e1', '33f00000-0000-4000-8000-00000000000c', 'pending');
insert into rewards (id, family_id, name, cost) values
  ('33f00000-0000-4000-8000-0000000000e3', '33f00000-0000-4000-8000-00000000000f', 'T33 reward', 1);
insert into allowance_entries (family_id, kid_id, pence, kind) values
  ('33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-00000000000c', 500, 'gift');
insert into notes (family_id, kid_id, author, body) values
  ('33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-00000000000c', 'parent', 'T33 note'),
  ('33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-00000000000c', 'kid', 'T33 kid note');
insert into overrides (family_id, kid_id, kind, reason) values
  ('33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-00000000000c', 'tax', 'T33');
insert into family_goals (family_id, name, target_xp) values ('33f00000-0000-4000-8000-00000000000f', 'T33 goal', 100);
insert into guilds (id, name, crest, capacity, leader_kid_id, invite_code, owner_family_id) values
  ('33f00000-0000-4000-8000-0000000000e5', 'T33 guild', '🛡️', 10, '33f00000-0000-4000-8000-00000000000c', 'TTT333', '33f00000-0000-4000-8000-00000000000f');
insert into guild_members (guild_id, kid_id, family_id, role, status, approved_by_own_parent, approved_by_owner) values
  ('33f00000-0000-4000-8000-0000000000e5', '33f00000-0000-4000-8000-00000000000c', '33f00000-0000-4000-8000-00000000000f', 'leader', 'active', true, true);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();

create or replace function t33_args(p_fn regprocedure, p_int bigint) returns text language plpgsql as $$
declare
  v_names text[]; v_types oid[]; v_args text[] := '{}'; i int; v_name text; v_type text; v_val text;
  v_huge text := repeat('x', 100000);
  v_ids jsonb := jsonb_build_object(
    'family', '33f00000-0000-4000-8000-00000000000f', 'kid', '33f00000-0000-4000-8000-00000000000c',
    'quest', '33f00000-0000-4000-8000-0000000000e7', 'submission', '33f00000-0000-4000-8000-0000000000e2',
    'reward', '33f00000-0000-4000-8000-0000000000e3', 'guild', '33f00000-0000-4000-8000-0000000000e5',
    'kid_user', '33f00000-0000-4000-8000-0000000000f2');
begin
  select proargnames, proargtypes::oid[] into v_names, v_types from pg_proc where oid = p_fn;
  for i in 0 .. coalesce(array_length(v_types, 1), 0) - 1 loop
    v_name := coalesce(v_names[i + 1], '');
    v_type := format_type(v_types[array_lower(v_types, 1) + i], null);
    v_val := case
      when v_type = 'uuid' then coalesce(
             v_ids ->> regexp_replace(v_name, '^p_', ''),
             v_ids ->> regexp_replace(regexp_replace(v_name, '^p_', ''), '_id$', ''),
             gen_random_uuid()::text)
      -- A word from a fixed list is checked against the list; the rest of the
      -- call is what is being tried, so it is given one that passes.
      when v_type = 'text' and v_name = 'p_role' then 'parent'
      when v_type = 'text' and v_name ~ '(tz|timezone)$' then 'UTC'
      when v_type = 'text' and v_name = 'p_skin_id' then 'ember'
      when v_type = 'text' and v_name = 'p_game' then 'stack'
      when v_type = 'text' and v_name = 'p_method' then 'payment_card'
      when v_type = 'text' and v_name = 'p_version' then current_consent_version()
      when v_type in ('text', 'character varying') then v_huge
      when v_type = 'integer' then greatest(-2147483648, least(2147483647, p_int))::text
      when v_type = 'smallint' then greatest(-32768, least(32767, p_int))::text
      when v_type in ('bigint', 'numeric') then case when p_int = 1 then '1' when p_int > 0 then '9223372036854775807' else '-9223372036854775808' end
      when v_type = 'boolean' then 'true'
      when v_type = 'jsonb' then case
             when v_name = 'p_reminders' then
               (select jsonb_agg(jsonb_build_object('time', to_char(time '00:00' + make_interval(mins => g % 1440), 'HH24:MI'),
                                                    'label', repeat('x', 1000), 'on', true))
                  from generate_series(1, 5000) g)::text
             when v_name = 'p_keys' then jsonb_build_object('p256dh', v_huge, 'auth', v_huge)::text
             else jsonb_build_object('note', v_huge, 'capture_source', 'none', 'test_score', p_int::text,
                                     'elapsed_ms', p_int::text, 'label', v_huge, 'ai_report', jsonb_build_object('x', v_huge),
                                     'ai_verdict', 'looks_good', 'ai_score', '50', 'x', v_huge)::text end
      when v_type = 'date' then current_date::text
      when v_type like 'timestamp%' then now()::text
      when v_type = 'integer[]' then (select array_agg(g)::text from generate_series(1, 100000) g)
      when v_type like '%[]' then '{}'
      else null end;
    -- In order rather than by name: not every argument has one.
    v_args := v_args || format('%L::%s', v_val, v_type);
  end loop;
  return format('select (%s(%s))::text', p_fn::regproc, array_to_string(v_args, ', '));
end $$;

-- ---------- every function, as the parent and as the child, twice ----------
do $$
declare
  f record; caller uuid; v_int bigint; v_sql text; v_calls int := 0; v_ok int := 0;
  v_started timestamptz; v_slow text[] := '{}';
begin
  -- An ordinary number first, so the text gets past any check on the
  -- amount and as far as being stored; then the extremes.
  foreach v_int in array array[1, 2147483647, -2147483648]::bigint[] loop
    foreach caller in array array['33f00000-0000-4000-8000-0000000000f1', '33f00000-0000-4000-8000-0000000000f2']::uuid[] loop
      for f in
        select p.oid::regprocedure as fn
          from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.prokind = 'f'
           and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
           and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
           -- These end the family (or this phone's place in it), which would
           -- leave nothing for the rest of the calls to write to. Each is
           -- covered by its own file.
           and p.proname not in ('delete_family_account', 'revoke_parental_consent', 'unlink_kid_device',
                                 'remove_adult', 'leave_school_staff')
           -- The test files' own helpers, which are not part of the product.
           and p.proname not in ('ok', 'become', 'seed_consent', 'seed_done')
           and p.proname !~ '^t[0-9]+_'
         order by p.proname
      loop
        v_calls := v_calls + 1;
        v_sql := t33_args(f.fn, v_int);
        v_started := clock_timestamp();
        begin
          execute 'set local role app_user';
          perform become(caller);
          execute v_sql;
          v_ok := v_ok + 1;
        exception when others then null;
        end;
        -- A number is also a size: "make me a code this long" took the
        -- database's whole attention for as long as it was told to.
        if clock_timestamp() - v_started > interval '3 seconds' then
          v_slow := v_slow || f.fn::text;
        end if;
        execute 'set local role postgres';
        perform become(null);
      end loop;
    end loop;
  end loop;
  raise notice '  (% calls made, % of them answered rather than refused)', v_calls, v_ok;
  perform ok('no call, however large its numbers, keeps the database busy for long',
             cardinality(v_slow) = 0, 'slow: ' || array_to_string(v_slow, ', '));
end $$;

-- ---------- and every column a parent's or child's phone writes directly ----------
do $$
declare t record; c record; caller uuid; v_huge text := repeat('y', 100000); v_n int := 0;
  v_row jsonb; v_big jsonb; v_cols text;
begin
  foreach caller in array array['33f00000-0000-4000-8000-0000000000f1', '33f00000-0000-4000-8000-0000000000f2']::uuid[] loop
    for c in
      select a.attrelid::regclass as rel, a.attname, format_type(a.atttypid, null) as typ
        from pg_attribute a join pg_class k on k.oid = a.attrelid
       where k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
         and a.attnum > 0 and not a.attisdropped
         and format_type(a.atttypid, null) in ('text', 'integer', 'jsonb')
         and exists (select 1 from pg_attribute f where f.attrelid = a.attrelid and f.attname = 'family_id')
         and has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')
       order by 1, 2
    loop
      begin
        execute 'set local role app_user';
        perform become(caller);
        execute format('update %s set %I = %s where family_id = %L', c.rel, c.attname,
                       case c.typ when 'text' then quote_literal(v_huge)
                                  when 'integer' then '2147483647'
                                  else quote_literal(jsonb_build_object('x', v_huge)::text) || '::jsonb' end,
                       '33f00000-0000-4000-8000-00000000000f');
        v_n := v_n + 1;
      exception when others then null;
      end;
      execute 'set local role postgres';
      perform become(null);
    end loop;
  end loop;
  -- And new rows: a copy of one of the family's own, every writable column
  -- at its largest.
  foreach caller in array array['33f00000-0000-4000-8000-0000000000f1', '33f00000-0000-4000-8000-0000000000f2']::uuid[] loop
    for t in
      select k.oid::regclass as rel from pg_class k
       where k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
         and exists (select 1 from pg_attribute f where f.attrelid = k.oid and f.attname = 'family_id')
         and has_table_privilege('authenticated', k.oid, 'INSERT')
       order by 1
    loop
      execute format('select to_jsonb(x) from %s x where family_id = %L limit 1', t.rel,
                     '33f00000-0000-4000-8000-00000000000f') into v_row;
      continue when v_row is null;
      if v_row ? 'id' then v_row := v_row || jsonb_build_object('id', gen_random_uuid()); end if;
      select coalesce(jsonb_object_agg(a.attname, case format_type(a.atttypid, null)
               when 'text' then to_jsonb(v_huge) when 'integer' then to_jsonb(2147483647)
               else jsonb_build_object('x', v_huge) end), '{}') into v_big
        from pg_attribute a
       where a.attrelid = t.rel and a.attnum > 0 and not a.attisdropped
         and format_type(a.atttypid, null) in ('text', 'integer', 'jsonb')
         and a.attname not in ('family_id', 'kid_id', 'author', 'kind', 'status', 'role', 'difficulty', 'recurrence', 'lockout_kind');
      select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
        from pg_attribute where attrelid = t.rel and attnum > 0 and not attisdropped;
      begin
        execute 'set local role app_user';
        perform become(caller);
        execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1)',
                       t.rel, v_cols, v_cols, t.rel) using v_row || v_big;
        v_n := v_n + 1;
      exception when others then null;
      end;
      execute 'set local role postgres';
      perform become(null);
    end loop;
  end loop;

  -- families has no family_id column: its own id is the family.
  begin
    execute 'set local role app_user';
    perform become('33f00000-0000-4000-8000-0000000000f1');
    update families set name = v_huge where id = '33f00000-0000-4000-8000-00000000000f';
  exception when others then null;
  end;
  execute 'set local role postgres';
  perform become(null);
  raise notice '  (% direct writes accepted by the row rules)', v_n;
end $$;

-- ---------- what made it in ----------
do $$
declare
  c record; v_n bigint; v_fails text[] := '{}'; v_pred text;
  v_f uuid[] := array['33f00000-0000-4000-8000-00000000000f', '33f00000-0000-4000-8000-0000000000ff',
                      '33f00000-0000-4000-8000-0000000000f1', '33f00000-0000-4000-8000-00000000000c',
                      '33f00000-0000-4000-8000-0000000000f2', '33f00000-0000-4000-8000-0000000000e5']::uuid[];
begin
  -- Long text, anywhere in the database.
  for c in
    select a.attrelid::regclass as rel, k.relname, a.attname, format_type(a.atttypid, null) as typ
      from pg_attribute a join pg_class k on k.oid = a.attrelid
     where k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped
       and format_type(a.atttypid, null) in ('text', 'character varying', 'jsonb')
       -- Written by us, not by a browser: the published notice, and Stripe's
       -- signed events kept as the payment record.
       and (k.relname, a.attname) not in (('consent_notices', 'body'), ('billing_events', 'payload'))
  loop
    execute format('select count(*) from %s where length(%I::text) > %s', c.rel, c.attname,
                   case when c.typ = 'jsonb' then 20000 else 4000 end) into v_n;
    if v_n > 0 then v_fails := v_fails || format('%s.%s', c.relname, c.attname); end if;
  end loop;
  perform ok('no text a browser sent is stored longer than 4,000 characters (json: 20,000)',
             cardinality(v_fails) = 0, 'too long: ' || array_to_string(v_fails, ', '));

  -- The family's numbers.
  v_fails := '{}';
  for c in
    select a.attrelid::regclass as rel, k.relname, a.attname
      from pg_attribute a join pg_class k on k.oid = a.attrelid
     where k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped
       and a.atttypid in ('integer'::regtype, 'smallint'::regtype, 'numeric'::regtype)
  loop
    select coalesce(string_agg(format('x.%I = any(%L::uuid[])', attname, v_f), ' or '), 'false') into v_pred
      from pg_attribute where attrelid = c.rel and attnum > 0 and not attisdropped and atttypid = 'uuid'::regtype;
    execute format('select count(*) from %s x where (%s) and abs(x.%I) >= 1000000000', c.rel, v_pred, c.attname) into v_n;
    if v_n > 0 then v_fails := v_fails || format('%s.%s', c.relname, c.attname); end if;
  end loop;
  perform ok('no number a browser sent is stored at an extreme',
             cardinality(v_fails) = 0, 'unbounded: ' || array_to_string(v_fails, ', '));

  -- How much one family could make the database hold in a handful of calls.
  v_fails := '{}';
  for c in
    select k.oid::regclass as rel, k.relname
      from pg_class k where k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
  loop
    select coalesce(string_agg(format('x.%I = any(%L::uuid[])', attname, v_f), ' or '), 'false') into v_pred
      from pg_attribute where attrelid = c.rel and attnum > 0 and not attisdropped and atttypid = 'uuid'::regtype;
    execute format('select count(*) from %s x where %s', c.rel, v_pred) into v_n;
    if v_n > 200 then v_fails := v_fails || format('%s (%s rows)', c.relname, v_n); end if;
  end loop;
  perform ok('no call wrote an unbounded number of rows',
             cardinality(v_fails) = 0, array_to_string(v_fails, ', '));
end $$;

drop function t33_args(regprocedure, bigint);
