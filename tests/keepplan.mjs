/**
 * Pause instead of cancel, the half-price month, cancelling, and the move to
 * Elite or to yearly billing, through the real server functions.
 *
 * /api/keep-plan and /api/billing-portal run under workerd, as Cloudflare
 * runs them, against a stand-in Stripe on :12111 that holds the family's
 * subscription and records every call; Stripe's news comes back through
 * the real, signed webhook; the reminder email through the real job, to a
 * stand-in email provider on :12112. After each step: what Stripe was
 * asked, what the database holds, what the plan screen is told
 * (billing_status, billingNotice), what the child's phone works out from
 * its sync (effectiveTier), and the owner's console counts.
 *
 *   - pause for 2 months: Stripe's pause_collection ("void", resuming on
 *     the date), the plan counted as the free level, nothing deleted;
 *     paused twice, refused; Stripe failing, undone
 *   - resume early, and billing starting again on the date by itself
 *   - the half-price month: once, ever; Stripe failing gives it back
 *   - cancelling still works, paused or not: Stripe's own cancel page
 *   - Elite and yearly on Stripe's confirm page, at the plan list's prices
 *   - a child's phone and a supporter can do none of it
 *   - the reminder three days before billing starts again, once
 *
 * The database's half on its own: supabase/test/57-pauses.sql.
 *
 * Needs the Cloudflare stack up:  supabase/test/up.sh --cf
 */
import http from 'node:http'
import pg from 'pg'
import Stripe from 'stripe'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = globalThis.window || { location: { search: '', hash: '' }, addEventListener() {}, removeEventListener() {} }

const { effectiveTier, pausedUntilOf } = await import('../src/state/reducer.js')
const { billingNotice, billingError, keepOffers } = await import('../src/lib/billing.js')
const { TIERS } = await import('../src/state/initialState.js')

const BASE = process.env.API_BASE || 'http://localhost:8788'
const MOCK = process.env.MOCK_URL || 'http://localhost:54321'
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

/* ------------------------------------------------------------------ */
/* Stand-ins: Stripe, holding subscriptions, and the email provider     */
/* ------------------------------------------------------------------ */

const calls = []
const subs = new Map()
let stripeMode = 'ok'
// Nested form fields ("a[b][c]=v") as one object, the way Stripe reads them.
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
    if (stripeMode === 'drop') { req.socket.destroy(); return }
    const url = new URL(req.url, 'http://stripe.test')
    const params = new URLSearchParams(raw)
    calls.push({ method: req.method, path: url.pathname, params, body: nested(params), key: req.headers['idempotency-key'] || null })
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (stripeMode === 'error500') return send(500, { error: { type: 'api_error', message: 'Stripe is having a bad day' } })
    if (url.pathname === '/v1/billing_portal/sessions') return send(200, { id: 'bps_kp', object: 'billing_portal.session', url: 'https://billing.stripe.test/keep' })
    const sub = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)$/)
    if (sub) {
      const held = subs.get(sub[1])
      if (!held) return send(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such subscription' } })
      if (req.method === 'GET') return send(200, held)
      if (stripeMode === 'fail-updates') return send(500, { error: { type: 'api_error', message: 'could not update' } })
      if (params.has('pause_collection')) held.pause_collection = null
      if (params.has('pause_collection[behavior]')) {
        held.pause_collection = { behavior: params.get('pause_collection[behavior]'), resumes_at: Number(params.get('pause_collection[resumes_at]')) }
      }
      const discounts = Object.values(nested(params).discounts || {})
      if (discounts.length) held.discounts = discounts.map((d) => d.discount || `di_${d.coupon}`)
      return send(200, held)
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

const lastCall = (path, method = 'POST') => [...calls].reverse().find((c) => c.path === path && c.method === method)
const callsTo = (from, path) => calls.slice(from).filter((c) => c.path === path && c.method === 'POST')

const signer = new Stripe('sk_test_routing_only')
let clock = Math.floor(Date.now() / 1000) + 30
const signed = async (event) => {
  clock += 10
  const payload = JSON.stringify({ created: clock, ...event })
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_local_only' })
  return fetch(`${BASE}/api/stripe-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload })
}
const keep = (body, token) => fetch(`${BASE}/api/keep-plan`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
})
const portal = (body, token) => fetch(`${BASE}/api/billing-portal`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE, Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
})
const answer = async (res) => ({ status: res.status, ...(await res.json().catch(() => ({}))) })
const billingAs = async (token) => (await fetch(`${MOCK}/rest/v1/rpc/billing_status`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${token}` }, body: '{}',
})).json()
const today = async (metric) => Number((await db.query(
  `select coalesce(sum(n), 0) as n from usage_daily where day = (now() at time zone 'utc')::date and metric = $1`, [metric])).rows[0].n)
