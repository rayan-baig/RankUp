/**
 * The promises RankUp makes about XP, sync and accounts, checked against a
 * real Postgres.
 *
 * Each section is one promise: the levels are the same everywhere, two
 * parents accepting at once pay once, a streak freeze covers the right day
 * wherever the family is, a chore comes back once a day across a clock
 * change, a deleted child stops reaching every phone, deleting an account
 * leaves nothing behind that the privacy policy lists, and so on. Where two
 * phones matter, two connections run at the same instant.
 *
 * The phone-side half (the outbox, the cursor, the merge, the reducer's
 * mirrors of these rules) is tests/offline.mjs.
 *
 * Needs Postgres with the schema applied:  supabase/test/run.sh
 */
import pg from 'pg'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = globalThis.window || { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { levelFromXp, totalXpForLevel } = await import('../src/lib/xp.js')
const { recurrenceDue } = await import('../src/lib/recurrence.js')
const { reducer } = await import('../src/state/reducer.js')
const { createInitialState } = await import('../src/state/initialState.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const conn = () => new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
const admin = conn()
const phoneA = conn()
const phoneB = conn()
await Promise.all([admin.connect(), phoneA.connect(), phoneB.connect()])
// Supabase runs in UTC. A bare ::date on a timestamp is the UTC date there.
for (const c of [admin, phoneA, phoneB]) await c.query("set timezone = 'UTC'")

const q = (sql, args = []) => admin.query(sql, args)
const one = async (sql, args = []) => (await q(sql, args)).rows[0]

/** Run as a signed-in user, the way the API does: their claims, RLS on. */
async function as(client, user, fn) {
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user])
  await client.query('set role authenticated')
  try { return await fn(client) } finally { await client.query('reset role') }
}
async function rpcAs(client, user, fn, args = {}) {
  return as(client, user, async (c) => {
    const names = Object.keys(args)
    const sql = `select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
    try { return (await c.query(sql, names.map((n) => args[n]))).rows[0].r }
    catch (err) { return { ok: false, error: err.message } }
  })
}

/* ------------------------------------------------------------------ */
/* A family to work in                                                 */
/* ------------------------------------------------------------------ */

const ID = (n) => `9d000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const FAMILY = ID(1)
const OWNER = ID(11)
const COPARENT = ID(12)
const KID_PHONE = ID(21)
const KID = ID(31)
const KID_NAME = 'Zephyrina'

async function freshFamily() {
  await q('delete from families where id = $1', [FAMILY])
  await q('delete from pairing_codes where kid_name = $1', [KID_NAME])
  await q(`insert into auth.users (id, email) values ($1, 'gd-owner@example.com'), ($2, 'gd-co@example.com'), ($3, null)
           on conflict (id) do nothing`, [OWNER, COPARENT, KID_PHONE])
  await q(`insert into families (id, name, tier) values ($1, 'Guarantee Family Q', 'standard')`, [FAMILY])
  await q(`insert into parents (user_id, family_id, name, role, is_owner) values ($1, $3, 'Pat', 'parent', true), ($2, $3, 'Lee', 'parent', false)
           on conflict (user_id) do update set family_id = excluded.family_id, role = 'parent', is_owner = excluded.is_owner`,
  [OWNER, COPARENT, FAMILY])
  await q('select seed_consent($1, $2)', [FAMILY, OWNER])
  await q(`insert into kids (id, family_id, name, user_id) values ($1, $2, $3, $4)`, [KID, FAMILY, KID_NAME, KID_PHONE])
}
let n = 100
const newQuest = async (fields = {}) => {
  const id = ID(n += 1)
  const cols = { id, family_id: FAMILY, kid_id: KID, title: 'Feed the cat', xp: 30, ...fields }
  const keys = Object.keys(cols)
  await q(`insert into quests (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((k) => cols[k]))
  return id
}
const newSubmission = async (questId, fields = {}) => {
  const id = ID(n += 1)
  await q(`insert into submissions (id, family_id, quest_id, kid_id, status, on_time, elapsed_ms)
           values ($1, $2, $3, $4, 'pending', $5, $6)`, [id, FAMILY, questId, KID, fields.on_time ?? true, fields.elapsed_ms ?? null])
  await q(`update quests set status = 'submitted' where id = $1`, [questId])
  return id
}
const kid = () => one('select * from kids where id = $1', [KID])

/* A zone whose date is not the UTC date right now, whenever this runs. */
const AWAY = (await one(`select case when extract(hour from now() at time zone 'UTC') >= 10
                                then 'Pacific/Kiritimati' else 'Etc/GMT+12' end as tz`)).tz
const awayToday = (await one(`select (now() at time zone $1)::date::text as d`, [AWAY])).d

/* ================================================================== */
console.log('\n=== Levels: the app is the only place the curve lives ===')
{
  const funcs = await one(`select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                            where s.nspname = 'public' and p.prosrc ~* '(xp_to_next|level_from|total_xp_for|least\\(400)'`)
  const cols = await one(`select count(*)::int as n from information_schema.columns
                           where table_schema = 'public' and column_name ~* '^(level|kid_level|current_level)$'`)
  ok('no database function computes a level, so there is no second curve to drift', funcs.n === 0, `${funcs.n} found`)
  ok('and no table stores one: only XP is kept, every screen derives the level from it', cols.n === 0)
  let bad = []
  for (let L = 1; L <= 100; L += 1) {
    const at = totalXpForLevel(L)
    if (levelFromXp(at).level !== L) bad.push(`${at} xp is not level ${L}`)
    if (L > 1 && levelFromXp(at - 1).level !== L - 1) bad.push(`${at - 1} xp is not level ${L - 1}`)
    if (L > 1 && at <= totalXpForLevel(L - 1)) bad.push(`level ${L} is not above ${L - 1}`)
  }
  ok('levels 1 to 100: each threshold is exactly where the level starts, one XP short is the level below',
    bad.length === 0, bad[0])
  // The one server-side reader of a child's standing hands over XP, not a level.
  const roster = await one(`select pg_get_functiondef('guild_roster(uuid, uuid)'::regprocedure) as d`)
  ok('the guild roster sends XP for the app to turn into a level', /'xp', k\.xp/.test(roster.d))
}

/* ================================================================== */
console.log('\n=== Double XP counts once when two parents accept at the same moment ===')
{
  await freshFamily()
  const quest = await newQuest({ xp: 40, double_xp: true })
  const sub = await newSubmission(quest)
  const args = { p_submission_id: sub, p_xp: 999, p_coins: 999, p_note: '' }
  const [a, b] = await Promise.all([
    rpcAs(phoneA, OWNER, 'approve_submission', args),
    rpcAs(phoneB, COPARENT, 'approve_submission', args),
  ])
  const wins = [a, b].filter((r) => !r?.error).length
  ok('exactly one of the two taps is accepted', wins === 1, JSON.stringify([a, b]))
  ok('the other is told it was already decided', [a, b].some((r) => /already decided/.test(r?.error || '')))
  const k = await kid()
  ok('the child got double XP once: 80, not 160', k.xp === 80, `xp ${k.xp}`)
  const ev = await one(`select count(*)::int as n from events where kid_id = $1 and type = 'quest_approved'`, [KID])
  ok('and one approval was recorded', ev.n === 1)
  const s = await one('select awarded_xp from submissions where id = $1', [sub])
  ok('the submission says 80 too', s.awarded_xp === 80)
}

/* ================================================================== */
console.log('\n=== A streak freeze covers the missed day, on the family\'s day ===')
{
  // The approving phone is in AWAY, whose date is not UTC's: the freeze must
  // be judged by AWAY's calendar.
  await freshFamily()
  await q(`update kids set streak_count = 6, streak_freezes = 1, streak_last_day = $2::date - 2 where id = $1`, [KID, awayToday])
  let sub = await newSubmission(await newQuest({ xp: 20 }))
  await rpcAs(phoneA, OWNER, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0, p_tz: AWAY })
  let k = await kid()
  ok('one missed day: the freeze is spent and the run carries on (6 -> 7)', k.streak_count === 7 && k.streak_freezes === 0,
    `count ${k.streak_count}, freezes ${k.streak_freezes}`)
  ok('the day counted is today where the family is', k.streak_last_day.toISOString().slice(0, 10) === awayToday)
  ok('the streak bonus was still paid on that approval (+10% at 6 days)', k.xp === 22, `xp ${k.xp}`)
  const ev = await one(`select meta->>'covered' as covered from events where kid_id = $1 and type = 'streak_freeze'`, [KID])
  ok('and the freeze is in the family\'s history, naming the day it covered',
    ev?.covered === (await one(`select ($1::date - 1)::text as d`, [awayToday])).d)

  // Yesterday in AWAY is not a missed day, even when it is two days ago in UTC.
  await freshFamily()
  await q(`update kids set streak_count = 6, streak_freezes = 1, streak_last_day = $2::date - 1 where id = $1`, [KID, awayToday])
  sub = await newSubmission(await newQuest({ xp: 20 }))
  await rpcAs(phoneA, OWNER, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0, p_tz: AWAY })
  k = await kid()
  ok('no day missed where the family is: the freeze is kept', k.streak_count === 7 && k.streak_freezes === 1)

  // Two missed days is more than one freeze covers.
  await freshFamily()
  await q(`update kids set streak_count = 6, streak_freezes = 1, streak_last_day = $2::date - 3 where id = $1`, [KID, awayToday])
  sub = await newSubmission(await newQuest({ xp: 20 }))
  await rpcAs(phoneA, OWNER, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0, p_tz: AWAY })
  k = await kid()
  ok('two missed days: the run starts again and the freeze is kept for next time',
    k.streak_count === 1 && k.streak_freezes === 1 && k.xp === 20)

  // No freeze left: one missed day breaks it.
  await freshFamily()
  await q(`update kids set streak_count = 6, streak_freezes = 0, streak_last_day = $2::date - 2 where id = $1`, [KID, awayToday])
  sub = await newSubmission(await newQuest({ xp: 20 }))
  await rpcAs(phoneA, OWNER, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0, p_tz: AWAY })
  k = await kid()
  ok('with no freeze, a missed day starts the run again', k.streak_count === 1)
}

/* ================================================================== */
console.log('\n=== A child who travels keeps their streak ===')
{
  // Flying east: yesterday in the new zone was the last day counted.
  await freshFamily()
  const tokyoToday = (await one(`select (now() at time zone 'Asia/Tokyo')::date::text as d`)).d
  const laToday = (await one(`select (now() at time zone 'America/Los_Angeles')::date::text as d`)).d
  await q(`update kids set streak_count = 4, streak_freezes = 0, streak_last_day = $2::date - 1 where id = $1`, [KID, tokyoToday])
  let sub = await newSubmission(await newQuest())
  await rpcAs(phoneA, OWNER, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0, p_tz: 'Asia/Tokyo' })
  let k = await kid()
  ok('east: a chore on each local day carries the run on (4 -> 5)', k.streak_count === 5, `count ${k.streak_count}`)

  // Flying back west: the local date can be the same or even earlier than
  // the last day counted. That is not a broken streak.
  sub = await newSubmission(await newQuest())
  await rpcAs(phoneB, COPARENT, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0, p_tz: 'America/Los_Angeles' })
  k = await kid()
  ok('west: landing on an earlier date keeps the run (still 5)', k.streak_count === 5, `count ${k.streak_count}`)
  ok('and the day counted follows the phone, so tomorrow there counts as the next day',
    k.streak_last_day.toISOString().slice(0, 10) === laToday)
  // The family's saved zone is not what decides: the phone in hand is.
  await q(`update families set timezone = 'Europe/London' where id = $1`, [FAMILY])
  const today = await one(`select family_today($1, 'Asia/Tokyo')::text as d`, [FAMILY])
  ok('"today" is the travelling phone\'s day, not the zone saved at home', today.d === tokyoToday)
}

/* ================================================================== */
console.log('\n=== A daily chore comes back once a day, wherever and whenever ===')
{
  // Approved at 23:30 last night in Los Angeles, which is already today in UTC.
  await freshFamily()
  const quest = await newQuest({ recurrence: 'daily', status: 'approved' })
  await q(`update quests set completed_at = (date_trunc('day', now() at time zone 'America/Los_Angeles') - interval '30 minutes')
                                              at time zone 'America/Los_Angeles' where id = $1`, [quest])
  const utcDay = await one(`select (completed_at::date = (now() at time zone 'America/Los_Angeles')::date) as same from quests where id = $1`, [quest])
  let r = await rpcAs(phoneA, OWNER, 'reset_due_recurring_quests', { p_tz: 'America/Los_Angeles' })
  ok('done late last night in LA (already "today" in UTC), it is back this morning in LA',
    (r.reset || []).includes(quest), `utc date same as LA today: ${utcDay.same}; ${JSON.stringify(r)}`)

  // Came back two days ago, only done today: not back again today.
  const late = await newQuest({ recurrence: 'daily', status: 'approved' })
  await q(`update quests set last_reset_on = (now() at time zone 'America/Los_Angeles')::date - 2, completed_at = now() where id = $1`, [late])
  r = await rpcAs(phoneA, OWNER, 'reset_due_recurring_quests', { p_tz: 'America/Los_Angeles' })
  ok('a daily chore that came back on Monday and was done today is not back again today',
    !(r.reset || []).includes(late), JSON.stringify(r))

  // Across both clock changes: tick every 15 minutes, do the chore whenever it
  // is back, and count how often it came back on each local day.
  for (const [label, from, to] of [['spring forward', '2026-03-06 00:00', '2026-03-10 00:00'],
    ['fall back', '2026-10-30 00:00', '2026-11-03 00:00']]) {
    const ticks = (await q(`select t, (t at time zone 'America/New_York')::date::text as day
                              from generate_series(($1::timestamp at time zone 'America/New_York'),
                                                   ($2::timestamp at time zone 'America/New_York'),
                                                   interval '15 minutes') t`, [from, to])).rows
    let lastReset = null
    let completed = ticks[0].t
    const perDay = {}
    for (const { t, day } of ticks) {
      const doneDay = (await one(`select ($1::timestamptz at time zone 'America/New_York')::date::text as d`, [completed])).d
      const last = lastReset && lastReset > doneDay ? lastReset : doneDay
      const due = (await one(`select recurring_quest_due('daily', 'approved', $1::date, $2::date) as due`, [last, day])).due
      if (due) {
        perDay[day] = (perDay[day] || 0) + 1
        lastReset = day
        completed = new Date(new Date(t).getTime() + 60_000)   // done straight away
      }
    }
    const days = Object.keys(perDay)
    ok(`${label}: back exactly once on every day (${days.join(', ')})`,
      days.length === 4 && Object.values(perDay).every((c) => c === 1), JSON.stringify(perDay))
  }
}

/* ================================================================== */
console.log('\n=== Weekly chores come back on the family\'s chosen day ===')
{
  await freshFamily()
  const set = await rpcAs(phoneA, OWNER, 'set_week_reset_day', { p_day: 6 })
  ok('a parent can choose Saturday', set?.ok === true, JSON.stringify(set))
  const kidTry = await rpcAs(phoneA, KID_PHONE, 'set_week_reset_day', { p_day: 1 })
  ok('a child cannot change it', kidTry?.ok === false)
  ok('nor can anyone choose a day that does not exist',
    (await rpcAs(phoneA, OWNER, 'set_week_reset_day', { p_day: 9 }))?.ok === false)
  const fam = await one('select week_resets_on from families where id = $1', [FAMILY])
  ok('it is kept with the family', fam.week_resets_on === 6)

  const due = async (last, today, day) => (await one(`select recurring_quest_due('weekly', 'approved', $1::date, $2::date, $3) as d`, [last, today, day])).d
  // 2026-09-09 is a Wednesday, 2026-09-12 the Saturday after it.
  ok('done on Wednesday, it waits through Friday', !(await due('2026-09-09', '2026-09-11', 6)))
  ok('and is back on Saturday', await due('2026-09-09', '2026-09-12', 6))
  ok('done ON a Saturday, it waits for the next one', !(await due('2026-09-12', '2026-09-18', 6)) && await due('2026-09-12', '2026-09-19', 6))
  ok('missed Saturday entirely, it is still waiting on Sunday', await due('2026-09-09', '2026-09-13', 6))
  ok('with no day chosen, it is seven days after it was done', !(await due('2026-09-09', '2026-09-15', null)) && await due('2026-09-09', '2026-09-16', null))

  // The app and the database agree, for every chosen day.
  const mismatches = []
  for (let day = 1; day <= 7; day += 1) {
    for (let a = 0; a < 15; a += 1) {
      for (let b = 0; b < 15; b += 1) {
        const last = new Date(Date.UTC(2026, 8, 7 + a)).toISOString().slice(0, 10)
        const today = new Date(Date.UTC(2026, 8, 7 + b)).toISOString().slice(0, 10)
        const db = await due(last, today, day)
        const app = recurrenceDue({ recurrence: 'weekly', status: 'approved', lastResetOn: last }, today, day)
        if (Boolean(db) !== app) mismatches.push(`${last}->${today} day ${day}: app ${app} db ${db}`)
      }
    }
  }
  ok('the app and the database agree on all 1575 of them', mismatches.length === 0, mismatches[0])

  // And the reset the phones ask for uses the family's day.
  const todayDow = (await one(`select extract(isodow from (now() at time zone 'UTC')::date)::int as d`)).d
  const weekly = await newQuest({ recurrence: 'weekly', status: 'approved' })
  await q(`update quests set completed_at = now() - interval '1 day' where id = $1`, [weekly])
  await rpcAs(phoneA, OWNER, 'set_week_reset_day', { p_day: (todayDow % 7) + 1 })   // tomorrow
  let r = await rpcAs(phoneA, OWNER, 'reset_due_recurring_quests', { p_tz: 'UTC' })
  ok('chosen day is tomorrow: done yesterday, it is not back yet', !(r.reset || []).includes(weekly))
  await rpcAs(phoneA, OWNER, 'set_week_reset_day', { p_day: todayDow })              // today
  r = await rpcAs(phoneA, OWNER, 'reset_due_recurring_quests', { p_tz: 'UTC' })
  ok('chosen day is today: it is back', (r.reset || []).includes(weekly))

  // The family's choice reaches the phones and the phone's rule uses it.
  const snap = await as(phoneA, OWNER, async (c) => (await c.query('select family_snapshot(0) as s')).rows[0].s)
  let state = reducer(createInitialState(), { type: 'MERGE_SNAPSHOT', snapshot: snap })
  ok('the chosen day arrives on every phone with the family', state.family.weekResetsOn === todayDow)
  state = reducer(state, { type: 'SET_WEEK_RESET_DAY', day: 3 })
  ok('changing it on a phone sends it to the server',
    state.syncQueue.some((i) => i.fn === 'set_week_reset_day' && i.args.p_day === 3) && state.family.weekResetsOn === 3)
  await rpcAs(phoneA, OWNER, 'set_week_reset_day', { p_day: null })
}

/* ================================================================== */
console.log('\n=== A timed chore finished exactly at the deadline is on time ===')
{
  await freshFamily()
  const quest = await newQuest({ xp: 40, timer_seconds: 300 })
  await q(`update quests set status = 'assigned' where id = $1`, [quest])
  const sub = ID(n += 1)
  const r = await rpcAs(phoneA, KID_PHONE, 'submit_quest', {
    p_submission_id: sub, p_quest_id: quest, p_kid_id: KID,
    p_payload: JSON.stringify({ elapsed_ms: 300000, on_time: true }),
  })
  ok('the child sends it at exactly 5:00 of a 5:00 chore', r?.ok === true, JSON.stringify(r))
  await rpcAs(phoneB, COPARENT, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0 })
  const s = await one('select awarded_xp, on_time from submissions where id = $1', [sub])
  ok('and it is paid the beat-the-clock bonus: 40 + 10', s.on_time === true && s.awarded_xp === 50, JSON.stringify(s))
}

/* ================================================================== */
console.log('\n=== "Send back" leaves the chore exactly as it was ===')
{
  await freshFamily()
  const quest = await newQuest({ xp: 55, difficulty: 'hard', double_xp: true, timer_seconds: 600, recurrence: 'weekly', pence: 150, test_score: true })
  await q(`update quests set status = 'assigned', last_reset_on = current_date - 3 where id = $1`, [quest])
  const before = await one(`select to_jsonb(q) - array['rev','status','redo_note','redo_count','edited_by'] as row from quests q where id = $1`, [quest])
  const kidBefore = await kid()
  const sub = ID(n += 1)
  await rpcAs(phoneA, KID_PHONE, 'submit_quest', { p_submission_id: sub, p_quest_id: quest, p_kid_id: KID, p_payload: '{"test_score": 91}' })
  const back = await rpcAs(phoneB, OWNER, 'reject_submission', { p_submission_id: sub, p_note: 'Under the bed too' })
  ok('a parent sends it back', back?.ok === true, JSON.stringify(back))
  const after = await one(`select to_jsonb(q) - array['rev','status','redo_note','redo_count','edited_by'] as row,
                                  status, redo_note, redo_count from quests q where id = $1`, [quest])
  ok('every setting of the chore is as it was: worth, double XP, timer, repeat, pocket money, score',
    JSON.stringify(after.row) === JSON.stringify(before.row), JSON.stringify({ before: before.row, after: after.row }))
  ok('it is open again, with the parent\'s note', after.status === 'redo' && after.redo_note === 'Under the bed too' && after.redo_count === 1)
  const kidAfter = await kid()
  ok('nothing was paid or taken', kidAfter.xp === kidBefore.xp && kidAfter.coins === kidBefore.coins
    && kidAfter.streak_count === kidBefore.streak_count)
  const again = await rpcAs(phoneA, KID_PHONE, 'submit_quest', { p_submission_id: ID(n += 1), p_quest_id: quest, p_kid_id: KID, p_payload: '{}' })
  ok('and the child can send it again', again?.ok === true)
}

/* ================================================================== */
console.log('\n=== Two parents edit the same chore: last write wins, and the other is kept on record ===')
{
  await freshFamily()
  const quest = await newQuest({ title: 'Tidy room', xp: 30 })
  // Each phone sends only the columns it changed (a patch), as the app does.
  await as(phoneA, OWNER, (c) => c.query(`update quests set title = 'Tidy your room' where id = $1`, [quest]))
  await as(phoneB, COPARENT, (c) => c.query(`update quests set title = 'Tidy room and desk' where id = $1`, [quest]))
  await as(phoneA, OWNER, (c) => c.query(`update quests set xp = 45 where id = $1`, [quest]))
  const row = await one('select title, xp from quests where id = $1', [quest])
  ok('the edit that arrived last is the title', row.title === 'Tidy room and desk')
  ok('an edit to a different field from the other phone survives beside it', row.xp === 45)
  const edits = (await q(`select meta from events where family_id = $1 and type = 'quest_edited' order by id`, [FAMILY])).rows.map((r) => r.meta)
  ok('every edit is in the family\'s history', edits.length === 3, `${edits.length} recorded`)
  const second = edits[1] || {}
  ok('the replaced title is kept, with who wrote it and who replaced it',
    second.changes?.title?.from === 'Tidy your room' && second.changes?.title?.to === 'Tidy room and desk'
      && second.replaced_edit_by === OWNER && second.by === COPARENT, JSON.stringify(second))
  const exported = await rpcAs(phoneA, OWNER, 'export_family_data', {})
  ok('and a parent can find it in "Download my data"',
    JSON.stringify(exported?.activity || []).includes('Tidy your room'))
  // A chore being approved is not an edit.
  const sub = await newSubmission(quest)
  await rpcAs(phoneA, OWNER, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0 })
  const count = await one(`select count(*)::int as n from events where family_id = $1 and type = 'quest_edited'`, [FAMILY])
  ok('approving it adds no edit line', count.n === 3)
  const forged = await rpcAs(phoneA, OWNER, 'log_quest_edit', { p_family: ID(999), p_kid: KID, p_meta: '{}' })
  void forged
  const elsewhere = await one(`select count(*)::int as n from events where family_id = $1`, [ID(999)])
  ok('nobody can write a history line into another family', elsewhere.n === 0)
}

/* ================================================================== */
console.log('\n=== The cursor cannot step over rows written in the same instant ===')
{
  await freshFamily()
  const before = (await one(`select last_value::bigint as v from sync_rev`)).v
  await q('begin')
  for (let i = 0; i < 40; i += 1) await q(`insert into quests (family_id, kid_id, title) values ($1, $2, 'Batch ' || $3)`, [FAMILY, KID, i])
  await q('commit')
  const rows = (await q(`select rev, created_at from quests where family_id = $1 and title like 'Batch %' order by rev`, [FAMILY])).rows
  ok('forty rows written in one transaction share one timestamp', new Set(rows.map((r) => r.created_at.getTime())).size === 1)
  ok('but every one has its own revision', new Set(rows.map((r) => String(r.rev))).size === 40)
  let missed = 0
  for (const [i, r] of rows.entries()) {
    const snap = await as(phoneA, OWNER, async (c) => (await c.query('select family_snapshot($1) as s', [r.rev])).rows[0].s)
    const got = snap.quests.filter((x) => x.title.startsWith('Batch ')).length
    if (got !== 39 - i) missed += 1
  }
  ok('asking from any one of them returns exactly the ones after it', missed === 0, `${missed} cursors were wrong`)
  const fromBefore = await as(phoneA, OWNER, async (c) => (await c.query('select family_snapshot($1) as s', [before])).rows[0].s)
  ok('and asking from before the batch returns all forty', fromBefore.quests.filter((x) => x.title.startsWith('Batch ')).length === 40)

  // A write that takes its number first and commits last is the real danger.
  await phoneA.query('begin')
  await phoneA.query(`insert into quests (family_id, kid_id, title) values ($1, $2, 'Slow one')`, [FAMILY, KID])
  await q(`insert into quests (family_id, kid_id, title) values ($1, $2, 'Quick one')`, [FAMILY, KID])
  const early = await as(phoneB, OWNER, async (c) => (await c.query('select family_snapshot($1) as s', [before])).rows[0].s)
  await phoneA.query('commit')
  const head = Number(early.server_rev)
  const slowRev = Number((await one(`select rev from quests where title = 'Slow one' and family_id = $1`, [FAMILY])).rev)
  ok('a head can be handed out before a lower revision has committed (why phones hold heads back)',
    !early.quests.some((x) => x.title === 'Slow one') && slowRev <= head)
  const late = await as(phoneB, OWNER, async (c) => (await c.query('select family_snapshot($1) as s', [before])).rows[0].s)
  ok('asking again from the older cursor picks it up (tests/cursor.mjs drives the phone side)',
    late.quests.some((x) => x.title === 'Slow one'))
}

/* ================================================================== */
console.log('\n=== A deleted child stops reaching every phone ===')
{
  await freshFamily()
  const quest = await newQuest()
  const sub = await newSubmission(quest)
  void sub
  await q(`insert into notes (family_id, kid_id, author, body) values ($1, $2, 'parent', 'Well done')`, [FAMILY, KID])
  await q(`insert into push_subscriptions (endpoint, keys, family_id, kid_id, user_id, role)
           values ('https://push.example/gd-kid', '{}', $1, $2, $3, 'kid')`, [FAMILY, KID, KID_PHONE])
  const cursor = (await one('select last_value::bigint as v from sync_rev')).v
  await as(phoneA, OWNER, (c) => c.query('delete from kids where id = $1', [KID]))
  const coSnap = await as(phoneB, COPARENT, async (c) => (await c.query('select family_snapshot($1) as s', [cursor])).rows[0].s)
  const gone = new Set(coSnap.deletions.map((d) => `${d.table_name}:${d.row_id}`))
  ok('the other parent\'s phone is told the child is gone', gone.has(`kids:${KID}`))
  ok('and so are their chores and submissions', gone.has(`quests:${quest}`) && gone.has(`submissions:${sub}`))
  ok('and their notes', coSnap.deletions.some((d) => d.table_name === 'notes'))
  const fresh = await as(phoneB, COPARENT, async (c) => (await c.query('select family_snapshot(0) as s', [])).rows[0].s)
  const text = JSON.stringify({ ...fresh, deletions: [] })
  ok('a fresh sync carries nothing of theirs', !text.includes(KID) && !text.includes(KID_NAME))
  const kidSnap = await as(phoneA, KID_PHONE, async (c) => (await c.query('select family_snapshot(0) as s')).rows[0].s)
  ok('their own phone is answered with nothing, which is what tells it to erase itself', kidSnap === null)
  const targets = await one(`select count(*)::int as n from push_targets($1, 'kid', null)`, [FAMILY])
  ok('and it is no longer sent notifications', targets.n === 0)
  // On a phone: the tombstones remove every row of theirs.
  const phone = reducer({ ...createInitialState(), kids: [{ id: KID, name: KID_NAME, xp: 0, coins: 0, streak: {} }],
    quests: [{ id: quest, kidId: KID }], submissions: [{ id: sub, kidId: KID, questId: quest }] },
  { type: 'MERGE_SNAPSHOT', snapshot: coSnap })
  ok('merged on a phone, the child, their chores and their submissions disappear',
    !phone.kids.length && !phone.quests.length && !phone.submissions.length)
}

/* ================================================================== */
console.log('\n=== Unlinking a child\'s phone cuts it off at once ===')
{
  await freshFamily()
  await q(`insert into push_subscriptions (endpoint, keys, family_id, kid_id, user_id, role)
           values ('https://push.example/gd-kid2', '{}', $1, $2, $3, 'kid')`, [FAMILY, KID, KID_PHONE])
  ok('before: the child\'s phone is notified', (await one(`select count(*)::int as n from push_targets($1, 'kid', $2)`, [FAMILY, KID])).n === 1)
  const r = await rpcAs(phoneA, OWNER, 'unlink_kid_device', { p_kid_id: KID })
  ok('a parent unlinks it', r?.ok === true)
  const kidSnap = await as(phoneB, KID_PHONE, async (c) => (await c.query('select family_snapshot(0) as s')).rows[0].s)
  ok('its next sync is answered with nothing (the phone then erases itself: tests/offline.mjs)', kidSnap === null)
  ok('and it is no longer sent the family\'s notifications',
    (await one(`select count(*)::int as n from push_targets($1, 'kid', $2)`, [FAMILY, KID])).n === 0)
  const k = await kid()
  ok('the child, their XP and their chores stay with the family', k && k.user_id === null)
}

/* ================================================================== */
console.log('\n=== A co-parent invitation works once, even tapped twice at once ===')
{
  await freshFamily()
  const SECOND = ID(13); const THIRD = ID(14)
  await q('delete from parents where user_id in ($1, $2)', [SECOND, THIRD])
  await q(`insert into auth.users (id, email) values ($1, 'gd-x@example.com'), ($2, 'gd-y@example.com') on conflict do nothing`, [SECOND, THIRD])
  await q('delete from parents where user_id = $1', [COPARENT])
  const inv = await rpcAs(phoneA, OWNER, 'create_parent_invite', { p_role: 'parent' })
  const [a, b] = await Promise.all([
    rpcAs(phoneA, SECOND, 'claim_parent_invite', { p_code: inv.code, p_name: 'X' }),
    rpcAs(phoneB, THIRD, 'claim_parent_invite', { p_code: inv.code, p_name: 'Y' }),
  ])
  const joined = (await one(`select count(*)::int as n from parents where user_id in ($1, $2)`, [SECOND, THIRD])).n
  ok('two people claiming the same code at the same moment: one gets in', joined === 1 && [a, b].filter((r) => r?.ok).length === 1,
    JSON.stringify([a, b]))
  ok('the other is told it was already used', [a, b].some((r) => r?.reason === 'already_used'))
  await q('delete from parents where user_id in ($1, $2)', [SECOND, THIRD])
}

/* ================================================================== */
console.log('\n=== Removing a co-parent ends their access straight away ===')
{
  await freshFamily()
  const quest = await newQuest()
  await q(`insert into push_subscriptions (endpoint, keys, family_id, user_id, role)
           values ('https://push.example/gd-co', '{}', $1, $2, 'parent')`, [FAMILY, COPARENT])
  const sub = await newSubmission(quest)
  ok('before: they see the family and are notified',
    (await as(phoneB, COPARENT, async (c) => (await c.query('select family_snapshot(0) as s')).rows[0].s)) !== null
      && (await one(`select count(*)::int as n from push_targets($1, 'parent', null)`, [FAMILY])).n === 1)
  const coId = (await one('select id from parents where user_id = $1', [COPARENT])).id
  // Their phone keeps its (still unexpired) sign-in token: the next request is the test.
  const removed = await rpcAs(phoneA, OWNER, 'remove_adult', { p_parent_id: coId })
  ok('the owner removes them', removed?.ok === true)
  const snap = await as(phoneB, COPARENT, async (c) => (await c.query('select family_snapshot(0) as s')).rows[0].s)
  ok('their very next sync gets nothing', snap === null)
  const seen = await as(phoneB, COPARENT, async (c) => (await c.query('select count(*)::int as n from quests')).rows[0].n)
  ok('they cannot read a single chore', seen === 0)
  const approve = await rpcAs(phoneB, COPARENT, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0 })
  ok('they cannot approve one', Boolean(approve?.error))
  const edited = await as(phoneB, COPARENT, async (c) => (await c.query(`update quests set title = 'hijack' where id = $1`, [quest])).rowCount)
  ok('nor change one', edited === 0)
  ok('and their phone stops getting the family\'s notifications',
    (await one(`select count(*)::int as n from push_targets($1, 'parent', null)`, [FAMILY])).n === 0)
}

/* ================================================================== */
/* Everything held about a family, found by what identifies it.        */
async function traces(markers, { skip = [] } = {}) {
  const tables = (await q(`select table_schema || '.' || table_name as t from information_schema.tables
                            where table_schema in ('public', 'auth') and table_type = 'BASE TABLE'`)).rows.map((r) => r.t)
  const found = []
  const pattern = markers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  for (const t of tables) {
    if (skip.includes(t)) continue
    const r = await one(`select count(*)::int as n from ${t} x where to_jsonb(x)::text ~* $1`, [pattern])
    if (r.n) found.push(`${t} (${r.n})`)
  }
  return found
}

async function fullFamily() {
  await freshFamily()
  const quest = await newQuest()
  const sub = await newSubmission(quest)
  await rpcAs(phoneA, OWNER, 'approve_submission', { p_submission_id: sub, p_xp: 0, p_coins: 0 })
  await q(`insert into notes (family_id, kid_id, author, body) values ($1, $2, 'parent', 'Proud of you')`, [FAMILY, KID])
  await q(`insert into rewards (family_id, name, cost) values ($1, 'Film night', 10)`, [FAMILY])
  await q(`insert into push_subscriptions (endpoint, keys, family_id, kid_id, user_id, role)
           values ('https://push.example/gd-k', '{}', $1, $2, $3, 'kid'), ('https://push.example/gd-p', '{}', $1, null, $4, 'parent')`,
  [FAMILY, KID, KID_PHONE, OWNER])
  // The code the child's phone showed when it was paired: it carries their name.
  await q(`insert into pairing_codes (code, kid_id, kid_user_id, kid_name, expires_at, claimed_at, claimed_by_family_id, claimed_by_family_name)
           values ('914273', $1, $2, $3, now() + interval '5 minutes', now(), $4, 'Guarantee Family Q')`, [KID, KID_PHONE, KID_NAME, FAMILY])
  await q(`insert into rpc_receipts (id, kid_id, fn, result) values (gen_random_uuid(), $1, 'play_minigame', '{"ok":true}')`, [KID])
  await q(`insert into pairing_claim_attempts (user_id) values ($1)`, [OWNER])
}

console.log('\n=== Deleting the account removes everything the privacy policy lists ===')
{
  await fullFamily()
  const markers = [FAMILY, KID, KID_PHONE, OWNER, KID_NAME, 'gd-owner@example.com', 'Guarantee Family Q']
  ok('(the family is really there to begin with)', (await traces(markers, { skip: ['public.consent_notices'] })).length >= 8)
  const r = await rpcAs(phoneA, OWNER, 'delete_family_account', { p_confirm: 'DELETE' })
  ok('the parent deletes the account', r?.ok === true, JSON.stringify(r))
  const left = await traces(markers, { skip: ['public.consent_notices'] })
  ok('nothing is left anywhere that names the family, the child, their phone, or the parent\'s email or sign-in',
    left.length === 0, left.join(', '))
  const co = await one(`select (select count(*) from parents where user_id = $1)::int as p, (select count(*) from auth.users where id = $1)::int as u`, [COPARENT])
  ok('the other parent is out of the family; their own sign-in is theirs to delete', co.p === 0 && co.u === 1)
}

console.log('\n=== Withdrawing consent removes the children\'s data, in the same moment ===')
{
  await fullFamily()
  const r = await rpcAs(phoneA, OWNER, 'revoke_parental_consent', { p_reason: 'test' })
  ok('the parent withdraws consent', r?.ok === true && r.children_deleted === 1, JSON.stringify(r))
  // The tombstone that tells the family's other phones to drop the child is
  // the one row allowed to hold their (random) id, and it holds nothing else.
  const left = await traces([KID, KID_PHONE, KID_NAME], { skip: ['public.consent_notices', 'public.deletions'] })
  ok('immediately, nothing is left that names the child or points at their phone', left.length === 0, left.join(', '))
  const stone = await one(`select count(*)::int as n from deletions where row_id = $1 and table_name = 'kids'`, [KID])
  ok('only a tombstone with their id, which removes them from the other phones', stone.n === 1)
  const fam = await one('select count(*)::int as n from families where id = $1', [FAMILY])
  ok('the parent\'s own account stays, as the notice says', fam.n === 1)
}

/* ================================================================== */
console.log('\n=== The first sync for a family with a year behind it ===')
{
  await freshFamily()
  await q(`with kq as (insert into kids (family_id, name) select $1, 'Year kid ' || g from generate_series(1, 3) g returning id),
                qq as (insert into quests (family_id, kid_id, title, recurrence, status)
                       select $1, kq.id, 'Chore ' || g, 'daily', 'approved' from kq, generate_series(1, 8) g returning id, kid_id)
           insert into submissions (family_id, quest_id, kid_id, status, note, decided_at, submitted_at, awarded_xp, awarded_coins)
           select $1, qq.id, qq.kid_id, 'approved', '', now() - make_interval(days => d), now() - make_interval(days => d), 30, 6
             from qq, generate_series(1, 365) d where (hashtext(qq.id::text || d) % 10 + 10) % 10 < 4`, [FAMILY])
  await q(`insert into quests (family_id, kid_id, title) select $1, $2, 'Once ' || g from generate_series(1, 1500) g`, [FAMILY, KID])
  await q(`delete from quests where family_id = $1 and title like 'Once %'`, [FAMILY])
  const size = await one(`select (select count(*) from submissions where family_id = $1)::int as s,
                                 (select count(*) from deletions where family_id = $1)::int as d`, [FAMILY])
  let best = Infinity
  let body = ''
  for (let i = 0; i < 3; i += 1) {
    const t = Date.now()
    body = await as(phoneA, OWNER, async (c) => (await c.query('select family_snapshot(0)::text as s')).rows[0].s)
    best = Math.min(best, Date.now() - t)
  }
  const kb = Math.round(body.length / 1024)
  console.log(`    ${size.s} chores done, ${size.d} deleted: ${best} ms in the database, ${kb} KB`)
  ok('the database answers in well under a second', best < 1000, `${best} ms`)
  // About 2.6 MB, and twice as long in the database, before the dead photo
  // columns and the tombstone padding came out.
  ok('and it is well under the 2.6 MB it used to be', kb < 2.2 * 1024, `${kb} KB`)
  const snap = JSON.parse(body)
  ok('no photo or photo-check column travels', !snap.submissions.some((s) => 'ai_report' in s || 'photo_hash' in s || 'photo_path' in s))
  const t = Date.now()
  const merged = reducer(createInitialState(), { type: 'MERGE_SNAPSHOT', snapshot: snap })
  const ms = Date.now() - t
  console.log(`    merged on the phone in ${ms} ms`)
  ok('and the phone takes it in quickly', ms < 500 && merged.submissions.length === size.s, `${ms} ms`)
}

await q('delete from families where id = $1', [FAMILY])
await Promise.all([admin.end(), phoneA.end(), phoneB.end()])
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
