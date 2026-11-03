/**
 * The server endpoints, through the runtime that actually serves them.
 *
 * Everything else in this repo tests the app or the database. These
 * functions sit between the two, holding the secrets — the VAPID private key,
 * the Stripe key, the service role key — and nothing was
 * exercising them end to end. They are also where a mistake costs real money:
 * an endpoint that spends a family's allowance on a request that never ran, or
 * one that lets a stranger buzz somebody's phone.
 *
 * Needs the Cloudflare stack up:  supabase/test/up.sh --cf
 */
import http from 'node:http'
import { readdirSync, readFileSync } from 'node:fs'
import pg from 'pg'
import Stripe from 'stripe'
import { billingNotice, billingError } from '../src/lib/billing.js'

const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

const BASE = process.env.API_BASE || 'http://localhost:8788'
const MOCK = process.env.MOCK_URL || 'http://localhost:54321'
// Stripe ids are made unique per run, so the suite can run again on the same
// database: a fixed id is "already handled" the second time.
const RUN = Date.now().toString(36)
const CRON = 'test-cron-secret'
// The stats key serve-functions.sh gives the local server. Against anything
// else, set STATS_KEY_FOR_TEST to that server's key.
const STATS_KEY_FOR_TEST = process.env.STATS_KEY_FOR_TEST
  || (/^http:\/\/localhost[:/]/.test(BASE) ? 'test-stats-key' : '')

/*
 * Which functions in api/ this suite actually reached. Every request it makes
 * goes through fetch, so fetch keeps count: a function counts once it has
 * answered at least one request with anything but a 404 (a 404 is the route
 * table saying it does not exist). The end of the file fails for any that
 * never did, so a function added to api/ is a failure here until it is tested.
 */
const reached = new Map()
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const res = await realFetch(input, init)
  const url = String(input?.url || input)
  if (url.startsWith(`${BASE}/api/`) && res.status !== 404) {
    const name = new URL(url).pathname.replace(/^\/api\//, '').split('/')[0]
    reached.set(name, (reached.get(name) || 0) + 1)
  }
  return res
}

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

/*
 * A stand-in for the email provider (EMAIL_API_BASE in serve-functions.sh).
 * It records every email the functions send, and can be told to fail.
 */
const emails = []
let emailMode = 'ok'
const emailStandIn = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    if (emailMode === 'error500') { res.writeHead(500); res.end('{"message":"down"}'); return }
    let body = {}
    try { body = JSON.parse(raw || '{}') } catch { /* recorded as empty */ }
    emails.push({ path: req.url, auth: req.headers.authorization, key: req.headers['idempotency-key'], body })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: `email_${emails.length}` }))
  })
})
await new Promise((resolve) => emailStandIn.listen(Number(process.env.EMAIL_STANDIN_PORT || 12112), resolve))

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  })

console.log('\n=== Nothing works without a token ===')
ok('a push with no token is refused', (await post('/api/send-push', { familyId: FAMILY, role: 'parent', kind: 'reminder' })).status === 401)
ok('a checkout with no token is refused', (await post('/api/create-checkout', { tier: 'standard' })).status === 401)
ok('a school checkout with no token is refused', (await post('/api/school-checkout', { cycle: 'month' })).status === 401)
const parentAsSchool = await post('/api/school-checkout', { cycle: 'month' }, PARENT)
ok('a parent CANNOT start a school’s checkout', parentAsSchool.status === 403 || parentAsSchool.status === 503,
  `status ${parentAsSchool.status}`)

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

console.log('\n=== RankUp takes no photos ===')
const noPhotoCheck = await post('/api/verify-photo', { imageDataUrl: 'x' }, PARENT)
ok('there is no photo-check address any more', noPhotoCheck.status === 404, `status ${noPhotoCheck.status}`)

console.log('\n=== The scheduled jobs are not open to the public ===')
for (const job of ['run-retention', 'send-reminders', 'send-digests', 'send-trial-emails', 'settle-alliances', 'settle-schools']) {
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
ok('but tells it nothing about the inside, only which version answered',
  Object.keys(shallow).sort().join(',') === 'ok,version', `keys: ${Object.keys(shallow).join(', ')}`)
ok('and that version is package.json\'s', shallow.version === PACKAGE_VERSION, `${shallow.version} vs ${PACKAGE_VERSION}`)
const deep = await (await fetch(`${BASE}/api/health`, { headers: { Authorization: `Bearer ${CRON}` } })).json()
ok('while the operator sees the jobs', Boolean(deep.jobs), `keys: ${Object.keys(deep).join(', ')}`)
ok('and the version too', deep.version === PACKAGE_VERSION, String(deep.version))

console.log('\n=== An error is a short JSON answer, never the inside of the server ===')
for (const path of ['/api/no-such-function', '/api/constructor', '/api/__proto__', '/api/health/extra']) {
  const res = await fetch(`${BASE}${path}`)
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = null }
  ok(`${path} is a 404 in JSON`, res.status === 404 && /application\/json/.test(res.headers.get('content-type') || '')
    && body && Object.keys(body).join(',') === 'error' && body.error === 'not_found', `${res.status} ${text.slice(0, 120)}`)
}
const wrongVerb = await fetch(`${BASE}/api/health`, { method: 'DELETE' })
const wrongVerbText = await wrongVerb.text()
ok('a wrong method is refused in JSON, with a code and no message from the runtime',
  wrongVerb.status === 405 && /^\{"error":"method_not_allowed"/.test(wrongVerbText), `${wrongVerb.status} ${wrongVerbText}`)
const garbled = await fetch(`${BASE}/api/create-checkout`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PARENT}` }, body: '{not json',
})
const garbledText = await garbled.text()
ok('a body that is not JSON gets a JSON answer, with no stack or file name in it',
  garbled.status >= 400 && garbled.status < 600 && (() => { try { JSON.parse(garbledText); return true } catch { return false } })()
    && !/\bat\s+\S+\s*\(|\.js:\d+|stack|SyntaxError|Unexpected token/i.test(garbledText), `${garbled.status} ${garbledText.slice(0, 160)}`)

console.log('\n=== The owner\'s console can count families, and nobody else can ===')
const noKey = await fetch(`${BASE}/api/stats`)
ok('stats refuse a caller without the key', noKey.status === 401 || noKey.status === 404, `status ${noKey.status}`)
for (const [who, key] of [['the scheduler\'s key', CRON], ['the operator\'s key', 'test-operator-secret'], ['a parent\'s sign-in', PARENT]]) {
  const res = await fetch(`${BASE}/api/stats`, { headers: { Authorization: `Bearer ${key}` } })
  const text = await res.text()
  ok(`nor to ${who}`, (res.status === 401 || res.status === 404) && !/\d{2,}|families|users/.test(text), `status ${res.status} ${text}`)
}
if (STATS_KEY_FOR_TEST) {
  const counted = await fetch(`${BASE}/api/stats`, { headers: { Authorization: `Bearer ${STATS_KEY_FOR_TEST}` } })
  const raw = await counted.text()
  let body = {}
  try { body = JSON.parse(raw) } catch { body = {} }
  ok('and answer the console with two numbers and the daily totals, nothing more', counted.status === 200 && Number.isInteger(body.users)
    && Number.isInteger(body.active_users) && Object.keys(body).sort().join(',') === 'active_users,daily,users', raw.slice(0, 200))
  const METRICS = ['chores_accepted', 'families_signed_up', 'games_played', 'help_views', 'rewards_bought', 'schools_signed_up']
  const days = body.daily?.days || []
  ok('the daily totals are the last 30 days, oldest first, ending today (UTC)',
    days.length === 30 && days[29]?.day === new Date().toISOString().slice(0, 10) && days[0].day < days[29].day, JSON.stringify(days.slice(-1)))
  ok('each day is a date and the six counts, and nothing else: no id, no name, no family',
    days.every((d) => Object.keys(d).sort().join(',') === ['day', ...METRICS].sort().join(',')
      && METRICS.every((m) => Number.isInteger(d[m]) && d[m] >= 0)), JSON.stringify(days[29]))
  ok('with the totals over the 30 days',
    METRICS.every((m) => body.daily.totals[m] === days.reduce((n, d) => n + d[m], 0)), JSON.stringify(body.daily?.totals))

  // A help page view, counted with the public key alone, as the app sends it.
  const helpBefore = days[29]?.help_views || 0
  const viewed = await fetch(`${MOCK}/rest/v1/rpc/count_help_view`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: 'Bearer local-anon-key' }, body: '{}',
  })
  const after = await (await fetch(`${BASE}/api/stats`, { headers: { Authorization: `Bearer ${STATS_KEY_FOR_TEST}` } })).json()
  ok('a help page view, sent with no sign-in at all, is counted', viewed.ok && after.daily.days[29].help_views === helpBefore + 1,
    `${viewed.status}: ${helpBefore} -> ${after.daily?.days?.[29]?.help_views}`)
  const nosy = await fetch(`${MOCK}/rest/v1/rpc/usage_daily_counts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${PARENT}` }, body: '{}',
  })
  ok('but a parent cannot read the counts from the database themselves', !nosy.ok, `status ${nosy.status}`)
  ok('the numbers are counts, not a family\'s anything',
    body.users === Number((await db.query('select count(*) from families')).rows[0].count), raw)
  ok('and nothing more rides along in the headers',
    !Object.keys(Object.fromEntries(counted.headers)).some((h) => /^x-|server-timing|set-cookie/i.test(h)),
    JSON.stringify(Object.fromEntries(counted.headers)))
  const posted = await fetch(`${BASE}/api/stats`, { method: 'POST', headers: { Authorization: `Bearer ${STATS_KEY_FOR_TEST}` } })
  ok('GET only', posted.status === 405, `status ${posted.status}`)
}

console.log('\n=== An unsigned Stripe event is never acted on ===')
const forgedPayment = await post('/api/stripe-webhook',
  { type: 'customer.subscription.updated', data: { object: { id: 'sub_fake', status: 'active' } } })
ok('a webhook with no signature is rejected', forgedPayment.status === 400 || forgedPayment.status === 503,
  `status ${forgedPayment.status}`)

console.log('\n=== A signed Stripe event reaches the right customer ===')
// Signed with the same test secret up.sh gives the runtime, so these go all the
// way through signature checking to the database.
const signer = new Stripe('sk_test_routing_only')
const signed = async (event) => {
  const payload = JSON.stringify(event)
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_local_only' })
  return fetch(`${BASE}/api/stripe-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload,
  })
}
const SCHOOL = 'a0000000-0000-4000-8000-0000000005c1'
await db.query(
  `insert into schools (id, name, district, district_key, student_count, size_band, status)
   values ($1, 'API School', 'API District', 'api district', 400, 'medium', 'trial')
   on conflict (id) do update set status = 'trial', stripe_customer_id = null`, [SCHOOL])
