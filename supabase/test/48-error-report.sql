-- ---------------------------------------------------------------------------
-- The error report (crashes.sql: record_server_error, claim_error_report,
-- finish_error_report; api/send-trial-emails.js sends it to ERRORS_EMAIL).
--
--   * a server function's error is recorded with emails, tokens, ids and
--     quoted values taken out, and a function failing in a loop cannot fill
--     the table;
--   * the report never carries a child's name, an adult's name or email, a
--     family id or a token, even when the error message had them in it;
--   * each distinct error is in at most one report an hour, and there are at
--     most 20 reports in 24 hours;
--   * a report that could not be sent gives its errors back, and so does one
--     from a run that died;
--   * only the scheduled job can call any of it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

-- Earlier files' crashes are in the window too; this file starts from nothing
-- (and gives it all back at the end).
delete from crash_reports;
delete from server_errors;
delete from error_report_sends;
delete from error_report_kinds;

insert into auth.users (id, email) values
  ('48a00000-0000-4000-8000-0000000000a1', 't48-parent@example.com');
insert into families (id, name) values ('48a00000-0000-4000-8000-00000000000f', 'Quillfeather');
insert into parents (user_id, family_id, name) values
  ('48a00000-0000-4000-8000-0000000000a1', '48a00000-0000-4000-8000-00000000000f', 'Orlaithe');
select seed_consent('48a00000-0000-4000-8000-00000000000f', '48a00000-0000-4000-8000-0000000000a1');
insert into kids (id, family_id, name) values
  ('48a00000-0000-4000-8000-00000000000c', '48a00000-0000-4000-8000-00000000000f', 'Zephyrine');

-- ---------- a server function's error ----------
do $$
declare v jsonb; v_msg text;
begin
  v := record_server_error('create-checkout',
    'No such customer: cus_T48abcdefgh123 for t48-parent@example.com (family 48a00000-0000-4000-8000-00000000000f), '
    || 'Authorization: Bearer sk_live_51abcdefghijklmnop, value "Zephyrine''s chores", code=123456');
  perform ok('a server function''s error is recorded', (v->>'recorded')::boolean);
  select message into v_msg from server_errors order by id desc limit 1;
  perform ok('without the email', v_msg not like '%@%', v_msg);
  perform ok('without the family''s id', v_msg not like '%48a00000%', v_msg);
  perform ok('without Stripe''s customer id or a key', v_msg not like '%cus_T48%' and v_msg not like '%sk_live%', v_msg);
  perform ok('without the quoted value or the code', v_msg not like '%chores%' and v_msg not like '%123456%', v_msg);
  perform ok('but still saying what went wrong', v_msg like 'No such customer: [id]%', v_msg);

  v := record_server_error('<script>/../etc', 'odd');
  perform ok('a function''s name that is not a name is stored as unknown',
    (select where_at from server_errors order by id desc limit 1) = 'unknown');

  for i in 1..70 loop
    v := record_server_error('t48-loop', 'failing in a loop');
  end loop;
  perform ok('a function failing in a loop is held to 60 an hour',
    (select count(*) from server_errors where where_at = 't48-loop') = 60
    and (v->>'reason') = 'rate_limited' and (v->>'ok')::boolean);
end $$;

-- ---------- a crash with a child's name and a parent's email in it ----------
-- The phone takes names out before sending; an older phone, or a request
-- made by hand, might not. Stored here as it would arrive from one.
insert into crash_reports (family_id, where_at, message) values
  ('48a00000-0000-4000-8000-00000000000f', '/parent/kid/Zephyrine',
   'TypeError: zephyrine is undefined for t48-parent@example.com in Quillfeather, Orlaithe asked'),
  ('48a00000-0000-4000-8000-00000000000f', '/parent/kid/Zephyrine',
   'TypeError: ZEPHYRINE is undefined for t48-parent@example.com in Quillfeather, Orlaithe asked');

do $$
declare
  v jsonb;
  v_text text;
  v_name text;
  v_leaks text[] := '{}';
