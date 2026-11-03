/**
 * A plan's whole life, end to end, in Stripe's test mode as the code sees it.
 *
 * tests/api.mjs checks each Stripe event on its own. This walks one family,
 * and then one school, through everything that happens to a plan in order:
 * subscribe monthly, renew, a payment fails, a refund, cancel, subscribe again
 * for a year. Each step goes through the real functions under workerd: the
 * checkout and the billing portal ask a stand-in Stripe on :12111, and every
 * Stripe event is signed with the webhook's secret and posted to
 * /api/stripe-webhook. Stripe retries and does not deliver in order, so each
 * step also replays an event and delivers one late.
 *
 * After every step it checks the three things a family would notice:
 *   - the plan the database holds, and what billing_status tells the plan screen
 *   - the words on the plan screen and on the dashboard (billingNotice,
 *     dashboardBillingNotice), from what the parent's phone is actually sent
 *   - what the child can use: the plan the child's own phone works out from
 *     its sync, the XP the database would pay for a chore (Elite's boost), and
 *     whether a second child can be added (Starter is one child)
 * and, for a school, whether it is in the league for its students.
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

const { reducer, effectiveTier } = await import('../src/state/reducer.js')
const { createInitialState, TIERS } = await import('../src/state/initialState.js')
const { billingNotice, dashboardBillingNotice, planDate } = await import('../src/lib/billing.js')
const { schoolBillingNotice } = await import('../src/lib/schools.js')

const BASE = process.env.API_BASE || 'http://localhost:8788'
const MOCK = 'http://localhost:54321'
const RUN = Date.now().toString(36)

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
/* A stand-in Stripe, recording what the functions ask of it           */
/* ------------------------------------------------------------------ */

const calls = []
const subs = new Map()
const stripeStandIn = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    const url = new URL(req.url, 'http://stripe.test')
    calls.push({ method: req.method, path: url.pathname, params: new URLSearchParams(raw) })
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (url.pathname === '/v1/checkout/sessions') return send(200, { id: `cs_walk_${calls.length}`, object: 'checkout.session', url: `https://checkout.stripe.test/${calls.length}` })
    if (url.pathname === '/v1/billing_portal/sessions') return send(200, { id: 'bps_walk', object: 'billing_portal.session', url: 'https://billing.stripe.test/walk' })
    if (url.pathname === '/v1/subscriptions' && req.method === 'GET') {
      const customer = url.searchParams.get('customer')
      return send(200, { object: 'list', data: [...subs.values()].filter((s) => s.customer === customer), has_more: false })
    }
    if (url.pathname.startsWith('/v1/subscriptions/')) {
      const id = url.pathname.split('/').pop()
      return send(200, subs.get(id) || { id, object: 'subscription' })
    }
    return send(404, { error: { type: 'invalid_request_error', message: 'no such route in the stand-in' } })
  })
})
await new Promise((resolve) => stripeStandIn.listen(12111, resolve))
const lastCall = (path) => [...calls].reverse().find((c) => c.path === path)

const signer = new Stripe('sk_test_routing_only')
// Event times count up from a little before now, a few seconds apart, so a
// refund's charge is recent as it would be in test mode (the database tells an
// earlier period's refund apart by when the charge was made).
let clock = Math.floor(Date.now() / 1000) - 3600
const tick = (secs = 10) => { clock += secs; return clock }
const DAY = 86400
/** Post one signed event; returns the webhook's answer. */
async function webhook(event) {
  const payload = JSON.stringify(event)
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_local_only' })
  const res = await fetch(`${BASE}/api/stripe-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload,
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const event = (id, type, object, created = tick()) => ({ id: `evt_${id}_${RUN}`, type, created, data: { object } })

const asUser = (path, body, token) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body ?? {}),
})
const rpcAs = async (fn, token, args = {}) => (await fetch(`${MOCK}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'local-anon-key', Authorization: `Bearer ${token}` },
  body: JSON.stringify(args),
})).json()

/* ------------------------------------------------------------------ */
/* The family                                                          */
/* ------------------------------------------------------------------ */

const PARENT = 'b14a0000-0000-4000-8000-00000000a001'
const KID_PHONE = 'b14a0000-0000-4000-8000-00000000c001'
const FAMILY = 'b14a0000-0000-4000-8000-00000000f001'
const KID = 'b14a0000-0000-4000-8000-00000000d001'
const QUEST = 'b14a0000-0000-4000-8000-00000000e001'
const CHORE = 'b14a0000-0000-4000-8000-00000000e101'
const CUSTOMER = `cus_walk_${RUN}`
const MONTHLY = `sub_walk_month_${RUN}`
const YEARLY = `sub_walk_year_${RUN}`

