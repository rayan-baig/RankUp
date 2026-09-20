/**
 * The server endpoints, through the runtime that actually serves them.
 *
 * Everything else in this repo tests the app or the database. These four
 * functions sit between the two, holding the secrets — the Anthropic key, the
 * VAPID private key, the Stripe key, the service role key — and nothing was
 * exercising them end to end. They are also where a mistake costs real money:
 * an endpoint that spends a family's allowance on a request that never ran, or
 * one that lets a stranger buzz somebody's phone.
 *
 * Needs the Cloudflare stack up:  supabase/test/up.sh --cf
 */
import pg from 'pg'

const BASE = process.env.API_BASE || 'http://localhost:8788'
const CRON = 'test-cron-secret'

const fails = []
const pass = n => console.log('  PASS', n)
const fail = (n, d) => { fails.push(n); console.log('  FAIL', n, '—', d) }
const ok = (n, cond, d = '') => (cond ? pass(n) : fail(n, d))

const db = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

// Fixtures of our own, so this suite does not lean on another file's rows.
const PARENT = 'a0000000-0000-4000-8000-00000000a001'
const OUTSIDER = 'a0000000-0000-4000-8000-00000000a002'
const FAMILY = 'a0000000-0000-4000-8000-00000000f001'
const OTHER_FAMILY = 'a0000000-0000-4000-8000-00000000f002'

await db.query(
  `insert into auth.users (id, email) values ($1, 'api-parent@example.com'), ($2, 'api-outsider@example.com')
     on conflict do nothing`, [PARENT, OUTSIDER])
await db.query(
  `insert into families (id, name, tier) values ($1, 'API Family', 'elite'), ($2, 'Other API Family', 'elite')
     on conflict do nothing`, [FAMILY, OTHER_FAMILY])
await db.query(
  `insert into parents (user_id, family_id, name) values ($1, $3, 'API Parent'), ($2, $4, 'API Outsider')
     on conflict do nothing`, [PARENT, OUTSIDER, FAMILY, OTHER_FAMILY])

const checksUsed = async () => {
  const r = await db.query('select ai_checks_used from families where id = $1', [FAMILY])
  return r.rows[0]?.ai_checks_used ?? null
}

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  })

console.log('\n=== Nothing works without a token ===')
ok('a push with no token is refused', (await post('/api/send-push', { familyId: FAMILY, role: 'parent', kind: 'reminder' })).status === 401)
ok('a photo check with no token is refused', (await post('/api/verify-photo', { imageDataUrl: 'x' })).status === 401)
ok('a checkout with no token is refused', (await post('/api/create-checkout', { tier: 'standard' })).status === 401)

console.log('\n=== A stranger cannot buzz somebody else’s phone ===')
const outsiderPush = await post('/api/send-push', { familyId: FAMILY, role: 'parent', kind: 'reminder' }, OUTSIDER)
ok('another family’s parent is refused', outsiderPush.status === 403, `status ${outsiderPush.status}`)
const ownPush = await post('/api/send-push', { familyId: FAMILY, role: 'parent', kind: 'reminder' }, PARENT)
ok('the family’s own parent gets through the membership check', ownPush.status === 200,
  `status ${ownPush.status} ${(await ownPush.clone().text()).slice(0, 80)}`)

console.log('\n=== And cannot make up the words on the lock screen ===')
const forged = await post('/api/send-push',
  { familyId: FAMILY, role: 'parent', kind: 'anything', title: 'Send money', body: 'to this account' }, PARENT)
ok('an unknown notice kind is refused outright', forged.status === 400, `status ${forged.status}`)

console.log('\n=== A photo that was never looked at does not cost a check ===')
// The endpoint claimed the allowance and THEN parsed the image, so a picture
// that was too large or in the wrong format spent one of the family's two
// hundred and returned 400 without giving it back.
const before = await checksUsed()
const badImage = await post('/api/verify-photo', { imageDataUrl: 'data:text/plain;base64,aGVsbG8=' }, PARENT)
const after = await checksUsed()
ok('a malformed image is refused', badImage.status === 400, `status ${badImage.status}`)
ok('and it cost the family nothing', after === before, `used ${before} → ${after}`)

console.log('\n=== The scheduled jobs are not open to the public ===')
for (const job of ['run-retention', 'send-reminders', 'send-digests', 'settle-alliances']) {
  const open = await fetch(`${BASE}/api/${job}`, { method: 'POST' })
  ok(`${job} refuses a caller with no secret`, open.status === 401 || open.status === 403, `status ${open.status}`)
  const withSecret = await fetch(`${BASE}/api/${job}`, {
    method: 'POST', headers: { Authorization: `Bearer ${CRON}` },
  })
  ok(`${job} runs for the scheduler`, withSecret.status === 200, `status ${withSecret.status}`)
}
// Health is deliberately public at the shallow depth, so an uptime monitor can
// poll it. What must NOT be public is the detail: which job has gone quiet,
// what the last error said, how many crashes there were today.
const shallow = await (await fetch(`${BASE}/api/health`)).json()
ok('health answers a public uptime monitor', shallow.ok === true)
ok('but tells it nothing about the inside',
  Object.keys(shallow).length === 1, `keys: ${Object.keys(shallow).join(', ')}`)
const deep = await (await fetch(`${BASE}/api/health`, { headers: { Authorization: `Bearer ${CRON}` } })).json()
ok('while the operator sees the jobs', Boolean(deep.jobs), `keys: ${Object.keys(deep).join(', ')}`)

console.log('\n=== An unsigned Stripe event is never acted on ===')
const forgedPayment = await post('/api/stripe-webhook',
  { type: 'customer.subscription.updated', data: { object: { id: 'sub_fake', status: 'active' } } })
ok('a webhook with no signature is rejected', forgedPayment.status === 400 || forgedPayment.status === 503,
  `status ${forgedPayment.status}`)

console.log('\n=== A route that does not exist is a 404, not a stack trace ===')
const missing = await fetch(`${BASE}/api/not-a-real-endpoint`, { method: 'POST' })
ok('an unknown endpoint is a plain 404', missing.status === 404, `status ${missing.status}`)

await db.end()
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