const row = async (id) => (await db.query(
  `select tier, subscription_status, paused_until, save_offer_used_at, billing_cycle, subscription_ends_at, effective_tier(id) as effective
     from families where id = $1`, [id])).rows[0]
// What the child's phone works out from the family row it is synced.
const childSees = async (id) => {
  const f = (await db.query('select * from families where id = $1', [id])).rows[0]
  return effectiveTier({ tier: f.tier, pausedUntil: pausedUntilOf(f.paused_until?.toISOString?.() || f.paused_until) })
}

/* ------------------------------------------------------------------ */
/* A family paying for Standard, monthly, with a child and a supporter */
/* ------------------------------------------------------------------ */

const ids = (n) => `c0a00000-0000-4000-8000-${String(n).padStart(12, '0')}`
const FAMILY = ids(1)
const PARENT = ids(2)
const GRAN = ids(3)
const CHILD = ids(4)
const KID = ids(5)
const YEARLY = ids(6)
const YEARLY_PARENT = ids(7)
const SUB = `sub_kp_${RUN}`
const YEARLY_SUB = `sub_kp_year_${RUN}`
const ADDRESS = `kp-parent-${RUN}@example.com`

await db.query('delete from families where id in ($1, $2)', [FAMILY, YEARLY])
await db.query('delete from auth.users where id in ($1, $2, $3, $4)', [PARENT, GRAN, CHILD, YEARLY_PARENT])
await db.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, null), ($6, $7)`,
  [PARENT, ADDRESS, GRAN, `kp-gran-${RUN}@example.com`, CHILD, YEARLY_PARENT, `kp-yearly-${RUN}@example.com`])
await db.query(`insert into families (id, name, tier, subscription_status, stripe_customer_id, stripe_subscription_id, billing_cycle, billing_event_at, timezone)
                values ($1, 'Keep Plan Family', 'standard', 'active', $2, $3, 'month', now() - interval '1 day', 'UTC'),
                       ($4, 'Keep Plan Yearly', 'standard', 'active', $5, $6, 'year', now() - interval '1 day', 'UTC')`,
  [FAMILY, `cus_kp_${RUN}`, SUB, YEARLY, `cus_kp_year_${RUN}`, YEARLY_SUB])
await db.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, 'KP Parent', 'parent'), ($3, $2, 'KP Gran', 'supporter'),
                ($4, $5, 'KP Yearly', 'parent')`, [PARENT, FAMILY, GRAN, YEARLY_PARENT, YEARLY])
await db.query('select seed_consent($1, $2)', [FAMILY, PARENT])
await db.query(`insert into kids (id, family_id, user_id, name, xp, coins, skins) values ($1, $2, $3, 'KP Kid', 640, 85, '["tide"]')`, [KID, FAMILY, CHILD])
const item = (price, interval) => ({ object: 'list', data: [{ id: `si_${price}`, price: { id: price, recurring: { interval } } }] })
subs.set(SUB, { id: SUB, object: 'subscription', status: 'active', customer: `cus_kp_${RUN}`, metadata: { family_id: FAMILY, tier: 'standard' },
  items: item('price_test_standard_only', 'month'), pause_collection: null, discounts: ['di_alliance_prize'] })
subs.set(YEARLY_SUB, { id: YEARLY_SUB, object: 'subscription', status: 'active', customer: `cus_kp_year_${RUN}`, metadata: { family_id: YEARLY, tier: 'standard' },
  items: item('price_test_standard_year', 'year'), pause_collection: null, discounts: [] })
const subEvent = (id, extra = {}) => ({
  id: `evt_kp_${id}_${RUN}`, type: 'customer.subscription.updated',
  data: { object: { ...subs.get(SUB), ...extra } },
})

console.log('\n=== Only a parent of the family, signed in ===')
ok('no sign-in: refused', (await keep({ action: 'pause', months: 1 })).status === 401)
ok('a child\'s own phone: refused, and told nothing about the plan', (await answer(await keep({ action: 'pause', months: 1 }, CHILD))).error === 'no_family'
  && (await billingAs(CHILD)).ok === false)
