-- ---------------------------------------------------------------------------
-- Crash reports.
--
-- Run after schema.sql (and, for the error report, schools.sql).
--
-- Nobody files a bug report about a children's chore app: they close it, and if
-- it happens twice they delete it. This is the only way a crash on a stranger's
-- phone ever reaches you.
--
-- WHAT IS STORED: a route, an error message, the top of a component stack and a
-- user agent. No names, no photographs, nothing a child typed. The client
-- truncates before sending and the column widths truncate again, because an
-- error string can quote the value that caused it and those values are family
-- data.
--
-- WHAT IT CANNOT DO: grow. A crash loop that could flood this table would be a
-- worse bug than the one it is reporting, so the insert is rate-limited in the
-- database as well as on the device, and retention sweeps it with everything
-- else.
-- ---------------------------------------------------------------------------

create table if not exists crash_reports (
  id         bigserial primary key,
  family_id  uuid references families(id) on delete cascade,
  where_at   text not null,
  message    text not null,
  stack      text not null default '',
  agent      text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists crash_reports_created_idx on crash_reports (created_at);

alter table crash_reports enable row level security;
-- Written through the function below, read only by you, in the dashboard.
revoke all on crash_reports from public, anon, authenticated;

/**
 * The database's own pass over what a phone sent, in case the phone's did not
 * run (an older version, or a request made by hand): emails, sign-in tokens
 * and runs of four or more digits come out. The phone takes out more — the
 * family's names, anything quoted — because only it knows the names.
 */
create or replace function crash_scrub(p_text text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
    'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[token]', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+', '[email]', 'g'),
    '(access_token|refresh_token|token|code|key|password|pin)=[^&[:space:]]+', '\1=[removed]', 'gi'),
    '[0-9]{4,}', '[number]', 'g')
$$;

/**
 * Record one crash.
 *
 * Deliberately callable by anon as well as authenticated: the crashes worth
 * hearing about most are the ones that happen before anybody manages to sign
 * in. A caller with no family records a row with a null family_id.
 *
 * Ten per family per hour is the ceiling. Past that the report is dropped and
 * the function still returns ok — a device in a crash loop must not also get
 * an error from the thing meant to be recording its errors.
 */
create or replace function record_crash(
  p_where text, p_message text, p_stack text default '', p_agent text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_family uuid := current_family_id();
  v_recent int;
begin
  -- Signed-out reports share one row-space, so counting them together made a
  -- single global bucket: ten an hour for every signed-out user on earth, which
  -- anyone could exhaust on purpose to blind pre-signin crash reporting. Those
  -- get a much larger ceiling of their own; a family keeps its tight one.
  if v_family is null then
    select count(*) into v_recent from crash_reports
     where created_at > now() - interval '1 hour' and family_id is null;
    if v_recent >= 200 then
      return jsonb_build_object('ok', true, 'recorded', false, 'reason', 'rate_limited');
    end if;
    insert into crash_reports (family_id, where_at, message, stack, agent)
    values (null, left(crash_scrub(coalesce(p_where, 'unknown')), 80), left(crash_scrub(p_message), 300),
            left(crash_scrub(p_stack), 600), left(coalesce(p_agent, ''), 200));
    return jsonb_build_object('ok', true, 'recorded', true);
  end if;

  select count(*) into v_recent from crash_reports
   where created_at > now() - interval '1 hour'
     and family_id = v_family;
  if v_recent >= 10 then
    return jsonb_build_object('ok', true, 'recorded', false, 'reason', 'rate_limited');
  end if;

  insert into crash_reports (family_id, where_at, message, stack, agent)
  values (v_family,
          left(crash_scrub(coalesce(p_where, 'unknown')), 80),
          left(crash_scrub(p_message), 300),
          left(crash_scrub(p_stack), 600),
          left(coalesce(p_agent, ''), 200));

  return jsonb_build_object('ok', true, 'recorded', true);
end $$;

grant execute on function record_crash(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Errors in the server functions.
--
-- A crash on a phone lands above. An error in one of the functions in api/
-- (a checkout that could not start, a job that failed) used to reach only the
-- host's log, which nobody reads until a parent writes in. Each one is now
-- also written here, by the function itself, with the service key
-- (api/_shared/job.js, reportError).
--
-- WHAT IS STORED: which function, and its error message with emails, tokens,
-- ids, quoted values and long numbers taken out (error_scrub). Never the
-- request, never who asked, never a family.
-- ---------------------------------------------------------------------------

create table if not exists server_errors (
  id         bigserial primary key,
  where_at   text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists server_errors_created_idx on server_errors (created_at);

alter table server_errors enable row level security;
revoke all on server_errors from public, anon, authenticated;

/**
 * crash_scrub, and more: ids (a family's is a uuid), Stripe's ids, bearer
 * tokens, any long run that looks like a key, and anything in quotes (an
 * error quotes the value that caused it, and values are what a family typed).
 * The phone does the same before a crash is sent; this is for everything
 * else, and is safe to run over text it has already cleaned.
 */
create or replace function error_scrub(p_text text) returns text
language sql immutable as $$
  select crash_scrub(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '[id]', 'g'),
      '\m(cus|sub|si|pi|pm|cs|in|ii|ch|re|txn|evt|price|prod|seti|acct|sk|pk|rk|whsec)_(test_|live_)?[A-Za-z0-9]{8,}', '[id]', 'g'),
      '(Bearer|Basic)\s+[^[:space:]]+', '\1 [token]', 'gi'),
      '[A-Za-z0-9_-]{32,}', '[token]', 'g'),
      '"[^"]*"|''[^'']*''|`[^`]*`', '"…"', 'g'))
