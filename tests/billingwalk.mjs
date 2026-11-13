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
 * Then "bring a friend": a family invites another, which pays, and the
 * inviting family gets one free month as credit on its Stripe account,
 * exactly once however often Stripe sends the invoice; nothing for a trial,
 * a $0 invoice or a failed one; nothing for the same household or past the
 * cap; a refund within 14 days taking an unused month back; a dispute that
 * arrives before its invoice; and a Starter family's month banked until it
 * subscribes.
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
const { inviteSummary, rewardNotice } = await import('../src/lib/referrals.js')

const BASE = process.env.API_BASE || 'http://localhost:8788'
const MOCK = process.env.MOCK_URL || 'http://localhost:54321'
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
// Customer balance: every credit and debit made, and what each idempotency
// key was answered with, as Stripe keeps them. A key sent again gets the
// first answer and moves no money.
const balanceTxns = []
const answered = new Map()
const charges = new Map()
const invoicePayments = new Map()
const balanceOf = (customer) => balanceTxns.filter((t) => t.customer === customer).reduce((n, t) => n + t.amount, 0)
const stripeStandIn = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    const url = new URL(req.url, 'http://stripe.test')
    calls.push({ method: req.method, path: url.pathname, params: new URLSearchParams(raw), key: req.headers['idempotency-key'] })
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    const balance = url.pathname.match(/^\/v1\/customers\/([^/]+)\/balance_transactions$/)
    if (balance && req.method === 'POST') {
      const key = req.headers['idempotency-key']
      if (key && answered.has(key)) return send(200, answered.get(key))
      const p = new URLSearchParams(raw)
      const txn = { id: `cbtxn_walk_${balanceTxns.length + 1}`, object: 'customer_balance_transaction', customer: balance[1],
        amount: Number(p.get('amount')), currency: p.get('currency'), description: p.get('description'),
        metadata: Object.fromEntries([...p].filter(([k]) => k.startsWith('metadata['))) }
      balanceTxns.push(txn)
      if (key) answered.set(key, txn)
      return send(200, txn)
    }
    const customer = url.pathname.match(/^\/v1\/customers\/([^/]+)$/)
    if (customer && req.method === 'GET') return send(200, { id: customer[1], object: 'customer', balance: balanceOf(customer[1]) })
    const charge = url.pathname.match(/^\/v1\/charges\/([^/]+)$/)
    if (charge && charges.has(charge[1])) return send(200, charges.get(charge[1]))
    if (url.pathname === '/v1/invoice_payments' && req.method === 'GET') {
      return send(200, { object: 'list', data: invoicePayments.get(url.searchParams.get('invoice')) || [], has_more: false })
    }
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
await new Promise((resolve) => stripeStandIn.listen(Number(process.env.STRIPE_STANDIN_PORT || 12111), resolve))
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
  // Stripe still has the subscription, set to renew: a second one beside it
  // would charge the card twice every period.
  const second = await asUser('/api/create-checkout', { tier: 'elite', cycle: 'month' }, PARENT)
  const why = await second.json().catch(() => ({}))
  ok('refunded but still renewing in Stripe: no second plan can be started beside it',
    second.status === 409 && why.error === 'refunded_plan_renews', `status ${second.status} ${JSON.stringify(why)}`)
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
/* Bring a friend: a free month when the family you invited pays       */
/* ------------------------------------------------------------------ */

/*
 * Families, each with a parent; the referrer also has a child's phone. Ids
 * are fixed and removed first, so the walk can run again on the same
 * database. Customers and subscriptions carry this run's suffix.
 */
