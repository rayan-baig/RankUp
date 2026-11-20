/**
 * The deals and the Season autopilot, through the real server functions
 * (0.23.0), under workerd as Cloudflare runs them, against a stand-in Stripe
 * and email provider; Stripe's news through the real, signed webhook.
 *
 *   - /api/deals: what is on, with the Founding places left counted in the
 *     database, and never a coupon id;
 *   - Founding Families on a yearly checkout: a place held first, Stripe
 *     given the coupon from the settings (no amount), an idempotency key and
 *     a checkout that closes when the hold lapses; one place per family; the
 *     webhook confirming it, and an expired checkout giving it back;
 *   - a monthly checkout carries no deal, and a parent can still type a
 *     promotion code;
 *   - the holiday gift sale on a gift's checkout, with an idempotency key;
 *   - the Season's deal on a yearly checkout in a Season's first 14 days;
 *   - the daily job runs the Season autopilot and emails the owner's reminder
 *     once.
 *
 * The database's half: supabase/test/61-deals-and-seasons.sql.
 * Needs the Cloudflare stack up:  supabase/test/up.sh --cf
 */
import http from 'node:http'
import pg from 'pg'
import Stripe from 'stripe'

const BASE = process.env.API_BASE || 'http://localhost:8788'
const CRON = 'test-cron-secret'
const RUN = Date.now().toString(36).replace(/\d/g, (d) => 'qrstuvwxyz'[d])

const fails = []
const ok = (n, cond, d = '') => (cond ? console.log('  PASS', n) : (fails.push(n), console.log('  FAIL', n, '—', d)))

const db = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

const calls = []
const nested = (params) => {
  const out = {}
  for (const [key, value] of params) {
    const parts = key.replace(/\]/g, '').split('[')
    let at = out
    parts.forEach((p, i) => {
      if (i === parts.length - 1) at[p] = value
      else at = (at[p] = at[p] || {})
    })
  }
  return out
}
const stripeStandIn = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    const url = new URL(req.url, 'http://stripe.test')
    const params = new URLSearchParams(raw)
    calls.push({ method: req.method, path: url.pathname, body: nested(params), key: req.headers['idempotency-key'] || null })
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (url.pathname === '/v1/checkout/sessions' && req.method === 'POST') {
      return send(200, { id: `cs_deal_${calls.length}`, object: 'checkout.session', url: `https://checkout.stripe.test/${calls.length}` })
    }
    return send(404, { error: { type: 'invalid_request_error', message: 'no such route in the stand-in' } })
  })
})
await new Promise((resolve) => stripeStandIn.listen(Number(process.env.STRIPE_STANDIN_PORT || 12111), resolve))

const emails = []
const emailStandIn = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    let body = {}
    try { body = JSON.parse(raw || '{}') } catch { /* recorded as empty */ }
    emails.push({ key: req.headers['idempotency-key'], body })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id: `email_${emails.length}` }))
  })
})
await new Promise((resolve) => emailStandIn.listen(Number(process.env.EMAIL_STANDIN_PORT || 12112), resolve))

