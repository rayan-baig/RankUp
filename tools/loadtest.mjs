#!/usr/bin/env node
/**
 * The database under load: many families' phones syncing at once.
 *
 *   node tools/loadtest.mjs --setup                 build a throwaway database and seed it
 *   node tools/loadtest.mjs                         run the load steps against it
 *   node tools/loadtest.mjs --setup --steps 50,200 --seconds 20 --json out.json
 *   node tools/loadtest.mjs --top 15                and list the 15 slowest statements after
 *   node tools/loadtest.mjs --jobs                  time each scheduled job's query once, instead
 *
 * What it does, and why this way:
 *
 *   --setup   drops and creates PGDATABASE (default rankup_load; never the
 *             test database), applies the Supabase stand-in and every SQL file
 *             in the order supabase/test/run.sh applies them (read from there,
 *             so the two cannot drift), and seeds --families families (1,000
 *             by default): one or two parents each, two or three children with
 *             their own paired phones, eight open chores per child, three
 *             months of accepted chores (about 120 per child), rewards bought
 *             and given, notes. Then ANALYZE, so plans are the plans a real
 *             database of this size gets.
 *
 *   the run   every phone in the sample is a loop that does what a phone does,
 *             with no pause between requests (each virtual phone is many real
 *             ones: a real phone asks every 8 seconds):
 *               a child's phone   pull (family_snapshot since its cursor),
 *                                 "I did it!" (submit_quest), buy a reward
 *                                 (redeem_reward)
 *               a parent's phone  pull, Accept (approve_submission), a new
 *                                 chore (an insert into quests, as the app
 *                                 writes one), Mark given (mark_redemption_given)
 *             Each phone's first pull is from zero (a phone opening for the
 *             first time) and one in fifty after that is too; the rest ask
 *             for what changed since their cursor, as the app does.
 *
 *             Every request is one transaction the way PostgREST runs it: set
 *             the role to `authenticated`, set the caller's id, call, commit.
 *             So row level security and every security-definer check are in
 *             force, exactly as on Supabase. The pool (--pool, default 15) is
 *             the database connections a small Supabase project's pooler
 *             hands out; a request waits for one like a request waits at the
 *             pooler, and that wait is in the latency.
 *
 *   report    per step and per function: requests per second, median and
 *             95th percentile latency, refusals (an answer the app expects,
 *             such as two parents accepting one chore: one is told "already
 *             decided") and errors (anything else), and the first step at
 *             which something breaks: a 95th percentile pull over 1 second,
 *             more than 1% errors, or the pool unable to hand out a connection
 *             within 5 seconds.
 *
 * Needs a local Postgres with pg_stat_statements preloaded for --top
 * (shared_preload_libraries=pg_stat_statements); the run itself does not.
 * PGHOST, PGPORT and PGUSER as for supabase/test/run.sh. See docs/LOAD-TEST.md.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else { out[key] = next; i += 1 }
  }
  return out
}

const opt = args(process.argv.slice(2))
const DB = String(opt.db || process.env.PGDATABASE_LOAD || 'rankup_load')
if (DB === 'rankup_test' || DB === 'postgres') {
  console.error(`refusing to use ${DB}: this tool drops and reseeds its database`)
  process.exit(2)
}
const conn = {
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || undefined,
}
const FAMILIES = Math.max(10, Number(opt.families || 1000))
const STEPS = String(opt.steps || '25,50,100,200,400').split(',').map(Number).filter((n) => n > 0)
const SECONDS = Math.max(3, Number(opt.seconds || 20))
const POOL = Math.max(1, Number(opt.pool || 15))
const PULL_P95_LIMIT_MS = Number(opt['pull-p95-limit'] || 1000)
const ERROR_LIMIT = Number(opt['error-limit'] || 0.01)
const WAIT_LIMIT_MS = Number(opt['wait-limit'] || 5000)

/* ------------------------------------------------------------------------ */
/* Setup                                                                    */
/* ------------------------------------------------------------------------ */

/** The SQL files, in the order run.sh applies them on its second pass. */
export function sqlFileOrder(runSh = readFileSync(join(ROOT, 'supabase/test/run.sh'), 'utf8')) {
  const loops = [...runSh.matchAll(/^for f in (.+); do$/gm)].map((m) => m[1])
  const files = [...loops[1].matchAll(/"\$HERE\/\.\.\/([a-z]+\.sql)"/g)].map((m) => m[1])
  if (files.length < 10) throw new Error('could not read the SQL file order from supabase/test/run.sh')
  return files
}