const schoolPaid = await signed({
  id: `evt_api_school_${Date.now()}`, type: 'customer.subscription.updated',
  data: { object: { id: 'sub_api_school', object: 'subscription', status: 'active',
                    customer: 'cus_api_school', metadata: { school_id: SCHOOL } } },
})
const schoolRow = (await db.query('select status, stripe_customer_id from schools where id = $1', [SCHOOL])).rows[0]
ok('a school’s paid subscription is accepted', schoolPaid.status === 200, `status ${schoolPaid.status}`)
ok('and switches that school on', schoolRow.status === 'active' && schoolRow.stripe_customer_id === 'cus_api_school',
  JSON.stringify(schoolRow))
const familyPaid = await signed({
  id: `evt_api_family_${Date.now()}`, type: 'customer.subscription.updated',
  data: { object: { id: 'sub_api_family', object: 'subscription', status: 'active',
                    customer: 'cus_api_family', metadata: { family_id: OTHER_FAMILY, tier: 'standard' } } },
})
const familyRow = (await db.query('select subscription_status from families where id = $1', [OTHER_FAMILY])).rows[0]
ok('a family’s still goes to the family', familyPaid.status === 200 && familyRow.subscription_status === 'active',
  `status ${familyPaid.status}, ${JSON.stringify(familyRow)}`)
ok('and touches no school', (await db.query(
  "select count(*)::int as n from schools where stripe_customer_id = 'cus_api_family'")).rows[0].n === 0)

console.log('\n=== A family already paying, and Stripe news out of order ===')
await db.query(
  `update families set tier = 'elite', subscription_status = 'active', stripe_subscription_id = 'sub_api_live',
          stripe_customer_id = 'cus_api_live', billing_event_at = now() where id = $1`, [FAMILY])
const second = await post('/api/create-checkout', { tier: 'standard' }, PARENT)
ok('a family already paying cannot start a second subscription', second.status === 409, `status ${second.status}`)
const lateFailure = await signed({
  id: `evt_api_fail_${Date.now()}`, type: 'invoice.payment_failed', created: Math.floor(Date.now() / 1000) - 3600,
  data: { object: { id: 'in_api_1', object: 'invoice', customer: 'cus_api_live', metadata: { family_id: FAMILY } } },
})
ok('a late "payment failed" is accepted', lateFailure.status === 200, `status ${lateFailure.status}`)
ok('and does not downgrade a family that has paid',
  (await db.query('select tier from families where id = $1', [FAMILY])).rows[0].tier === 'elite')
const oldCancel = await signed({
  id: `evt_api_oldcancel_${Date.now()}`, type: 'customer.subscription.deleted', created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'sub_api_old', object: 'subscription', status: 'canceled', customer: 'cus_api_live',
                    metadata: { family_id: FAMILY, tier: 'standard' } } },
})
ok('an old plan being cancelled leaves the family on the plan they pay for',
  oldCancel.status === 200 && (await db.query('select tier from families where id = $1', [FAMILY])).rows[0].tier === 'elite')
const ticketsBefore = (await db.query('select flash_tickets from families where id = $1', [FAMILY])).rows[0].flash_tickets
for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
  // eslint-disable-next-line no-await-in-loop
  await signed({
    id: `evt_api_${type}_${Date.now()}`, type,
    data: { object: { id: `cs_api_bank_debit_${RUN}`, object: 'checkout.session', customer: 'cus_api_live',
                      payment_status: type.endsWith('completed') ? 'unpaid' : 'paid', amount_total: 499, currency: 'usd',
                      metadata: { family_id: FAMILY, product: 'flash_5', ticket_count: '5' } } },
  })
}
const ticketsAfter = (await db.query('select flash_tickets from families where id = $1', [FAMILY])).rows[0].flash_tickets
ok('Flash Tickets paid by a payment that clears later are credited, once',
  ticketsAfter === ticketsBefore + 5, `${ticketsBefore} -> ${ticketsAfter}`)

console.log('\n=== Only the operator can check schools ===')
const operator = (key, body) => fetch(`${BASE}/api/operator-schools`, {
  method: body ? 'POST' : 'GET',
  headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
})
ok('nobody without the key sees the schools', (await operator(null)).status === 401)
ok('not even with the scheduler’s key', (await operator(CRON)).status === 401)
ok('nor the owner’s console key', (await operator('test-stats-key')).status === 401)
ok('a signed-in parent’s token is not the key', (await operator(PARENT)).status === 401)
ok('nor the key with a character missing', (await operator('test-operator-secre')).status === 401)
const unkeyedVerify = await operator(null, { action: 'unverify', school_id: SCHOOL })
ok('and without it nothing can be changed either', unkeyedVerify.status === 401)
const listed = await (await operator('test-operator-secret')).json()
ok('the operator sees every school, with who signed it up',
  listed.ok && listed.schools.some((s) => s.id === SCHOOL && Array.isArray(s.staff)))
ok('and the last 30 days of usage, totals only',
  listed.usage?.days?.length === 30 && typeof listed.usage?.totals?.chores_accepted === 'number'
    && !/family_id|kid_id|user_id|email/.test(JSON.stringify(listed.usage)), JSON.stringify(listed.usage?.totals))
const verified = await operator('test-operator-secret', { action: 'verify', school_id: SCHOOL })
ok('and can verify one', verified.status === 200 &&
  (await db.query('select verified from schools where id = $1', [SCHOOL])).rows[0].verified === true)
await operator('test-operator-secret', { action: 'suspend', school_id: SCHOOL })
ok('or suspend it', (await db.query('select status from schools where id = $1', [SCHOOL])).rows[0].status === 'suspended')
await operator('test-operator-secret', { action: 'unsuspend', school_id: SCHOOL })
ok('and lifting it puts the paying school back to active',
  (await db.query('select status from schools where id = $1', [SCHOOL])).rows[0].status === 'active')
ok('an unknown action is refused',
  (await operator('test-operator-secret', { action: 'delete', school_id: SCHOOL })).status === 400)
ok('as is a school that does not exist',
  (await operator('test-operator-secret', { action: 'verify', school_id: '00000000-0000-4000-8000-000000000000' })).status === 404)

/*
 * A stand-in for Stripe's API, on the address up.sh gives the runtime as
 * STRIPE_API_BASE. It records what the functions ask Stripe for, and can be
 * told to fail the way Stripe does when it is down: answering 500, or not
 * answering at all.
 */