await db.query('delete from families where id = $1', [FAMILY])
await db.query(`insert into auth.users (id, email) values ($1, 'walk-parent@example.com'), ($2, null) on conflict do nothing`, [PARENT, KID_PHONE])
await db.query(`insert into families (id, name, tier) values ($1, 'Walk Family', 'starter')`, [FAMILY])
await db.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, 'Walk Parent', 'parent')
                on conflict (user_id) do update set family_id = excluded.family_id, role = 'parent'`, [PARENT, FAMILY])
await db.query('select seed_consent($1, $2)', [FAMILY, PARENT])
await db.query(`insert into kids (id, family_id, user_id, name) values ($1, $2, $3, 'Walker')`, [KID, FAMILY, KID_PHONE])
await db.query(`insert into quests (id, family_id, kid_id, title, xp, done_means) values ($1, $2, $3, 'Feed the cat', 40, 'Bowl full')`, [QUEST, FAMILY, KID])
await db.query(`insert into submissions (id, family_id, quest_id, kid_id, status) values ($1, $2, $3, $4, 'pending')`, [CHORE, FAMILY, QUEST, KID])

const elitePrice = { month: 'price_test_elite_month', year: 'price_test_elite_year' }
const subscription = (id, status, { cycle = 'month', periodEnd, extra = {} } = {}) => ({
  id, object: 'subscription', status, customer: CUSTOMER,
  metadata: { family_id: FAMILY, tier: 'elite', cycle },
  items: { data: [{ id: `si_${id}`, current_period_end: periodEnd, price: { id: elitePrice[cycle], recurring: { interval: cycle } } }] },
  ...extra,
})
const invoice = (id, amount, subId) => ({
  id: `in_${id}_${RUN}`, object: 'invoice', customer: CUSTOMER, amount_paid: amount, currency: 'usd',
  parent: { subscription_details: { subscription: subId, metadata: { family_id: FAMILY } } },
})

/** Everything a family would notice, read the way each screen reads it. */
async function family() {
  const row = (await db.query(`select tier, subscription_status as status, subscription_renews_at, subscription_ends_at,
                                      effective_tier(id) as effective from families where id = $1`, [FAMILY])).rows[0]
  const status = await rpcAs('billing_status', PARENT)
  // The parent's phone and the child's phone, each from its own sync.
  const parentPhone = reducer({ ...createInitialState(), onboarded: true },
    { type: 'MERGE_SNAPSHOT', snapshot: await rpcAs('family_snapshot', PARENT, { p_since: 0 }), pending: [] })
  const kidPhone = reducer({ ...createInitialState(), onboarded: true, device: { role: 'kid', linkedKidId: KID } },
    { type: 'MERGE_SNAPSHOT', snapshot: await rpcAs('family_snapshot', KID_PHONE, { p_since: 0 }), pending: [] })
  const award = (await db.query('select award_for_submission($1) as a', [CHORE])).rows[0].a
  // Whether a second child could be added now: tried, and undone.
  let secondChild = true
  await db.query('begin')
  try {
    await db.query(`insert into kids (family_id, name) values ($1, 'Second')`, [FAMILY])
  } catch { secondChild = false }
  await db.query('rollback')
  return {
    row, status,
    plan: billingNotice(status),
    dashboard: dashboardBillingNotice(parentPhone.family),
    kidTier: effectiveTier(kidPhone.family),
    xp: award?.xp,
    secondChild,
  }
}
const BASE_XP = 40
const ELITE_XP = Math.round(BASE_XP * TIERS.elite.xpMultiplier)
/** The checks every step makes, for a plan that is on or off. */
function expectPlan(step, f, on) {
  if (on) {
    ok(`${step}: the family is on Elite`, f.row.tier === 'elite' && f.row.effective === 'elite' && f.status.tier === 'elite', JSON.stringify(f.row))
    ok(`${step}: the child's phone works out Elite from its own sync`, f.kidTier === 'elite', f.kidTier)
    ok(`${step}: a chore pays the child Elite's ${TIERS.elite.xpMultiplier}× XP (${ELITE_XP})`, f.xp === ELITE_XP, `xp ${f.xp}`)
    ok(`${step}: a second child can be added`, f.secondChild === true)
  } else {
    ok(`${step}: the family is on Starter`, f.row.tier === 'starter' && f.row.effective === 'starter' && f.status.tier === 'starter', JSON.stringify(f.row))
    ok(`${step}: the child's phone says Starter too`, f.kidTier === 'starter', f.kidTier)
    ok(`${step}: a chore pays plain XP (${BASE_XP}), and nothing the child has is taken`, f.xp === BASE_XP, `xp ${f.xp}`)
    ok(`${step}: Starter's one child: a second cannot be added`, f.secondChild === false)
  }
}

