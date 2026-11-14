#!/usr/bin/env node
/**
 * 10,000 reminders due at the same minute, sent through the real job.
 *
 *   node tools/pushload.mjs                         10,000, against :8788
 *   node tools/pushload.mjs --count 2000 --api http://localhost:8888 --push-ms 40
 *
 * Seeds --count families into the database the functions server reads
 * (PGHOST, PGPORT, PGDATABASE as for the SQL suite; rankup_test by default),
 * each with one parent's phone and one reminder due now. The phones' address
 * is a stand-in push service started here, which answers 201 after --push-ms
 * (default 0; a real push service takes tens of milliseconds) and counts what
 * each phone received. Then it calls /api/send-reminders the way the
 * scheduler does, again and again until nothing is left, and reports each
 * run: how many it sent, in how long, and why it stopped. At the end: every
 * phone must have received exactly one reminder, and every reminder must be
 * marked sent. The families are deleted afterwards.
 *
 * Needs the functions running (supabase/test/up.sh --cf). The job's own
 * budgets apply exactly as deployed: JOB_SUBREQUEST_LIMIT (1000),
 * PUSH_RUN_SECONDS (20), PUSH_BATCH_SIZE (100). docs/NOTIFICATIONS.md has
 * the numbers this gave.
 */
import http from 'node:http'
import crypto from 'node:crypto'
import pg from 'pg'

const opt = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1]; i += 1 }
}
const COUNT = Math.max(1, Number(opt.count || 10000))
const API = String(opt.api || process.env.API_BASE || 'http://localhost:8788')
const PUSH_MS = Math.max(0, Number(opt['push-ms'] || 0))
const PORT = Number(opt.port || 8795)
const CRON = String(opt.cron || 'test-cron-secret')
const MAX_RUNS = Number(opt['max-runs'] || 60)

const db = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

const received = new Map()
let total = 0
const server = http.createServer((req, res) => {
  req.on('data', () => {})
  req.on('end', () => {
    total += 1
    received.set(req.url, (received.get(req.url) || 0) + 1)
    setTimeout(() => { res.writeHead(201); res.end() }, PUSH_MS)
  })
})
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))

const phone = crypto.createECDH('prime256v1')
phone.generateKeys()
const keys = { p256dh: phone.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }

// Everybody else's reminders are left alone, but would be sent too: they are
// counted separately and not held against the result.
const PREFIX = 'pl'
async function cleanup() {
  await db.query(`delete from families where name like 'Push load %'`)
  await db.query(`delete from auth.users where email like 'push-load-%@example.test'`)
}
await cleanup()
const t0 = Date.now()
await db.query(`
  with f as (
    insert into families (id, name, timezone)
    select md5('${PREFIX}f' || g)::uuid, 'Push load ' || g, 'UTC' from generate_series(1, $1::int) g
    returning id
  ) select count(*) from f`, [COUNT])
await db.query(`insert into auth.users (id, email)
  select md5('${PREFIX}u' || g)::uuid, 'push-load-' || g || '@example.test' from generate_series(1, $1::int) g`, [COUNT])
await db.query(`insert into parents (user_id, family_id, name)
  select md5('${PREFIX}u' || g)::uuid, md5('${PREFIX}f' || g)::uuid, 'P' from generate_series(1, $1::int) g`, [COUNT])
await db.query(`insert into push_subscriptions (endpoint, keys, family_id, user_id, role)
  select 'http://127.0.0.1:${PORT}/p/' || g, $2::jsonb, md5('${PREFIX}f' || g)::uuid, md5('${PREFIX}u' || g)::uuid, 'parent'
    from generate_series(1, $1::int) g`, [COUNT, JSON.stringify(keys)])
// Due a minute ago, where they live, so every one is due on the first run.
await db.query(`insert into reminder_schedules (family_id, role, label, at_local, timezone)
  select md5('${PREFIX}f' || g)::uuid, 'parent', 'Morning quests', ((now() - interval '1 minute') at time zone 'UTC')::time, 'UTC'
    from generate_series(1, $1::int) g`, [COUNT])
console.log(`${COUNT} reminders due, one phone each (seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s); push service answers after ${PUSH_MS} ms`)

const runs = []
const started = Date.now()
for (let i = 0; i < MAX_RUNS; i += 1) {
  const r0 = Date.now()
  const res = await fetch(`${API}/api/send-reminders`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const body = await res.json().catch(() => ({}))
  const ms = Date.now() - r0
  runs.push({ status: res.status, ms, ...body })
  console.log(`  run ${String(i + 1).padStart(2)}: ${res.status} sent ${String(body.sent ?? '?').padStart(5)} in ${String(ms).padStart(6)} ms` +
    ` (${body.batches ?? '?'} batches${body.stopped_for ? `, stopped for ${body.stopped_for}` : ''})`)
  if (res.status !== 200 || !body.due) break
}
const elapsed = Date.now() - started

const ours = [...received.entries()].filter(([path]) => /^\/p\/\d+$/.test(path))
const twice = ours.filter(([, n]) => n > 1).length
const never = COUNT - ours.length
const unmarked = (await db.query(`select count(*)::int n from reminder_schedules r join families f on f.id = r.family_id
   where f.name like 'Push load %' and r.last_sent_on is null`)).rows[0].n
const busy = runs.filter((r) => r.sent > 0)
const perRun = busy.length ? Math.round(busy.reduce((a, r) => a + r.ms, 0) / busy.length) : 0
console.log(`\n${COUNT} reminders: ${busy.length} runs that sent, ${elapsed} ms in all, ${perRun} ms a run on average,` +
  ` ${(elapsed / COUNT).toFixed(2)} ms a notice`)
console.log(`received: ${ours.length} phones, ${twice} twice, ${never} never; ${unmarked} not marked sent; ${total} pushes in all`)

await cleanup()
await db.end()
server.close()
const ok = twice === 0 && never === 0 && unmarked === 0
console.log(ok ? 'EVERY REMINDER SENT ONCE' : 'FAILED')
process.exit(ok ? 0 : 1)