const stripeCalls = []
let stripeMode = 'ok'
// The subscriptions this stand-in Stripe holds, by id: listed by customer,
// retrieved, and cancelled (DELETE), as Stripe does.
const stripeSubs = new Map()
const stripeStandIn = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    if (stripeMode === 'drop') { req.socket.destroy(); return }
    const url = new URL(req.url, 'http://stripe.test')
    stripeCalls.push({ method: req.method, path: url.pathname, params: new URLSearchParams(raw),
                       query: url.searchParams, idempotencyKey: req.headers['idempotency-key'] || null })
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (stripeMode === 'error500') return send(500, { error: { type: 'api_error', message: 'Stripe is having a bad day' } })
    if (url.pathname === '/v1/checkout/sessions') {
      return send(200, { id: `cs_test_${stripeCalls.length}`, object: 'checkout.session', url: `https://checkout.stripe.test/${stripeCalls.length}` })
    }
    if (url.pathname === '/v1/billing_portal/sessions') return send(200, { id: 'bps_test', object: 'billing_portal.session', url: 'https://billing.stripe.test/portal' })
    if (url.pathname === '/v1/subscriptions' && req.method === 'GET') {
      const customer = url.searchParams.get('customer')
      const data = [...stripeSubs.values()].filter((sub) => !customer || sub.customer === customer)
      return send(200, { object: 'list', url: '/v1/subscriptions', data, has_more: false })
    }
    if (url.pathname.startsWith('/v1/subscriptions/')) {
      const id = url.pathname.split('/').pop()
      const held = stripeSubs.get(id)
      if (req.method === 'DELETE') {
        if (!held) return send(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such subscription: '${id}'` } })
        if (held.status === 'canceled') {
          return send(400, { error: { type: 'invalid_request_error', message: 'A canceled subscription can only update its cancellation_details and metadata.' } })
        }
        held.status = 'canceled'
        return send(200, held)
      }
      return send(200, held || { id, object: 'subscription' })
    }
    return send(404, { error: { type: 'invalid_request_error', message: 'no such route in the stand-in' } })
  })
})
await new Promise((resolve) => stripeStandIn.listen(Number(process.env.STRIPE_STANDIN_PORT || 12111), resolve))
const lastCall = (path) => [...stripeCalls].reverse().find((c) => c.path === path)
const asUser = (path, body, token) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE, Authorization: `Bearer ${token}` },
  body: JSON.stringify(body ?? {}),
})
const billingRow = async (id) => (await db.query(
  'select tier, subscription_status, flash_tickets, last_paid_tier from families where id = $1', [id])).rows[0]
// What the plan screen is given: billing_status, asked as the parent, through the API.
const billingAs = async (token) => (await fetch(`${MOCK}/rest/v1/rpc/billing_status`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${token}` }, body: '{}',
})).json()
let clock = Math.floor(Date.now() / 1000) + 60
const tick = () => { clock += 10; return clock }

console.log('\n=== The billing portal when Stripe is down ===')
{
  stripeMode = 'ok'
  const open = await asUser('/api/billing-portal', {}, PARENT)
  const body = await open.json().catch(() => ({}))
  ok('with Stripe up, a parent gets the portal link', open.status === 200 && body.url === 'https://billing.stripe.test/portal',
    `status ${open.status} ${JSON.stringify(body)}`)
  ok('for their own customer, coming back to the plan screen',
    lastCall('/v1/billing_portal/sessions')?.params.get('customer') === 'cus_api_live'
    && lastCall('/v1/billing_portal/sessions')?.params.get('return_url') === `${BASE}/#/parent/plan`)

  stripeMode = 'error500'
  const errorsBefore = Number((await db.query(`select count(*) from server_errors where where_at = 'billing-portal'`)).rows[0].count)
  const broken = await asUser('/api/billing-portal', {}, PARENT)
  const brokenBody = await broken.json().catch(() => ({}))
  ok('Stripe answering 500 gives a plain "Stripe is not answering", not a crash',
    broken.status === 503 && brokenBody.error === 'stripe_unavailable', `status ${broken.status} ${JSON.stringify(brokenBody)}`)
  const recorded = await db.query(`select message from server_errors where where_at = 'billing-portal' order by id desc limit 1`)
  ok('and the function writes its error down for the error report, without the customer or the request',
    Number((await db.query(`select count(*) from server_errors where where_at = 'billing-portal'`)).rows[0].count) === errorsBefore + 1
      && !/cus_api_live|@|a0000000/.test(recorded.rows[0]?.message || ''), recorded.rows[0]?.message)

  stripeMode = 'drop'
  const started = Date.now()
  const gone = await asUser('/api/billing-portal', {}, PARENT)
  const goneBody = await gone.json().catch(() => ({}))
  ok('Stripe not answering at all says the same', gone.status === 503 && goneBody.error === 'stripe_unavailable',
    `status ${gone.status} ${JSON.stringify(goneBody)}`)
  ok('and says it promptly', Date.now() - started < 25000, `${Date.now() - started}ms`)
  ok('which the app puts in words a parent can act on',
    /not answering/.test(billingError(goneBody.error)) && /Nothing about your plan has changed/.test(billingError(goneBody.error)))
  ok('as it does when the host itself answers 502', billingError('http_502') === billingError('stripe_unavailable'))
  stripeMode = 'ok'
}

/*
 * RankUp lives at rankup.<your domain>, beside MTRX Horizyn's console and its
 * other products on the same parent domain. A sibling is another site: it gets
 * no CORS header and no cookie from any function or page, and a payment it
 * starts still comes back to RankUp. tests/isolation.mjs checks the same in
 * the source; this is the host's runtime answering.
 */