function psql(db, file, extra = []) {
  const r = spawnSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', ...extra, '-f', file, db], {
    env: { ...process.env, PGHOST: conn.host, PGPORT: String(conn.port), PGUSER: conn.user },
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(`${file} failed to apply:\n${r.stderr || r.stdout}`)
}

/**
 * The seed. Ids are md5s of a readable key, so a run can be repeated and two
 * runs seed the same rows. Names are made up and generic.
 */
export function seedSql(families) {
  return `
set client_min_messages = warning;
create temporary table fam as
  select g,
         md5('fam-' || g)::uuid as id,
         case when g % 2 = 0 then 'elite' else 'standard' end as tier,
         (array['Europe/London','America/New_York','America/Los_Angeles','Australia/Sydney','Europe/Berlin','UTC'])[1 + g % 6] as tz,
         case when g % 3 = 0 then 2 else 1 end as parents,
         2 + (g % 2) as kids
    from generate_series(1, ${families}) g;

insert into families (id, name, tier, timezone)
select id, 'Load family ' || g, tier, tz from fam;

create temporary table par as
  select f.g, p, f.id as family_id,
         md5('par-' || f.g || '-' || p)::uuid as id,
         md5('paru-' || f.g || '-' || p)::uuid as user_id
    from fam f cross join lateral generate_series(1, f.parents) p;
insert into auth.users (id, email) select user_id, 'load-' || g || '-' || p || '@example.test' from par;
insert into parents (id, user_id, family_id, name, is_owner)
select id, user_id, family_id, (array['Sam','Alex','Jo','Robin'])[1 + (g + p) % 4], p = 1 from par;
insert into parental_consents (family_id, parent_id, version, method, signed_name)
select family_id, id, '2026-01', 'payment_card', 'Load parent' from par where p = 1;

create temporary table kid as
  select f.g, k, f.id as family_id,
         md5('kid-' || f.g || '-' || k)::uuid as id,
         md5('kidu-' || f.g || '-' || k)::uuid as user_id
    from fam f cross join lateral generate_series(1, f.kids) k;
insert into auth.users (id) select user_id from kid;
insert into kids (id, family_id, user_id, name, xp, coins, streak_count, streak_last_day, play_tokens)
select id, family_id, user_id, (array['Ava','Leo','Mia','Noah','Isla','Max','Zoe','Finn'])[1 + (g * 3 + k) % 8],
       2000 + (g * 37 + k * 11) % 6000, 5000, (g + k) % 9, current_date - 1, 2
  from kid;

-- Eight open chores a child, the kind a family actually sets.
create temporary table chores as
  select cn, title, category, xp from (values
    (1,'Make your bed','bedroom',20),(2,'Feed the cat','pets',15),(3,'Empty the dishwasher','kitchen',30),
    (4,'Homework, 30 minutes','school',40),(5,'Tidy your desk','bedroom',25),(6,'Take the bins out','outdoor',30),
    (7,'Read for 20 minutes','school',30),(8,'Set the table','kitchen',15),(9,'Water the plants','outdoor',15),
    (10,'Put laundry away','bedroom',25),(11,'Practise piano','music',40),(12,'Wipe the bathroom sink','bathroom',30)
  ) v(cn, title, category, xp);

insert into quests (id, family_id, kid_id, created_by, title, category, xp, recurrence, status, created_at)
select md5('qo-' || k.g || '-' || k.k || '-' || n)::uuid, k.family_id, k.id, md5('par-' || k.g || '-1')::uuid,
       c.title, c.category, c.xp, case when n % 3 = 0 then 'once' else 'daily' end, 'assigned',
       now() - interval '1 day'
  from kid k cross join generate_series(1, 8) n join chores c on c.cn = 1 + (n + k.k) % 12;

-- Three months of history: thirty chores a child, done again and again.
insert into quests (id, family_id, kid_id, created_by, title, category, xp, recurrence, status, completed_at, created_at)
select md5('qh-' || k.g || '-' || k.k || '-' || n)::uuid, k.family_id, k.id, md5('par-' || k.g || '-1')::uuid,
       c.title, c.category, c.xp, 'once', 'approved', now() - make_interval(days => n * 3), now() - interval '95 days'
  from kid k cross join generate_series(1, 30) n join chores c on c.cn = 1 + (n * 5 + k.k) % 12;

insert into submissions (id, family_id, quest_id, kid_id, status, submitted_at, decided_at, decided_by,
                         awarded_xp, awarded_coins, note)
select md5('sh-' || k.g || '-' || k.k || '-' || n)::uuid, k.family_id,
       md5('qh-' || k.g || '-' || k.k || '-' || (1 + n % 30))::uuid, k.id,
       case when n % 20 = 0 then 'rejected' else 'approved' end,
       now() - make_interval(hours => n * 18 + 2), now() - make_interval(hours => n * 18),
       md5('par-' || k.g || '-1')::uuid, 30 + n % 30, 6 + n % 6, case when n % 7 = 0 then 'Done!' else '' end
  from kid k cross join generate_series(1, 120) n;

insert into events (family_id, kid_id, type, meta, day, created_at)
select s.family_id, s.kid_id, 'quest_approved',
       jsonb_build_object('questId', s.quest_id, 'xp', s.awarded_xp, 'coins', s.awarded_coins),
       s.decided_at::date, s.decided_at
  from submissions s join fam f on f.id = s.family_id where s.status = 'approved';

insert into rewards (id, family_id, name, icon, cost)
select md5('rw-' || f.g || '-' || n)::uuid, f.id,
       (array['30 min screen time','Pick dinner','Stay up late','Movie night','Ice cream trip','Pocket money'])[n],
       '🎁', (array[40,60,120,200,150,100])[n]
  from fam f cross join generate_series(1, 6) n;

insert into redemptions (id, family_id, reward_id, kid_id, name, cost, status, created_at, given_at)
select md5('rd-' || k.g || '-' || k.k || '-' || n)::uuid, k.family_id, md5('rw-' || k.g || '-' || (1 + n % 6))::uuid,
       k.id, 'Reward', 60, 'given', now() - make_interval(days => n * 9), now() - make_interval(days => n * 9)
  from kid k cross join generate_series(1, 10) n;

insert into notes (family_id, kid_id, author, body, read, created_at)
select k.family_id, k.id, case when n % 2 = 0 then 'parent' else 'kid' end, 'Great job this week', true,
       now() - make_interval(days => n * 5)
  from kid k cross join generate_series(1, 4) n;

analyze;
`
}