const signer = new Stripe('sk_test_routing_only')
const signed = async (event) => {
  const payload = JSON.stringify({ created: Math.floor(Date.now() / 1000), ...event })
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_local_only' })
  return fetch(`${BASE}/api/stripe-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload })
}
const checkout = (body, token) => fetch(`${BASE}/api/create-checkout`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
})
const answer = async (res) => ({ status: res.status, ...(await res.json().catch(() => ({}))) })
const deals = async () => answer(await fetch(`${BASE}/api/deals`))
const lastCheckout = () => [...calls].reverse().find((c) => c.path === '/v1/checkout/sessions')
const place = async (family) => (await db.query('select * from founding_places where family_id = $1', [family])).rows[0] || null

const ids = (n) => `d0a00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const FAMILIES = [ids(1), ids(2), ids(3)]
const PARENTS = [ids(11), ids(12), ids(13)]
const CHILD = ids(21)
await db.query('delete from families where id = any($1)', [FAMILIES])
await db.query('delete from auth.users where id = any($1)', [[...PARENTS, CHILD]])
for (let i = 0; i < 3; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  await db.query('insert into auth.users (id, email) values ($1, $2)', [PARENTS[i], `deal-${i}-${RUN}@example.com`])
  // eslint-disable-next-line no-await-in-loop
  await db.query(`insert into families (id, name, tier) values ($1, $2, 'starter')`, [FAMILIES[i], `Deal family ${i}`])
  // eslint-disable-next-line no-await-in-loop
  await db.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, 'P', 'parent')`, [PARENTS[i], FAMILIES[i]])
}
await db.query('insert into auth.users (id, email) values ($1, null)', [CHILD])
await db.query('select seed_consent($1, $2)', [FAMILIES[0], PARENTS[0]])
await db.query(`insert into kids (family_id, user_id, name) values ($1, $2, 'Deal kid')`, [FAMILIES[0], CHILD])

console.log('\n=== What is on, said honestly ===')
const before = await deals()
const res0 = await fetch(`${BASE}/api/deals`)
ok('anybody can ask (the Give page has no account), and it is kept a minute', res0.status === 200 && /max-age=60/.test(res0.headers.get('cache-control') || ''))
ok('Founding Families: the percent and the limit from the settings', before.founding?.percent === 40 && before.founding?.limit === 500, JSON.stringify(before.founding))
const taken = Number((await db.query('select founding_places_taken() as n')).rows[0].n)
ok('and the places left are the database\'s count', before.founding?.left === 500 - taken, `${before.founding?.left} vs ${500 - taken}`)
ok('with its real end date', before.founding?.ends_at?.startsWith('2099-12-31'), before.founding?.ends_at)
ok('the holiday gift sale is on, between its two days', before.gift_sale?.percent === 25, JSON.stringify(before.gift_sale))
ok('no Season has started, so no Season\'s deal', before.season === null)
ok('never a coupon id, never a family', !/rankup-test|coupon|family/.test(JSON.stringify(before)), JSON.stringify(before))

console.log('\n=== Founding Families on a yearly checkout ===')
{
  const r = await answer(await checkout({ tier: 'elite', cycle: 'month', deal: 'founding' }, PARENTS[0]))
  ok('the founding price is for the yearly plan only', r.status === 400 && r.error === 'deal_yearly_only', JSON.stringify(r))
  ok('and nothing was held or asked of Stripe', !(await place(FAMILIES[0])) && !lastCheckout())
}
{
  const r = await answer(await checkout({ tier: 'elite', cycle: 'year', deal: 'founding' }, PARENTS[0]))
  ok('a parent starts a yearly checkout at the founding price', r.status === 200 && /checkout\.stripe\.test/.test(r.url || ''), JSON.stringify(r))
  const call = lastCheckout()
  ok('Stripe is given the coupon from the settings, and no amount', call?.body.discounts?.['0']?.coupon === 'rankup-test-founding'
    && !JSON.stringify(call?.body).includes('unit_amount'), JSON.stringify(call?.body.discounts))
  ok('the yearly price, as for anyone', call?.body.line_items?.['0']?.price === 'price_test_elite_year')
  ok('no promotion code on top of it', call?.body.allow_promotion_codes === undefined)
  ok('marked as a Founding checkout for the webhook', call?.body.metadata?.founding === '1' && call?.body.subscription_data?.metadata?.family_id === FAMILIES[0])
  ok('with an idempotency key', /^checkout:/.test(call?.key || ''), call?.key)
  const closes = Number(call?.body.expires_at) - Math.floor(Date.now() / 1000)
  ok('and it closes when the held place lapses (about two hours)', closes > 7000 && closes <= 7260, String(closes))
  const held = await place(FAMILIES[0])
  ok('a place is held in the database first, for that checkout', Boolean(held && !held.confirmed_at && !held.released_at && held.session_id?.startsWith('cs_deal_')), JSON.stringify(held))
  ok('and the count says so', (await deals()).founding?.left === before.founding.left - 1)
  const key = call?.key
  await checkout({ tier: 'elite', cycle: 'year', deal: 'founding' }, PARENTS[0])
  ok('a second tap is the same checkout (the same key) and the same place', lastCheckout()?.key === key
    && (await deals()).founding?.left === before.founding.left - 1)
}
{
  const r = await answer(await checkout({ tier: 'standard', cycle: 'year', deal: 'founding' }, CHILD))
  ok('a child\'s phone cannot start one', r.status === 403, JSON.stringify(r))
}
{
  const r = await answer(await signed({
    id: `evt_deal_paid_${RUN}`, type: 'checkout.session.completed',
    data: { object: { id: (await place(FAMILIES[0])).session_id, object: 'checkout.session', mode: 'subscription', payment_status: 'paid',
                      customer: `cus_deal_${RUN}`, client_reference_id: FAMILIES[0],
                      metadata: { family_id: FAMILIES[0], tier: 'elite', cycle: 'year', founding: '1' } } },
  }))
  ok('Stripe\'s signed news confirms the place', r.status === 200 && r.founding === 'confirmed' && (await place(FAMILIES[0]))?.confirmed_at, JSON.stringify(r))
  const again = await answer(await checkout({ tier: 'elite', cycle: 'year', deal: 'founding' }, PARENTS[0]))
  ok('one place per family: a second founding checkout is refused', again.status === 409 && again.error === 'already_founding', JSON.stringify(again))
}
{
  await checkout({ tier: 'standard', cycle: 'year', deal: 'founding' }, PARENTS[1])
  const held = await place(FAMILIES[1])
  ok('another family holds a place', held && !held.confirmed_at)
  const r = await answer(await signed({
    id: `evt_deal_expired_${RUN}`, type: 'checkout.session.expired',
    data: { object: { id: held.session_id, object: 'checkout.session', client_reference_id: FAMILIES[1],
                      metadata: { family_id: FAMILIES[1], founding: '1' } } },
  }))
  ok('their checkout closes unpaid: the place goes back', r.status === 200 && (await place(FAMILIES[1]))?.released_at, JSON.stringify(r))
  ok('and the count says so', (await deals()).founding?.left === before.founding.left - 1)
}

console.log('\n=== No deal on a monthly checkout ===')
{
  await checkout({ tier: 'standard', cycle: 'month' }, PARENTS[2])
  const call = lastCheckout()
  ok('no coupon on a monthly plan', !call?.body.discounts && call?.body.metadata?.deal === undefined)
  ok('a parent can still type a promotion code there', call?.body.allow_promotion_codes === 'true')
  ok('with an idempotency key', /^checkout:/.test(call?.key || ''))
}

console.log('\n=== The holiday gift sale ===')
{
  const r = await answer(await fetch(`${BASE}/api/gift-checkout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ plan: 'elite', delivery: 'self', buyerEmail: `gran-${RUN}@example.com`, fromName: 'Gran' }),
  }))
  const call = lastCheckout()
  ok('a gift bought during the sale carries the sale\'s coupon from the settings', r.status === 200
    && call?.body.discounts?.['0']?.coupon === 'rankup-test-gift-sale', JSON.stringify({ r, d: call?.body.discounts }))
  ok('at the gift\'s own price, with no amount named', call?.body.line_items?.['0']?.price === 'price_test_gift_elite_year')
  ok('one order, one checkout: an idempotency key per order', /^gift-checkout:/.test(call?.key || ''), call?.key)
}