console.log('\n=== A sibling on the same parent domain is trusted with nothing ===')
{
  const SIBLINGS = ['https://console.example.com', 'https://example.com']
  const shared = (res) => [...res.headers.keys()].filter((k) => /^access-control-|^set-cookie$|^service-worker-allowed$/i.test(k))
  const names = readdirSync(new URL('../api/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''))
  for (const sibling of SIBLINGS) {
    const host = new URL(sibling).host
    const leaks = []
    for (const name of names) {
      const asked = await fetch(`${BASE}/api/${name}`, {
        method: 'OPTIONS',
        headers: { Origin: sibling, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' },
      })
      if (shared(asked).length) leaks.push(`${name} (preflight): ${shared(asked).join(', ')}`)
      const straight = await fetch(`${BASE}/api/${name}`, { headers: { Origin: sibling } })
      if (shared(straight).length) leaks.push(`${name}: ${shared(straight).join(', ')}`)
    }
    ok(`none of the ${names.length} functions answers ${host} with a CORS header or a cookie, preflight or not`,
      leaks.length === 0, leaks.join('; '))
    const pages = []
    const script = (await (await fetch(`${BASE}/`)).text()).match(/src="\/?(assets\/[^"]+\.js)"/)?.[1]
    for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', ...(script ? [`/${script}`] : [])]) {
      const res = await fetch(`${BASE}${path}`, { headers: { Origin: sibling } })
      if (shared(res).length) pages.push(`${path}: ${shared(res).join(', ')}`)
    }
    ok(`nor does any page, script or the service worker (no wider scope for ${host} to borrow)`,
      Boolean(script) && pages.length === 0, script ? pages.join('; ') : 'no script found in the page')
  }
  const front = await fetch(`${BASE}/`)
  ok('the page refuses to be framed by anyone, a sibling included', front.headers.get('x-frame-options') === 'DENY',
    `x-frame-options: ${front.headers.get('x-frame-options')}`)
  ok('and asks for an agent cluster of its own', front.headers.get('origin-agent-cluster') === '?1',
    `origin-agent-cluster: ${front.headers.get('origin-agent-cluster')}`)

  // The parent's real token, sent from a sibling's page (or by anyone who
  // writes Origin themselves): the way back from Stripe is still RankUp.
  const fromSibling = await fetch(`${BASE}/api/billing-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SIBLINGS[0], Authorization: `Bearer ${PARENT}` },
    body: '{}',
  })
  ok('a billing portal opened with a sibling\'s Origin still returns to RankUp',
    fromSibling.status === 200
    && lastCall('/v1/billing_portal/sessions')?.params.get('return_url') === `${BASE}/#/parent/plan`,
    `status ${fromSibling.status} ${lastCall('/v1/billing_portal/sessions')?.params.get('return_url')}`)
  ok('and its answer carries no CORS header for the sibling to read it by', shared(fromSibling).length === 0,
    shared(fromSibling).join(', '))
}

console.log('\n=== A school that changes size is charged for its new size ===')
{
  const ADMIN = 'a0000000-0000-4000-8000-0000000005a1'
  const RESIZED = 'a0000000-0000-4000-8000-0000000005c2'
  await db.query(`insert into auth.users (id, email) values ($1, 'api-school-admin@example.com') on conflict do nothing`, [ADMIN])
  await db.query(
    `insert into schools (id, name, district, district_key, student_count, size_band, status, trial_ends_at)
     values ($1, 'Resized School', 'API District', 'api district', 200, 'small', 'trial', now() + interval '20 days')
     on conflict (id) do update set student_count = 200, size_band = 'small', status = 'trial',
                                    stripe_subscription_id = null, stripe_customer_id = null`, [RESIZED])
  await db.query(`insert into school_staff (user_id, school_id, name, role) values ($1, $2, 'Admin', 'admin')
                  on conflict (user_id) do update set school_id = $2, role = 'admin'`, [ADMIN, RESIZED])

  // Checkout opened at the old size, and left open.
  const early = await asUser('/api/school-checkout', { cycle: 'month' }, ADMIN)
  ok('a small school is offered the small price', early.status === 200
    && lastCall('/v1/checkout/sessions')?.params.get('line_items[0][price]') === 'price_test_school_small',
    `status ${early.status} ${lastCall('/v1/checkout/sessions')?.params.get('line_items[0][price]')}`)

  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ADMIN])
  const resized = (await db.query('select update_school_size(900) as r')).rows[0].r
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  ok('the school corrects its size to 900', resized.ok === true, JSON.stringify(resized))

  const monthly = await asUser('/api/school-checkout', { cycle: 'month' }, ADMIN)
  const monthCall = lastCall('/v1/checkout/sessions')
  ok('a fresh checkout charges the large price', monthly.status === 200
    && monthCall?.params.get('line_items[0][price]') === 'price_test_school_large'
    && monthCall?.params.get('metadata[band]') === 'large',
    `${monthCall?.params.get('line_items[0][price]')} / ${monthCall?.params.get('metadata[band]')}`)
  const yearly = await asUser('/api/school-checkout', { cycle: 'year', band: 'small' }, ADMIN)
  ok('and the large yearly price for a year, whatever the request says about size', yearly.status === 200
    && lastCall('/v1/checkout/sessions')?.params.get('line_items[0][price]') === 'price_test_school_large_year')

  // The page opened before the resize is paid on anyway.
  const before = stripeCalls.length
  const stale = await signed({
    id: `evt_api_school_stale_${Date.now()}`, type: 'customer.subscription.created', created: tick(),
    data: { object: { id: 'sub_api_school_stale', object: 'subscription', status: 'trialing', customer: 'cus_api_resized',
      metadata: { school_id: RESIZED, band: 'small', cycle: 'month', kind: 'school' },
      items: { data: [{ id: 'si_api_stale', price: { id: 'price_test_school_small', recurring: { interval: 'month' } } }] } } },
  })
  const moved = stripeCalls.slice(before).find((c) => c.path === '/v1/subscriptions/sub_api_school_stale')
  ok('a subscription paid on the stale page is accepted', stale.status === 200, `status ${stale.status}`)
  ok('and moved onto the large price from its next invoice',
    moved?.params.get('items[0][id]') === 'si_api_stale' && moved?.params.get('items[0][price]') === 'price_test_school_large'
    && moved?.params.get('proration_behavior') === 'none',
    moved ? [...moved.params].join('&') : 'no update sent')
  const afterMove = stripeCalls.length
  await signed({
    id: `evt_api_school_right_${Date.now()}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: { id: 'sub_api_school_stale', object: 'subscription', status: 'trialing', customer: 'cus_api_resized',
      metadata: { school_id: RESIZED, band: 'large', cycle: 'month', kind: 'school' },
      items: { data: [{ id: 'si_api_stale', price: { id: 'price_test_school_large', recurring: { interval: 'month' } } }] } } },
  })
  ok('Stripe saying it is on the right price changes nothing more',
    !stripeCalls.slice(afterMove).some((c) => c.path.startsWith('/v1/subscriptions/')))
  await signed({
    id: `evt_api_school_deal_${Date.now()}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: { id: 'sub_api_school_stale', object: 'subscription', status: 'active', customer: 'cus_api_resized',
      metadata: { school_id: RESIZED, cycle: 'month', kind: 'school' },
      items: { data: [{ id: 'si_api_stale', price: { id: 'price_hand_set_deal', recurring: { interval: 'month' } } }] } } },
  })
  ok('nor does a price the operator set by hand',
    !stripeCalls.slice(afterMove).some((c) => c.path.startsWith('/v1/subscriptions/')))
}

console.log('\n=== Annual prices map back to the right plan in every subscription event ===')
{
  const YEARLY = 'a0000000-0000-4000-8000-00000000f003'
  await db.query(`insert into families (id, name, tier) values ($1, 'Yearly Family', 'starter')
                  on conflict (id) do update set tier = 'starter', subscription_status = 'none', billing_event_at = null,
                                                 stripe_subscription_id = null, stripe_customer_id = 'cus_api_yearly'`, [YEARLY])
  await db.query(`update families set stripe_customer_id = 'cus_api_yearly' where id = $1`, [YEARLY])
  const sub = (price, status = 'active', extra = []) => ({
    id: 'sub_api_yearly', object: 'subscription', status, customer: 'cus_api_yearly',
    // Metadata left saying "standard", as it does after a plan is changed in
    // the portal: the price is what was paid for, and it has to win.
    metadata: { family_id: YEARLY, tier: 'standard', cycle: 'year' },
    items: { data: [...extra, { id: 'si_api_yearly', price: { id: price, recurring: { interval: 'year' } } }] },
  })
  for (const type of ['customer.subscription.created', 'customer.subscription.updated']) {
    // eslint-disable-next-line no-await-in-loop
    const r = await signed({ id: `evt_api_yearly_elite_${type}_${Date.now()}`, type, created: tick(), data: { object: sub('price_test_elite_year') } })
    // eslint-disable-next-line no-await-in-loop
    const row = await billingRow(YEARLY)
    ok(`${type}: a yearly Elite price is Elite`, r.status === 200 && row.tier === 'elite', `status ${r.status} ${JSON.stringify(row)}`)
  }
  await signed({ id: `evt_api_yearly_std_${Date.now()}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: { ...sub('price_test_standard_year'), metadata: { family_id: YEARLY, tier: 'elite' } } } })
  ok('customer.subscription.updated: a yearly Standard price is Standard, whatever the metadata claims',
    (await billingRow(YEARLY)).tier === 'standard')
  await signed({ id: `evt_api_yearly_two_${Date.now()}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: sub('price_test_elite_year', 'active', [{ id: 'si_api_extra', price: { id: 'price_some_other_line' } }]) } })
  ok('a yearly Elite price is found when it is not the first line', (await billingRow(YEARLY)).tier === 'elite')
  await signed({ id: `evt_api_yearly_paid_${Date.now()}`, type: 'invoice.paid', created: tick(),
    data: { object: { id: 'in_api_yearly', object: 'invoice', customer: 'cus_api_yearly', amount_paid: 15990, currency: 'usd',
      parent: { subscription_details: { metadata: { family_id: YEARLY, tier: 'standard' } } },
      lines: { data: [{ price: { id: 'price_test_elite_year' } }] } } } })
  await signed({ id: `evt_api_yearly_cs_${Date.now()}`, type: 'checkout.session.completed', created: tick(),
    data: { object: { id: 'cs_api_yearly', object: 'checkout.session', mode: 'subscription', customer: 'cus_api_yearly',
      payment_status: 'paid', metadata: { family_id: YEARLY, tier: 'standard', cycle: 'year' } } } })
  ok('invoice.paid and checkout.session.completed leave a yearly Elite family on Elite', (await billingRow(YEARLY)).tier === 'elite')
  const deleted = await signed({ id: `evt_api_yearly_del_${Date.now()}`, type: 'customer.subscription.deleted', created: tick(),
    data: { object: sub('price_test_elite_year', 'canceled') } })
  const ended = await billingRow(YEARLY)
  ok('customer.subscription.deleted: the yearly plan ending drops to Starter', deleted.status === 200
    && ended.tier === 'starter' && ended.subscription_status === 'canceled', JSON.stringify(ended))
}

