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
// Letters only: the error-report scrubber turns any 4 digits in a row into
// "[number]", and a label with digits in it then went missing from the
// report now and then.
const RUN = Date.now().toString(36).replace(/\d/g, (d) => 'qrstuvwxyz'[d])
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
// Pausing, resuming and the half-price month: all of it in tests/keepplan.mjs.
ok('a pause with no token is refused', (await post('/api/keep-plan', { action: 'pause', months: 1 })).status === 401)
const outsiderPause = await post('/api/keep-plan', { action: 'nap' }, OUTSIDER)
ok('and a made-up action is refused before anything is asked', outsiderPause.status === 400, `status ${outsiderPause.status}`)
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
for (const job of ['run-retention', 'send-reminders', 'send-digests', 'send-trial-emails', 'settle-alliances', 'settle-schools', 'refresh-leaderboards']) {
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
// The cheapest check (no database) and the whole one (settings and jobs
// too), through the same runtime. tests/failsoft.mjs drives every case of
// both; here, that Cloudflare serves them and they keep the same split.
const live = await fetch(`${BASE}/api/healthz`)
const liveBody = await live.json()
ok('/api/healthz answers 200 with only ok and the version', live.status === 200
  && Object.keys(liveBody).sort().join(',') === 'ok,version' && liveBody.version === PACKAGE_VERSION, JSON.stringify(liveBody))
ok('and nothing in between may keep it', live.headers.get('cache-control') === 'no-store')
// Which deals are on (0.23.0): anybody may ask, and it says no coupon id.
// tests/deals.mjs drives the deals themselves.
const dealsRes = await fetch(`${BASE}/api/deals`)
const dealsBody = await dealsRes.json()
ok('/api/deals answers anybody, with the deals and no coupon id', dealsRes.status === 200 && dealsBody.ok
  && 'founding' in dealsBody && !/rankup-test-/.test(JSON.stringify(dealsBody)), JSON.stringify(dealsBody))
const readyPublic = await fetch(`${BASE}/api/ready`)
const readyBody = await readyPublic.json()
ok('/api/ready answers 200 or 503 with only ok and the version', [200, 503].includes(readyPublic.status)
  && Object.keys(readyBody).sort().join(',') === 'ok,version' && readyBody.ok === (readyPublic.status === 200), `${readyPublic.status} ${JSON.stringify(readyBody)}`)
const readyDeep = await (await fetch(`${BASE}/api/ready`, { headers: { Authorization: `Bearer ${CRON}` } })).json()
ok('with the secret it lists the jobs, and no required setting is missing here',
  Boolean(readyDeep.jobs) && Array.isArray(readyDeep.missing_settings) && readyDeep.missing_settings.length === 0, JSON.stringify(readyDeep.missing_settings))
ok('and never a setting\'s value', !JSON.stringify(readyDeep).includes(CRON) && !JSON.stringify(readyDeep).includes('service-role-key'))

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
  const METRICS = ['chores_accepted', 'families_signed_up', 'games_played', 'help_views', 'plans_cancelled', 'plans_paused',
    'plans_saved', 'rewards_bought', 'schools_signed_up']
  const days = body.daily?.days || []
  ok('the daily totals are the last 30 days, oldest first, ending today (UTC)',
    days.length === 30 && days[29]?.day === new Date().toISOString().slice(0, 10) && days[0].day < days[29].day, JSON.stringify(days.slice(-1)))
  ok('each day is a date and the nine counts, and nothing else: no id, no name, no family',
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
const stripeInvoices = new Map()
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
    // Closing a card checkout a plan by invoice makes unnecessary.
    const expire = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/)
    if (expire && req.method === 'POST') return send(200, { id: expire[1], object: 'checkout.session', status: 'expired' })
    // An invoice, by id, as the tests set it up; and refunds.
    const inv = url.pathname.match(/^\/v1\/invoices\/([^/]+)$/)
    if (inv && req.method === 'GET') {
      const held = stripeInvoices.get(inv[1])
      return held ? send(200, held) : send(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such invoice' } })
    }
    if (url.pathname === '/v1/refunds' && req.method === 'POST') return send(200, { id: `re_test_${stripeCalls.length}`, object: 'refund', status: 'succeeded' })
    if (url.pathname === '/v1/billing_portal/sessions') return send(200, { id: 'bps_test', object: 'billing_portal.session', url: 'https://billing.stripe.test/portal' })
    // A district's plan: a customer, and a subscription invoiced by email.
    if (url.pathname === '/v1/customers' && req.method === 'POST') return send(200, { id: `cus_test_${stripeCalls.length}`, object: 'customer' })
    if (url.pathname.startsWith('/v1/customers/') && req.method === 'POST' && !url.pathname.includes('balance')) {
      return send(200, { id: url.pathname.split('/')[3], object: 'customer' })
    }
    if (url.pathname === '/v1/subscriptions' && req.method === 'POST') {
      return send(200, { id: `sub_test_${stripeCalls.length}`, object: 'subscription', status: 'active' })
    }
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
    data: { object: { id: 'in_api_yearly', object: 'invoice', customer: 'cus_api_yearly', amount_paid: 7999, currency: 'usd',
      parent: { subscription_details: { metadata: { family_id: YEARLY, tier: 'standard' } } },
      lines: { data: [{ price: { id: 'price_test_elite_year' } }] } } } })
  await signed({ id: `evt_api_yearly_cs_${Date.now()}`, type: 'checkout.session.completed', created: tick(),
    data: { object: { id: 'cs_api_yearly', object: 'checkout.session', mode: 'subscription', customer: 'cus_api_yearly',
      payment_status: 'paid', metadata: { family_id: YEARLY, tier: 'standard', cycle: 'year' } } } })
  ok('invoice.paid and checkout.session.completed leave a yearly Elite family on Elite', (await billingRow(YEARLY)).tier === 'elite')
  // A price change gives the plans new Stripe price ids. A family that
  // subscribed before it stays on its old price, which is in no STRIPE_PRICE_*
  // setting any more: it keeps the plan its checkout wrote on the subscription
  // (docs/PAYMENTS.md, "Changing a price"). Both ways, so neither is the
  // plan the family happened to have already.
  await signed({ id: `evt_api_yearly_retired_std_${Date.now()}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: { ...sub('price_retired_standard_year'), metadata: { family_id: YEARLY, tier: 'standard', cycle: 'year' } } } })
  const retiredStandard = await billingRow(YEARLY)
  await signed({ id: `evt_api_yearly_retired_elite_${Date.now()}`, type: 'customer.subscription.updated', created: tick(),
    data: { object: { ...sub('price_retired_elite_year'), metadata: { family_id: YEARLY, tier: 'elite', cycle: 'year' } } } })
  const retiredElite = await billingRow(YEARLY)
  ok('a family still on a retired price keeps the plan its checkout recorded (Standard, then Elite)',
    retiredStandard.tier === 'standard' && retiredElite.tier === 'elite', JSON.stringify([retiredStandard, retiredElite]))
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
      amount: 999, amount_refunded: 999, refunded: true, currency: 'usd', created: Math.floor(Date.now() / 1000), ...over } } })
  await refund({ id: `ch_api_goodwill_${RUN}`, amount_refunded: 500, refunded: false })
  ok('a partial refund leaves the plan alone', (await billingRow(RENEW)).tier === 'elite')
  // This month's renewal has been paid; last month's is refunded in full.
  await signed({ id: `evt_api_renew_paid_${Date.now()}`, type: 'invoice.paid', created: tick(),
    data: { object: { id: `in_api_renew_this_month_${RUN}`, object: 'invoice', customer: 'cus_api_renew', amount_paid: 999, currency: 'usd',
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
    data: { object: { id: `in_api_del_late_${RUN}`, object: 'invoice', customer: late.customer, amount_paid: 999, currency: 'usd',
      parent: { subscription_details: { metadata: { family_id: late.family } } } } } })
  const counted = (await db.query('select family_id, amount_pence from billing_events where stripe_event = $1', [`invoice:in_api_del_late_${RUN}`])).rows[0]
  ok('money already taken is still counted, against no family', invoiceLate.status === 200
    && counted?.family_id === null && counted?.amount_pence === 999, `status ${invoiceLate.status} ${JSON.stringify(counted)}`)
  const refundLate = await signed({ id: `evt_api_del_late_ref_${RUN}`, type: 'charge.refunded', created: tick(),
    data: { object: { id: `ch_api_del_late_${RUN}`, object: 'charge', customer: late.customer, amount: 999, amount_refunded: 999,
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

console.log('\n=== Gifts: buying needs no account; redeeming needs a parent ===')
{
  // The whole of a gift, paid, emailed, redeemed and refunded, is walked in
  // tests/billingwalk.mjs. Here: the two endpoints' doors.
  stripeMode = 'ok'
  // Gifts started from this machine count against its hourly ten; a clean hour.
  await db.query('delete from gift_checkout_attempts')
  const gift = (body, headers = {}) => fetch(`${BASE}/api/gift-checkout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, ...headers }, body: JSON.stringify(body),
  })
  ok('the gift checkout takes POST only', (await fetch(`${BASE}/api/gift-checkout`)).status === 405)
  const bad = await gift({ plan: 'elite', delivery: 'email', buyerEmail: 'nope', toEmail: '' })
  const badBody = await bad.json().catch(() => ({}))
  ok('a form that is not filled in properly is refused before Stripe is asked, naming the fields',
    bad.status === 400 && badBody.error === 'invalid' && badBody.fields.includes('buyerEmail') && badBody.fields.includes('toEmail'),
    `${bad.status} ${JSON.stringify(badBody)}`)
  const rude = await gift({ plan: 'elite', delivery: 'self', buyerEmail: `api-gift-${RUN}@example.com`, message: 'a shit present' })
  ok('a rude word in the message is refused', rude.status === 400, `status ${rude.status}`)
  const before = stripeCalls.length
  const started = await gift({ plan: 'standard', delivery: 'self', buyerEmail: `api-gift-${RUN}@example.com`, fromName: 'Aunt Api', message: 'Enjoy!' })
  const startedBody = await started.json().catch(() => ({}))
  const call = lastCall('/v1/checkout/sessions')
  ok('with no sign-in at all, the buyer is sent to Stripe', started.status === 200 && /checkout\.stripe\.test/.test(startedBody.url || ''),
    `${started.status} ${JSON.stringify(startedBody)}`)
  ok('for one payment at the gift\'s own one-time price, not a subscription', stripeCalls.length === before + 1
    && call?.params.get('mode') === 'payment' && call?.params.get('line_items[0][price]') === 'price_test_gift_standard_year'
    && call?.params.get('customer_email') === `api-gift-${RUN}@example.com` && !call?.params.get('subscription_data[metadata][tier]'),
    call ? [...call.params].join('&') : 'no call')
  const orderId = call?.params.get('metadata[gift_order]')
  ok('marked as a gift, carrying the order and nothing about who it is for',
    call?.params.get('metadata[kind]') === 'gift' && call?.params.get('client_reference_id') === orderId
    && !call?.params.get('metadata[family_id]') && ![...call.params.values()].some((v) => /Aunt Api|Enjoy/.test(v)))
  ok('coming back to the Give page, on this site', call?.params.get('success_url') === `${BASE}/#/gift?paid=1`
    && call?.params.get('cancel_url') === `${BASE}/#/gift?cancelled=1`)
  const order = (await db.query('select o.code_hash, o.paid_at, b.email from gift_orders o join gift_buyers b on b.order_id = o.id where o.id = $1', [orderId])).rows[0]
  ok('the order is kept, and has no code until Stripe says it is paid', order && order.code_hash === null && order.paid_at === null
    && order.email === `api-gift-${RUN}@example.com`, JSON.stringify(order))
  stripeMode = 'error500'
  const down = await gift({ plan: 'elite', delivery: 'self', buyerEmail: `api-gift-${RUN}@example.com` })
  ok('Stripe down says so plainly', down.status === 503 && (await down.json()).error === 'stripe_unavailable')
  stripeMode = 'ok'

  ok('redeeming takes a sign-in', (await post('/api/redeem-gift', { code: 'ABCD-EFGH-JKMN' })).status === 401)
  ok('and a code', (await post('/api/redeem-gift', {}, PARENT)).status === 400)
  const wrong = await post('/api/redeem-gift', { code: 'ZZZZ-ZZZZ-ZZZZ' }, PARENT)
  ok('a code nobody sold is refused, by name', wrong.status === 400 && (await wrong.json()).error === 'bad_code', `status ${wrong.status}`)
  const kidPhone = (await db.query("select user_id from kids where user_id is not null limit 1")).rows[0]?.user_id
  if (kidPhone) {
    const asChild = await post('/api/redeem-gift', { code: 'ZZZZ-ZZZZ-ZZZZ' }, kidPhone)
    ok('a child\'s phone cannot redeem a gift: only a parent', asChild.status === 403, `status ${asChild.status}`)
  }
  await db.query('delete from gift_redeem_attempts where family_id = $1', [FAMILY])
  await db.query('delete from gift_orders where id = $1', [orderId])
}