console.log('\n=== 1. Subscribe monthly ===')
{
  const checkout = await asUser('/api/create-checkout', { tier: 'elite', cycle: 'month' }, PARENT)
  const call = lastCall('/v1/checkout/sessions')
  ok('the parent starts a monthly Elite checkout', checkout.status === 200
    && call?.params.get('line_items[0][price]') === 'price_test_elite_month'
    && call?.params.get('metadata[family_id]') === FAMILY && call?.params.get('mode') === 'subscription',
  `status ${checkout.status} ${call ? [...call.params].join('&') : ''}`)
  ok('which comes back to the plan screen', call?.params.get('success_url') === `${BASE}/#/parent/plan?checkout=success`)
  const before = await family()
  expectPlan('before paying', before, false)

  const p1 = tick(0) + 30 * DAY
  subs.set(MONTHLY, subscription(MONTHLY, 'active', { periodEnd: p1 }))
  const created = event('created', 'customer.subscription.created', subs.get(MONTHLY))
  // Stripe does not deliver in order: the subscription arrives before the checkout.
  const r1 = await webhook(created)
  const r2 = await webhook(event('checkout', 'checkout.session.completed', {
    id: `cs_walk_${RUN}`, object: 'checkout.session', mode: 'subscription', payment_status: 'paid', customer: CUSTOMER,
    subscription: MONTHLY, client_reference_id: FAMILY, metadata: { family_id: FAMILY, tier: 'elite', cycle: 'month' } }))
  const paid = invoice('first', 1599, MONTHLY)
  const r3 = await webhook(event('paid1', 'invoice.paid', paid))
  const r4 = await webhook(event('succeeded1', 'invoice.payment_succeeded', paid))
  ok('Stripe\'s events are all answered', [r1, r2, r3, r4].every((r) => r.status === 200), JSON.stringify([r1, r2, r3, r4]))
  const f = await family()
  expectPlan('subscribed', f, true)
  ok('subscribed: the plan screen has nothing to warn about, and renews at the period end',
    f.plan === null && f.dashboard === null && Date.parse(f.status.renews_at) === p1 * 1000, JSON.stringify(f.status))
  const counted = (await db.query('select count(*)::int as n, sum(amount_pence)::int as paid from billing_events where stripe_event = $1', [`invoice:${paid.id}`])).rows[0]
  ok('the payment is counted once, though Stripe sent it as two events', counted.n === 1 && counted.paid === 1599, JSON.stringify(counted))

  const replay = await webhook(created)
  ok('the same event again is answered and changes nothing', replay.status === 200 && (await family()).row.tier === 'elite')
  const second = await asUser('/api/create-checkout', { tier: 'elite', cycle: 'year' }, PARENT)
  ok('a family already paying cannot start a second plan', second.status === 409, `status ${second.status}`)
}

console.log('\n=== 2. Renew ===')
{
  const p2 = clock + 60 * DAY
  const stale = event('stale', 'customer.subscription.updated', subscription(MONTHLY, 'active', { periodEnd: clock + 30 * DAY }), tick())
  const paid = invoice('renewal', 1599, MONTHLY)
  // The renewal's invoice lands before the subscription says it moved on.
  await webhook(event('paid2', 'invoice.paid', paid))
  subs.set(MONTHLY, subscription(MONTHLY, 'active', { periodEnd: p2 }))
  await webhook(event('renewed', 'customer.subscription.updated', subs.get(MONTHLY)))
  // And an update from before the renewal turns up last.
  const late = await webhook(stale)
  const f = await family()
  expectPlan('renewed', f, true)
  ok('renewed: the new renewal date stands, though older news came after it',
    late.status === 200 && Date.parse(f.status.renews_at) === p2 * 1000, `${f.status.renews_at} vs ${new Date(p2 * 1000).toISOString()}`)
  ok('renewed: nothing to warn about', f.plan === null && f.dashboard === null)
  ok('both payments are on record, once each', (await db.query(
    "select count(*)::int as n from billing_events where family_id = $1 and stripe_event like 'invoice:%'", [FAMILY])).rows[0].n === 2)
}