begin
  v := claim_error_report(20);
  v_text := v::text;
  perform ok('the report has the new errors in it',
    jsonb_array_length(v->'kinds') > 0 and (v->>'report_id') is not null, left(v_text, 200));
  perform ok('the child''s name is not in it, in any case', v_text !~* 'zephyrine', v_text);
  perform ok('nor the adult''s name, nor the family''s', v_text !~* 'orlaithe' and v_text !~* 'quillfeather');
  perform ok('nor any email', v_text !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.', v_text);
  perform ok('nor any id, token or key',
    v_text !~* '[0-9a-f]{8}-[0-9a-f]{4}-' and v_text !~ 'eyJ' and v_text !~ 'cus_' and v_text !~ 'sk_live');
  perform ok('and says where a name was', v_text like '%[name]%');
  -- Every child's and adult's name in the database, not only this family's.
  for v_name in select distinct lower(w) from (
      select regexp_split_to_table(name, '[^[:alpha:]]+') w from kids
      union all select regexp_split_to_table(name, '[^[:alpha:]]+') from parents) x where length(w) >= 2 loop
    if v_text ~* ('(^|[^[:alpha:]])' || v_name || '($|[^[:alpha:]])') then v_leaks := v_leaks || v_name; end if;
  end loop;
  perform ok('no word of anybody''s name in RankUp is in it', cardinality(v_leaks) = 0, array_to_string(v_leaks, ', '));
  perform ok('the two spellings of one crash are one kind, counted twice',
    exists (select 1 from jsonb_array_elements(v->'kinds') k
             where k->>'source' = 'app' and k->>'message' like 'TypeError: [name] is undefined for [email] in [name], [name] asked'
               and k->>'where' like '%/[name]' and (k->>'count')::int = 2
               and (k->>'new')::boolean));
  perform ok('a server error says which function',
    exists (select 1 from jsonb_array_elements(v->'kinds') k
             where k->>'source' = 'server' and k->>'where' = 'create-checkout'));
  perform ok('and nothing the job does not need: no fingerprint, no family',
    not exists (select 1 from jsonb_array_elements(v->'kinds') k
                 where k ? 'fingerprint' or k ? 'previous' or k ? 'family_id'));
  perform finish_error_report((v->>'report_id')::bigint, true);
end $$;

-- ---------- once an hour, per error ----------
-- Everything so far happened two hours ago, and was reported half an hour
-- ago. (A transaction's clock stands still, so the times are set by hand.)
update crash_reports set created_at = now() - interval '2 hours';
update server_errors set created_at = now() - interval '2 hours';
update error_report_kinds set last_reported_at = now() - interval '30 minutes';
insert into crash_reports (family_id, where_at, message) values
  ('48a00000-0000-4000-8000-00000000000f', '/parent/kid/Zephyrine',
   'TypeError: zephyrine is undefined for t48-parent@example.com in Quillfeather, Orlaithe asked');
do $$
declare v jsonb;
begin
  v := claim_error_report(20);
  perform ok('the same error again within the hour is not reported again', jsonb_array_length(v->'kinds') = 0, v::text);

  update error_report_kinds set last_reported_at = now() - interval '61 minutes';
  v := claim_error_report(20);
  perform ok('an hour later it is, counting only what happened since',
    exists (select 1 from jsonb_array_elements(v->'kinds') k
             where k->>'source' = 'app' and (k->>'count')::int = 1 and not (k->>'new')::boolean),
    v::text);
  perform ok('and only the errors that happened again',
    not exists (select 1 from jsonb_array_elements(v->'kinds') k where k->>'where' = 'create-checkout'));

  -- The email could not be sent: the errors go back for the next run.
  perform finish_error_report((v->>'report_id')::bigint, false);
  v := claim_error_report(20);
  perform ok('a report that was not sent gives its errors back', jsonb_array_length(v->'kinds') = 1, v::text);

  -- The run died after claiming: half an hour on, the next run has them.
  update error_report_sends set claimed_at = now() - interval '31 minutes' where id = (v->>'report_id')::bigint;
  v := claim_error_report(20);
  perform ok('and so does one from a run that died', jsonb_array_length(v->'kinds') = 1, v::text);
  perform finish_error_report((v->>'report_id')::bigint, true);
end $$;

-- ---------- a long list is cut short, and says so ----------
do $$
declare v jsonb;
begin
  insert into server_errors (where_at, message)
  select 't48-many', 'kind ' || chr(64 + i) from generate_series(1, 26) i;
  v := claim_error_report(20);
  perform ok('at most 20 errors in one report', jsonb_array_length(v->'kinds') = 20, v::text);
  perform ok('and how many more there are', (v->>'more')::int = 6, v->>'more');
  perform finish_error_report((v->>'report_id')::bigint, true);
  v := claim_error_report(20);
  perform ok('which are in the next one', jsonb_array_length(v->'kinds') = 6, v::text);
  perform finish_error_report((v->>'report_id')::bigint, true);
end $$;

-- ---------- at most 20 a day ----------
do $$
declare v jsonb;
begin
  insert into error_report_sends (claimed_at, sent_at)
  select now() - interval '1 hour', now() - interval '1 hour' from generate_series(1, 20 - (select count(*) from error_report_sends)::int);
  insert into server_errors (where_at, message) values ('t48-late', 'a new error');
  v := claim_error_report(20);
  perform ok('after 20 reports in 24 hours, no more until the day has passed',
    (v->>'capped')::boolean and jsonb_array_length(v->'kinds') = 0, v::text);
  update error_report_sends set claimed_at = now() - interval '25 hours';
  v := claim_error_report(20);
  perform ok('then the waiting error is reported',
    exists (select 1 from jsonb_array_elements(v->'kinds') k where k->>'where' = 't48-late'), v::text);
end $$;

-- ---------- only the scheduled job ----------
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
revoke all on server_errors, error_report_kinds, error_report_sends from anon, authenticated;

set role app_user;
do $$
declare f text; v_open text[] := '{}';
begin
  perform become('48a00000-0000-4000-8000-0000000000a1');
  foreach f in array array['select record_server_error(''x'', ''y'')', 'select claim_error_report(20)',
                           'select finish_error_report(1, false)', 'select 1 from server_errors',
                           'select 1 from error_report_kinds', 'select 1 from error_report_sends'] loop
    begin
      execute f;
      v_open := v_open || f;
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform ok('a parent cannot record, claim or read any of it', cardinality(v_open) = 0, array_to_string(v_open, '; '));
end $$;
reset role;

rollback;