const R = (n) => `b19a0000-0000-4000-8000-${String(n).padStart(12, '0')}`
const RU = (n) => `b19b0000-0000-4000-8000-${String(n).padStart(12, '0')}`
const REF = { n: 1, email: 'walk-ref-inviter@example.com' }        // pays for Elite monthly
const FRIEND = { n: 2, email: 'walk-ref-friend@example.com' }      // invited by REF; trial, then Standard
const TWIN = { n: 3, email: 'walk-ref-inviter+twin@example.com' }  // REF's own parent, a second family
const SAMECARD = { n: 4, email: 'walk-ref-samecard@example.com' }  // invited by REF; pays with REF's customer
const REF2 = { n: 5, email: 'walk-ref-yearly@example.com' }        // pays for Elite yearly
const FRIEND2 = { n: 6, email: 'walk-ref-friend-two@example.com' } // invited by REF2; refunded within 14 days
const FRIEND3 = { n: 7, email: 'walk-ref-friend-three@example.com' } // invited by REF2; disputed before its invoice
const STARTER = { n: 8, email: 'walk-ref-starter@example.com' }    // on Starter
const FRIEND4 = { n: 9, email: 'walk-ref-friend-four@example.com' } // invited by STARTER
const CAPPED = { n: 10, email: 'walk-ref-capped@example.com' }     // invited by REF after its twelfth month
const REF_KID_PHONE = 'b19c0000-0000-4000-8000-000000000001'
const ALL_REF = [REF, FRIEND, TWIN, SAMECARD, REF2, FRIEND2, FRIEND3, STARTER, FRIEND4, CAPPED]
// Earlier free months for REF this year, for the cap: families 20-30.
const EARLIER = Array.from({ length: 11 }, (_, i) => 20 + i)