console.log('\n=== A school district: its plan by invoice, and nobody else\'s ===')
{
  const OFFICE = 'a0000000-0000-4000-8000-00000000d0a1'
  const STRANGER = 'a0000000-0000-4000-8000-00000000d0a2'
  await db.query(`insert into auth.users (id, email) values ($1, 'api-district@example.com'), ($2, 'api-district-stranger@example.com')
                  on conflict do nothing`, [OFFICE, STRANGER])
  await db.query('delete from district_staff where user_id = $1', [OFFICE])
  const rpc = (fn, args, token) => fetch(`${MOCK}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  }).then((r) => r.json())
  const made = await rpc('register_district', { p_name: `API District ${RUN}`, p_your_name: 'Dr Api' }, OFFICE)
  const DISTRICT = made.district_id
  ok('a district office signs its district up through the API', made.ok === true, JSON.stringify(made))
  for (const [name, students] of [['API Oak', 420], ['API Elm', 900], ['API Ash', 500]]) {
    await rpc('add_district_school', { p_name: name, p_city: 'Apiville', p_students: students }, OFFICE)
  }

  ok('the district\'s billing takes POST only', (await fetch(`${BASE}/api/district-billing`)).status === 405)
  ok('and a sign-in', (await post('/api/district-billing', { action: 'invoice', email: 'a@b.co' })).status === 401)
  ok('and an action it knows', (await asUser('/api/district-billing', { action: 'free' }, OFFICE)).status === 400)
  const strangerTry = await asUser('/api/district-billing', { action: 'invoice', email: 'x@example.com' }, STRANGER)
  ok('a stranger cannot invoice anybody\'s district', strangerTry.status === 403 && (await strangerTry.json()).error === 'not_district_admin',
    `status ${strangerTry.status}`)
  const parentTry = await asUser('/api/district-billing', { action: 'invoice', email: 'x@example.com' }, PARENT)
  ok('nor can a parent', parentTry.status === 403)
  ok('the invoice needs an email to go to', (await asUser('/api/district-billing', { action: 'invoice', email: 'nope' }, OFFICE)).status === 400)
  ok('there is no plan to update before there is a plan', (await asUser('/api/district-billing', { action: 'update' }, OFFICE)).status === 409)
  ok('nor a portal before there is a customer', (await asUser('/api/district-billing', { action: 'portal' }, OFFICE)).status === 400)

  const before = stripeCalls.length
  const sent = await asUser('/api/district-billing', { action: 'invoice', email: 'Accounts@API-District.example' }, OFFICE)
  const sentBody = await sent.json().catch(() => ({}))
  const calls = stripeCalls.slice(before)
  const customerCall = calls.find((c) => c.path === '/v1/customers' && c.method === 'POST')
  const subCall = calls.find((c) => c.path === '/v1/subscriptions' && c.method === 'POST')
  ok('the admin asks for the invoice and Stripe is told to send it', sent.status === 200 && sentBody.sent_to === 'accounts@api-district.example',
    `${sent.status} ${JSON.stringify(sentBody)}`)
  ok('to a customer for the district alone: its name, where the invoice goes, which district',
    customerCall?.params.get('email') === 'accounts@api-district.example' && customerCall?.params.get('metadata[district_id]') === DISTRICT
    && customerCall?.params.get('name') === `API District ${RUN}` && customerCall?.idempotencyKey === `district-customer:${DISTRICT}`,
    customerCall ? [...customerCall.params].join('&') : 'no call')
  const p = (k) => subCall?.params.get(k)
  ok('a yearly plan invoiced by email, with the days to pay from the settings',
    p('collection_method') === 'send_invoice' && p('days_until_due') === '21' && p('metadata[district_id]') === DISTRICT
    && p('metadata[kind]') === 'district', subCall ? [...subCall.params].join('&') : 'no call')
  const lines = [0, 1, 2].map((i) => [p(`items[${i}][price]`), p(`items[${i}][quantity]`)])
  ok('one price per size and discount, the schools as quantities, and never an amount',
    JSON.stringify(lines) === JSON.stringify([['price_test_district_large_10', '1'], ['price_test_district_medium_10', '2'], [null, null]])
    && ![...subCall.params.keys()].some((k) => /amount|unit_amount|price_data/.test(k)), JSON.stringify(lines))
  ok('with a key, so two taps make one plan', /^district-plan:/.test(subCall?.idempotencyKey || ''))
  const customerId = (await db.query('select stripe_customer_id from districts where id = $1', [DISTRICT])).rows[0].stripe_customer_id
  ok('the customer is kept against the district, never shown to the browser',
    customerId === `cus_test_${stripeCalls.indexOf(customerCall) + 1}` && !JSON.stringify(sentBody).includes('cus_'), customerId)

  // Stripe says the plan is live: the webhook reads what it pays for.
  const live = await signed({
    id: `evt_api_district_${RUN}_1`, type: 'customer.subscription.created', created: tick(),
    data: { object: { id: `sub_api_district_${RUN}`, object: 'subscription', status: 'active', customer: customerId,
      collection_method: 'send_invoice', metadata: { district_id: DISTRICT, kind: 'district' },
      items: { data: [
        { id: 'si_api_d1', quantity: 1, price: { id: 'price_test_district_large_10' } },
        { id: 'si_api_d2', quantity: 2, price: { id: 'price_test_district_medium_10' } }] } } },
  })
  const row = (await db.query('select status, paid_bands, paid_all from districts where id = $1', [DISTRICT])).rows[0]
  ok('the webhook switches the district\'s plan on, paying for one large and two medium schools',
    live.status === 200 && row.status === 'active' && row.paid_bands.large === 1 && row.paid_bands.medium === 2 && !row.paid_all, JSON.stringify(row))
  const covered = (await db.query(`select count(*)::int n from district_schools ds where ds.district_id = $1 and district_covers(ds.school_id)`, [DISTRICT])).rows[0].n
  ok('which covers all three schools', covered === 3, String(covered))
  ok('and touches no family\'s plan', (await db.query("select count(*)::int n from families where stripe_customer_id = $1", [customerId])).rows[0].n === 0)
  const again = await asUser('/api/district-billing', { action: 'invoice', email: 'accounts@api-district.example' }, OFFICE)
  ok('a paying district is not invoiced a second time', again.status === 409, `status ${again.status}`)

  const paid = await signed({
    id: `evt_api_district_${RUN}_2`, type: 'invoice.paid', created: tick(),
    data: { object: { id: `in_api_district_${RUN}`, object: 'invoice', customer: customerId, amount_paid: 159300, currency: 'usd',
      parent: { subscription_details: { metadata: { district_id: DISTRICT } } } } },
  })
  ok('its invoice, paid, is recorded with its amount, against the district',
    paid.status === 200 && (await db.query('select amount_pence, district_id from billing_events where stripe_event = $1', [`invoice:in_api_district_${RUN}`])).rows[0]?.district_id === DISTRICT)

  // A fourth school, then "update the plan".
  await rpc('add_district_school', { p_name: 'API Pine', p_city: 'Apiville', p_students: 250 }, OFFICE)
  stripeSubs.set(`sub_api_district_${RUN}`, { id: `sub_api_district_${RUN}`, object: 'subscription', status: 'active', customer: customerId,
    items: { object: 'list', data: [
      { id: 'si_api_d1', quantity: 1, price: { id: 'price_test_district_large_10' } },
      { id: 'si_api_d2', quantity: 2, price: { id: 'price_test_district_medium_10' } }] } })
  const from = stripeCalls.length
  const updated = await asUser('/api/district-billing', { action: 'update' }, OFFICE)
  const upd = stripeCalls.slice(from).find((c) => c.method === 'POST' && c.path === `/v1/subscriptions/sub_api_district_${RUN}`)
  ok('updating the plan adds the new school to the same subscription, invoiced for the rest of the year',
    updated.status === 200 && upd?.params.get('proration_behavior') === 'always_invoice'
    && upd?.params.get('items[0][id]') === 'si_api_d1' && upd?.params.get('items[1][id]') === 'si_api_d2'
    && upd?.params.get('items[2][price]') === 'price_test_district_small_10' && upd?.params.get('items[2][quantity]') === '1',
    upd ? [...upd.params].join('&') : `status ${updated.status}`)
  const firstUpdateKey = upd?.idempotencyKey
  // Pine taken off and the plan updated, then Pine back and updated again:
  // the same plan as the first update, which Stripe must not answer from
  // its cache of that first one.
  const pine = (await db.query(`select s.id from schools s join district_schools ds on ds.school_id = s.id
                                 where ds.district_id = $1 and s.name = 'API Pine'`, [DISTRICT])).rows[0].id
  await rpc('remove_district_school', { p_school_id: pine }, OFFICE)
  await asUser('/api/district-billing', { action: 'update' }, OFFICE)
  await rpc('add_district_school', { p_name: 'API Pine', p_city: 'Apiville', p_students: 250 }, OFFICE)
  const backFrom = stripeCalls.length
  const back = await asUser('/api/district-billing', { action: 'update' }, OFFICE)
  const backUpd = stripeCalls.slice(backFrom).find((c) => c.method === 'POST' && c.path === `/v1/subscriptions/sub_api_district_${RUN}`)
  ok('A, then B, then A again: the third update is a request of its own, never the first one\'s cached answer',
    back.status === 200 && backUpd && backUpd.idempotencyKey !== firstUpdateKey, `${firstUpdateKey} then ${backUpd?.idempotencyKey}`)
  const tapFrom = stripeCalls.length
  await asUser('/api/district-billing', { action: 'update' }, OFFICE)
  const tapUpd = stripeCalls.slice(tapFrom).find((c) => c.method === 'POST' && c.path === `/v1/subscriptions/sub_api_district_${RUN}`)
  ok('while a second tap with nothing changed is the same request, so Stripe makes it once', tapUpd?.idempotencyKey === backUpd?.idempotencyKey)
  const portal = await asUser('/api/district-billing', { action: 'portal' }, OFFICE)
  ok('the admin reaches its invoices and cancelling, coming back to the district page',
    portal.status === 200 && lastCall('/v1/billing_portal/sessions')?.params.get('customer') === customerId
    && lastCall('/v1/billing_portal/sessions')?.params.get('return_url') === `${BASE}/#/district`)

  const ended = await signed({
    id: `evt_api_district_${RUN}_3`, type: 'customer.subscription.deleted', created: tick(),
    data: { object: { id: `sub_api_district_${RUN}`, object: 'subscription', status: 'canceled', customer: customerId,
      metadata: { district_id: DISTRICT }, items: { data: [] } } },
  })
  const after = (await db.query('select status from districts where id = $1', [DISTRICT])).rows[0]
  const kept = (await db.query('select count(*)::int n from district_schools where district_id = $1', [DISTRICT])).rows[0].n
  ok('when the plan ends the district lapses, and its schools are all still there, on their own',
    ended.status === 200 && after.status === 'lapsed' && kept === 4, `${after.status}, ${kept}`)
  const reFrom = stripeCalls.length
  const reinvoiced = await asUser('/api/district-billing', { action: 'invoice', email: 'accounts@api-district.example' }, OFFICE)
  const reSub = stripeCalls.slice(reFrom).find((c) => c.path === '/v1/subscriptions' && c.method === 'POST')
  ok('cancelled and invoiced again the same day: a new plan, under a key of its own',
    reinvoiced.status === 200 && reSub && reSub.idempotencyKey !== subCall?.idempotencyKey, `${subCall?.idempotencyKey} then ${reSub?.idempotencyKey}`)

  stripeMode = 'error500'
  const down = await asUser('/api/district-billing', { action: 'invoice', email: 'accounts@api-district.example' }, OFFICE)
  ok('Stripe down says so plainly', down.status === 503 && (await down.json()).error === 'stripe_unavailable')
  stripeMode = 'ok'

  await db.query('delete from schools where id in (select school_id from district_schools where district_id = $1)', [DISTRICT])
  await db.query('delete from districts where id = $1', [DISTRICT])
  await db.query('delete from auth.users where id in ($1, $2)', [OFFICE, STRANGER])
}

console.log('\n=== School pilots: codes from the operator, used once, never on top of a paid plan ===')
{
  const HEAD = 'a0000000-0000-4000-8000-00000000c6a1'
  const PAYING_HEAD = 'a0000000-0000-4000-8000-00000000c6a2'
  const OTHER_HEAD = 'a0000000-0000-4000-8000-00000000c6a3'
  const head = `api-pilot-head-${RUN}@example.com`
  await db.query(`insert into auth.users (id, email) values ($1, $4), ($2, $5), ($3, $6) on conflict (id) do update set email = excluded.email`,
    [HEAD, PAYING_HEAD, OTHER_HEAD, head, `api-pilot-paying-${RUN}@example.com`, `api-pilot-other-${RUN}@example.com`])
  await db.query('delete from school_staff where user_id in ($1, $2, $3)', [HEAD, PAYING_HEAD, OTHER_HEAD])
  await db.query('delete from school_pilot_attempts where user_id in ($1, $2, $3)', [HEAD, PAYING_HEAD, OTHER_HEAD])
  const rpc = (fn, args, token) => fetch(`${MOCK}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  }).then((r) => r.json())
  const reg = await rpc('register_school', { p_name: `Example Academy ${RUN}`, p_district: `API Pilot District ${RUN}`, p_city: 'Exampleton',
    p_students: 420, p_your_name: 'Ms Example' }, HEAD)
  const PILOT_SCHOOL = reg.school_id
  ok('a school signs up through the API, on the 30-day trial', reg.ok === true, JSON.stringify(reg))
  const paying = await rpc('register_school', { p_name: `Paying Prep ${RUN}`, p_district: `API Pilot District ${RUN}`, p_city: 'Exampleton',
    p_students: 200, p_your_name: 'Mr Paying' }, PAYING_HEAD)
  await db.query(`update schools set status = 'active', stripe_subscription_id = 'sub_api_pilot_paying', trial_ends_at = now() + interval '5 days'
                   where id = $1`, [paying.school_id])
  const other = await rpc('register_school', { p_name: `Other School ${RUN}`, p_district: `API Pilot District ${RUN}`, p_city: 'Exampleton',
    p_students: 900, p_your_name: 'Dr Other' }, OTHER_HEAD)

  ok('making a pilot code needs the operator key', (await operator(null, { action: 'create_pilot', label: 'Example Academy' })).status === 401
    && (await operator(HEAD, { action: 'create_pilot', label: 'Example Academy' })).status === 401)
  const listed0 = await (await operator('test-operator-secret')).json()
  ok('the page is told the pilot length to start at: 90 days', listed0.pilot_days === 90 && Array.isArray(listed0.pilots), JSON.stringify(listed0.pilot_days))
  const noLabel = await operator('test-operator-secret', { action: 'create_pilot', label: 'X' })
  ok('a code needs to say who it is for', noLabel.status === 400 && (await noLabel.json()).error === 'bad_label')
  ok('and a length the database allows', (await (await operator('test-operator-secret', { action: 'create_pilot', label: 'Example Academy', days: 3 })).json()).error === 'bad_days')
  const madeRes = await operator('test-operator-secret', { action: 'create_pilot', label: `Example Academy ${RUN}` })
  const madeBody = await madeRes.json()
  const code = madeBody.made?.code || ''
  ok('the operator makes a 90-day code, shown once, as XXXXX-XXXXX', madeRes.status === 200 && /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(code)
    && madeBody.made.days === 90, JSON.stringify(madeBody.made))
  const stored = (await db.query('select * from school_pilots where id = $1', [madeBody.made?.id])).rows[0]
  ok('only its hash is stored, never the code', stored && !JSON.stringify(stored).includes(code.replace('-', '')) && /^[0-9a-f]{64}$/.test(stored.code_hash))
  ok('used by a date: 60 days unless the operator says otherwise',
    Math.abs(new Date(stored.code_expires_at) - (Date.now() + 60 * 86400000)) < 120000, String(stored?.code_expires_at))
  ok('the list has it, waiting, and never the code',
    madeBody.pilots.some((p) => p.id === madeBody.made.id && p.state === 'waiting') && !JSON.stringify(madeBody.pilots).includes(code))

  ok('a paying school is told a pilot adds nothing to its plan, and the code is not spent',
    (await rpc('redeem_school_pilot', { p_code: code }, PAYING_HEAD)).reason === 'already_paying'
    && (await db.query('select redeemed_at from school_pilots where id = $1', [madeBody.made.id])).rows[0].redeemed_at === null
    && (await db.query('select status from schools where id = $1', [paying.school_id])).rows[0].status === 'active')
  const used = await rpc('redeem_school_pilot', { p_code: code.toLowerCase() }, HEAD)
  ok('the school\'s admin types it, and the trial becomes a 90-day pilot', used.ok === true && used.days === 90, JSON.stringify(used))
  const school = (await db.query('select status, trial_ends_at from schools where id = $1', [PILOT_SCHOOL])).rows[0]
  ok('ending 90 days from today', school.status === 'trial' && Math.abs(new Date(school.trial_ends_at) - (Date.now() + 90 * 86400000)) < 120000)
  ok('single use: nobody else can use it', (await rpc('redeem_school_pilot', { p_code: code }, OTHER_HEAD)).reason === 'used')
  const shortCode = await (await operator('test-operator-secret', { action: 'create_pilot', label: `Short ${RUN}`, days: 30,
    code_expires_at: new Date(Date.now() + 86400000).toISOString() })).json()
  await db.query(`update school_pilots set code_expires_at = now() - interval '1 minute' where id = $1`, [shortCode.made.id])
  ok('a code past its date no longer works', (await rpc('redeem_school_pilot', { p_code: shortCode.made.code }, OTHER_HEAD)).reason === 'expired')
  const gone = await operator('test-operator-secret', { action: 'withdraw_pilot', pilot_id: shortCode.made.id })
  ok('one nobody used can be taken back', gone.status === 200 && (await db.query('select 1 from school_pilots where id = $1', [shortCode.made.id])).rowCount === 0)
  ok('one that was used cannot', (await operator('test-operator-secret', { action: 'withdraw_pilot', pilot_id: madeBody.made.id })).status === 409)
  const after = await (await operator('test-operator-secret')).json()
  const mine = after.pilots.find((p) => p.id === madeBody.made.id)
  ok('the operator\'s list says the pilot is running, for which school, until when',
    mine?.state === 'running' && mine.school?.name === `Example Academy ${RUN}` && new Date(mine.ends_at) > new Date(Date.now() + 89 * 86400000), JSON.stringify(mine))

  console.log('\n=== The report, and houses ===')
  ok('the report is the admin\'s alone', (await rpc('school_pilot_report', {}, OUTSIDER)).reason === 'not_school_admin')
  for (const n of ['Kestrel', 'Otter']) await rpc('add_school_group', { p_name: n }, HEAD)
  const card = (await rpc('school_overview', {}, HEAD)).school
  const kestrel = card.houses.groups.find((g) => g.name === 'Kestrel')
  ok('the admin names houses, on the school\'s board', card.houses.kind === 'house' && card.houses.groups.length === 2 && card.pilot?.days === 90)
  // Seven children of one family: five in Kestrel, two in no house yet.
  // Three families (no numbers show for children of fewer), each with a
  // parent of its own; the first family's is the one this test looks through.
  const households = []
  for (let f = 1; f <= 3; f += 1) {
    const id = (await db.query(`insert into families (name, tier) values ($1, 'standard') returning id`, [`API Pilot Family ${f}`])).rows[0].id
    const user = (await db.query(`insert into auth.users (email) values ($1) returning id`, [`api-pilot-parent-${f}-${RUN}@example.com`])).rows[0].id
    await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Pilot Parent')`, [user, id])
    await db.query('select seed_consent($1, $2)', [id, user])
    households.push({ id, user })
  }
  const parentUser = households[0].user
  const joinCode = card.join_code
  const kids = []
  const parentOf = new Map()
  for (let n = 1; n <= 7; n += 1) {
    // Children 1, 4 and 7 in the first family; 2 and 5, 3 and 6 in the others.
    const home = households[(n - 1) % 3]
    const kid = (await db.query(`insert into kids (family_id, name) values ($1, $2) returning id`, [home.id, `Pilotkid${n} Secretname`])).rows[0].id
    kids.push(kid)
    parentOf.set(kid, home.user)
    await rpc('join_school', { p_kid_id: kid, p_join_code: joinCode, p_show_name: false }, home.user)
    const quest = (await db.query(`insert into quests (family_id, kid_id, title, category) values ($1, $2, 'Secret chore words', 'kitchen') returning id`, [home.id, kid])).rows[0].id
    await db.query(`insert into submissions (family_id, quest_id, kid_id, status, decided_at) values ($1, $2, $3, 'approved', now())`, [home.id, quest, kid])
  }
  for (const kid of kids.slice(0, 5)) await rpc('set_kid_school_group', { p_kid_id: kid, p_group_id: kestrel.id }, parentOf.get(kid))
  const report = await rpc('school_pilot_report', {}, HEAD)
  ok('the report: 7 taking part, all did a chore, 7 chores, 1.0 each',
    report.ok && report.kind === 'pilot' && report.totals.students === 7 && report.totals.share_pct === 100
    && report.totals.chores === 7 && Number(report.totals.average) === 1, JSON.stringify(report.totals))
  const k = report.groups.groups.find((g) => g.name === 'Kestrel')
  ok('Kestrel shows (5), and the two in no house are not a group anyone can work out: so it is hidden too',
    k && k.shown === false && !('chores' in k), JSON.stringify(report.groups))
  await rpc('set_kid_school_group', { p_kid_id: kids[5], p_group_id: kestrel.id }, parentOf.get(kids[5]))
  await rpc('set_kid_school_group', { p_kid_id: kids[6], p_group_id: kestrel.id }, parentOf.get(kids[6]))
  const report2 = await rpc('school_pilot_report', {}, HEAD)
  const k2 = report2.groups.groups.find((g) => g.name === 'Kestrel')
  const o2 = report2.groups.groups.find((g) => g.name === 'Otter')
  ok('all seven in Kestrel: its totals show, 7 chores; Otter, with none, shows nothing',
    k2.shown === true && k2.students === 7 && k2.chores === 7 && o2.shown === false, JSON.stringify(report2.groups))
  ok('ending with the price for its size', report2.price?.monthly_cents === 5900 && report2.price?.label === 'Medium school')
  ok('and nothing about any child', !/Pilotkid|Secretname|Secret chore/.test(JSON.stringify(report2)))
  const board = (await rpc('my_schools', {}, parentUser)).children[0]
  ok('the parent sees the house board and which house their child is in',
    board.group_id === kestrel.id && board.school.houses.groups.length === 2 && !/Pilotkid|Secretname/.test(JSON.stringify(board.school.houses)))

  console.log('\n=== The reminder, 14 days before a pilot ends ===')
  await db.query(`update schools set trial_ends_at = now() + interval '13 days' where id = $1`, [PILOT_SCHOOL])
  const run = () => fetch(`${BASE}/api/send-trial-emails`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const ours = () => emails.filter((e) => e.body.to?.includes(head) && /pilot/i.test(e.body.subject || ''))
  const ran = await (await run()).json()
  const reminder = ours()[0]?.body || {}
  ok('the hourly email job sends the admin one reminder', ran.pilots?.sent >= 1 && ours().length === 1, JSON.stringify(ran.pilots))
  ok('saying so, with the price and both ways to buy, and the report',
    reminder.subject === 'Your RankUp pilot ends in 13 days' && (reminder.text || '').includes('$59.00 a month, or $590.00 a year')
    && /pay by card, or ask for a yearly invoice/.test(reminder.text || '') && (reminder.text || '').includes(`${BASE}/#/school/report`), reminder.subject)
  ok('and no child in it', !/Pilotkid|Secretname/.test(JSON.stringify(reminder)))
  await run()
  ok('once per pilot', ours().length === 1)

  console.log('\n=== A school paying by invoice ===')
  // A card checkout opened first, and left in another tab.
  const cardTab = await asUser('/api/school-checkout', { cycle: 'month' }, HEAD)
  const cardSession = (await db.query('select session_id from school_checkout_sessions where school_id = $1', [PILOT_SCHOOL])).rows[0]?.session_id
  ok('(a card checkout opened and left, remembered for the school)', cardTab.status === 200 && Boolean(cardSession))
  const before = stripeCalls.length
  ok('the invoice needs an address', (await asUser('/api/school-checkout', { method: 'invoice', email: 'nope' }, HEAD)).status === 400)
  ok('and the school\'s admin', (await asUser('/api/school-checkout', { method: 'invoice', email: 'office@example.test' }, OUTSIDER)).status === 403)
  const inv = await asUser('/api/school-checkout', { method: 'invoice', email: 'Office@Example-Academy.example' }, HEAD)
  const invBody = await inv.json()
  const sub = stripeCalls.slice(before).find((c) => c.method === 'POST' && c.path === '/v1/subscriptions')
  const cust = stripeCalls.slice(before).find((c) => c.method === 'POST' && c.path === '/v1/customers')
  ok('the admin asks for a yearly invoice, and Stripe is told to send it', inv.status === 200 && invBody.sent_to === 'office@example-academy.example',
    `${inv.status} ${JSON.stringify(invBody)}`)
  ok('at the yearly price for its size, invoiced by email, for this school',
    sub?.params.get('items[0][price]') === 'price_test_school_medium_year' && sub?.params.get('collection_method') === 'send_invoice'
    && sub?.params.get('days_until_due') === '21' && sub?.params.get('metadata[school_id]') === PILOT_SCHOOL,
    sub ? [...sub.params].join('&') : 'no call')
  ok('with what is left of the pilot kept: nothing is due before it ends',
    Math.abs(Number(sub?.params.get('trial_end')) * 1000 - (Date.now() + 13 * 86400000)) < 300000)
  ok('to a customer for the school alone', cust?.params.get('metadata[school_id]') === PILOT_SCHOOL && cust?.params.get('email') === 'office@example-academy.example'
    && (await db.query('select stripe_customer_id from schools where id = $1', [PILOT_SCHOOL])).rows[0].stripe_customer_id)
  ok('the card checkout the admin opened first is closed, so it cannot make a second plan',
    stripeCalls.slice(before).some((c) => c.method === 'POST' && c.path === `/v1/checkout/sessions/${cardSession}/expire`)
    && (await db.query('select count(*)::int n from school_checkout_sessions where school_id = $1', [PILOT_SCHOOL])).rows[0].n === 0,
    cardSession)
  const firstKey = sub?.idempotencyKey

  console.log('\n=== A school paid for twice: the second plan cancelled and refunded ===')
  const schoolCustomer = (await db.query('select stripe_customer_id from schools where id = $1', [PILOT_SCHOOL])).rows[0].stripe_customer_id
  const schoolSub = (id, extra = {}) => ({ id, object: 'subscription', status: 'active', customer: schoolCustomer,
    metadata: { school_id: PILOT_SCHOOL, kind: 'school', band: 'medium', cycle: 'year' },
    items: { object: 'list', data: [{ id: `si_${id}`, price: { id: 'price_test_school_medium_year', recurring: { interval: 'year' } } }] }, ...extra })
  ok('(the plan by invoice is live)', (await signed({ id: `evt_api_inv_${RUN}_1`, type: 'customer.subscription.created', created: tick(),
    data: { object: schoolSub(`sub_api_inv_${RUN}`, { collection_method: 'send_invoice' }) } })).status === 200
    && (await db.query('select stripe_subscription_id from schools where id = $1', [PILOT_SCHOOL])).rows[0].stripe_subscription_id === `sub_api_inv_${RUN}`)
  // A card checkout from before is paid all the same.
  stripeSubs.set(`sub_api_card_${RUN}`, schoolSub(`sub_api_card_${RUN}`))
  stripeInvoices.set(`in_api_card_${RUN}`, { id: `in_api_card_${RUN}`, object: 'invoice', status: 'paid', amount_paid: 5900,
    payment_intent: `pi_api_card_${RUN}`, subscription: `sub_api_card_${RUN}` })
  const dupFrom = stripeCalls.length
  const dupRes = await signed({ id: `evt_api_card_${RUN}_1`, type: 'customer.subscription.created', created: tick(),
    data: { object: schoolSub(`sub_api_card_${RUN}`, { collection_method: 'charge_automatically', latest_invoice: `in_api_card_${RUN}` }) } })
  const dupCalls = stripeCalls.slice(dupFrom)
  ok('the second plan is not taken as the school\'s', dupRes.status === 200
    && (await db.query('select stripe_subscription_id from schools where id = $1', [PILOT_SCHOOL])).rows[0].stripe_subscription_id === `sub_api_inv_${RUN}`)
  ok('it is cancelled at once, and its payment refunded in full',
    dupCalls.some((c) => c.method === 'DELETE' && c.path === `/v1/subscriptions/sub_api_card_${RUN}`)
    && dupCalls.some((c) => c.method === 'POST' && c.path === '/v1/refunds' && c.params.get('payment_intent') === `pi_api_card_${RUN}`
                            && c.idempotencyKey === `duplicate-plan-refund:in_api_card_${RUN}`),
    dupCalls.map((c) => `${c.method} ${c.path}`).join(', '))
  ok('and the owner is told, in plain words', /already paid for, so a second plan .* was cancelled and its payment refunded in full/
    .test(JSON.stringify(emails.filter((e) => e.body.to?.includes('errors@example.test')).map((e) => e.body.text)))
    || (await db.query(`select count(*)::int n from server_errors where message like '%second plan%'`)).rows[0].n > 0)
  const refundNews = await signed({ id: `evt_api_card_${RUN}_2`, type: 'charge.refunded', created: tick(),
    data: { object: { id: `ch_api_card_${RUN}`, object: 'charge', customer: schoolCustomer, amount: 5900, amount_refunded: 5900,
      refunded: true, payment_intent: `pi_api_card_${RUN}`, metadata: { school_id: PILOT_SCHOOL } } } })
  ok('that refund\'s news is not the school\'s own plan refunded: it stays paid for',
    refundNews.status === 200 && (await db.query('select status from schools where id = $1', [PILOT_SCHOOL])).rows[0].status === 'active')

  // Cancelled, then invoiced again the same day: a new plan, not Stripe's cached answer.
  await signed({ id: `evt_api_inv_${RUN}_2`, type: 'customer.subscription.deleted', created: tick(),
    data: { object: schoolSub(`sub_api_inv_${RUN}`, { status: 'canceled', collection_method: 'send_invoice' }) } })
  const againFrom = stripeCalls.length
  const again = await asUser('/api/school-checkout', { method: 'invoice', email: 'office@example-academy.example' }, HEAD)
  const againSub = stripeCalls.slice(againFrom).find((c) => c.method === 'POST' && c.path === '/v1/subscriptions')
  ok('a plan cancelled and invoiced again the same day is a new request to Stripe, with a key of its own',
    again.status === 200 && againSub && againSub.idempotencyKey !== firstKey && /^school-invoice:/.test(againSub.idempotencyKey || ''),
    `${firstKey} then ${againSub?.idempotencyKey}`)

  await db.query('delete from families where id = any($1)', [households.map((h) => h.id)])
  await db.query('delete from auth.users where id = any($1)', [households.map((h) => h.user)])
  await db.query('delete from schools where id in ($1, $2, $3)', [PILOT_SCHOOL, paying.school_id, other.school_id])
  await db.query('delete from school_pilots where label like $1', [`%${RUN}`])
  await db.query('delete from auth.users where id in ($1, $2, $3, $4)', [HEAD, PAYING_HEAD, OTHER_HEAD, parentUser])
}

console.log('\n=== "Request a pilot": to the owner by email, and rate limited ===')
{
  await db.query(`delete from district_quote_attempts where kind = 'pilot'`)
  const ask = (body) => fetch(`${BASE}/api/pilot-request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(body),
  })
  ok('the pilot form takes POST only', (await fetch(`${BASE}/api/pilot-request`)).status === 405)
  const bad = await ask({ school: '', email: 'nope' })
  const badBody = await bad.json().catch(() => ({}))
  ok('a form not filled in is refused, naming the fields, and nothing is sent',
    bad.status === 400 && ['school', 'name', 'email'].every((f) => badBody.fields?.includes(f)), JSON.stringify(badBody))
  const before = emails.length
  const form = { school: `Example Academy ${RUN}`, name: 'Ms Example', role: 'Head of school', email: `head-${RUN}@example-academy.example`,
    town: 'Exampleton', students: 640, message: 'We use houses & want <a semester>.' }
  const sent = await ask(form)
  const mail = emails[before]
  ok('a request goes to the owner\'s sales address, with no sign-in at all', sent.status === 200 && emails.length === before + 1
    && mail.body.to?.[0] === 'sales@example.test', `status ${sent.status}, ${emails.length - before} emails`)
  ok('replying goes to the person who asked', mail?.body.reply_to === `head-${RUN}@example-academy.example`)
  ok('it says what they asked for', /Example Academy/.test(mail?.body.subject || '') && mail?.body.text.includes('640')
    && mail?.body.text.includes('want <a semester>') && !mail?.body.html.includes('<a semester>'))
  ok('with a key, so a retry is never a second email', /^pilot-request:\d+$/.test(mail?.key || ''), mail?.key)
  ok('and nothing they typed is stored: only a mark that a request was made',
    (await db.query(`select count(*)::int n from district_quote_attempts where kind = 'pilot'`)).rows[0].n === 1
    && !JSON.stringify((await db.query('select * from district_quote_attempts')).rows).includes('example-academy'))
  await ask(form)
  await ask(form)
  const fourth = await ask(form)
  ok('three an hour from one place, then wait', fourth.status === 429 && (await fourth.json()).error === 'too_many_requests', `status ${fourth.status}`)
  ok('and the fourth sent nothing', emails.length === before + 3)
  await db.query(`delete from district_quote_attempts where kind = 'pilot'`)
}

console.log('\n=== "Get a quote": to the owner by email, and rate limited ===')
{
  await db.query('delete from district_quote_attempts')
  const quote = (body) => fetch(`${BASE}/api/district-quote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(body),
  })
  ok('the quote form takes POST only', (await fetch(`${BASE}/api/district-quote`)).status === 405)
  const bad = await quote({ district: '', email: 'nope', schools: 'lots' })
  const badBody = await bad.json().catch(() => ({}))
  ok('a form not filled in is refused, naming the fields, and nothing is sent',
    bad.status === 400 && ['district', 'name', 'email', 'schools'].every((f) => badBody.fields?.includes(f)), JSON.stringify(badBody))
  const before = emails.length
  const form = { district: `Big Plains ${RUN}`, name: 'Dr Plains', role: 'Superintendent', email: `plains-${RUN}@district.example`,
    schools: 140, students: 52000, message: 'We need a quote & a PO <soon>.' }
  const sent = await quote(form)
  const mail = emails[before]
  ok('a request goes to the owner\'s sales address, with no sign-in at all', sent.status === 200 && emails.length === before + 1
    && mail.body.to?.[0] === 'sales@example.test', `status ${sent.status}, ${emails.length - before} emails`)
  ok('replying goes to the person who asked', mail?.body.reply_to === `plains-${RUN}@district.example`)
  ok('it says what they asked for', /Big Plains/.test(mail?.body.subject || '') && /140 schools/.test(mail?.body.subject || '')
    && mail?.body.text.includes('52,000') && mail?.body.text.includes('a PO <soon>') && !mail?.body.html.includes('<soon>'))
  ok('with a key, so a retry is never a second email', /^district-quote:\d+$/.test(mail?.key || ''), mail?.key)
  ok('and nothing they typed is stored: only a mark that a request was made',
    (await db.query('select count(*)::int n from district_quote_attempts')).rows[0].n === 1
    && !JSON.stringify((await db.query('select * from district_quote_attempts')).rows).includes('plains'))
  await quote(form)
  await quote(form)
  const fourth = await quote(form)
  ok('three an hour from one place, then wait', fourth.status === 429 && (await fourth.json()).error === 'too_many_quotes', `status ${fourth.status}`)
  ok('and the fourth sent nothing', emails.length === before + 3)
  await db.query('delete from district_quote_attempts')
  emailMode = 'error500'
  const failed = await quote(form)
  ok('the email service down says the request was not sent', failed.status === 502 && (await failed.json()).error === 'not_sent')
  emailMode = 'ok'
  await db.query('delete from district_quote_attempts')
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

console.log('\n=== Theme Genesis: only the operator sees the themes sent for a Season ===')
{
  // A child's finished theme, sent by their parent through the same function
  // the app calls, as that parent.
  const KID = 'a0000000-0000-4000-8000-00000000c0e2'
  const THEME = 'a0000000-0000-4000-8000-00000000c0e3'
  const kidName = 'Ottoline'
  await db.query(`insert into parental_consents (family_id, parent_id, version, method, signed_name)
                  select $1, id, '2026-01', 'payment_card', 'Test Parent' from parents where user_id = $2
                  on conflict do nothing`, [FAMILY, PARENT])
  await db.query(`insert into kids (id, family_id, name) values ($1, $2, $3) on conflict (id) do nothing`, [KID, FAMILY, kidName])
  await db.query('delete from theme_submissions where kid_id = $1', [KID])
  await db.query('delete from kid_themes where kid_id = $1', [KID])
  await db.query(`insert into kid_themes (id, family_id, kid_id, name, design, status) values ($1, $2, $3, $4, $5, 'ready')`, [THEME, FAMILY, KID,
    `Api Reef ${RUN}`.slice(0, 24), JSON.stringify({ v: 1, vibe: 'ocean', base: 'aura', bg: '#052a3a', a: '#3ee0d0', a2: '#ffb3c1',
      pat: 'waves', mascot: '🐬', cur: 'Pearls', worlds: ['Coral Reef', 'Kelp Forest', 'Shipwreck Bay', 'The Deep'] })])
  const sent = await fetch(`${MOCK}/rest/v1/rpc/submit_kid_theme`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${PARENT}` },
    body: JSON.stringify({ p_theme_id: THEME, p_credit: 'Otto' }),
  })
  ok('a parent sends their child\'s theme to RankUp', (await sent.json())?.ok === true)

  const themes = (key, body) => fetch(`${BASE}/api/operator-themes`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  ok('nobody without the operator key sees the inbox', (await themes(null)).status === 401)
  ok('not with the scheduler’s key, nor a parent’s sign-in', (await themes(CRON)).status === 401 && (await themes(PARENT)).status === 401)
  ok('and nothing can be picked without it', (await themes(null, { action: 'decline', submission_id: THEME })).status === 401)
  const inbox = await (await themes('test-operator-secret')).json()
  const mine = (inbox.submissions || []).find((x) => x.name === `Api Reef ${RUN}`.slice(0, 24))
  ok('the operator sees it, with its credit line and month', Boolean(mine) && mine.credit === 'Otto' && /^\d{4}-\d{2}$/.test(mine.month))
  ok('and nothing that leads to the family or the child',
    !JSON.stringify(inbox).includes(FAMILY) && !JSON.stringify(inbox).includes(KID) && !JSON.stringify(inbox).includes(kidName)
      && !/family_id|kid_id|user_id|email/.test(JSON.stringify(inbox)))

  const number = 500 + Math.floor(Math.random() * 400)
  await db.query('delete from seasons where number = $1', [number])
  const start = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
  const made = await themes('test-operator-secret', { action: 'season', number, name: `Api Season ${RUN}`.slice(0, 40), starts_on: start })
  const madeBody = await made.json()
  const season = (madeBody.seasons || []).find((x) => x.number === number)
  ok('the operator makes the next Season', made.status === 200 && Boolean(season) && !season.live, JSON.stringify(madeBody).slice(0, 200))
  ok('a Season with a number already taken is refused, and says why',
    (await themes('test-operator-secret', { action: 'season', number, name: 'Again', starts_on: start })).status === 409)
  const picked = await themes('test-operator-secret', { action: 'pick', submission_id: mine?.id, season_id: season?.id })
  ok('and picks the theme for it', picked.status === 200
    && (await db.query('select picked_season from kid_themes where id = $1', [THEME])).rows[0]?.picked_season === number)
  const declineAfter = await themes('test-operator-secret', { action: 'decline', submission_id: mine?.id })
  ok('a picked theme cannot then be declined', declineAfter.status === 409 && (await declineAfter.json()).error === 'already_picked')
  ok('an action it does not know is refused', (await themes('test-operator-secret', { action: 'publish', submission_id: mine?.id })).status === 400)
  const removed = await themes('test-operator-secret', { action: 'remove', submission_id: mine?.id })
  ok('and "Remove" takes it out of the inbox and the Season', removed.status === 200
    && (await db.query('select count(*)::int n from season_themes where season_id = $1', [season?.id])).rows[0].n === 0)
  await db.query('delete from seasons where number = $1', [number])
  await db.query('delete from kid_themes where kid_id = $1', [KID])
}

console.log('\n=== The leaderboards: the job ranks, and a child not in Arena is on no public board ===')
{
  // Two children with chores accepted: one a parent put in Arena, one left
  // in Adventure (where every child starts). Through the real job and the
  // database's API, as a phone would ask.
  const LP = 'a0000000-0000-4000-8000-00000000b101'
  const LF = 'a0000000-0000-4000-8000-00000000b10f'
  const ARENA_DEVICE = 'a0000000-0000-4000-8000-00000000b1a1'
  const QUIET_DEVICE = 'a0000000-0000-4000-8000-00000000b1a2'
  const ARENA = 'a0000000-0000-4000-8000-00000000b1c1'
  const QUIET = 'a0000000-0000-4000-8000-00000000b1c2'
  await db.query(`insert into auth.users (id, email) values ($1, 'api-boards@example.com'), ($2, null), ($3, null) on conflict do nothing`,
    [LP, ARENA_DEVICE, QUIET_DEVICE])
  await db.query(`insert into families (id, name, tier) values ($1, 'API Boards family', 'standard') on conflict do nothing`, [LF])
  await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'API Boards parent') on conflict do nothing`, [LP, LF])
  await db.query('select seed_consent($1, $2)', [LF, LP])
  await db.query(`insert into kids (id, family_id, user_id, name) values ($1, $3, $4, 'Wilhelmina Arena'), ($2, $3, $5, 'Ottoline Quiet')
                    on conflict do nothing`, [ARENA, QUIET, LF, ARENA_DEVICE, QUIET_DEVICE])
  for (const kid of [ARENA, QUIET]) {
    const q = await db.query(`insert into quests (family_id, kid_id, title, xp) values ($1, $2, 'API chore', 30) returning id`, [LF, kid])
    await db.query(`insert into submissions (family_id, quest_id, kid_id, status, decided_at, awarded_xp, base_xp)
                    select $1, $2, $3, 'approved', now() - make_interval(mins => g), 30, 30 from generate_series(1, 3) g`, [LF, q.rows[0].id, kid])
  }
  const rpc = (fn, args, token) => fetch(`${MOCK}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  }).then((r) => r.json())

  const kidTriesArena = await rpc('set_leaderboard_mode', { p_kid_id: ARENA, p_mode: 'arena' }, ARENA_DEVICE)
  ok('a child cannot put themselves in Arena', kidTriesArena.reason === 'parent_only', JSON.stringify(kidTriesArena))
  ok('a parent can', (await rpc('set_leaderboard_mode', { p_kid_id: ARENA, p_mode: 'arena' }, LP)).mode === 'arena')
  await rpc('set_leaderboard_country', { p_country: 'IE' }, LP)
  const job = await fetch(`${BASE}/api/refresh-leaderboards`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const ran = await job.json()
  ok('the job ranks the boards', job.status === 200 && ran.ok === true && ran.ranked > 0, JSON.stringify(ran))
  ok('and records its run for /api/health', (await db.query("select ok_count from job_runs where job = 'refresh-leaderboards'")).rows[0]?.ok_count > 0)

  const seen = await rpc('leaderboard_board', { p_kid_id: ARENA, p_board: 'chores', p_period: 'all', p_scope: 'world', p_game: '' }, ARENA_DEVICE)
  const text = JSON.stringify(seen)
  const quietNick = (await db.query('select nickname from leaderboard_profiles where kid_id = $1', [QUIET])).rows[0]?.nickname
  ok('the Arena child sees the worldwide board, with their own place', seen.ok && seen.me?.rank >= 1, text.slice(0, 200))
  ok('the Adventure child is nowhere on it, by name or by nickname',
    !text.includes('Ottoline') && !text.includes('Quiet') && (!quietNick || !text.includes(quietNick)))
  ok('nor anyone\'s real name', !text.includes('Wilhelmina'))
  ok('in the stored ranking, not one row is the Adventure child\'s',
    (await db.query('select count(*)::int n from leaderboard_ranks where kid_id = $1', [QUIET])).rows[0].n === 0)
  const asked = await rpc('leaderboard_board', { p_kid_id: QUIET, p_board: 'chores', p_period: 'all', p_scope: 'world', p_game: '' }, QUIET_DEVICE)
  ok('and the Adventure child is shown no public board', asked.reason === 'adventure', JSON.stringify(asked))
  const stranger = await fetch(`${MOCK}/rest/v1/rpc/leaderboard_board`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${OUTSIDER}` },
    body: JSON.stringify({ p_kid_id: ARENA, p_board: 'chores', p_period: 'all', p_scope: 'world', p_game: '' }),
  })
  ok('another family cannot open a board as this child', !stranger.ok, `status ${stranger.status}`)
  const job2 = await fetch(`${BASE}/api/refresh-leaderboards`, { method: 'POST' })
  ok('the job refuses a caller with no secret', job2.status === 401 || job2.status === 403, `status ${job2.status}`)

  ok('back to Adventure, by the child themselves', (await rpc('set_leaderboard_mode', { p_kid_id: ARENA, p_mode: 'adventure' }, ARENA_DEVICE)).mode === 'adventure')
  ok('takes them off at once', (await db.query('select count(*)::int n from leaderboard_ranks where kid_id = $1', [ARENA])).rows[0].n === 0)
  await db.query('delete from families where id = $1', [LF])
  await db.query('delete from auth.users where id in ($1, $2, $3)', [LP, ARENA_DEVICE, QUIET_DEVICE])
}

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
