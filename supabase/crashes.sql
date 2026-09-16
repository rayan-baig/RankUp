-- ---------------------------------------------------------------------------
-- Crash reports.
--
-- Run after schema.sql.
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
revoke all on crash_reports from public;

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
  select count(*) into v_recent from crash_reports
   where created_at > now() - interval '1 hour'
     and family_id is not distinct from v_family;
  if v_recent >= 10 then
    return jsonb_build_object('ok', true, 'recorded', false, 'reason', 'rate_limited');
  end if;

  insert into crash_reports (family_id, where_at, message, stack, agent)
  values (v_family,
          left(coalesce(p_where, 'unknown'), 80),
          left(coalesce(p_message, ''), 300),
          left(coalesce(p_stack, ''), 600),
          left(coalesce(p_agent, ''), 200));

  return jsonb_build_object('ok', true, 'recorded', true);
end $$;

grant execute on function record_crash(text, text, text, text) to anon, authenticated;