console.log('\n=== The Season\'s deal, in a Season\'s first 14 days ===')
{
  await db.query('delete from seasons where number = 901')
  await db.query(`insert into seasons (number, name, starts_on) values (901, 'Test Season', (now() at time zone 'utc')::date - 2)`)
  const d = await deals()
  ok('a Season that started two days ago has its deal on', d.season?.percent === 20 && d.season?.number === 901 && d.season?.on === 'yearly', JSON.stringify(d.season))
  const until = Date.parse(d.season?.until || '')
  const start = Date.parse(new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10))
  ok('ending on its fourteenth day, honestly', Math.abs(until - (start + 14 * 86400000 - 1)) < 1000, d.season?.until)
  await db.query('delete from founding_places where family_id = $1', [FAMILIES[2]])
  await checkout({ tier: 'standard', cycle: 'year' }, PARENTS[2])
  const call = lastCheckout()
  ok('a yearly checkout without Founding gets the Season\'s coupon', call?.body.discounts?.['0']?.coupon === 'rankup-test-season'
    && call?.body.metadata?.deal === 'season_901', JSON.stringify(call?.body.metadata))
  await db.query(`update seasons set starts_on = (now() at time zone 'utc')::date - 15 where number = 901`)
  ok('after 14 days it is off by itself', (await deals()).season === null)
  await db.query('delete from seasons where number = 901')
}

console.log('\n=== The daily job runs the Season autopilot ===')
{
  // Season 2 of a launch four months less a week ago starts in a week, and nothing is queued.
  await db.query('delete from season_themes where season_id in (select id from seasons where number in (1, 2))')
  await db.query('delete from seasons where number in (1, 2)')
  await db.query('delete from season_reminders')
  await db.query(`insert into season_plan (id, launch_on) values (1, ((now() at time zone 'utc')::date + 7 - interval '4 months')::date)
                  on conflict (id) do update set launch_on = excluded.launch_on`)
  const from = emails.length
  const job = () => fetch(`${BASE}/api/run-retention`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const r = await answer(await job())
  ok('the daily job makes the Seasons due, by themselves', r.status === 200 && r.seasons?.ok && r.seasons.made?.includes(2), JSON.stringify(r.seasons))
  const sent = emails.slice(from)
  ok('and emails the owner: Season 2 starts in a week with no new theme', sent.length === 1
    && /Season 2 starts/.test(sent[0].body.subject || '') && sent[0].body.to?.includes('errors@example.test'), JSON.stringify(sent.map((e) => e.body.subject)))
  ok('with an idempotency key', sent[0]?.key === 'season-reminder-2')
  await job()
  ok('once: the next day\'s run sends nothing more', emails.length === from + 1)
  await db.query('delete from season_themes where season_id in (select id from seasons where number in (1, 2))')
  await db.query('delete from seasons where number in (1, 2)')
  await db.query('delete from season_reminders')
  await db.query('delete from season_plan')
}

await db.query('delete from founding_places where family_id = any($1)', [FAMILIES])
await db.query('delete from families where id = any($1)', [FAMILIES])
await db.query('delete from auth.users where id = any($1)', [[...PARENTS, CHILD]])
await db.end()
stripeStandIn.close()
emailStandIn.close()
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