console.log('\n=== 3. A payment fails ===')
let recovered
{
  const before = event('before_fail', 'customer.subscription.updated', subs.get(MONTHLY), tick())
  const failedInvoice = { ...invoice('failed', 1599, MONTHLY), amount_paid: 0, status: 'open' }
  const ignored = await webhook(event('failed', 'invoice.payment_failed', failedInvoice))
  ok('"payment failed" on its own is answered and changes nothing',
    ignored.status === 200 && (await family()).row.tier === 'elite', JSON.stringify(ignored))
  subs.set(MONTHLY, subscription(MONTHLY, 'past_due', { periodEnd: clock + 90 * DAY }))
  await webhook(event('past_due', 'customer.subscription.updated', subs.get(MONTHLY)))
  // A retry of an "active" from before the failure, after it.
  await webhook(before)
  const f = await family()
  expectPlan('payment failed', f, false)
  ok('payment failed: the plan screen says so, names the plan, and says what to do',
    f.plan?.title === 'A payment failed' && /Elite plan/.test(f.plan.body) && /Manage billing/.test(f.plan.body), JSON.stringify(f.plan))
  ok('payment failed: and so does the dashboard', f.dashboard?.title === 'A payment failed', JSON.stringify(f.dashboard))
  ok('payment failed: the child is told nothing was taken away', /Nothing your kids have earned has been touched/.test(f.plan?.body || ''))

  // The parent updates the card in the portal; Stripe takes the payment.
  const portal = await asUser('/api/billing-portal', {}, PARENT)
  ok('"Manage billing" opens Stripe\'s portal for this family', portal.status === 200
    && lastCall('/v1/billing_portal/sessions')?.params.get('customer') === CUSTOMER)
  recovered = invoice('recovered', 1599, MONTHLY)
  subs.set(MONTHLY, subscription(MONTHLY, 'active', { periodEnd: clock + 90 * DAY }))
  await webhook(event('recovered', 'customer.subscription.updated', subs.get(MONTHLY)))
  await webhook(event('paid3', 'invoice.paid', recovered))
  const back = await family()
  expectPlan('card updated and paid', back, true)
  ok('card updated and paid: the warning goes', back.plan === null && back.dashboard === null)
}

console.log('\n=== 4. A refund ===')
{
  const charge = (over = {}) => ({ id: `ch_walk_${RUN}`, object: 'charge', customer: CUSTOMER, payment_intent: `pi_walk_${RUN}`,
    amount: 1599, amount_refunded: 1599, refunded: true, currency: 'usd', created: clock - 60, ...over })
  const partial = await webhook(event('partial', 'charge.refunded', charge({ id: `ch_walk_goodwill_${RUN}`, amount_refunded: 500, refunded: false })))
  ok('a partial refund is goodwill: the plan stays', partial.status === 200 && (await family()).row.tier === 'elite', JSON.stringify(partial))
  const full = await webhook(event('refund', 'charge.refunded', charge()))
  const f = await family()
  expectPlan('refunded', f, false)
  ok('refunded: the plan screen says the payment was refunded', f.plan?.title === 'Your payment was refunded', JSON.stringify(f.plan))
  ok('refunded: and so does the dashboard', f.dashboard?.title === 'Your payment was refunded', JSON.stringify(f.dashboard))
  const again = await webhook(event('refund_again', 'charge.refunded', charge()))
  ok('the same refund again (a new event for the same charge) acts once',
    full.status === 200 && again.status === 200 && (await db.query(
      "select count(*)::int as n from billing_events where stripe_event = $1", [`refund:ch_walk_${RUN}`])).rows[0].n === 1)
}

console.log('\n=== 5. Cancel ===')
{
  const portal = await asUser('/api/billing-portal', {}, PARENT)
  ok('the parent cancels from "Manage billing"', portal.status === 200)
  const periodEnd = subs.get(MONTHLY).items.data[0].current_period_end
  // Stripe's answer to "cancel at the end of the period": still active.
  subs.set(MONTHLY, subscription(MONTHLY, 'active', { periodEnd, extra: { cancel_at_period_end: true, cancel_at: periodEnd } }))
  const scheduled = event('cancel_scheduled', 'customer.subscription.updated', subs.get(MONTHLY))
  await webhook(scheduled)
  let f = await family()
  // This put the refunded family straight back on Elite, free, until the
  // period ended: Stripe still calls a subscription active once it has been
  // refunded, and cancelling at the period end says so again.
  expectPlan('cancelled after the refund, before the period ends', f, false)
  ok('the refunded period stays refunded, and the date it stops is kept',
    f.row.status === 'refunded' && Date.parse(f.row.subscription_ends_at) === periodEnd * 1000, JSON.stringify(f.row))

  subs.set(MONTHLY, subscription(MONTHLY, 'canceled', { periodEnd, extra: { ended_at: tick() } }))
  const ended = await webhook(event('deleted', 'customer.subscription.deleted', subs.get(MONTHLY), clock))
  await webhook(scheduled)
  f = await family()
  expectPlan('cancelled', f, false)
  ok('cancelled: the plan has ended, and it says Starter now (not "runs until")',
    ended.status === 200 && f.plan?.title === 'Your plan has ended' && /on Starter now/.test(f.plan.body)
    && !/runs until/.test(f.plan.body), JSON.stringify(f.plan))
  ok('cancelled: the dashboard leaves a plan they chose to end alone', f.dashboard === null, JSON.stringify(f.dashboard))
  ok('cancelled: no subscription is left on the family', f.status.has_subscription === false, JSON.stringify(f.status))
}

