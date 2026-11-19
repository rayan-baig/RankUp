/**
 * When something outside RankUp is slow or down, RankUp still answers.
 *
 *   - every call the server functions make to the database stops waiting
 *     after a set time, whether the database says nothing at all or sends
 *     half an answer and stalls (api/_shared/http.js); Stripe, email and push
 *     already had their own limits, and no other bare fetch is allowed in;
 *   - a phone's sync request does the same (src/lib/sync/transport.js), so
 *     one stuck request cannot stop every pull and change behind it;
 *   - the health checks: /api/healthz asks nothing; /api/health and
 *     /api/ready say 200 or 503 with only { ok, version } to anybody, the
 *     reasons only with the CRON_SECRET, never a secret's value or the
 *     database's own error text; a public answer is kept for a few seconds,
 *     so asking every second costs the database almost nothing.
 *
 * Runs in Node against small stand-in servers on free ports; needs nothing
 * else running. Part of `npm run test:static`.
 */
import http from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

/** A stand-in server; `behaviour(req, res)` decides each answer. */
function standIn() {
  const state = { behaviour: null, hits: 0 }
  const sockets = new Set()
  const server = http.createServer((req, res) => {
    state.hits += 1
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => state.behaviour(req, res, body))
  })
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    state,
    close: () => { for (const s of sockets) s.destroy(); server.close() },
  })))
}

const silent = () => { /* never answers */ }
const stalls = (req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"ok":') }
const answers = (status, payload) => (req, res) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload === undefined ? '' : JSON.stringify(payload))
}
/** How a promise ended, and how long it took; still waiting after ms + 2 s counts as an error of its own. */
const within = async (ms, promise) => {
  const t0 = Date.now()
  let guard
  const waiting = new Promise((resolve, reject) => { guard = setTimeout(() => reject(new Error('still waiting')), ms + 2000) })
  try {
    await Promise.race([promise, waiting])
    return { error: null, took: Date.now() - t0 }
  } catch (error) {
    return { error, took: Date.now() - t0 }
  } finally {
    clearTimeout(guard)
  }
}

const db = await standIn()

// ---------------------------------------------------------------------------
console.log('\n=== The server functions stop waiting for the database ===')
const { timedFetch, DB_TIMEOUT_MS, JOB_TIMEOUT_MS } = await import('../api/_shared/http.js')
ok('a person waits at most ten seconds; a scheduled job at most twenty-five',
  DB_TIMEOUT_MS === 10_000 && JOB_TIMEOUT_MS === 25_000, `${DB_TIMEOUT_MS} / ${JOB_TIMEOUT_MS}`)

db.state.behaviour = silent
let r = await within(300, timedFetch(`${db.url}/rest/v1/rpc/x`, { method: 'POST' }, 300))
ok('a database that never answers is given up on in time', r.error?.name === 'TimeoutError' && r.took < 1500,
  `${r.error?.name} after ${r.took} ms`)

db.state.behaviour = stalls
r = await within(300, timedFetch(`${db.url}/rest/v1/rpc/x`, { method: 'POST' }, 300))
ok('so is one that sends half an answer and stalls', r.error?.name === 'TimeoutError' && r.took < 1500,
  `${r.error?.name} after ${r.took} ms`)

db.state.behaviour = answers(200, { fine: true })
const good = await timedFetch(`${db.url}/rest/v1/rpc/x`, { method: 'POST' }, 2000)
ok('a quick answer comes through whole', good.ok && (await good.json()).fine === true)
db.state.behaviour = answers(204)
const empty = await timedFetch(`${db.url}/rest/v1/rpc/x`, { method: 'POST' }, 2000)
ok('and so does a function that returns nothing (204)', empty.status === 204 && (await empty.text()) === '')

const { makeServiceRpc } = await import('../api/_shared/job.js')
db.state.behaviour = silent
r = await within(300, makeServiceRpc(db.url, 'service-key', 300)('anything', {}))
ok('the shared service call has the same limit', r.error?.name === 'TimeoutError' && r.took < 1500,
  `${r.error?.name} after ${r.took} ms`)

// No call to anything outside goes without a time limit.
const files = [...readdirSync('api').filter((f) => f.endsWith('.js')).map((f) => join('api', f)),
  ...readdirSync('api/_shared').filter((f) => f.endsWith('.js')).map((f) => join('api/_shared', f))]
