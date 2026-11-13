-- ---------------------------------------------------------------------------
-- Health.
--
-- The claim: a scheduled job that stops being called becomes visible. That is
-- the failure this exists for — all three jobs fail by going quiet, and the
-- only thing worse than a job that breaks is one that stops without saying so.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
set client_min_messages to notice;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
select lock_billing_columns();
revoke all on job_runs from anon, authenticated;

-- ---------- a customer cannot reach any of it ----------
set role app_user;
do $$
begin
  begin
    perform health_snapshot();
    raise exception 'FAIL a signed-in user read the health snapshot';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a signed-in user CANNOT read the health snapshot (%)', left(sqlerrm, 30);
  end;
  begin
    perform record_job_run('send-reminders', true);
    raise exception 'FAIL a signed-in user marked a job as having run';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice '  PASS a signed-in user CANNOT mark a job as run (%)', left(sqlerrm, 30);
  end;
end $$;
reset role;

-- ---------- before launch: never run, and that is not a failure ----------
do $$
declare v jsonb;
begin
  delete from job_runs;
  v := health_snapshot();
  perform ok('a job that has never run says so, rather than "stale"',
    (v->'jobs'->'send-reminders'->>'state') = 'never_run');
  perform ok('every job is reported, not just the ones with rows',
    (select count(*) from jsonb_object_keys(v->'jobs')) = 7);
end $$;

-- ---------- a healthy system ----------
do $$
declare v jsonb;
begin
  perform record_job_run('send-reminders', true);
  perform record_job_run('run-retention', true);
  perform record_job_run('send-digests', true);
  perform record_job_run('send-trial-emails', true);
  perform record_job_run('settle-alliances', true);
  perform record_job_run('settle-schools', true);
  perform record_job_run('refresh-leaderboards', true);
  v := health_snapshot();
  perform ok('with all of them just run, health is ok', (v->>'ok')::boolean);
  perform ok('and each reads as ok', (v->'jobs'->'run-retention'->>'state') = 'ok');
  perform ok('with a minutes-since figure to look at',
    (v->'jobs'->'run-retention'->>'minutes_since')::numeric = 0);
end $$;

-- ---------- the failure this exists to catch ----------
do $$
declare v jsonb;
begin
  -- The scheduler stopped three hours ago. Nothing errored; it just went quiet.
  update job_runs set last_ok_at = now() - interval '3 hours' where job = 'send-reminders';
  v := health_snapshot();
  perform ok('a reminder job that stopped being called reads as stale',
    (v->'jobs'->'send-reminders'->>'state') = 'stale');
  perform ok('and that alone makes the whole check fail', (v->>'ok')::boolean = false);

  -- Retention is allowed to be quieter than reminders: a daily job three hours
  -- late is fine, and calling that an emergency would train you to ignore it.
  update job_runs set last_ok_at = now() - interval '3 hours' where job = 'run-retention';
  perform ok('but a daily job three hours quiet is NOT an alarm',
    (health_snapshot()->'jobs'->'run-retention'->>'state') = 'ok');
end $$;

-- ---------- a failed run is remembered with its reason ----------
do $$
declare v jsonb;
begin
  perform record_job_run('settle-alliances', false, 'stripe refused the coupon');
  v := health_snapshot();
  perform ok('a failed run keeps the reason',
    (v->'jobs'->'settle-alliances'->>'last_error') = 'stripe refused the coupon');
  perform ok('and counts the failure',
    (v->'jobs'->'settle-alliances'->>'fail_count')::int = 1);
  perform ok('while the earlier success still stands, so it is not reported as dead',
    (v->'jobs'->'settle-alliances'->>'state') = 'ok');
end $$;

-- ---------- no photo backlog to report ----------
do $$
declare v jsonb;
begin
  update job_runs set last_ok_at = now();
  v := health_snapshot();
  perform ok('there is no photo backlog in the report: RankUp keeps no photos',
    not (v ? 'stale_photo_backlog'));
  perform ok('and with every job run, health is green', (v->>'ok')::boolean);
end $$;