console.log('\n=== A failed renewal drops the plan, and the parent is told why ===')
{
  const RENEW_PARENT = 'a0000000-0000-4000-8000-00000000a004'
  const RENEW = 'a0000000-0000-4000-8000-00000000f004'
  await db.query(`insert into auth.users (id, email) values ($1, 'api-renew@example.com') on conflict do nothing`, [RENEW_PARENT])
  await db.query(`insert into families (id, name, tier) values ($1, 'Renewing Family', 'elite') on conflict (id) do nothing`, [RENEW])
  await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Renewing Parent') on conflict do nothing`, [RENEW_PARENT, RENEW])
  await db.query(`update families set tier = 'elite', subscription_status = 'active', stripe_subscription_id = 'sub_api_renew',
                  stripe_customer_id = 'cus_api_renew', billing_event_at = null, last_paid_tier = null where id = $1`, [RENEW])
  const renewal = (status) => ({ id: 'sub_api_renew', object: 'subscription', status, customer: 'cus_api_renew',
    metadata: { family_id: RENEW, tier: 'elite' }, items: { data: [{ id: 'si_api_renew', price: { id: 'price_test_elite_month' } }] } })

  const failed = await signed({ id: `evt_api_renew_fail_${Date.now()}`, type: 'invoice.payment_failed', created: tick(),
    data: { object: { id: 'in_api_renew', object: 'invoice', customer: 'cus_api_renew', metadata: { family_id: RENEW } } } })
  ok('"payment failed" on its own changes nothing (the subscription event says what happened)',
    failed.status === 200 && (await billingRow(RENEW)).tier === 'elite')

  await signed({ id: `evt_api_renew_due_${Date.now()}`, type: 'customer.subscription.updated', created: tick(), data: { object: renewal('past_due') } })
  let row = await billingRow(RENEW)
  ok('past due: the family drops to Starter at once', row.tier === 'starter' && row.subscription_status === 'past_due', JSON.stringify(row))
  let notice = billingNotice(await billingAs(RENEW_PARENT))
  ok('and the plan screen says the card was declined, naming the plan that stopped',
    notice?.title === 'A payment failed' && /Elite plan/.test(notice.body) && /Manage billing/.test(notice.body), JSON.stringify(notice))

  for (const status of ['unpaid', 'incomplete_expired', 'paused']) {
    // eslint-disable-next-line no-await-in-loop
    const r = await signed({ id: `evt_api_renew_${status}_${Date.now()}`, type: 'customer.subscription.updated', created: tick(), data: { object: renewal(status) } })
    // eslint-disable-next-line no-await-in-loop
    row = await billingRow(RENEW)
    ok(`"${status}" is stored rather than refused (the webhook used to answer 500 for ever)`,
      r.status === 200 && row.subscription_status === status && row.tier === 'starter', `status ${r.status} ${JSON.stringify(row)}`)
    // eslint-disable-next-line no-await-in-loop
    notice = billingNotice(await billingAs(RENEW_PARENT))
    ok(`and "${status}" has words for the parent`, Boolean(notice?.title) && /Starter/.test(notice.body), JSON.stringify(notice))
  }
  await signed({ id: `evt_api_renew_back_${Date.now()}`, type: 'customer.subscription.updated', created: tick(), data: { object: renewal('active') } })
  row = await billingRow(RENEW)
  ok('a card that goes through puts the plan back', row.tier === 'elite' && row.subscription_status === 'active', JSON.stringify(row))
  ok('with nothing left to warn about', billingNotice(await billingAs(RENEW_PARENT)) === null)

  console.log('\n=== A refund ===')
  const refund = (over) => signed({ id: `evt_api_refund_${Date.now()}_${Math.random()}`, type: 'charge.refunded', created: tick(),
    data: { object: { id: `ch_api_renew_${RUN}`, object: 'charge', customer: 'cus_api_renew', payment_intent: `pi_api_renew_${RUN}`,
      amount: 1599, amount_refunded: 1599, refunded: true, currency: 'usd', created: Math.floor(Date.now() / 1000), ...over } } })
  await refund({ id: `ch_api_goodwill_${RUN}`, amount_refunded: 500, refunded: false })
  ok('a partial refund leaves the plan alone', (await billingRow(RENEW)).tier === 'elite')
  // This month's renewal has been paid; last month's is refunded in full.
  await signed({ id: `evt_api_renew_paid_${Date.now()}`, type: 'invoice.paid', created: tick(),
    data: { object: { id: `in_api_renew_this_month_${RUN}`, object: 'invoice', customer: 'cus_api_renew', amount_paid: 1599, currency: 'usd',
      parent: { subscription_details: { metadata: { family_id: RENEW } } } } } })
  await refund({ id: `ch_api_last_month_${RUN}`, created: Math.floor(Date.now() / 1000) - 35 * 86400 })
  ok('refunding an earlier month leaves the month that is paid for standing', (await billingRow(RENEW)).tier === 'elite',
    JSON.stringify(await billingRow(RENEW)))
  const full = await refund({})
  row = await billingRow(RENEW)
  ok('a plan payment refunded in full drops the family to Starter', full.status === 200
    && row.tier === 'starter' && row.subscription_status === 'refunded', JSON.stringify(row))
  notice = billingNotice(await billingAs(RENEW_PARENT))
  ok('and the parent is told it was refunded', notice?.title === 'Your payment was refunded', JSON.stringify(notice))
  // Back on the plan for the pack checks below. A renewal into a new period:
  // "active" for the period that was refunded keeps it refunded
  // (tests/billingwalk.mjs, 41-billing-walk.sql).
  await signed({ id: `evt_api_renew_again_${Date.now()}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: { ...renewal('active'), current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 } } })

  console.log('\n=== Flash Ticket packs: replayed, refunded ===')
  await db.query('update families set flash_tickets = 0 where id = $1', [RENEW])
  const pack = { id: `evt_api_pack_${Date.now()}`, type: 'checkout.session.completed', created: tick(),
    data: { object: { id: `cs_api_pack_${RUN}`, object: 'checkout.session', mode: 'payment', customer: 'cus_api_renew',
      payment_status: 'paid', payment_intent: `pi_api_pack_${RUN}`, amount_total: 599, currency: 'usd',
      metadata: { family_id: RENEW, product: 'flash_5', ticket_count: '5' } } } }
  await signed(pack)
  await signed(pack)
  await Promise.all([signed(pack), signed(pack), signed({ ...pack, id: `${pack.id}_other` })])
  ok('one pack, delivered five times (twice at once, once under another event id), is five tickets',
    (await billingRow(RENEW)).flash_tickets === 5, JSON.stringify(await billingRow(RENEW)))
  await db.query('update families set flash_tickets = 3 where id = $1', [RENEW])   // two spent
  const packRefund = { id: `evt_api_pack_refund_${Date.now()}`, type: 'charge.refunded', created: tick(),
    data: { object: { id: `ch_api_pack_${RUN}`, object: 'charge', customer: 'cus_api_renew', payment_intent: `pi_api_pack_${RUN}`,
      amount: 599, amount_refunded: 599, refunded: true, currency: 'usd' } } }
  await signed(packRefund)
  await signed({ ...packRefund, id: `${packRefund.id}_again` })
  row = await billingRow(RENEW)
  ok('refunding the pack takes back what is left of it, never below zero', row.flash_tickets === 0, JSON.stringify(row))
  ok('and leaves the plan alone', row.tier === 'elite' && row.subscription_status === 'active', JSON.stringify(row))
  await db.query('update families set flash_tickets = 4 where id = $1', [RENEW])
  await signed({ ...packRefund, id: `${packRefund.id}_late` })
  ok('a replay of the refund takes nothing more', (await billingRow(RENEW)).flash_tickets === 4)
}

/*
 * Deleting the account stops the billing.
 *
 * It did not: the database removed the family, and with it the only link to
 * its Stripe subscription, which went on charging the card every month. Now
 * api/delete-account.js deletes and then cancels at Stripe with the secret
 * key; a cancellation Stripe will not take stays queued for run-retention.
 */
{
  const familyFixture = async (tag, { billing = true } = {}) => {
    const parent = `a0000000-0000-4000-8000-00000000de${tag}a`
    const family = `a0000000-0000-4000-8000-00000000de${tag}f`
    const customer = `cus_api_del_${tag}_${RUN}`
    const subscription = `sub_api_del_${tag}_${RUN}`
    await db.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [parent, `api-del-${tag}@example.com`])
    await db.query(`insert into families (id, name, tier) values ($1, $2, 'starter') on conflict (id) do nothing`, [family, `Deleting ${tag}`])
    await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Deleting Parent') on conflict do nothing`, [parent, family])
    if (billing) {
      await db.query(`update families set tier = 'elite', subscription_status = 'active', stripe_customer_id = $2,
                      stripe_subscription_id = $3 where id = $1`, [family, customer, subscription])
      stripeSubs.set(subscription, { id: subscription, object: 'subscription', status: 'active', customer,
                                     metadata: { family_id: family, tier: 'elite' } })
    }
    return { parent, family, customer, subscription }
  }
  const familyExists = async (id) => (await db.query('select count(*)::int as n from families where id = $1', [id])).rows[0].n === 1
  const queued = async (subscription) => (await db.query(
    'select attempts, done_at, last_error from billing_cancellations where stripe_subscription_id = $1', [subscription])).rows[0]
  const cancels = (from, id) => stripeCalls.slice(from).filter((c) => c.method === 'DELETE' && c.path === `/v1/subscriptions/${id}`)
  const deleteAs = (token, confirm = 'DELETE') => asUser('/api/delete-account', { confirm }, token)

  console.log('\n=== Deleting a paying family\'s account cancels its subscription at Stripe, at once ===')
  stripeMode = 'ok'
  const paying = await familyFixture('1')
  // A second plan on the same customer that the family row did not know of
  // yet (a checkout just completed), one already over, and a school's.
  const extra = `sub_api_del_extra_${RUN}`
  stripeSubs.set(extra, { id: extra, object: 'subscription', status: 'trialing', customer: paying.customer, metadata: {} })
  stripeSubs.set(`sub_api_del_over_${RUN}`, { id: `sub_api_del_over_${RUN}`, object: 'subscription', status: 'canceled', customer: paying.customer, metadata: {} })
  stripeSubs.set(`sub_api_del_school_${RUN}`, { id: `sub_api_del_school_${RUN}`, object: 'subscription', status: 'active', customer: paying.customer, metadata: { school_id: SCHOOL } })

  ok('deleting with no token is refused', (await post('/api/delete-account', { confirm: 'DELETE' })).status === 401)
  let from = stripeCalls.length
  const unconfirmed = await deleteAs(paying.parent, 'yes')
  ok('without the typed confirmation nothing is deleted or cancelled', unconfirmed.status === 400
    && await familyExists(paying.family) && cancels(from, paying.subscription).length === 0, `status ${unconfirmed.status}`)

  from = stripeCalls.length
  const done = await deleteAs(paying.parent)
  const doneBody = await done.json().catch(() => ({}))
  ok('the parent deletes the account', done.status === 200 && doneBody.ok === true, `status ${done.status} ${JSON.stringify(doneBody)}`)
  ok('and the family is gone', !(await familyExists(paying.family)))
  ok('its subscription is cancelled at Stripe in the same request', doneBody.billing === 'cancelled'
    && cancels(from, paying.subscription).length === 1 && stripeSubs.get(paying.subscription).status === 'canceled', JSON.stringify(doneBody))
  const cancelCall = cancels(from, paying.subscription)[0]
  // A DELETE carries its parameters in the query string.
  const cancelParam = (name) => cancelCall?.query.get(name) ?? cancelCall?.params.get(name)
  ok('at once: no final invoice and no proration, so nothing more is charged',
    cancelParam('invoice_now') === 'false' && cancelParam('prorate') === 'false',
    cancelCall ? `${cancelCall.query} | ${cancelCall.params}` : 'no call')
  ok('sent with an idempotency key, so a retry cannot act twice', Boolean(cancelCall?.idempotencyKey))
  ok('as is a second live plan on the same customer', cancels(from, extra).length === 1)
  ok('but not one already over, nor a school\'s plan',
    cancels(from, `sub_api_del_over_${RUN}`).length === 0 && cancels(from, `sub_api_del_school_${RUN}`).length === 0
    && stripeSubs.get(`sub_api_del_school_${RUN}`).status === 'active')
  ok('the Stripe customer is kept (it holds the payment records)',
    !stripeCalls.slice(from).some((c) => c.method === 'DELETE' && c.path.startsWith('/v1/customers')))
  ok('the browser is not handed the family id or any Stripe id',
    !JSON.stringify(doneBody).includes(paying.family) && !JSON.stringify(doneBody).includes('cus_') && !JSON.stringify(doneBody).includes('sub_'))
  ok('and the queue records it as done', Boolean((await queued(paying.subscription))?.done_at))

  const after = await signed({ id: `evt_api_del_gone_${RUN}`, type: 'customer.subscription.deleted', created: tick(),
    data: { object: { ...stripeSubs.get(paying.subscription) } } })
  const afterBody = await after.json().catch(() => ({}))
  ok('Stripe\'s "subscription deleted" for the deleted family is answered, not failed for days',
    after.status === 200 && afterBody.ignored === 'family_deleted', `status ${after.status} ${JSON.stringify(afterBody)}`)
  from = stripeCalls.length
  const again = await fetch(`${BASE}/api/run-retention`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  ok('the daily job cancels nothing twice', again.status === 200 && cancels(from, paying.subscription).length === 0)
  ok('the account cannot be deleted twice', (await deleteAs(paying.parent)).status === 403)

  console.log('\n=== Stripe down when the account is deleted: deleted anyway, cancelled later ===')
  const unlucky = await familyFixture('2')
  stripeMode = 'error500'
  const down = await deleteAs(unlucky.parent)
  const downBody = await down.json().catch(() => ({}))
  ok('the account is still deleted', down.status === 200 && downBody.ok === true && !(await familyExists(unlucky.family)),
    `status ${down.status} ${JSON.stringify(downBody)}`)
  ok('and says the cancellation is queued, not done', downBody.billing === 'queued', JSON.stringify(downBody))
  let row = await queued(unlucky.subscription)
  ok('it waits in the queue with what went wrong', row && !row.done_at && row.attempts === 1 && Boolean(row.last_error), JSON.stringify(row))
  ok('and the subscription is still live at Stripe (nothing pretended otherwise)', stripeSubs.get(unlucky.subscription).status === 'active')

  stripeMode = 'drop'
  const stillDown = await fetch(`${BASE}/api/run-retention`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const stillDownBody = await stillDown.json().catch(() => ({}))
  row = await queued(unlucky.subscription)
  ok('Stripe still not answering: the daily job still succeeds at its clean-up', stillDown.status === 200
    && stillDownBody.billing_cancellations?.failed >= 1, `status ${stillDown.status} ${JSON.stringify(stillDownBody.billing_cancellations)}`)
  ok('and the cancellation keeps waiting, tried twice now', !row.done_at && row.attempts === 2, JSON.stringify(row))

  stripeMode = 'ok'
  from = stripeCalls.length
  const back = await fetch(`${BASE}/api/run-retention`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const backBody = await back.json().catch(() => ({}))
  row = await queued(unlucky.subscription)
  ok('Stripe back: the next run cancels it', back.status === 200 && cancels(from, unlucky.subscription).length === 1
    && stripeSubs.get(unlucky.subscription).status === 'canceled', JSON.stringify(backBody.billing_cancellations))
  ok('and marks it done', Boolean(row.done_at) && row.last_error === null, JSON.stringify(row))
  from = stripeCalls.length
  await fetch(`${BASE}/api/run-retention`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  ok('after which no run asks Stripe again', cancels(from, unlucky.subscription).length === 0)

  console.log('\n=== An older app that asks the database directly ===')
  const direct = await familyFixture('5')
  const viaDb = await (await fetch(`${MOCK}/rest/v1/rpc/delete_family_account`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${direct.parent}` },
    body: JSON.stringify({ p_confirm: 'DELETE' }),
  })).json()
  ok('deletes the account, and its subscription is queued', viaDb?.ok === true && !(await familyExists(direct.family))
    && Boolean(await queued(direct.subscription)) && stripeSubs.get(direct.subscription).status === 'active', JSON.stringify(viaDb))
  from = stripeCalls.length
  await fetch(`${BASE}/api/run-retention`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  ok('which the daily job then cancels', cancels(from, direct.subscription).length === 1
    && stripeSubs.get(direct.subscription).status === 'canceled' && Boolean((await queued(direct.subscription))?.done_at))

  console.log('\n=== Already cancelled at Stripe, but the answer was lost ===')
  const lost = await familyFixture('3')
  stripeSubs.get(lost.subscription).status = 'canceled'
  from = stripeCalls.length
  const lostDone = await (await deleteAs(lost.parent)).json().catch(() => ({}))
  ok('a subscription Stripe has already cancelled counts as done', lostDone.billing === 'cancelled'
    && Boolean((await queued(lost.subscription))?.done_at), JSON.stringify(lostDone))

  console.log('\n=== A checkout paid after the account was deleted ===')
  const late = await familyFixture('4', { billing: false })
  const lateBody = await (await deleteAs(late.parent)).json().catch(() => ({}))
  ok('a family that never paid deletes with nothing to cancel', lateBody.ok === true && lateBody.billing === 'none', JSON.stringify(lateBody))
  stripeSubs.set(late.subscription, { id: late.subscription, object: 'subscription', status: 'active', customer: late.customer,
                                      metadata: { family_id: late.family, tier: 'elite' } })
  from = stripeCalls.length
  const paidLate = await signed({ id: `evt_api_del_late_${RUN}`, type: 'checkout.session.completed', created: tick(),
    data: { object: { id: `cs_api_del_late_${RUN}`, object: 'checkout.session', mode: 'subscription', payment_status: 'paid',
      customer: late.customer, subscription: late.subscription, client_reference_id: late.family,
      metadata: { family_id: late.family, tier: 'elite' } } } })
  const paidLateBody = await paidLate.json().catch(() => ({}))
  ok('the webhook answers it', paidLate.status === 200 && paidLateBody.ignored === 'family_deleted', `status ${paidLate.status} ${JSON.stringify(paidLateBody)}`)
  ok('and cancels the subscription it started before it can renew', cancels(from, late.subscription).length === 1
    && stripeSubs.get(late.subscription).status === 'canceled')
  const updatedLate = await signed({ id: `evt_api_del_late_upd_${RUN}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: { id: late.subscription, object: 'subscription', status: 'active', customer: late.customer,
      metadata: { family_id: late.family, tier: 'elite' } } } })
  ok('its other events are answered too, not failed for days', updatedLate.status === 200, `status ${updatedLate.status}`)
  const invoiceLate = await signed({ id: `evt_api_del_late_inv_${RUN}`, type: 'invoice.paid', created: tick(),
    data: { object: { id: `in_api_del_late_${RUN}`, object: 'invoice', customer: late.customer, amount_paid: 1599, currency: 'usd',
      parent: { subscription_details: { metadata: { family_id: late.family } } } } } })
  const counted = (await db.query('select family_id, amount_pence from billing_events where stripe_event = $1', [`invoice:in_api_del_late_${RUN}`])).rows[0]
  ok('money already taken is still counted, against no family', invoiceLate.status === 200
    && counted?.family_id === null && counted?.amount_pence === 1599, `status ${invoiceLate.status} ${JSON.stringify(counted)}`)
  const refundLate = await signed({ id: `evt_api_del_late_ref_${RUN}`, type: 'charge.refunded', created: tick(),
    data: { object: { id: `ch_api_del_late_${RUN}`, object: 'charge', customer: late.customer, amount: 1599, amount_refunded: 1599,
      refunded: true, currency: 'usd', metadata: { family_id: late.family } } } })
  ok('and a refund the operator gives it is answered', refundLate.status === 200, `status ${refundLate.status}`)

  console.log('\n=== A family this database never had is never cancelled ===')
  const stranger = `sub_api_stranger_${RUN}`
  stripeSubs.set(stranger, { id: stranger, object: 'subscription', status: 'active', customer: `cus_api_stranger_${RUN}`,
                             metadata: { family_id: 'a0000000-0000-4000-8000-0000000fffff' } })
  from = stripeCalls.length
  const strange = await signed({ id: `evt_api_stranger_${RUN}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: { ...stripeSubs.get(stranger) } } })
  const strangeBody = await strange.json().catch(() => ({}))
  ok('news about it is answered and dropped', strange.status === 200 && strangeBody.ignored === 'no_family', JSON.stringify(strangeBody))
  ok('and its subscription is left alone: only a family known to have deleted itself is cancelled',
    cancels(from, stranger).length === 0 && stripeSubs.get(stranger).status === 'active')
}

stripeStandIn.close()

console.log('\n=== The free trial\'s reminder emails ===')
{
  const { TIERS } = await import('../src/state/initialState.js')
  const TRIAL_FAMILY = 'a0000000-0000-4000-8000-00000000f0e1'
  const TRIAL_PARENT = 'a0000000-0000-4000-8000-00000000e0a1'
  const TRIAL_GRAN = 'a0000000-0000-4000-8000-00000000e0a2'
  const address = `api-trial-${RUN}@example.com`
  await db.query(`insert into auth.users (id, email) values ($1, $3), ($2, $4) on conflict (id) do update set email = excluded.email`,
    [TRIAL_PARENT, TRIAL_GRAN, address, `api-gran-${RUN}@example.com`])
  await db.query(`insert into families (id, name, tier, trial_tier, trial_ends_at, timezone)
                  values ($1, 'API Trial Family', 'starter', 'elite', now() + interval '60 hours', 'UTC')
                  on conflict (id) do update set trial_tier = 'elite', trial_ends_at = now() + interval '60 hours', tier = 'starter'`, [TRIAL_FAMILY])
  await db.query(`insert into parents (user_id, family_id, name, role) values ($1, $3, 'Trial Parent', 'parent'), ($2, $3, 'Trial Gran', 'supporter')
                  on conflict do nothing`, [TRIAL_PARENT, TRIAL_GRAN, TRIAL_FAMILY])
  await db.query('delete from trial_reminder_sends where family_id = $1', [TRIAL_FAMILY])
  const run = () => fetch(`${BASE}/api/send-trial-emails`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const ours = () => emails.filter((e) => e.body.to?.includes(address))

  // The provider is down first: nothing is lost.
  emailMode = 'error500'
  const down = await run()
  const downBody = await down.json().catch(() => ({}))
  ok('with the email service down the job still answers, and says it failed to send', down.status === 200 && downBody.failed >= 1, JSON.stringify(downBody))
  ok('and the reminder is not marked sent, so the next run tries again',
    (await db.query('select count(*)::int as n from trial_reminder_sends where family_id = $1', [TRIAL_FAMILY])).rows[0].n === 0)
  const health = await (await fetch(`${BASE}/api/health`, { headers: { Authorization: `Bearer ${CRON}` } })).json()
  ok('and /api/health shows the failure', health.jobs?.['send-trial-emails']?.last_error?.includes('not sent'), JSON.stringify(health.jobs?.['send-trial-emails']))

  emailMode = 'ok'
  const first = await run()
  ok('three days before the end, the job sends the first reminder', first.status === 200 && ours().length === 1, `${first.status}, ${ours().length} emails`)
  const mail = ours()[0] || { body: {} }
  ok('to the parent, one email per address, never to a supporter',
    mail.body.to?.length === 1 && mail.body.to[0] === address && !emails.some((e) => e.body.to?.includes(`api-gran-${RUN}@example.com`)))
  ok('from the configured sender, with replies to the support address',
    mail.body.from === 'RankUp <no-reply@rankup.example.test>' && mail.body.reply_to === 'help@example.test')
  ok('with the provider key, and an idempotency key naming the family and the reminder',
    mail.auth === 'Bearer re_test_local_only' && mail.key === `trial-three_days-${TRIAL_FAMILY}-${address}`, `${mail.key}`)
  ok(`the subject is the trial banner's words: "${mail.body.subject}"`, /^\d days? left of Elite Pass, free$/.test(mail.body.subject || ''))
  const text = mail.body.text || ''
  ok('a plain-text part, and an HTML part', text.length > 100 && /^<!doctype html>/i.test(mail.body.html || ''))
  ok('it says what they move to and that nothing is charged by itself',
    text.includes(`you are on ${TIERS.starter.name}, which is free`) && text.includes('Nothing is charged by itself'))
  ok('that their children keep what they earned', text.includes('Everything your children have earned stays exactly where it is'))
  ok('how to get help', /Need help\? Open RankUp, then Settings, Help & about, Help\. Or write to help@example\.test/.test(text))
  ok('a link to the plan on this site', text.includes(`${BASE}/#/parent/plan`) && (mail.body.html || '').includes(`${BASE}/#/parent/plan`))
  ok('and the MTRX Horizyn footer, in both parts', text.includes('RankUp is a product of MTRX Horizyn.') && (mail.body.html || '').includes('RankUp is a product of MTRX Horizyn.'))
  ok('no child is named in it, and no price', !/\$\d/.test(text) && !/Ava|kid name/.test(text))

  await run()
  ok('run again, nothing more is sent: once per family', ours().length === 1, `${ours().length} emails`)
  await Promise.all([run(), run()])
  ok('nor by two runs at once', ours().length === 1)

  // The day it ends: the second, and last, reminder.
  await db.query(`update families set trial_ends_at = date_trunc('day', now()) + interval '23 hours 59 minutes' where id = $1`, [TRIAL_FAMILY])
  const ending = await (await db.query('select trial_ends_at > now() as later from families where id = $1', [TRIAL_FAMILY])).rows[0]
  if (ending.later) {
    await run()
    const last = ours()[1]?.body || {}
    ok('on the day it ends, the last reminder goes', ours().length === 2 && last.subject === 'Last day of your free trial', last.subject)
    ok('and says so', (last.text || '').includes('ends today') && (last.text || '').includes('This is the last email about it'))
    await run()
    ok('and only once', ours().length === 2)
  } else {
    pass('(the last-day reminder is checked by 40-trial-emails.sql; it is too close to midnight UTC to try here)')
  }
}
console.log('\n=== A school\'s month, by email, after settlement ===')
{
  const SCHOOL = 'a0000000-0000-4000-8000-00000000c5c1'
  const HEAD = 'a0000000-0000-4000-8000-00000000c5a1'
  const TEACHER = 'a0000000-0000-4000-8000-00000000c5a2'
  const head = `api-school-head-${RUN}@example.com`
  const teacher = `api-school-teacher-${RUN}@example.com`
  const now = new Date()
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const monthKey = last.toISOString().slice(0, 7)
  const monthName = last.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  await db.query('delete from schools where id = $1', [SCHOOL])
  await db.query(`insert into auth.users (id, email) values ($1, $3), ($2, $4) on conflict (id) do update set email = excluded.email`,
    [HEAD, TEACHER, head, teacher])
  await db.query(`insert into schools (id, name, district, district_key, student_count, size_band, status, verified,
                    billing_status, billing_period_end)
                  values ($1, 'API Hill School', 'API Valley', 'api valley ${RUN}', 120, 'medium', 'active', true,
                    'active', now() + interval '12 days')`, [SCHOOL])
  await db.query(`insert into school_staff (user_id, school_id, name, role) values ($1, $3, 'Head', 'admin'), ($2, $3, 'Teacher', 'teacher')
                  on conflict (user_id) do update set school_id = excluded.school_id, role = excluded.role`, [HEAD, TEACHER, SCHOOL])
  // Last month, as settlement leaves it, and a payment in it.
  await db.query(`insert into school_month_scores (school_id, month_key, score, students, ranked) values ($1, $2, 12.5, 30, true)`, [SCHOOL, monthKey])
  await db.query(`insert into billing_events (school_id, stripe_event, type, payload, amount_pence, currency, received_at)
                  values ($1, $2, 'school:invoice_paid', '{}', 4900, 'USD', $3)`, [SCHOOL, `in_api_school_${RUN}`, new Date(last.getTime() + 9 * 86400000)])
  const run = () => fetch(`${BASE}/api/settle-schools`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const ours = () => emails.filter((e) => e.body.to?.includes(head))

  emailMode = 'error500'
  const down = await run()
  const downBody = await down.json().catch(() => ({}))
  ok('with the email service down, the month still closes and the job says the email failed',
    down.status === 200 && downBody.emails?.failed >= 1, JSON.stringify(downBody.emails))
  ok('and the school\'s month is not marked sent, so the next run tries again',
    (await db.query('select count(*)::int n from school_month_emails where school_id = $1', [SCHOOL])).rows[0].n === 0)

  emailMode = 'ok'
  const first = await run()
  ok('after settlement, the school\'s admin gets the month', first.status === 200 && ours().length === 1, `${first.status}, ${ours().length}`)
  const mail = ours()[0] || { body: {} }
  const text = mail.body.text || ''
  ok('to the admin only, never a teacher', mail.body.to?.length === 1 && !emails.some((e) => e.body.to?.includes(teacher)))
  ok(`the subject names the school and the month: "${mail.body.subject}"`, mail.body.subject === `API Hill School: your School League month, ${monthName}`)
  ok('the league result', text.includes(`API Hill School scored 12.5 points per student in ${monthName}, with 30 taking part: the only ranked school in API Valley this month, so no Champion there.`), text.split('\n\n')[1])
  ok('what it paid', text.includes(`In ${monthName} you paid $49.00.`))
  ok('and when it renews', /Your plan renews on \d{1,2} [A-Z][a-z]+ \d{4}\./.test(text))
  ok('a plain-text part and an HTML part', text.length > 100 && /^<!doctype html>/i.test(mail.body.html || ''))
  ok('the MTRX Horizyn footer, in both', text.includes('RankUp is a product of MTRX Horizyn.') && (mail.body.html || '').includes('RankUp is a product of MTRX Horizyn.'))
  ok('a way to the school page and to help', text.includes(`${BASE}/#/school`) && text.includes(`${BASE}/#/school/help`))
  ok('with an idempotency key naming the school and the month',
    mail.key === `school-month-${SCHOOL}-${monthKey}-${head}`, mail.key)

  await run()
  await Promise.all([run(), run()])
  ok('once per school per month, however often the job runs', ours().length === 1, `${ours().length} emails`)
  await db.query('delete from schools where id = $1', [SCHOOL])
}
console.log('\n=== The error report: one short email, and never a family in it ===')
{
  // A child with a name nobody would mistake, in the API family, and the
  // parent's email address: both put into a crash, the way an older phone
  // that did not clean its report could send them.
  const KID = 'a0000000-0000-4000-8000-00000000c0e1'
  const kidName = 'Wilhelmina'
  const parentEmail = 'api-parent@example.com'
  await db.query('delete from error_report_sends')
  await db.query(`insert into parental_consents (family_id, parent_id, version, method, signed_name)
                  select $1, id, '2026-01', 'payment_card', 'Test Parent' from parents where user_id = $2
                  on conflict do nothing`, [FAMILY, PARENT])
  await db.query(`insert into kids (id, family_id, name) values ($1, $2, $3) on conflict (id) do update set name = excluded.name`,
    [KID, FAMILY, kidName])
  const crash = await fetch(`${MOCK}/rest/v1/rpc/record_crash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${PARENT}` },
    body: JSON.stringify({ p_where: `/parent/kid/${kidName}`, p_message: `TypeError ${RUN}: ${kidName}'s streak is undefined for ${parentEmail} in ${FAMILY}`, p_stack: '', p_agent: 'test' }),
  })
  ok('(an older phone\'s crash report, with the name in it, is stored)', crash.ok, `status ${crash.status}`)
  // And a server function's error with both in its message, written as a
  // function writes one (reportError, with the service key).
  const serverError = await fetch(`${MOCK}/rest/v1/rpc/record_server_error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'service-role-key', Authorization: 'Bearer service-role-key' },
    body: JSON.stringify({ p_where: 'create-checkout', p_message: `Stripe ${RUN}: no such customer for ${parentEmail} (${kidName}), family ${FAMILY}` }),
  })
  ok('(and a server function\'s error)', serverError.ok, `status ${serverError.status}`)
  const blocked = await fetch(`${MOCK}/rest/v1/rpc/record_server_error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${PARENT}` },
    body: JSON.stringify({ p_where: 'create-checkout', p_message: 'made up' }),
  })
  ok('a parent cannot write into the server\'s error log', !blocked.ok, `status ${blocked.status}`)

  emailMode = 'ok'
  const reports = () => emails.filter((e) => e.body.to?.includes('errors@example.test'))
  const before = reports().length
  const run = () => fetch(`${BASE}/api/send-trial-emails`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const first = await (await run()).json().catch(() => ({}))
  const report = reports()[before]?.body || {}
  const text = report.text || ''
  const html = report.html || ''
  ok('the hourly email job sends one report to ERRORS_EMAIL', reports().length === before + 1 && first.error_report?.sent === 1,
    JSON.stringify(first.error_report))
  ok('listing the crash and the server error', text.includes(`TypeError ${RUN}`) && text.includes(`Stripe ${RUN}`), text.slice(0, 400))
  ok('the child\'s name is not in it, in either part', !new RegExp(kidName, 'i').test(text) && !new RegExp(kidName, 'i').test(html))
  ok('nor the parent\'s email, nor any email', !text.includes(parentEmail) && !html.includes(parentEmail) && !/[\w.+-]+@example\.com/.test(text + html))
  ok('nor the family\'s id', !text.includes(FAMILY) && !html.includes(FAMILY))
  ok('a plain-text part, an HTML part, and the MTRX Horizyn footer once in each',
    /^<!doctype html>/i.test(html) && text.split('RankUp is a product of MTRX Horizyn.').length === 2
      && html.split('RankUp is a product of MTRX Horizyn.').length === 2)
  ok('with an idempotency key, so a retried send is one email', /^errors-\d+$/.test(reports()[before]?.key || ''), reports()[before]?.key)

  await run()
  ok('run again within the hour: no second report about the same errors', reports().length === before + 1, `${reports().length - before} reports`)
  await db.query('delete from error_report_sends')
}
emailStandIn.close()

console.log('\n=== A route that does not exist is a 404, not a stack trace ===')
const missing = await fetch(`${BASE}/api/not-a-real-endpoint`, { method: 'POST' })
ok('an unknown endpoint is a plain 404', missing.status === 404, `status ${missing.status}`)

console.log('\n=== Every function in api/ was reached by this suite ===')
const functions = readdirSync(new URL('../api/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''))
for (const name of functions.sort()) {
  ok(`${name} answered (${reached.get(name) || 0} requests)`, (reached.get(name) || 0) > 0,
    'no request to it got anything but a 404: test it here, or check functions/api/[[route]].js routes it')
}

await db.end()
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