ok('a supporter (a grandparent looking in): refused', (await answer(await keep({ action: 'save' }, GRAN))).error === 'no_family')
for (const months of [0, 4, 'two', null]) {
  // eslint-disable-next-line no-await-in-loop
  ok(`a pause of ${JSON.stringify(months)} months: refused`, (await answer(await keep({ action: 'pause', months }, PARENT))).error === 'bad_months')
}
ok('nobody was paused by any of that', !(await row(FAMILY)).paused_until && calls.length === 0, String(calls.length))

console.log('\n=== Pause for 2 months ===')
{
  const pausedBefore = await today('plans_paused')
  ok('(Standard before the pause, on the plan screen\'s offers too)', (await row(FAMILY)).effective === 'standard'
    && keepOffers(await billingAs(PARENT)).pause && keepOffers(await billingAs(PARENT)).save)
  const from = calls.length
  const r = await answer(await keep({ action: 'pause', months: 2 }, PARENT))
  ok('the parent pauses for two months', r.status === 200 && r.ok && r.months === 2, JSON.stringify(r))
  const update = callsTo(from, `/v1/subscriptions/${SUB}`)[0]
  const resumes = Number(update?.params.get('pause_collection[resumes_at]'))
  const twoMonths = new Date(); twoMonths.setMonth(twoMonths.getMonth() + 2)
  ok('Stripe is told: stop collecting, void what falls inside, start again on the date',
    update?.params.get('pause_collection[behavior]') === 'void' && Math.abs(resumes * 1000 - twoMonths.getTime()) < 5 * 60000,
    update ? [...update.params].join('&') : 'no update')
  ok('with an idempotency key naming the pause', /^rankup-pause-\d+$/.test(update?.key || ''), update?.key)
  const f = await row(FAMILY)
  ok('the database says until when, the same date', f.paused_until && Math.abs(f.paused_until.getTime() - resumes * 1000) < 2000)
  ok('while paused, the family has the free level\'s features', f.effective === 'starter')
  ok('and the child\'s phone works out the same from its sync', (await childSees(FAMILY)) === 'starter')
  ok('but what they pay for is untouched, and so is everything the child has',
    f.tier === 'standard' && (await db.query('select xp, coins, skins from kids where id = $1', [KID])).rows[0].coins === 85
    && (await db.query('select xp from kids where id = $1', [KID])).rows[0].xp === 640)
  const status = await billingAs(PARENT)
  const notice = billingNotice(status)
  ok('the plan screen is told when billing starts again', Boolean(status.paused_until), JSON.stringify(status))
  ok(`and says so in words: "${notice?.title}"`, notice?.title === 'Your plan is paused' && /starts again by itself on/.test(notice.body)
    && /Nothing your kids have earned has been touched/.test(notice.body))
  ok('nothing more is offered on the way to cancelling while paused (cancelling still is)', !keepOffers(status).pause && !keepOffers(status).save)
  ok('the pause is confirmed, and counted once for the owner\'s console',
    (await db.query('select count(*)::int n from plan_pauses where family_id = $1 and confirmed_at is not null and ended_at is null', [FAMILY])).rows[0].n === 1
    && (await today('plans_paused')) === pausedBefore + 1)

  const again = await answer(await keep({ action: 'pause', months: 1 }, PARENT))
  ok('pausing again while paused: refused, in words', again.status === 409 && again.error === 'already_paused' && billingError(again.error) === 'Your plan is already paused.')
  const save = await answer(await keep({ action: 'save' }, PARENT))
  ok('the half-price month while paused: refused (nothing is charged to take half off)', save.status === 409 && save.error === 'paused')

  // Stripe's own news of the pause, through the signed webhook, twice.
  for (let i = 0; i < 2; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await signed(subEvent(`paused_${i}`))
    ok(`Stripe's "updated, paused" is accepted (${i ? 'again' : 'once'})`, res.status === 200)
  }
  ok('and makes no second pause or count', (await db.query('select count(*)::int n from plan_pauses where family_id = $1', [FAMILY])).rows[0].n === 1
    && (await today('plans_paused')) === pausedBefore + 1 && (await row(FAMILY)).effective === 'starter')
}