$$;

/**
 * Record one server function's error. The service key only: the functions
 * call it, a browser cannot. At most 60 an hour from one function and 300 an
 * hour in all, so a function failing in a loop (or somebody making one fail
 * on purpose) cannot fill the table.
 */
create or replace function record_server_error(p_where text, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_where text := coalesce(nullif(substring(lower(coalesce(p_where, '')) from '^[a-z0-9:-]{1,40}$'), ''), 'unknown');
begin
  perform pg_advisory_xact_lock(hashtext('record_server_error'));
  if (select count(*) from server_errors where created_at > now() - interval '1 hour') >= 300
     or (select count(*) from server_errors
          where created_at > now() - interval '1 hour' and where_at = v_where) >= 60 then
    return jsonb_build_object('ok', true, 'recorded', false, 'reason', 'rate_limited');
  end if;
  insert into server_errors (where_at, message)
  values (v_where, left(error_scrub(left(coalesce(p_message, ''), 2000)), 300));
  return jsonb_build_object('ok', true, 'recorded', true);
end $$;

revoke execute on function record_server_error(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The error report: one short email to ERRORS_EMAIL.
--
-- The hourly email job (api/send-trial-emails.js) asks claim_error_report
-- what is new since it last told you, sends it, and says how that went with
-- finish_error_report. Rules, all kept here rather than in the job, so two
-- runs at once cannot break them:
--
--   * Each distinct error (where it happened and what it said, once the
--     scrubbing below has run) is in at most one report an hour.
--   * At most 20 reports in any 24 hours.
--   * Nothing that could point at a family: no family id, no request, no
--     email, no token, and no name. error_scrub takes out the first four;
--     error_name_scrub takes out every word that is anybody's name in RankUp
--     (any child's, any adult's, any family's), because only the database
--     knows them all.
-- ---------------------------------------------------------------------------

create table if not exists error_report_kinds (
  fingerprint      text primary key,
  first_seen_at    timestamptz not null default now(),
  last_reported_at timestamptz
);

create table if not exists error_report_sends (
  id         bigserial primary key,
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  -- The kinds this report claimed and when each was last reported before,
  -- so a report that could not be sent gives them back.
  kinds      jsonb not null default '[]'::jsonb
);

create index if not exists error_report_sends_claimed_idx on error_report_sends (claimed_at);

alter table error_report_kinds enable row level security;
alter table error_report_sends enable row level security;
revoke all on error_report_kinds from public, anon, authenticated;
revoke all on error_report_sends from public, anon, authenticated;

/**
 * Every word in p_text that is in p_names (a jsonb object whose keys are
 * lower-case name words) becomes [name]. Whole words only, any case.
 */
create or replace function error_name_scrub(p_text text, p_names jsonb) returns text
language plpgsql immutable as $$
declare
  v_out text := coalesce(p_text, '');
  w text;
begin
  for w in select distinct lower(m[1]) from regexp_matches(v_out, '([[:alpha:]]{2,})', 'g') m loop
    if p_names ? w then
      -- A mark that is not a letter first, so a name inside "[name]" (a
      -- child called Name) is not replaced twice.
      v_out := regexp_replace(v_out, '(^|[^[:alpha:]])' || w || '(?=$|[^[:alpha:]])', '\1' || chr(1), 'gi');
    end if;
  end loop;
  return replace(v_out, chr(1), '[name]');
end $$;

/**
 * What is new, for one report. Returns { ok, report_id, kinds: [...], more }
 * or { ok, capped: true } once 20 reports have gone in 24 hours, or
 * { ok, kinds: [] } when there is nothing new.
 *
 * Each kind: source ('app' for a crash on a phone, 'server' for a function),
 * where (a screen, or a function's name), message, count (since it was last
 * reported, within the last 24 hours) and new (never reported before).
 */
create or replace function claim_error_report(p_max_kinds int default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_names jsonb;
  v_kinds jsonb;
  v_total int;
  v_id    bigint;
  v_max   int := greatest(1, least(coalesce(p_max_kinds, 20), 50));
begin
  perform pg_advisory_xact_lock(hashtext('claim_error_report'));

  -- A run that claimed a report and never said how it went (it died): give
  -- its kinds back, so they are in the next one.
  update error_report_kinds k
     set last_reported_at = nullif(c.value->>'previous', '')::timestamptz
    from error_report_sends s, jsonb_array_elements(s.kinds) c
   where s.sent_at is null and s.claimed_at < now() - interval '30 minutes'
     and k.fingerprint = c.value->>'fingerprint';
  delete from error_report_sends where sent_at is null and claimed_at < now() - interval '30 minutes';

  if (select count(*) from error_report_sends where claimed_at > now() - interval '24 hours') >= 20 then
    return jsonb_build_object('ok', true, 'capped', true, 'kinds', '[]'::jsonb);
  end if;

  -- Every word of every name anybody has in RankUp.
  select coalesce(jsonb_object_agg(w, true), '{}'::jsonb) into v_names
    from (select distinct lower(w) as w
            from (select regexp_split_to_table(name, '[^[:alpha:]]+') as w from kids
                  union all select regexp_split_to_table(name, '[^[:alpha:]]+') from parents
                  union all select regexp_split_to_table(name, '[^[:alpha:]]+') from families
                  union all select regexp_split_to_table(name, '[^[:alpha:]]+') from school_staff
                  union all select regexp_split_to_table(kid_name, '[^[:alpha:]]+') from pairing_codes
                  union all select regexp_split_to_table(claimed_by_family_name, '[^[:alpha:]]+') from pairing_codes) x
           where length(w) >= 2) n;

  with raw as (
    select 'app'::text as src, where_at as w, message as m, created_at from crash_reports
     where created_at > now() - interval '24 hours'
    union all
    select 'server', where_at, message, created_at from server_errors
     where created_at > now() - interval '24 hours'
  ), texts as (
    select distinct src, w, m from raw
  ), clean as (
    select src, w, m,
           left(error_name_scrub(error_scrub(w), v_names), 80) as cw,
           left(error_name_scrub(error_scrub(m), v_names), 300) as cm
      from texts
  ), rows as (
    select c.src, c.cw, c.cm, md5(c.src || '|' || c.cw || '|' || c.cm) as fp, r.created_at
      from raw r join clean c on c.src = r.src and c.w = r.w and c.m = r.m
  ), candidates as (
    select r.fp, r.src, r.cw, r.cm, k.last_reported_at as previous, k.last_reported_at is null as is_new,
           count(*) filter (where r.created_at > coalesce(k.last_reported_at, '-infinity'::timestamptz)) as n
      from rows r left join error_report_kinds k on k.fingerprint = r.fp
     group by r.fp, r.src, r.cw, r.cm, k.last_reported_at
    having count(*) filter (where r.created_at > coalesce(k.last_reported_at, '-infinity'::timestamptz)) > 0
       and (k.last_reported_at is null or k.last_reported_at <= now() - interval '1 hour')
  ), ranked as (
    select *, count(*) over () as total from candidates
     order by is_new desc, n desc, fp
     limit v_max
  )
  select jsonb_agg(jsonb_build_object('fingerprint', fp, 'source', src, 'where', cw, 'message', cm,
                                      'count', n, 'new', is_new, 'previous', previous)
                   order by is_new desc, n desc, fp),
         max(total)
    into v_kinds, v_total
    from ranked;

  if v_kinds is null then
    return jsonb_build_object('ok', true, 'kinds', '[]'::jsonb);
  end if;

  insert into error_report_kinds (fingerprint, last_reported_at)
  select k->>'fingerprint', now() from jsonb_array_elements(v_kinds) k
  on conflict (fingerprint) do update set last_reported_at = now();

  insert into error_report_sends (kinds)
  select jsonb_agg(jsonb_build_object('fingerprint', k->>'fingerprint', 'previous', k->>'previous'))
    from jsonb_array_elements(v_kinds) k
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'report_id', v_id,
    -- The fingerprints and earlier times stay in the database: the job needs
    -- only what the email says.
    'kinds', (select jsonb_agg(k - 'fingerprint' - 'previous' order by ord)
                from jsonb_array_elements(v_kinds) with ordinality as e(k, ord)),
    'more', greatest(0, v_total - jsonb_array_length(v_kinds)));
end $$;

/**
 * How the report went. Sent: kept, and it counts toward the 20 a day. Not
 * sent: its kinds are given back, so the next run reports them.
 */
create or replace function finish_error_report(p_report_id bigint, p_sent boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('claim_error_report'));
  if p_sent then
    update error_report_sends set sent_at = now() where id = p_report_id and sent_at is null;
    return;
  end if;
  update error_report_kinds k
     set last_reported_at = nullif(c.value->>'previous', '')::timestamptz
    from error_report_sends s, jsonb_array_elements(s.kinds) c
   where s.id = p_report_id and s.sent_at is null
     and k.fingerprint = c.value->>'fingerprint';
  delete from error_report_sends where id = p_report_id and sent_at is null;
end $$;

revoke execute on function claim_error_report(int) from public, anon, authenticated;
revoke execute on function finish_error_report(bigint, boolean) from public, anon, authenticated;