async function setup() {
  const admin = new pg.Client({ ...conn, database: 'postgres' })
  await admin.connect()
  await admin.query(`drop database if exists ${DB} with (force)`)
  await admin.query(`create database ${DB}`)
  await admin.end()

  const t0 = Date.now()
  psql(DB, join(ROOT, 'supabase/test/00-shim.sql'))
  for (const f of sqlFileOrder()) psql(DB, join(ROOT, 'supabase', f))
  console.log(`schema applied (${sqlFileOrder().length} files) in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  const c = new pg.Client({ ...conn, database: DB })
  await c.connect()
  const t1 = Date.now()
  await c.query(seedSql(FAMILIES))
  const counts = await c.query(`select
    (select count(*) from families) families, (select count(*) from kids) kids,
    (select count(*) from parents) parents, (select count(*) from quests) quests,
    (select count(*) from submissions) submissions, (select count(*) from events) events,
    (select count(*) from redemptions) redemptions,
    pg_size_pretty(pg_database_size(current_database())) size`)
  console.log(`seeded in ${((Date.now() - t1) / 1000).toFixed(1)}s:`, counts.rows[0])
  await c.end()
}

/* ------------------------------------------------------------------------ */
/* The phones                                                               */
/* ------------------------------------------------------------------------ */

class Stats {
  constructor() { this.by = new Map() }
  add(fn, ms, outcome) {
    let s = this.by.get(fn)
    if (!s) { s = { lat: [], refused: 0, errors: 0, samples: [] }; this.by.set(fn, s) }
    s.lat.push(ms)
    if (outcome === 'refused') s.refused += 1
    else if (outcome && outcome !== 'ok') {
      s.errors += 1
      if (s.samples.length < 3) s.samples.push(String(outcome).slice(0, 160))
    }
  }
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0)

/** Errors a phone is built to expect: the answer it shows the person, not a fault. */
const EXPECTED = /already decided|not_open|already_pending|insufficient|weekly_limit|not_found|reward_gone/

async function call(pool, userId, sql, params, stats, fn, waits) {
  const t0 = performance.now()
  let client
  try {
    client = await pool.connect()
  } catch (err) {
    stats.add(fn, performance.now() - t0, `pool: ${err.message}`)
    return null
  }
  const waited = performance.now() - t0
  waits.push(waited)
  try {
    await client.query('begin; set local role authenticated')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
    const r = await client.query(sql, params)
    await client.query('commit')
    const v = r.rows[0]?.v
    const refused = v && typeof v === 'object' && v.ok === false
    stats.add(fn, performance.now() - t0, refused ? 'refused' : 'ok')
    return v
  } catch (err) {
    await client.query('rollback').catch(() => {})
    stats.add(fn, performance.now() - t0, EXPECTED.test(err.message) ? 'refused' : err.message)
    return null
  } finally {
    client.release()
  }
}

/** What a phone keeps from its pulls, enough to choose its next action. */
function absorb(phone, snap) {
  if (!snap) return
  phone.cursor = Number(snap.server_rev) || phone.cursor
  for (const q of snap.quests || []) phone.quests.set(q.id, q)
  for (const s of snap.submissions || []) phone.subs.set(s.id, s)
  for (const r of snap.rewards || []) phone.rewards.set(r.id, r)
  for (const r of snap.redemptions || []) phone.redemptions.set(r.id, r)
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

async function phoneLoop(pool, phone, stats, waits, until) {
  const pull = async () => {
    const since = phone.cursor === 0 || Math.random() < 0.02 ? 0 : phone.cursor
    const snap = await call(pool, phone.userId, 'select family_snapshot($1) v', [since], stats,
      since === 0 ? 'pull (from zero)' : 'pull (since cursor)', waits)
    absorb(phone, snap)
  }
  await pull()
  while (Date.now() < until) {
    const r = Math.random()
    if (phone.role === 'kid') {
      if (r < 0.15) {
        const open = [...phone.quests.values()].filter((q) => q.kid_id === phone.kidId && (q.status === 'assigned' || q.status === 'redo'))
        if (open.length) {
          const q = pick(open)
          const v = await call(pool, phone.userId, 'select submit_quest($1, $2, $3, $4) v',
            [randomUUID(), q.id, phone.kidId, JSON.stringify({ note: 'Done', on_time: true })], stats, 'submit_quest', waits)
          if (v?.ok) q.status = 'submitted'
          continue
        }
      } else if (r < 0.20) {
        const rewards = [...phone.rewards.values()]
        if (rewards.length) {
          await call(pool, phone.userId, 'select redeem_reward($1, $2, $3) v',
            [randomUUID(), pick(rewards).id, phone.kidId], stats, 'redeem_reward', waits)
          continue
        }
      }
      await pull()
    } else {
      if (r < 0.15) {
        const pending = [...phone.subs.values()].filter((s) => s.status === 'pending')
        if (pending.length) {
          const s = pick(pending)
          await call(pool, phone.userId, 'select approve_submission($1, 0, 0, $2, $3, $4) is null v',
            [s.id, 'Nice work', 'proud', phone.tz], stats, 'approve_submission', waits)
          s.status = 'approved'
          continue
        }
      } else if (r < 0.27) {
        const kidIds = phone.kidIds
        await call(pool, phone.userId,
          `with q as (insert into quests (id, family_id, kid_id, title, category, xp, recurrence)
                      values ($1, $2, $3, $4, 'kitchen', 25, 'once') returning 1) select count(*) v from q`,
          [randomUUID(), phone.familyId, pick(kidIds), 'Unload the shopping'], stats, 'new chore (insert quests)', waits)
        continue
      } else if (r < 0.31) {
        const owed = [...phone.redemptions.values()].filter((x) => x.status === 'requested')
        if (owed.length) {
          const x = pick(owed)
          await call(pool, phone.userId, 'select mark_redemption_given($1) v', [x.id], stats, 'mark_redemption_given', waits)
          x.status = 'given'
          continue
        }
      }
      await pull()
    }
  }
}

async function loadPhones(c) {
  const kids = await c.query(`select k.id, k.user_id, k.family_id from kids k where k.user_id is not null`)
  const parents = await c.query(`select p.user_id, p.family_id, f.timezone,
      (select array_agg(id) from kids where family_id = p.family_id) kid_ids
    from parents p join families f on f.id = p.family_id`)
  const phones = [
    ...kids.rows.map((k) => ({ role: 'kid', userId: k.user_id, kidId: k.id, familyId: k.family_id })),
    ...parents.rows.map((p) => ({ role: 'parent', userId: p.user_id, familyId: p.family_id, tz: p.timezone, kidIds: p.kid_ids })),
  ]
  // Shuffled once with a fixed seed, so a step's sample is a mix of families
  // and of roles, and the same from run to run.
  let seed = 42
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  for (let i = phones.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [phones[i], phones[j]] = [phones[j], phones[i]]
  }
  return phones
}

async function runStep(allPhones, n) {
  const pool = new pg.Pool({ ...conn, database: DB, max: POOL, connectionTimeoutMillis: WAIT_LIMIT_MS })
  pool.on('error', () => {})
  const stats = new Stats()
  const waits = []
  const phones = allPhones.slice(0, n).map((p) => ({
    ...p, cursor: 0, quests: new Map(), subs: new Map(), rewards: new Map(), redemptions: new Map(),
  }))
  const started = Date.now()
  const until = started + SECONDS * 1000
  await Promise.all(phones.map((p) => phoneLoop(pool, p, stats, waits, until)))
  const elapsed = (Date.now() - started) / 1000
  await pool.end()

  const rows = []
  let total = 0
  let errors = 0
  for (const [fn, s] of [...stats.by.entries()].sort()) {
    const sorted = s.lat.slice().sort((a, b) => a - b)
    total += sorted.length
    errors += s.errors
    rows.push({
      fn, requests: sorted.length, rps: +(sorted.length / elapsed).toFixed(1),
      p50: +pct(sorted, 0.5).toFixed(1), p95: +pct(sorted, 0.95).toFixed(1), max: +sorted.at(-1).toFixed(1),
      refused: s.refused, errors: s.errors, samples: s.samples,
    })
  }
  const w = waits.slice().sort((a, b) => a - b)
  return {
    phones: n, pool: POOL, seconds: +elapsed.toFixed(1), total, rps: +(total / elapsed).toFixed(1), errors,
    poolWaitP50: +pct(w, 0.5).toFixed(1), poolWaitP95: +pct(w, 0.95).toFixed(1), rows,
  }
}

function broke(step) {
  const reasons = []
  const pulls = step.rows.filter((r) => r.fn.startsWith('pull (since'))
  for (const p of pulls) if (p.p95 > PULL_P95_LIMIT_MS) reasons.push(`95% of pulls took up to ${p.p95} ms (limit ${PULL_P95_LIMIT_MS})`)
  if (step.total && step.errors / step.total > ERROR_LIMIT) reasons.push(`${step.errors} errors in ${step.total} requests`)
  for (const r of step.rows) for (const s of r.samples) if (/pool|timeout/i.test(s)) { reasons.push(`pool: ${s}`); break }
  return reasons
}

function printStep(step) {
  console.log(`\n${step.phones} phones, pool ${step.pool}, ${step.seconds}s: ${step.total} requests, ${step.rps}/s, ` +
    `${step.errors} errors; waiting for a connection p50 ${step.poolWaitP50} ms, p95 ${step.poolWaitP95} ms`)
  console.log('  function                       req/s   median ms   p95 ms    max ms  refused  errors')
  for (const r of step.rows) {
    console.log(`  ${r.fn.padEnd(30)} ${String(r.rps).padStart(6)} ${String(r.p50).padStart(10)} ${String(r.p95).padStart(9)} ` +
      `${String(r.max).padStart(9)} ${String(r.refused).padStart(8)} ${String(r.errors).padStart(7)}`)
    for (const s of r.samples) console.log(`      ${s}`)
  }
}

async function top(limit) {
  const c = new pg.Client({ ...conn, database: DB })
  await c.connect()
  try {
    const r = await c.query(`select calls, round(total_exec_time::numeric, 1) total_ms,
        round(mean_exec_time::numeric, 3) mean_ms, rows,
        regexp_replace(left(query, 160), '\\s+', ' ', 'g') query
      from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database())
      order by total_exec_time desc limit $1`, [limit])
    console.log(`\nThe ${limit} statements with the most time in them (pg_stat_statements, nested statements included):`)
    for (const row of r.rows) console.log(`  ${String(row.calls).padStart(7)} calls  ${String(row.total_ms).padStart(10)} ms total  ${String(row.mean_ms).padStart(8)} ms each  ${row.query}`)
    return r.rows
  } catch (err) {
    console.log(`\n(pg_stat_statements is not available: ${err.message})`)
    return []
  } finally {
    await c.end()
  }
}

/**
 * The scheduled jobs' own queries, once each over the whole seed, inside a
 * transaction that is rolled back: what a job's run costs the database at
 * this many families. The digest is asked as of Sunday evening, when every
 * family is due.
 */
const JOBS = [
  ['due_digests (Sunday 19:00, every family due)',
    `select length(due_digests_at(date_trunc('week', now()) + interval '6 days 19 hours', 7, 18)::text)`],
  ['due_reminders', 'select length(due_reminders_at(now(), 120)::text)'],
  ['due_trial_reminders', 'select length(due_trial_reminders_at(now())::text)'],
  ['settle_alliances (last month)', `select length(settle_alliances(date_trunc('month', now() - interval '1 month')::date)::text)`],
  ['settle_school_month (last month)', `select length(settle_school_month(date_trunc('month', now() - interval '1 month')::date)::text)`],
  ['run_retention', 'select run_retention()'],
  // Every second child in Arena (inside the rolled-back transaction), then
  // the leaderboard job ranks them all on every board.
  ['refresh_leaderboards (half the children in Arena)',
    `insert into leaderboard_profiles (kid_id, family_id, mode, nickname, arena_since)
       select id, family_id, case when row_number() over (order by id) % 2 = 0 then 'arena' else 'adventure' end,
              leaderboard_random_nickname(), now() from kids on conflict (kid_id) do nothing;
     insert into leaderboard_families (family_id, country) select id, 'GB' from families on conflict (family_id) do nothing;
     select refresh_leaderboards()`],
  ['usage_counts', 'select usage_counts()'],
]

async function jobs() {
  const c = new pg.Client({ ...conn, database: DB })
  await c.connect()
  const out = []
  console.log('\nThe scheduled jobs, once each (rolled back):')
  for (const [name, sql] of JOBS) {
    await c.query('begin')
    const t0 = performance.now()
    let note = ''
    try { await c.query(sql) } catch (err) { note = ` (${err.message})` }
    const ms = +(performance.now() - t0).toFixed(1)
    await c.query('rollback')
    out.push({ job: name, ms })
    console.log(`  ${name.padEnd(48)} ${String(ms).padStart(9)} ms${note}`)
  }
  await c.end()
  return out
}

async function main() {
  if (opt.setup) await setup()
  if (opt['setup-only']) return
  if (opt.jobs) { await jobs(); return }

  const c = new pg.Client({ ...conn, database: DB })
  await c.connect()
  const statsOn = await c.query(`create extension if not exists pg_stat_statements`).then(() => true, () => false)
  if (statsOn) {
    await c.query(`alter database ${DB} set pg_stat_statements.track = 'all'`)
    await c.query('select pg_stat_statements_reset()')
  }
  const phones = await loadPhones(c)
  await c.end()
  console.log(`${phones.length} phones in ${DB} (${phones.filter((p) => p.role === 'kid').length} children's, ` +
    `${phones.filter((p) => p.role === 'parent').length} parents'); steps ${STEPS.join(', ')}, ${SECONDS}s each, pool ${POOL}`)

  const results = []
  let firstBreak = null
  for (const n of STEPS) {
    const step = await runStep(phones, Math.min(n, phones.length))
    printStep(step)
    const reasons = broke(step)
    step.broke = reasons
    if (reasons.length && !firstBreak) firstBreak = { phones: step.phones, reasons }
    results.push(step)
  }
  console.log(firstBreak
    ? `\nFIRST THING THAT BREAKS: at ${firstBreak.phones} phones, ${firstBreak.reasons.join('; ')}`
    : '\nNothing broke at any step.')
  const slow = statsOn ? await top(Number(opt.top || 12)) : []
  if (opt.json) {
    writeFileSync(String(opt.json), JSON.stringify({ families: FAMILIES, pool: POOL, seconds: SECONDS, steps: results, firstBreak, slow }, null, 2))
    console.log(`written to ${opt.json}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