console.log('\n=== 6. Subscribe again, for a year ===')
{
  const checkout = await asUser('/api/create-checkout', { tier: 'elite', cycle: 'year' }, PARENT)
  const call = lastCall('/v1/checkout/sessions')
  ok('a family whose plan ended can subscribe again, for a year', checkout.status === 200
    && call?.params.get('line_items[0][price]') === 'price_test_elite_year', `status ${checkout.status}`)
  ok('on the same Stripe customer, with no second free trial', call?.params.get('customer') === CUSTOMER
    && !call?.params.get('subscription_data[trial_end]'), [...(call?.params || [])].join('&'))

  const yearEnd = clock + 365 * DAY
  // Changed in the portal later, the metadata can lag: the price is what was paid for.
  subs.set(YEARLY, { ...subscription(YEARLY, 'active', { cycle: 'year', periodEnd: yearEnd }), metadata: { family_id: FAMILY, tier: 'standard', cycle: 'year' } })
  await webhook(event('checkout_year', 'checkout.session.completed', {
    id: `cs_walk_year_${RUN}`, object: 'checkout.session', mode: 'subscription', payment_status: 'paid', customer: CUSTOMER,
    subscription: YEARLY, client_reference_id: FAMILY, metadata: { family_id: FAMILY, tier: 'elite', cycle: 'year' } }))
  await webhook(event('created_year', 'customer.subscription.created', subs.get(YEARLY)))
  await webhook(event('paid_year', 'invoice.paid', invoice('year', 15990, YEARLY)))
  // The old plan's end, delivered again after the new one began.
  await webhook(event('old_deleted_again', 'customer.subscription.deleted', subs.get(MONTHLY), tick()))
  let f = await family()
  expectPlan('subscribed for a year', f, true)
  ok('a year: renews a year from now, nothing to warn about', Date.parse(f.status.renews_at) === yearEnd * 1000
    && f.plan === null && f.dashboard === null, JSON.stringify(f.status))

  // Cancelled in the portal: still Elite, and the plan screen says until when.
  subs.set(YEARLY, { ...subs.get(YEARLY), cancel_at_period_end: true, cancel_at: yearEnd })
  await webhook(event('year_cancel', 'customer.subscription.updated', subs.get(YEARLY)))
  f = await family()
  expectPlan('a year, cancelled in the portal', f, true)
  ok('the plan screen says it is ending, and when', f.plan?.title === 'Your plan is ending'
    && f.plan.body.includes(planDate(yearEnd * 1000)) && /Nothing changes until then/.test(f.plan.body), JSON.stringify(f.plan))
  ok('the dashboard does not nag about a plan they chose to end', f.dashboard === null)
  // Changed their mind.
  subs.set(YEARLY, { ...subs.get(YEARLY), cancel_at_period_end: false, cancel_at: null })
  await webhook(event('year_resumed', 'customer.subscription.updated', subs.get(YEARLY)))
  f = await family()
  ok('changing their mind takes the notice away', f.plan === null && f.row.tier === 'elite', JSON.stringify(f.plan))
}

/* ------------------------------------------------------------------ */
/* The school                                                          */
/* ------------------------------------------------------------------ */

const SCHOOL = 'b17a0000-0000-4000-8000-0000000005c1'
const ADMIN = 'b17a0000-0000-4000-8000-0000000005a1'
const SCHOOL_FAMILY = 'b17a0000-0000-4000-8000-00000000f001'
const SCHOOL_PARENT = 'b17a0000-0000-4000-8000-00000000a001'
const PUPIL = 'b17a0000-0000-4000-8000-00000000d001'
const PUPIL_PHONE = 'b17a0000-0000-4000-8000-00000000c001'
const SCHOOL_CUSTOMER = `cus_walk_school_${RUN}`
const SCHOOL_MONTHLY = `sub_walk_school_month_${RUN}`
const SCHOOL_YEARLY = `sub_walk_school_year_${RUN}`

await db.query('delete from schools where id = $1', [SCHOOL])
await db.query('delete from families where id = $1', [SCHOOL_FAMILY])
await db.query(`insert into auth.users (id, email) values ($1, 'walk-school-admin@example.com'), ($2, 'walk-school-parent@example.com'), ($3, null)
                on conflict do nothing`, [ADMIN, SCHOOL_PARENT, PUPIL_PHONE])
