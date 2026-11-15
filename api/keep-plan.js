/**
 * Serverless function: keep a plan instead of cancelling it.
 *
 *   POST { action: 'pause', months: 1 | 2 | 3 }   stop billing for a while
 *   POST { action: 'resume' }                     start billing again now
 *   POST { action: 'save' }                       one month at half price,
 *                                                 once per family, ever
 *
 * Offered to a parent on the way to cancelling (the plan screen's "Before
 * you cancel"), never instead of it: cancelling stays one tap away, in
 * Stripe's own portal (api/billing-portal.js, flow "cancel").
 *
 * Only a parent of the family can ask (billing_status answers only for a
 * parent's own token, never a supporter's or a child's phone), and the
 * family and its subscription come from the database, never the request.
 * The database decides who may (start_plan_pause, claim_save_offer in
 * supabase/billing.sql) and writes it down BEFORE Stripe is asked, so two
 * taps cannot both have the half-price month; then Stripe is asked; then
 * the database is told how Stripe answered, and undoes it if Stripe did not
 * take it. Every Stripe call carries an idempotency key.
 *
 * A pause is Stripe's pause_collection with behavior "void": the invoices
 * that fall inside it are voided, so nothing is charged, and Stripe starts
 * charging again by itself on resumes_at. A family on a monthly plan that
 * pauses for N months misses exactly N monthly charges. While it runs,
 * effective_tier counts the plan as the free level; nothing is deleted.
 *
 * The half-price month is the coupon in STRIPE_SAVE_COUPON (50% off, once),
 * added to the subscription beside any discount it already has. Without
 * that setting the offer is not made at all (`save_off`).
 */

import { makeStripe, stripeUnavailable } from './_shared/stripe.js'
import { makeServiceRpc, reportError, userHeaders } from './_shared/job.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SAVE_COUPON = process.env.STRIPE_SAVE_COUPON || ''

const ACTIONS = new Set(['pause', 'resume', 'save'])