await db.query('delete from families where id = any($1::uuid[])', [[...ALL_REF.map((f) => R(f.n)), ...EARLIER.map(R)]])
await db.query('delete from auth.users where id = any($1::uuid[])', [[...ALL_REF.map((f) => RU(f.n)), ...EARLIER.map(RU), REF_KID_PHONE]])
for (const f of ALL_REF) {
  f.id = R(f.n)
  f.user = RU(f.n)
  f.customer = `cus_walk_ref${f.n}_${RUN}`
  f.sub = `sub_walk_ref${f.n}_${RUN}`
  await db.query('insert into auth.users (id, email) values ($1, $2)', [f.user, f.email])
  await db.query(`insert into families (id, name, tier) values ($1, $2, 'starter')`, [f.id, `Walk Referral Household ${f.n}`])
  await db.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, $3, 'parent')`, [f.user, f.id, `Walk Referral Parent ${f.n}`])
}
await db.query('select seed_consent($1, $2)', [REF.id, REF.user])
await db.query('insert into auth.users (id) values ($1)', [REF_KID_PHONE])
await db.query(`insert into kids (family_id, user_id, name) values ($1, $2, 'Walk Referral Kid')`, [REF.id, REF_KID_PHONE])

const PRICES = {
  elite_month: { id: 'price_test_elite_month', unit_amount: 1599, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } },
  elite_year: { id: 'price_test_elite_year', unit_amount: 15990, currency: 'usd', recurring: { interval: 'year', interval_count: 1 } },
  standard_month: { id: 'price_test_standard_only', unit_amount: 999, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } },
}
const refSub = (f, status, price, { customer = f.customer, extra = {} } = {}) => ({
  id: f.sub, object: 'subscription', status, customer, currency: 'usd',
  metadata: { family_id: f.id, tier: price.id.includes('elite') ? 'elite' : 'standard', cycle: price.recurring.interval },
  items: { data: [{ id: `si_${f.sub}`, current_period_end: clock + 30 * DAY, price }] },
  ...extra,
})
const refInvoice = (f, id, amount, { customer = f.customer, extra = {} } = {}) => ({
  id: `in_ref_${id}_${RUN}`, object: 'invoice', customer, amount_paid: amount, currency: 'usd', status: 'paid',
  parent: { subscription_details: { subscription: f.sub, metadata: { family_id: f.id } } },
  ...extra,
})
/** A family starts a plan: the checkout and the subscription, as Stripe sends them. */
async function subscribe(f, status, price, opts = {}) {
  subs.set(f.sub, refSub(f, status, price, opts))
  const a = await webhook(event(`ref_checkout_${f.n}`, 'checkout.session.completed', {
    id: `cs_walk_ref${f.n}_${RUN}`, object: 'checkout.session', mode: 'subscription', payment_status: status === 'trialing' ? 'no_payment_required' : 'paid',
    customer: opts.customer || f.customer, subscription: f.sub, client_reference_id: f.id, metadata: { family_id: f.id } }))
  const created = event(`ref_created_${f.n}`, 'customer.subscription.created', subs.get(f.sub))
  const b = await webhook(created)
  return { answers: [a, b], created }
}
const creditsTo = (customer) => balanceTxns.filter((t) => t.customer === customer && t.amount < 0)
const reward = async (f) => (await db.query('select * from referrals where invited_family_id = $1', [f.id])).rows[0]
const claim = async (f, code) => rpcAs('claim_referral', f.user, { p_code: code })

console.log('\n=== Bring a friend 1. The inviting family pays; a friend joins with its code ===')
let refCode
{
  const paying = await subscribe(REF, 'active', PRICES.elite_month)
  await webhook(event('ref1_paid', 'invoice.paid', refInvoice(REF, 'ref1_first', 1599)))
  ok('the inviting family is on Elite, paid monthly', paying.answers.every((a) => a.status === 200)
    && (await db.query('select tier from families where id = $1', [REF.id])).rows[0].tier === 'elite')
  const mine = await rpcAs('my_referrals', REF.user)
  refCode = mine.code
  ok('its parent has a code, and nobody has joined yet', /^[A-Z2-9]{6}$/.test(refCode || '') && mine.claimed === 0
    && inviteSummary(mine).joined === null && rewardNotice(mine) === null, JSON.stringify(mine))
  const joined = await claim(FRIEND, refCode)
  ok('a friend\'s family joins with it', joined.ok === true, JSON.stringify(joined))
  const twin = await claim(TWIN, refCode)
  ok('the same parent\'s second family (the same email with a +tag) cannot use it',
    twin.ok === false && twin.reason === 'same_household', JSON.stringify(twin))
  ok('a family with the same card account joins (it is caught when it pays)', (await claim(SAMECARD, refCode)).ok === true)
}

console.log('\n=== Bring a friend 2. A trial, a $0 invoice and a failed payment earn nothing ===')
{
  // Days left on the in-app trial carry onto the card: Stripe's trial, with a $0 first invoice.
  await subscribe(FRIEND, 'trialing', PRICES.standard_month)
  const zero = refInvoice(FRIEND, 'trial', 0, { extra: { billing_reason: 'subscription_create' } })
  const z1 = await webhook(event('friend_trial_paid', 'invoice.paid', zero))
  const z2 = await webhook(event('friend_trial_succeeded', 'invoice.payment_succeeded', zero))
  ok('the trial\'s $0 invoice is answered and earns nothing', z1.status === 200 && z2.status === 200
    && creditsTo(REF.customer).length === 0 && !(await reward(FRIEND)).paid_invoice, JSON.stringify([z1, z2]))
  // The trial ends and the card is declined.
  const failed = await webhook(event('friend_failed', 'invoice.payment_failed',
    refInvoice(FRIEND, 'declined', 0, { extra: { status: 'open', amount_due: 999 } })))
  subs.set(FRIEND.sub, refSub(FRIEND, 'past_due', PRICES.standard_month))
  await webhook(event('friend_past_due', 'customer.subscription.updated', subs.get(FRIEND.sub)))
  ok('a failed payment earns nothing', failed.status === 200 && creditsTo(REF.customer).length === 0
    && !(await reward(FRIEND)).reward_state, JSON.stringify(failed))
}

console.log('\n=== Bring a friend 3. The friend\'s first invoice is paid: one free month, once ===')
{
  // The card is updated and Stripe takes the payment. On this API version the
  // invoice names no payment; it is listed under invoice_payments.
  const first = refInvoice(FRIEND, 'first', 999)
  invoicePayments.set(first.id, [{ id: `inpay_${RUN}`, object: 'invoice_payment', invoice: first.id, status: 'paid',
    payment: { type: 'payment_intent', payment_intent: `pi_ref_friend_${RUN}` } }])
  subs.set(FRIEND.sub, refSub(FRIEND, 'active', PRICES.standard_month))
  const paidEvent = event('friend_paid', 'invoice.paid', first)
  // Stripe does not deliver in order: the payment before the subscription says active.
  const a = await webhook(paidEvent)
  const b = await webhook(event('friend_succeeded', 'invoice.payment_succeeded', first))
  await webhook(event('friend_active', 'customer.subscription.updated', subs.get(FRIEND.sub)))
  const replay = await webhook(paidEvent)
  const credits = creditsTo(REF.customer)
  ok('the inviting family gets one credit, however often Stripe sends it', a.status === 200 && b.status === 200
    && replay.status === 200 && credits.length === 1, JSON.stringify(credits))
  ok('worth one month of the plan it pays for (Elite, monthly: 15.99), not the friend\'s plan',
    credits[0]?.amount === -1599 && credits[0]?.currency === 'usd', JSON.stringify(credits[0]))
  ok('and it says nothing about the friend\'s family to Stripe', !JSON.stringify(credits[0]).includes(FRIEND.id)
    && Object.keys(credits[0]?.metadata || {}).length === 0, JSON.stringify(credits[0]))
  ok('the credit was asked for once, with an idempotency key naming the referral',
    calls.filter((c) => c.path === `/v1/customers/${REF.customer}/balance_transactions`).length === 1
    && calls.find((c) => c.path === `/v1/customers/${REF.customer}/balance_transactions`)?.key === `referral-reward:${FRIEND.id}`)
  const r = await reward(FRIEND)
  ok('the database has it applied, with the invoice and the payment it was paid with', r.reward_state === 'applied'
    && r.paid_invoice === first.id && r.paid_refs.includes(`pi_ref_friend_${RUN}`) && r.reward_amount === 1599
    && r.reward_tier === 'elite' && r.reward_cycle === 'month', JSON.stringify(r))
  ok('Stripe\'s answer says a free month was given', a.body.referral === 'owed', JSON.stringify(a.body))

  // A month later the friend renews.
  await webhook(event('friend_renewed', 'invoice.paid', refInvoice(FRIEND, 'renewal', 999)))
  ok('the friend\'s next invoice gives nothing more: one reward per family', creditsTo(REF.customer).length === 1)
}

console.log('\n=== Bring a friend 4. What the inviting parent sees, and the child does not ===')
{
  const mine = await rpcAs('my_referrals', REF.user)
  const summary = inviteSummary(mine)
  ok('the card counts the families who joined and pay', mine.claimed === 2 && mine.paying === 1
    && summary.joined === '2 families joined with your code, 1 pays for a plan.', JSON.stringify(mine))
  ok('and the free month earned', mine.earned === 1 && summary.rewards.some((x) => x.id === 'earned' && /1 free month earned/.test(x.text)),
    JSON.stringify(summary))
  const text = JSON.stringify(mine)
  ok('never another family\'s name, id or email', [FRIEND, SAMECARD, TWIN].every((f) => !text.includes(f.id)
    && !text.includes(f.email) && !text.includes(`Household ${f.n}`) && !text.includes(f.customer)), text)
  const notice = rewardNotice(mine)
  ok('"You earned a free month" is waiting, once', mine.unseen === 1 && notice?.title === 'You earned a free month!'
    && /next bill/.test(notice.body), JSON.stringify(notice))
  await rpcAs('see_referral_rewards', REF.user)
  ok('and once seen, it is gone for the family', rewardNotice(await rpcAs('my_referrals', REF.user)) === null)
  const kid = await rpcAs('my_referrals', REF_KID_PHONE)
  ok('the child\'s phone is told nothing about it', kid.ok === false && kid.code === undefined && kid.claimed === undefined, JSON.stringify(kid))
  const kidSnapshot = JSON.stringify(await rpcAs('family_snapshot', REF_KID_PHONE, { p_since: 0 }))
  ok('nor does anything about it reach the child\'s phone in its sync', !/referrals|referred|paid_invoice|reward_state|free month|cbtxn/i.test(kidSnapshot))
}

console.log('\n=== Bring a friend 5. The same card account, and the cap ===')
{
  // SAMECARD pays through the inviting family's own Stripe customer.
  await subscribe(SAMECARD, 'active', PRICES.standard_month, { customer: REF.customer })
  const before = creditsTo(REF.customer).length
  await webhook(event('samecard_paid', 'invoice.paid', refInvoice(SAMECARD, 'samecard', 999, { customer: REF.customer })))
  const r = await reward(SAMECARD)
  ok('a family paying with the inviter\'s own Stripe customer earns nothing', creditsTo(REF.customer).length === before
    && r.reward_state === 'blocked' && r.reward_note === 'same_customer', JSON.stringify(r))

  // Eleven more free months for REF this year: with FRIEND's, twelve.
  for (const n of EARLIER) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [RU(n), `walk-ref-earlier-${n}@example.com`])
    await db.query(`insert into families (id, name) values ($1, $2)`, [R(n), `Walk Referral Earlier ${n}`])
    await db.query(`insert into referrals (invited_family_id, referrer_family_id, paid_invoice, paid_at, reward_state, reward_at, reward_seen_at)
                    values ($1, $2, $3, now(), 'applied', now() - interval '30 days', now())`, [R(n), REF.id, `in_ref_earlier_${n}_${RUN}`])
  }
  ok('a thirteenth friend can still join', (await claim(CAPPED, refCode)).ok === true)
  await subscribe(CAPPED, 'active', PRICES.standard_month)
  await webhook(event('capped_paid', 'invoice.paid', refInvoice(CAPPED, 'capped', 999)))
  const c = await reward(CAPPED)
  ok('but twelve free months in a year is the most: the thirteenth earns nothing',
    creditsTo(REF.customer).length === before && c.reward_state === 'blocked' && c.reward_note === 'cap', JSON.stringify(c))
  const mine = await rpcAs('my_referrals', REF.user)
  ok('and the card says so', inviteSummary(mine).rewards.some((x) => x.id === 'cap'), JSON.stringify(inviteSummary(mine)))
}

console.log('\n=== Bring a friend 6. A refund within 14 days takes an unused month back ===')
{
  await subscribe(REF2, 'active', PRICES.elite_year)
  await webhook(event('ref2_paid', 'invoice.paid', refInvoice(REF2, 'ref2_year', 15990)))
  const code = (await rpcAs('my_referrals', REF2.user)).code
  ok('two friends join the yearly family', (await claim(FRIEND2, code)).ok === true && (await claim(FRIEND3, code)).ok === true)

  await subscribe(FRIEND2, 'active', PRICES.standard_month)
  // The older API shape: the invoice names its charge and payment.
  const charge = `ch_ref_friend2_${RUN}`
  const pi = `pi_ref_friend2_${RUN}`
  await webhook(event('friend2_paid', 'invoice.paid', refInvoice(FRIEND2, 'friend2', 999, { extra: { charge, payment_intent: pi } })))
  const credits = creditsTo(REF2.customer)
  ok('a yearly payer\'s free month is a twelfth of its yearly price (159.90 / 12)', credits.length === 1
    && credits[0].amount === -1333, JSON.stringify(credits))
  ok('the credit is still on the account, unused', balanceOf(REF2.customer) === -1333)

  const refunded = { id: charge, object: 'charge', customer: FRIEND2.customer, payment_intent: pi, amount: 999,
    amount_refunded: 999, refunded: true, currency: 'usd', created: clock - 30 }
  const back = await webhook(event('friend2_refund', 'charge.refunded', refunded))
  const again = await webhook(event('friend2_refund_again', 'charge.refunded', refunded))
  const r = await reward(FRIEND2)
  ok('refunded in full a few days later: the unused month is taken back', back.status === 200 && back.body.referral === 'withdrawn'
    && r.reward_state === 'withdrawn' && r.reward_note === 'refund_within_14_days' && balanceOf(REF2.customer) === 0, JSON.stringify([back.body, r]))
  ok('once, though the refund came twice', again.status === 200
    && balanceTxns.filter((t) => t.customer === REF2.customer && t.amount > 0).length === 1)
  ok('and the friend\'s own plan stops, as for any refund', (await db.query('select subscription_status from families where id = $1',
    [FRIEND2.id])).rows[0].subscription_status === 'refunded')
}

console.log('\n=== Bring a friend 7. A payment disputed before its invoice arrives ===')
{
  await subscribe(FRIEND3, 'active', PRICES.standard_month)
  const charge = `ch_ref_friend3_${RUN}`
  charges.set(charge, { id: charge, object: 'charge', customer: FRIEND3.customer, payment_intent: `pi_ref_friend3_${RUN}`,
    amount: 999, created: clock })
  const before = creditsTo(REF2.customer).length
  // Stripe does not deliver in order: the dispute names only the charge.
  const disputed = await webhook(event('friend3_dispute', 'charge.dispute.created', {
    id: `dp_ref_${RUN}`, object: 'dispute', charge, amount: 999, created: clock }))
  await webhook(event('friend3_paid', 'invoice.paid', refInvoice(FRIEND3, 'friend3', 999, { extra: { charge } })))
  const r = await reward(FRIEND3)
  ok('the disputed payment earns nothing when its invoice turns up', disputed.status === 200
    && creditsTo(REF2.customer).length === before && r.reward_state === 'blocked' && r.reward_note === 'payment_reversed',
  JSON.stringify([disputed.body, r]))
}

console.log('\n=== Bring a friend 8. A family on Starter: its month is banked until it subscribes ===')
{
  const code = (await rpcAs('my_referrals', STARTER.user)).code
  ok('a friend joins the Starter family', (await claim(FRIEND4, code)).ok === true)
  await subscribe(FRIEND4, 'active', PRICES.standard_month)
  await webhook(event('friend4_paid', 'invoice.paid', refInvoice(FRIEND4, 'friend4', 999)))
  let mine = await rpcAs('my_referrals', STARTER.user)
  ok('the month is banked: nothing to take it off yet, so nothing is sent to Stripe',
    (await reward(FRIEND4)).reward_state === 'banked' && !calls.some((c) => c.path === `/v1/customers/${STARTER.customer}/balance_transactions`)
    && (await db.query('select effective_tier($1) as t', [STARTER.id])).rows[0].t === 'starter', JSON.stringify(mine))
  ok('the card says it is banked, and when it is used', inviteSummary(mine).rewards.some((x) => x.id === 'banked'
    && /comes off your first bill when you choose a plan/.test(x.text)), JSON.stringify(inviteSummary(mine)))
  ok('and the notice says so too', /banked/.test(rewardNotice(mine)?.body || ''), JSON.stringify(rewardNotice(mine)))

  // The Starter family subscribes to Standard, monthly.
  const { created } = await subscribe(STARTER, 'active', PRICES.standard_month)
  await webhook(created)
  await webhook(event('starter_paid', 'invoice.paid', refInvoice(STARTER, 'starter_first', 999)))
  const credits = creditsTo(STARTER.customer)
  ok('the moment it subscribes, the banked month is credited: one month of the plan it chose',
    credits.length === 1 && credits[0].amount === -999, JSON.stringify(credits))
  mine = await rpcAs('my_referrals', STARTER.user)
  ok('and the card now has it as earned', mine.banked === 0 && mine.earned === 1, JSON.stringify(mine))
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