// Its free trial is over, so a school whose plan stops is out of the league.
await db.query(`insert into schools (id, name, district, district_key, student_count, size_band, status, trial_ends_at, verified)
                values ($1, 'Walk School', 'Walk District', 'walk district', 500, 'medium', 'lapsed', now() - interval '1 day', true)`, [SCHOOL])
await db.query(`insert into school_staff (user_id, school_id, name, role) values ($1, $2, 'Head', 'admin')
                on conflict (user_id) do update set school_id = $2, role = 'admin'`, [ADMIN, SCHOOL])
await db.query(`insert into families (id, name) values ($1, 'Walk School Family')`, [SCHOOL_FAMILY])
await db.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, 'School Parent', 'parent')
                on conflict (user_id) do update set family_id = excluded.family_id`, [SCHOOL_PARENT, SCHOOL_FAMILY])
await db.query('select seed_consent($1, $2)', [SCHOOL_FAMILY, SCHOOL_PARENT])
await db.query(`insert into kids (id, family_id, user_id, name) values ($1, $2, $3, 'Pupil')`, [PUPIL, SCHOOL_FAMILY, PUPIL_PHONE])
await db.query(`insert into school_members (kid_id, school_id, family_id) values ($1, $2, $3)`, [PUPIL, SCHOOL, SCHOOL_FAMILY])

const schoolPrice = { month: 'price_test_school_medium', year: 'price_test_school_medium_year' }
const schoolSub = (id, status, { cycle = 'month', periodEnd, extra = {} } = {}) => ({
  id, object: 'subscription', status, customer: SCHOOL_CUSTOMER,
  metadata: { school_id: SCHOOL, band: 'medium', cycle, kind: 'school' },
  items: { data: [{ id: `si_${id}`, current_period_end: periodEnd, price: { id: schoolPrice[cycle], recurring: { interval: cycle } } }] },
  ...extra,
})
const schoolInvoice = (id, amount, subId) => ({
  id: `in_school_${id}_${RUN}`, object: 'invoice', customer: SCHOOL_CUSTOMER, amount_paid: amount, currency: 'usd',
  parent: { subscription_details: { subscription: subId, metadata: { school_id: SCHOOL } } },
})

/** What the school's admin sees, and whether its students are in the league. */
async function school() {
  const overview = await rpcAs('school_overview', ADMIN)
  const card = overview?.school || {}
  const pupil = await rpcAs('my_schools', PUPIL_PHONE)
  const row = (await db.query('select status, billing_status, stripe_subscription_id from schools where id = $1', [SCHOOL])).rows[0]
  return { row, card, notice: schoolBillingNotice(card), pupilLive: pupil?.children?.[0]?.school?.live }
}
function expectLeague(step, s, on) {
  if (on) {
    ok(`${step}: the school is in the league`, s.row.status === 'active' && s.card.live === true, JSON.stringify(s.row))
    ok(`${step}: and its students' phones say so`, s.pupilLive === true, String(s.pupilLive))
  } else {
    ok(`${step}: the school is out of the league`, s.row.status === 'lapsed' && s.card.live === false, JSON.stringify(s.row))
    ok(`${step}: and its students' phones say so (their points are kept)`, s.pupilLive === false, String(s.pupilLive))
  }
}