/** The caller's own family, as billing_status tells a parent. */
async function callerBilling(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/billing_status`, {
      method: 'POST',
      headers: userHeaders(token),
      body: '{}',
    })
    if (!res.ok) return null
    const status = await res.json()
    return status?.ok && status.family_id ? status : null
  } catch {
    return null
  }
}

/** Monthly or yearly, from the price Stripe charges. */
function cycleOf(sub) {
  const item = sub?.items?.data?.[0]
  const interval = item?.price?.recurring?.interval || item?.plan?.interval || sub?.metadata?.cycle
  return interval === 'year' || interval === 'month' ? interval : null
}

/**
 * What Stripe itself says stands in the way, before the database is asked:
 * Stripe is the truth about the subscription, the family row a copy of it.
 */
function stripeRefusal(sub, action) {
  if (!sub || sub.status === 'canceled') return 'no_subscription'
  if (action !== 'resume' && sub.status !== 'active') return 'not_active'
  if (action !== 'resume' && sub.pause_collection) return action === 'save' ? 'paused' : 'already_paused'
  if (action !== 'resume' && (sub.cancel_at || sub.cancel_at_period_end)) return 'plan_ending'
  return null
}

const failed = (err) => (stripeUnavailable(err) ? [503, 'stripe_unavailable'] : [502, null])

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!STRIPE_SECRET || !SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: 'not_configured' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'signed_out' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const action = typeof body?.action === 'string' ? body.action : ''
  if (!ACTIONS.has(action)) return res.status(400).json({ error: 'bad_request' })
  const months = Number(body?.months)
  if (action === 'pause' && !(Number.isInteger(months) && months >= 1 && months <= 3)) {
    return res.status(400).json({ error: 'bad_months' })
  }
  if (action === 'save' && !SAVE_COUPON) return res.status(503).json({ error: 'save_off' })

  const billing = await callerBilling(token)
  if (!billing) return res.status(403).json({ error: 'no_family' })
  const familyId = billing.family_id
  const rpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)
  const stripe = makeStripe(STRIPE_SECRET)

  let subscriptionId
  try {
    subscriptionId = await rpc('stripe_subscription_for_family', { p_family_id: familyId })
  } catch (err) {
    await reportError('keep-plan', err)
    return res.status(502).json({ error: 'database_unreachable' })
  }
  if (!subscriptionId) return res.status(409).json({ error: 'no_subscription' })

  // ---- resume: start billing again now ----
  if (action === 'resume') {
    if (!billing.paused_until) return res.status(409).json({ error: 'not_paused' })
    try {
      // An empty value takes the pause off. Charging carries on from the next
      // renewal date; nothing is charged today.
      await stripe.subscriptions.update(subscriptionId, { pause_collection: '' },
        { idempotencyKey: `rankup-resume-${familyId}-${String(billing.paused_until).slice(0, 19)}` })
    } catch (err) {
      await reportError('keep-plan:resume', err)
      const [code, why] = failed(err)
      return res.status(code).json({ error: why || 'resume_failed' })
    }
    try {
      await rpc('end_plan_pause', { p_family_id: familyId })
    } catch (err) {
      // Stripe has resumed it; its webhook tells the database the same.
      await reportError('keep-plan:resume', err)
    }
    return res.status(200).json({ ok: true, resumed: true })
  }

  let sub
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId)
  } catch (err) {
    await reportError(`keep-plan:${action}`, err)
    const [code, why] = failed(err)
    return res.status(code).json({ error: why || `${action}_failed` })
  }
  const refusal = stripeRefusal(sub, action)
  if (refusal) return res.status(409).json({ error: refusal })
  const cycle = cycleOf(sub)

  // ---- pause: 1, 2 or 3 months ----
  if (action === 'pause') {
    let start
    try {
      start = await rpc('start_plan_pause', { p_family_id: familyId, p_months: months, p_cycle: cycle })
    } catch (err) {
      await reportError('keep-plan:pause', err)
      return res.status(502).json({ error: 'database_unreachable' })
    }
    if (!start?.ok) return res.status(409).json({ error: start?.reason || 'pause_failed' })
    try {
      await stripe.subscriptions.update(subscriptionId, {
        pause_collection: { behavior: 'void', resumes_at: Math.floor(Date.parse(start.resumes_at) / 1000) },
      }, { idempotencyKey: `rankup-pause-${start.pause_id}` })
    } catch (err) {
      await reportError('keep-plan:pause', err)
      await rpc('finish_plan_pause', { p_pause_id: start.pause_id, p_ok: false }).catch(() => {})
      const [code, why] = failed(err)
      return res.status(code).json({ error: why || 'pause_failed' })
    }
    await rpc('finish_plan_pause', { p_pause_id: start.pause_id, p_ok: true }).catch(() => {})
    return res.status(200).json({ ok: true, paused_until: start.resumes_at, months })
  }

  // ---- save: one month at half price, once per family, ever ----
  let claim
  try {
    claim = await rpc('claim_save_offer', { p_family_id: familyId, p_cycle: cycle })
  } catch (err) {
    await reportError('keep-plan:save', err)
    return res.status(502).json({ error: 'database_unreachable' })
  }
  if (!claim?.ok) return res.status(409).json({ error: claim?.reason || 'save_failed' })
  try {
    // Beside whatever discount the plan already has (an Alliance prize, say),
    // not instead of it.
    const kept = (sub.discounts || []).map((d) => ({ discount: typeof d === 'string' ? d : d.id })).filter((d) => d.discount)
    await stripe.subscriptions.update(subscriptionId, { discounts: [...kept, { coupon: SAVE_COUPON }] },
      { idempotencyKey: `rankup-save-${familyId}-${String(claim.claimed_at || '').slice(0, 19)}` })
  } catch (err) {
    await reportError('keep-plan:save', err)
    await rpc('finish_save_offer', { p_family_id: familyId, p_ok: false }).catch(() => {})
    const [code, why] = failed(err)
    return res.status(code).json({ error: why || 'save_failed' })
  }
  await rpc('finish_save_offer', { p_family_id: familyId, p_ok: true }).catch(() => {})
  return res.status(200).json({ ok: true, saved: true })
}