const unbounded = files.filter((f) => {
  const text = readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '')
  const bare = [...text.matchAll(/(^|[^\w.])fetch\(/g)].length
  return bare > 0 && !/signal: controller\.signal/.test(text)
})
ok('every other call out of api/ carries its own time limit (email, push, the error log)', unbounded.length === 0,
  unbounded.join(', '))
const stripe = readFileSync('api/_shared/stripe.js', 'utf8')
ok('Stripe gives up after ten seconds and one retry', /timeout: 10000/.test(stripe) && /maxNetworkRetries: 1/.test(stripe))

// ---------------------------------------------------------------------------
console.log('\n=== A phone\'s sync request stops waiting too ===')
const { fetchWithin, REQUEST_TIMEOUT_MS } = await import('../src/lib/sync/transport.js')
ok('thirty seconds, far more than a slow pull needs', REQUEST_TIMEOUT_MS === 30_000)
db.state.behaviour = silent
r = await within(300, fetchWithin(`${db.url}/rest/v1/rpc/family_snapshot`, { method: 'POST' }, 300))
ok('a stuck request fails like a dropped connection, in time, with words the app explains',
  /timed out/.test(r.error?.message || '') && r.took < 1500, `${r.error?.message} after ${r.took} ms`)
db.state.behaviour = stalls
r = await within(300, fetchWithin(`${db.url}/rest/v1/rpc/family_snapshot`, { method: 'POST' }, 300))
ok('including one that stalls half way through its answer', /timed out/.test(r.error?.message || '') && r.took < 1500,
  `${r.error?.message} after ${r.took} ms`)
const { humanError } = await import('../src/lib/errors.js')
const warn = console.warn
console.warn = () => {}
ok('which the app turns into a plain sentence', humanError(new Error('No answer from the server in time (timed out).'))
  === 'The server took too long to answer. Try again.')