console.log('\n=== School 1. Subscribe monthly ===')
{
  const parentTry = await asUser('/api/school-checkout', { cycle: 'month' }, SCHOOL_PARENT)
  ok('a parent cannot start a school\'s checkout', parentTry.status === 403, `status ${parentTry.status}`)
  const checkout = await asUser('/api/school-checkout', { cycle: 'month', band: 'small' }, ADMIN)
  const call = lastCall('/v1/checkout/sessions')
  ok('the admin starts a monthly checkout, priced by the school\'s size whatever the request says',
    checkout.status === 200 && call?.params.get('line_items[0][price]') === 'price_test_school_medium'
    && call?.params.get('metadata[school_id]') === SCHOOL, `status ${checkout.status}`)
  ok('with no trial carried, since its trial is over', !call?.params.get('subscription_data[trial_end]'))
  expectLeague('before paying', await school(), false)

  subs.set(SCHOOL_MONTHLY, schoolSub(SCHOOL_MONTHLY, 'active', { periodEnd: clock + 30 * DAY }))
  const created = event('school_created', 'customer.subscription.created', subs.get(SCHOOL_MONTHLY))
  await webhook(event('school_checkout', 'checkout.session.completed', {
    id: `cs_walk_school_${RUN}`, object: 'checkout.session', mode: 'subscription', customer: SCHOOL_CUSTOMER,
    subscription: SCHOOL_MONTHLY, client_reference_id: SCHOOL, metadata: { school_id: SCHOOL, band: 'medium', cycle: 'month', kind: 'school' } }))
  const r = await webhook(created)
  const paid = schoolInvoice('first', 5900, SCHOOL_MONTHLY)
  await webhook(event('school_paid1', 'invoice.paid', paid))
  await webhook(event('school_succeeded1', 'invoice.payment_succeeded', paid))
  const s = await school()
  expectLeague('subscribed', s, true)
  ok('subscribed: no notice for the admin', r.body.school === true && s.notice === null, JSON.stringify(s.notice))
  ok('the payment is counted once', (await db.query('select count(*)::int as n from billing_events where stripe_event = $1',
    [`invoice:${paid.id}`])).rows[0].n === 1)
  await webhook(created)
  ok('the same event again changes nothing', (await school()).row.status === 'active')
  const again = await asUser('/api/school-checkout', { cycle: 'year' }, ADMIN)
  ok('a paying school cannot start a second plan', again.status === 403, `status ${again.status}`)
  // A paying school was refused the portal: the one place to change its card or cancel.
  const portal = await asUser('/api/billing-portal', { for: 'school' }, ADMIN)
  ok('a paying school\'s admin can open "Card, invoices and cancelling"', portal.status === 200
    && lastCall('/v1/billing_portal/sessions')?.params.get('customer') === SCHOOL_CUSTOMER
    && lastCall('/v1/billing_portal/sessions')?.params.get('return_url') === `${BASE}/#/school`, `status ${portal.status}`)
  const teacherPortal = await asUser('/api/billing-portal', { for: 'school' }, SCHOOL_PARENT)
  ok('and nobody else can', teacherPortal.status === 403, `status ${teacherPortal.status}`)
}

console.log('\n=== School 2. Renew ===')
{
  const stale = event('school_stale', 'customer.subscription.updated', subs.get(SCHOOL_MONTHLY), tick())
  await webhook(event('school_paid2', 'invoice.paid', schoolInvoice('renewal', 5900, SCHOOL_MONTHLY)))
  subs.set(SCHOOL_MONTHLY, schoolSub(SCHOOL_MONTHLY, 'active', { periodEnd: clock + 60 * DAY }))
  await webhook(event('school_renewed', 'customer.subscription.updated', subs.get(SCHOOL_MONTHLY)))
  await webhook(stale)
  const s = await school()
  expectLeague('renewed', s, true)
  ok('renewed: nothing for the admin to see', s.notice === null)
}

console.log('\n=== School 3. A payment fails ===')
{
  const before = event('school_before_fail', 'customer.subscription.updated', subs.get(SCHOOL_MONTHLY), tick())
  await webhook(event('school_failed', 'invoice.payment_failed', { ...schoolInvoice('failed', 0, SCHOOL_MONTHLY), status: 'open' }))
  subs.set(SCHOOL_MONTHLY, schoolSub(SCHOOL_MONTHLY, 'past_due', { periodEnd: clock + 90 * DAY }))
  await webhook(event('school_past_due', 'customer.subscription.updated', subs.get(SCHOOL_MONTHLY)))
  await webhook(before)
  const s = await school()
  expectLeague('payment failed (Stripe is still trying)', s, true)
  ok('payment failed: the admin is told, and what to do (it used to say nothing)',
    s.row.billing_status === 'past_due' && s.notice?.title === 'A payment failed' && /Card, invoices and cancelling/.test(s.notice.body),
    JSON.stringify(s.notice))
  const portal = await asUser('/api/billing-portal', { for: 'school' }, ADMIN)
  ok('and can reach the portal to change the card', portal.status === 200, `status ${portal.status}`)
  subs.set(SCHOOL_MONTHLY, schoolSub(SCHOOL_MONTHLY, 'active', { periodEnd: clock + 90 * DAY }))
  await webhook(event('school_recovered', 'customer.subscription.updated', subs.get(SCHOOL_MONTHLY)))
  await webhook(event('school_paid3', 'invoice.paid', schoolInvoice('recovered', 5900, SCHOOL_MONTHLY)))
  const back = await school()
  expectLeague('card updated and paid', back, true)
  ok('card updated and paid: the notice goes', back.notice === null, JSON.stringify(back.notice))
}