console.log('\n=== The reminder, three days before billing starts again ===')
{
  // Billing starts again in two and a half days, as Stripe's news would leave it.
  const soon = new Date(Date.now() + 60 * 3600000)
  await db.query('update plan_pauses set resumes_at = $2 where family_id = $1 and ended_at is null', [FAMILY, soon])
  await db.query('update families set paused_until = $2 where id = $1', [FAMILY, soon])
  const run = () => fetch(`${BASE}/api/send-trial-emails`, { method: 'POST', headers: { Authorization: `Bearer ${CRON}` } })
  const ours = () => emails.filter((e) => e.body.to?.includes(ADDRESS))
  const first = await answer(await run())
  const mail = ours()[0]?.body || {}
  ok('the hourly email job sends it', first.status === 200 && ours().length === 1 && first.pauses?.sent >= 1, JSON.stringify(first.pauses))
  ok(`with the day in the subject: "${mail.subject}"`, /^Your RankUp plan starts again on [A-Z][a-z]+ \d{1,2} [A-Z][a-z]+$/.test(mail.subject || ''))
  ok('what is charged then, at the plan list\'s price, and that nothing was lost',
    (mail.text || '').includes(`$${TIERS.standard.price.toFixed(2)} a month`) && /coins and items are all still there/.test(mail.text || ''))
  ok('to the parent only, never the supporter', !emails.some((e) => e.body.to?.includes(`kp-gran-${RUN}@example.com`)))
  ok('with an idempotency key naming the pause', /^pause-\d+-/.test(ours()[0]?.key || ''), ours()[0]?.key)
  await run()
  await Promise.all([run(), run()])
  ok('once: not again on the next run, nor two at once', ours().length === 1, `${ours().length} emails`)
}

console.log('\n=== Resume early ===')
{
  const from = calls.length
  const r = await answer(await keep({ action: 'resume' }, PARENT))
  ok('the parent starts it again now', r.status === 200 && r.resumed, JSON.stringify(r))
  const update = callsTo(from, `/v1/subscriptions/${SUB}`)[0]
  ok('Stripe is told to take the pause off', update?.params.get('pause_collection') === '' && subs.get(SUB).pause_collection === null,
    update ? [...update.params].join('&') : 'no update')
  const f = await row(FAMILY)
  ok('the plan they pay for is back at once, on the child\'s phone too', !f.paused_until && f.effective === 'standard' && (await childSees(FAMILY)) === 'standard')
  ok('the plan screen\'s notice goes', billingNotice(await billingAs(PARENT)) === null)
  const twice = await answer(await keep({ action: 'resume' }, PARENT))
  ok('resuming when it is not paused says so', twice.status === 409 && twice.error === 'not_paused')
  // Stripe's own "not paused" news afterwards changes nothing.
  ok('Stripe\'s "updated, not paused" afterwards is accepted', (await signed(subEvent('resumed'))).status === 200
    && (await row(FAMILY)).effective === 'standard')
}

console.log('\n=== Billing starting again on the date, by itself ===')
{
  await db.query(`update families set save_offer_used_at = null where id = $1`, [FAMILY])
  const r = await answer(await keep({ action: 'pause', months: 1 }, PARENT))
  ok('(paused for a month)', r.status === 200 && (await row(FAMILY)).effective === 'starter', JSON.stringify(r))
  await db.query(`update families set paused_until = now() - interval '1 second' where id = $1`, [FAMILY])
  ok('when the date comes, the plan counts again before any news from Stripe', (await row(FAMILY)).effective === 'standard'
    && (await childSees(FAMILY)) === 'standard')
  subs.get(SUB).pause_collection = null
  ok('and Stripe\'s news that it resumed ends the pause', (await signed(subEvent('date_came'))).status === 200
    && (await db.query('select count(*)::int n from plan_pauses where family_id = $1 and ended_at is null and resumes_at > now()', [FAMILY])).rows[0].n === 0)
}

console.log('\n=== Stripe failing undoes a pause ===')
{
  stripeMode = 'fail-updates'
  const r = await answer(await keep({ action: 'pause', months: 3 }, PARENT))
  stripeMode = 'ok'
  ok('Stripe refusing the change: the parent is told nothing changed', r.status >= 500 && /Nothing has changed|not answering/.test(billingError(r.error)), JSON.stringify(r))
  ok('and nothing did: not paused, no pause left behind', !(await row(FAMILY)).paused_until
    && (await db.query('select count(*)::int n from plan_pauses where family_id = $1 and months = 3', [FAMILY])).rows[0].n === 0)
  stripeMode = 'error500'
  const down = await answer(await keep({ action: 'pause', months: 1 }, PARENT))
  stripeMode = 'ok'
  ok('Stripe down altogether: "not answering", and nothing changed', down.status === 503 && down.error === 'stripe_unavailable' && !(await row(FAMILY)).paused_until)
}