console.warn = warn
const transportText = readFileSync('src/lib/sync/transport.js', 'utf8')
ok('every request and every sign-in renewal goes through it',
  (transportText.match(/await fetchWithin\(/g) || []).length >= 2 && !/res = await fetch\(/.test(transportText))

// ---------------------------------------------------------------------------
console.log('\n=== The health checks ===')
const SECRETS = {
  SUPABASE_URL: db.url,
  SUPABASE_SERVICE_ROLE_KEY: 'svc-4f1c9a-never-shown',
  VITE_SUPABASE_ANON_KEY: 'anon-4f1c9a',
  CRON_SECRET: 'cron-4f1c9a-never-shown',
  PUBLIC_SITE_URL: 'https://rankup.example',
}
const env = () => process.env
for (const [k, v] of Object.entries(SECRETS)) env()[k] = v
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const { default: healthz } = await import('../api/healthz.js')
const { default: health, forgetKeptAnswer, CACHE_MS, HEALTH_TIMEOUT_MS } = await import('../api/health.js')
const { default: ready } = await import('../api/ready.js')

async function ask(handler, { method = 'GET', secret } = {}) {
  let status = 200
  let body = null
  const headers = {}
  const res = {
    status(c) { status = c; return res },
    setHeader(k, v) { headers[k.toLowerCase()] = v; return res },
    json(p) { body = p; return res },
  }
  await handler({ method, headers: secret ? { authorization: `Bearer ${secret}` } : {} }, res)
  return { status, body, headers, text: JSON.stringify(body) }
}
const publicOnly = (a) => Object.keys(a.body || {}).sort().join(',') === 'ok,version'
const leaks = (a) => Object.values(SECRETS).filter((v) => v.includes('4f1c9a') && a.text.includes(v))

const healthy = { ok: true, checked_at: 'now', jobs: { 'send-reminders': { state: 'ok' } }, crashes_24h: 0 }
const stale = { ok: false, checked_at: 'now', jobs: { 'send-reminders': { state: 'stale', last_error: 'lookup_failed' } } }

db.state.hits = 0
let a = await ask(healthz)
ok('/api/healthz: 200 with only ok and the version, and asks the database nothing',
  a.status === 200 && publicOnly(a) && a.body.version === pkg.version && db.state.hits === 0, a.text)
ok('and a HEAD (some monitors ask that way) is answered too', (await ask(healthz, { method: 'HEAD' })).status === 200)
ok('nothing in between keeps the answer', a.headers['cache-control'] === 'no-store')

forgetKeptAnswer()
db.state.behaviour = answers(200, stale)
a = await ask(health)
ok('/api/health: up and reaching the database is 200, even with a job gone quiet', a.status === 200 && a.body.ok === true && publicOnly(a), a.text)
forgetKeptAnswer()
a = await ask(ready)
ok('/api/ready: a job gone quiet is 503', a.status === 503 && a.body.ok === false, a.text)
ok('and says only that, not which job or why', publicOnly(a) && !/send-reminders|lookup_failed/.test(a.text), a.text)
a = await ask(ready, { secret: SECRETS.CRON_SECRET })
ok('with the CRON_SECRET it says which job, and what went wrong', a.status === 503 && a.body.jobs?.['send-reminders']?.state === 'stale', a.text)
ok('the wrong secret is the public answer', publicOnly(await ask(ready, { secret: 'cron-4f1c9a-never-shoWn' })))

forgetKeptAnswer()
db.state.behaviour = answers(200, healthy)
a = await ask(ready)
ok('/api/ready: every job recent, every required setting there: 200', a.status === 200 && a.body.ok === true && publicOnly(a), a.text)

delete env().PUBLIC_SITE_URL
forgetKeptAnswer()
a = await ask(ready)
ok('a required setting missing (the site address): 503', a.status === 503 && publicOnly(a), a.text)
a = await ask(ready, { secret: SECRETS.CRON_SECRET })
ok('the operator is told which, by name', JSON.stringify(a.body.missing_settings) === '["site_url"]' && a.body.configured?.site_url === false, a.text)
ok('and never any setting\'s value', leaks(a).length === 0, leaks(a).join(', '))
env().VITE_STRIPE_ENABLED = 'true'
delete env().STRIPE_SECRET_KEY
a = await ask(ready, { secret: SECRETS.CRON_SECRET })
ok('once billing is switched on, Stripe\'s keys are required too', (a.body.missing_settings || []).includes('payments'), a.text)
delete env().VITE_STRIPE_ENABLED
env().PUBLIC_SITE_URL = SECRETS.PUBLIC_SITE_URL

// Cheap: asked again and again, the database is asked once.
forgetKeptAnswer()
db.state.behaviour = answers(200, healthy)
db.state.hits = 0
for (let i = 0; i < 20; i += 1) await ask(i % 2 ? health : ready)
ok(`twenty public asks in a row cost the database one query (kept for ${CACHE_MS / 1000} s)`, db.state.hits === 1, `${db.state.hits} queries`)
await ask(ready, { secret: SECRETS.CRON_SECRET })
ok('the operator\'s detailed ask always looks afresh', db.state.hits === 2, `${db.state.hits} queries`)

// The database down, refusing, or too slow.
forgetKeptAnswer()
db.state.behaviour = answers(500, { message: 'relation "job_runs" does not exist at character 4f1c9a' })
a = await ask(health)
ok('/api/health: the database refusing is 503, with nothing from its error', a.status === 503 && publicOnly(a) && !/relation|job_runs/.test(a.text), a.text)
a = await ask(ready, { secret: SECRETS.CRON_SECRET })
ok('the operator gets the reason as a code, still not the database\'s own words',
  a.status === 503 && a.body.reason === 'database_unreachable' && !/relation|job_runs/.test(a.text), a.text)
forgetKeptAnswer()
db.state.behaviour = silent
let slow = null
r = await within(HEALTH_TIMEOUT_MS, ask(health).then((x) => { slow = x }))
ok(`a database that does not answer is 503 within ${HEALTH_TIMEOUT_MS / 1000} seconds, not whenever the host gives up`,
  !r.error && slow?.status === 503 && publicOnly(slow), `${r.error?.message || slow?.status} after ${r.took} ms`)
delete env().SUPABASE_SERVICE_ROLE_KEY
forgetKeptAnswer()
a = await ask(ready, { secret: SECRETS.CRON_SECRET })
ok('no database settings at all: 503, and said so to the operator', a.status === 503 && a.body.reason === 'database_not_configured', a.text)
ok('anything but GET, HEAD or POST is refused', (await ask(health, { method: 'DELETE' })).status === 405
  && (await ask(ready, { method: 'PUT' })).status === 405 && (await ask(healthz, { method: 'DELETE' })).status === 405)

// Every route is wired on Cloudflare too.
const routes = readFileSync('functions/api/[[route]].js', 'utf8')
ok('/api/healthz and /api/ready are in the Cloudflare route table',
  /\bhealthz: \(\) => import\('\.\.\/\.\.\/api\/healthz\.js'\)/.test(routes) && /\bready: \(\) => import\('\.\.\/\.\.\/api\/ready\.js'\)/.test(routes))

db.close()
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