console.log('\n=== School 4. A refund ===')
{
  const charge = (over = {}) => ({ id: `ch_walk_school_${RUN}`, object: 'charge', customer: SCHOOL_CUSTOMER,
    amount: 5900, amount_refunded: 5900, refunded: true, currency: 'usd', created: clock - 60, ...over })
  await webhook(event('school_partial', 'charge.refunded', charge({ id: `ch_walk_school_part_${RUN}`, amount_refunded: 1000, refunded: false })))
  ok('a partial refund changes nothing', (await school()).row.status === 'active')
  const full = await webhook(event('school_refund', 'charge.refunded', charge()))
  const s = await school()
  // A refunded school was answered and left in the league as a paying one.
  expectLeague('refunded', s, false)
  ok('refunded: the admin is told it was refunded', full.status === 200 && s.notice?.title === 'Your payment was refunded',
    JSON.stringify(s.notice))
  await webhook(event('school_refund_again', 'charge.refunded', charge()))
  ok('the same refund again acts once', (await db.query('select count(*)::int as n from billing_events where stripe_event = $1',
    [`refund:ch_walk_school_${RUN}`])).rows[0].n === 1)
}

console.log('\n=== School 5. Cancel ===')
{
  const periodEnd = subs.get(SCHOOL_MONTHLY).items.data[0].current_period_end
  subs.set(SCHOOL_MONTHLY, schoolSub(SCHOOL_MONTHLY, 'active', { periodEnd, extra: { cancel_at_period_end: true, cancel_at: periodEnd } }))
  const scheduled = event('school_cancel_scheduled', 'customer.subscription.updated', subs.get(SCHOOL_MONTHLY))
  await webhook(scheduled)
  expectLeague('cancelled after the refund, before the period ends', await school(), false)
  subs.set(SCHOOL_MONTHLY, schoolSub(SCHOOL_MONTHLY, 'canceled', { periodEnd, extra: { ended_at: tick() } }))
  await webhook(event('school_deleted', 'customer.subscription.deleted', subs.get(SCHOOL_MONTHLY), clock))
  // An "active" from before the end, delivered after it: it used to put the school back in the league.
  await webhook(scheduled)
  const s = await school()
  expectLeague('cancelled', s, false)
  ok('cancelled: no subscription left, and the admin is told the plan ended',
    s.row.stripe_subscription_id === null && s.notice?.title === 'Your plan has ended', JSON.stringify(s))
}

console.log('\n=== School 6. Subscribe again, for a year ===')
{
  const checkout = await asUser('/api/school-checkout', { cycle: 'year' }, ADMIN)
  const call = lastCall('/v1/checkout/sessions')
  ok('the admin subscribes again, for a year, at the yearly price, on the same customer', checkout.status === 200
    && call?.params.get('line_items[0][price]') === 'price_test_school_medium_year' && call?.params.get('customer') === SCHOOL_CUSTOMER,
  `status ${checkout.status}`)
  const yearEnd = clock + 365 * DAY
  subs.set(SCHOOL_YEARLY, schoolSub(SCHOOL_YEARLY, 'active', { cycle: 'year', periodEnd: yearEnd }))
  await webhook(event('school_checkout_year', 'checkout.session.completed', {
    id: `cs_walk_school_year_${RUN}`, object: 'checkout.session', mode: 'subscription', customer: SCHOOL_CUSTOMER,
    subscription: SCHOOL_YEARLY, client_reference_id: SCHOOL, metadata: { school_id: SCHOOL, band: 'medium', cycle: 'year', kind: 'school' } }))
  await webhook(event('school_created_year', 'customer.subscription.created', subs.get(SCHOOL_YEARLY)))
  await webhook(event('school_paid_year', 'invoice.paid', schoolInvoice('year', 59000, SCHOOL_YEARLY)))
  await webhook(event('school_old_deleted_again', 'customer.subscription.deleted', subs.get(SCHOOL_MONTHLY), tick()))
  let s = await school()
  expectLeague('subscribed for a year', s, true)
  ok('a year: on the yearly subscription, nothing to warn about', s.row.stripe_subscription_id === SCHOOL_YEARLY && s.notice === null,
    JSON.stringify(s))
  ok('no price was moved: the yearly price is the right band', !calls.some((c) => c.method === 'POST' && c.path === `/v1/subscriptions/${SCHOOL_YEARLY}`))

  subs.set(SCHOOL_YEARLY, { ...subs.get(SCHOOL_YEARLY), cancel_at_period_end: true, cancel_at: yearEnd })
  await webhook(event('school_year_cancel', 'customer.subscription.updated', subs.get(SCHOOL_YEARLY)))
  s = await school()
  expectLeague('a year, cancelled in the portal', s, true)
  ok('the admin is told it is ending, and when', s.notice?.title === 'Your plan is ending'
    && s.notice.body.includes(planDate(yearEnd * 1000)), JSON.stringify(s.notice))
}

stripeStandIn.close()
await db.end()
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