console.log('\n=== The half-price month: once per family, ever ===')
{
  const savedBefore = await today('plans_saved')
  stripeMode = 'fail-updates'
  const failed = await answer(await keep({ action: 'save' }, PARENT))
  stripeMode = 'ok'
  ok('Stripe failing to apply it: the parent is told nothing changed', failed.status >= 500, JSON.stringify(failed))
  ok('and the family still has it to take', !(await row(FAMILY)).save_offer_used_at && (await billingAs(PARENT)).save_offer_used === false)
  const from = calls.length
  const r = await answer(await keep({ action: 'save' }, PARENT))
  ok('the parent takes it', r.status === 200 && r.saved, JSON.stringify(r))
  const update = callsTo(from, `/v1/subscriptions/${SUB}`)[0]
  ok('Stripe is given the coupon, beside the discount the plan already had',
    update?.body?.discounts?.[0]?.discount === 'di_alliance_prize' && update?.body?.discounts?.[1]?.coupon === 'rankup-test-half-month',
    update ? [...update.params].join('&') : 'no update')
  ok('with an idempotency key naming the family', update?.key?.startsWith(`rankup-save-${FAMILY}-`), update?.key)
  ok('the database marks it taken, and counts it once', Boolean((await row(FAMILY)).save_offer_used_at)
    && (await today('plans_saved')) === savedBefore + 1 && (await billingAs(PARENT)).save_offer_used === true)
  const before = calls.length
  const again = await answer(await keep({ action: 'save' }, PARENT))
  ok('a second time: refused, in words, and Stripe is not asked to change anything',
    again.status === 409 && again.error === 'already_used' && callsTo(before, `/v1/subscriptions/${SUB}`).length === 0
    && billingError(again.error) === 'Your family has already had its half-price month.')
  ok('the plan screen offers it no more, nor a pause in the month it is running', !keepOffers(await billingAs(PARENT)).save
    && !keepOffers(await billingAs(PARENT)).pause && (await billingAs(PARENT)).save_offer_recent === true)
  const pause = await answer(await keep({ action: 'pause', months: 1 }, PARENT))
  ok('a pause in the half-price month is refused, so that invoice is not voided', pause.status === 409 && pause.error === 'half_price_month')
}

console.log('\n=== A yearly plan ===')
{
  for (const action of ['pause', 'save']) {
    // eslint-disable-next-line no-await-in-loop
    const r = await answer(await keep({ action, months: 1 }, YEARLY_PARENT))
    ok(`${action === 'pause' ? 'a pause' : 'the half-price month'} is not for a yearly plan`, r.status === 409 && r.error === 'not_monthly', JSON.stringify(r))
  }
  ok('nothing changed for it', !(await row(YEARLY)).paused_until && !(await row(YEARLY)).save_offer_used_at)
  const yearly = await answer(await portal({ flow: 'yearly' }, YEARLY_PARENT))
  ok('and it is not offered yearly billing again', yearly.status === 409 && yearly.error === 'already_yearly')
}

console.log('\n=== Elite, and yearly, on Stripe\'s own confirm page ===')
{
  const up = await answer(await portal({ flow: 'upgrade' }, PARENT))
  const call = lastCall('/v1/billing_portal/sessions')
  ok('the Elite nudge opens Stripe\'s confirm page', up.status === 200 && up.url === 'https://billing.stripe.test/keep', JSON.stringify(up))
  ok('to move this subscription\'s item to Elite, the same period, at the configured price',
    call?.body?.flow_data?.type === 'subscription_update_confirm'
    && call.body.flow_data.subscription_update_confirm.subscription === SUB
    && call.body.flow_data.subscription_update_confirm.items['0'].id === 'si_price_test_standard_only'
    && call.body.flow_data.subscription_update_confirm.items['0'].price === 'price_test_elite_month',
    call ? [...call.params].join('&') : 'no call')
  ok('and back to the plan screen afterwards', call?.body?.flow_data?.after_completion?.redirect?.return_url === `${BASE}/#/parent/plan?changed=1`)
  const year = await answer(await portal({ flow: 'yearly' }, PARENT))
  const yearCall = lastCall('/v1/billing_portal/sessions')
  ok('"Switch to yearly" opens it for the same plan, yearly', year.status === 200
    && yearCall?.body?.flow_data?.subscription_update_confirm?.items?.['0']?.price === 'price_test_standard_year')
  ok('an unknown flow is refused', (await portal({ flow: 'refund' }, PARENT)).status === 400)

  // Stripe moved it to Elite: the webhook gives the plan.
  subs.get(SUB).items = item('price_test_elite_month', 'month')
  ok('the webhook takes the Elite price as Elite', (await signed(subEvent('elite'))).status === 200
    && (await row(FAMILY)).tier === 'elite' && (await row(FAMILY)).billing_cycle === 'month')
  const already = await answer(await portal({ flow: 'upgrade' }, PARENT))
  ok('and does not offer Elite to a family on it', already.status === 409 && already.error === 'already_elite')

  await db.query(`update families set paused_until = now() + interval '20 days' where id = $1`, [FAMILY])
  const paused = await answer(await portal({ flow: 'yearly' }, PARENT))
  ok('no change of plan during a pause (it would charge today)', paused.status === 409 && paused.error === 'paused')
}

console.log('\n=== Cancelling still works, paused or not ===')
{
  const cancelledBefore = await today('plans_cancelled')
  const r = await answer(await portal({ flow: 'cancel' }, PARENT))
  const call = lastCall('/v1/billing_portal/sessions')
  ok('"Cancel my plan" opens Stripe\'s own cancel page in one go, even while paused', r.status === 200 && r.url === 'https://billing.stripe.test/keep'
    && call?.body?.flow_data?.type === 'subscription_cancel' && call.body.flow_data.subscription_cancel.subscription === SUB,
    call ? [...call.params].join('&') : 'no call')
  ok('coming back to the plan screen', call?.body?.flow_data?.after_completion?.redirect?.return_url === `${BASE}/#/parent/plan`)
  ok('the plain "Manage billing" still opens the portal\'s front page', (await portal({}, PARENT)).status === 200
    && !lastCall('/v1/billing_portal/sessions')?.body?.flow_data)
  // The parent confirms in Stripe: the plan is set to stop.
  const cancelAt = clock + 20 * 86400
  ok('Stripe\'s news that it is set to stop is accepted', (await signed(subEvent('cancel', { cancel_at: cancelAt, pause_collection: null }))).status === 200)
  const f = await row(FAMILY)
  ok('the plan is ending on that date', f.subscription_ends_at && Math.abs(f.subscription_ends_at.getTime() / 1000 - cancelAt) < 2)
  ok('the plan screen says "Your plan is ending"', billingNotice(await billingAs(PARENT))?.title === 'Your plan is ending')
  ok('and nothing more is offered on the way out', !keepOffers(await billingAs(PARENT)).pause && !keepOffers(await billingAs(PARENT)).save)
  ok('the cancellation is counted once for the owner\'s console', (await today('plans_cancelled')) === cancelledBefore + 1)
  await signed(subEvent('cancel_again', { cancel_at: cancelAt, pause_collection: null }))
  ok('not again when Stripe repeats itself', (await today('plans_cancelled')) === cancelledBefore + 1)
  const pause = await answer(await keep({ action: 'pause', months: 1 }, PARENT))
  ok('a plan set to stop is not paused', pause.status === 409 && pause.error === 'plan_ending')
  ok('the child keeps everything after all of it', (await db.query('select xp, coins from kids where id = $1', [KID])).rows[0].xp === 640)
}

console.log('\n=== The owner\'s console shows the three counts ===')
{
  const counted = await (await fetch(`${BASE}/api/stats`, { headers: { Authorization: 'Bearer test-stats-key' } })).json()
  const day = counted.daily?.days?.[29] || {}
  ok('paused, half-price months and cancelled are in today\'s numbers',
    day.plans_paused >= 1 && day.plans_saved >= 1 && day.plans_cancelled >= 1, JSON.stringify(day))
}

await db.query('delete from families where id in ($1, $2)', [FAMILY, YEARLY])
await db.query('delete from auth.users where id in ($1, $2, $3, $4)', [PARENT, GRAN, CHILD, YEARLY_PARENT])
stripeStandIn.close()
emailStandIn.close()
await db.end()
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
