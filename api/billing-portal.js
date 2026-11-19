/**
 * Serverless function: open Stripe's customer portal.
 *
 * Cancelling, changing a card and downloading invoices all happen there rather
 * than being rebuilt here. With `flow`, it opens on one page of it: cancelling
 * (one tap from the plan screen), or confirming a move to Elite or to yearly
 * billing (see FLOWS). That is not laziness: those flows carry legal
 * obligations about how cancellation is presented, and Stripe keeps theirs
 * current.
 */

import { makeStripe, stripeUnavailable } from './_shared/stripe.js'
import { reportError, userHeaders } from './_shared/job.js'
import { returnOrigin } from './_shared/site.js'
import { timedFetch } from './_shared/http.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/*
 * The family plans' prices, the same four create-checkout.js charges. A
 * change of plan in the portal moves the subscription from one of these to
 * another, so a family is only ever charged a price the plan screen shows.
 */
const PRICES = {
  month: { standard: process.env.STRIPE_PRICE_STANDARD || '', elite: process.env.STRIPE_PRICE_ELITE || '' },
  year: { standard: process.env.STRIPE_PRICE_STANDARD_YEAR || '', elite: process.env.STRIPE_PRICE_ELITE_YEAR || '' },
}

/*
 * Straight to one thing in Stripe's portal, instead of its front page:
 *
 *   cancel   Stripe's own "cancel your plan" page. The plan screen's
 *            "Cancel my plan" opens it in one tap, after the pause and the
 *            half-price month have been offered, never instead of them.
 *   upgrade  Elite, for the same period they pay for now (the Elite nudge).
 *   yearly   the same plan, billed yearly ("Switch to yearly" in Settings).
 *
 * The last two use Stripe's confirm page (subscription_update_confirm), so
 * the parent sees the new price and what is charged today before agreeing.
 */
const FLOWS = new Set(['cancel', 'upgrade', 'yearly'])

/*
 * The portal configuration for changing plan (bpc_...), its own: the only
 * one that lets a customer switch price, used for the Elite and yearly
 * confirm pages alone. The default configuration, which the front page and
 * "Cancel my plan" open, does not allow switching, so the half-price
 * month's coupon can never land on a yearly charge made from there (the
 * yearly flow itself waits out that month). docs/PAYMENTS.md, "The customer
 * portal's two configurations".
 */
const PLAN_CHANGE_CONFIG = process.env.STRIPE_PORTAL_PLAN_CHANGE_CONFIG || ''

/** Which plan, and which period, a subscription's price is. */
function planOf(sub) {
  const item = sub?.items?.data?.[0]
  const price = item?.price?.id || item?.plan?.id || ''
  for (const cycle of ['month', 'year']) {
    for (const tier of ['standard', 'elite']) {
      if (price && PRICES[cycle][tier] === price) return { item, tier, cycle }
    }
  }
  const interval = item?.price?.recurring?.interval || item?.plan?.interval
  const tier = sub?.metadata?.tier === 'elite' ? 'elite' : sub?.metadata?.tier === 'standard' ? 'standard' : null
  return { item, tier, cycle: interval === 'year' ? 'year' : interval === 'month' ? 'month' : null }
}

/**
 * The portal session's flow for `flow`, or { error } to answer with. Asks
 * Stripe for the subscription: which price it is on now is Stripe's to say.
 */
async function flowData(stripe, status, flow, origin) {
  const subscriptionId = await serviceRpc('stripe_subscription_for_family', { p_family_id: status.family_id })
  if (!subscriptionId) return { error: 'no_subscription', code: 400 }
  const back = { type: 'redirect', redirect: { return_url: `${origin}/#/parent/plan${flow === 'cancel' ? '' : '?changed=1'}` } }
  if (flow === 'cancel') {
    return { flow: { type: 'subscription_cancel', subscription_cancel: { subscription: subscriptionId }, after_completion: back } }
  }
  // Changing plan during a pause would start charging the new price today.
  if (status.paused_until) return { error: 'paused', code: 409 }
  // Yearly bills the year at once, and the half-price month's coupon takes
  // 50% off the next invoice, whatever it is: half a year free. Not until
  // that month is over (the same 31 days a pause waits).
  if (flow === 'yearly' && status.save_offer_recent) return { error: 'half_price_yearly', code: 409 }
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  if (!sub || !['active', 'trialing'].includes(sub.status)) return { error: 'no_subscription', code: 400 }
  const { item, tier, cycle } = planOf(sub)
  if (!item?.id || !tier || !cycle) return { error: 'custom_plan', code: 409 }
  if (flow === 'upgrade' && tier === 'elite') return { error: 'already_elite', code: 409 }
  if (flow === 'yearly' && cycle === 'year') return { error: 'already_yearly', code: 409 }
  const price = flow === 'upgrade' ? PRICES[cycle].elite : PRICES.year[tier]
  if (!price || !PLAN_CHANGE_CONFIG) return { error: 'not_configured', code: 503 }
  return {
    configuration: PLAN_CHANGE_CONFIG,
    flow: {
      type: 'subscription_update_confirm',
      subscription_update_confirm: { subscription: subscriptionId, items: [{ id: item.id, price, quantity: 1 }] },
      after_completion: back,
    },
  }
}

async function serviceRpc(fn, args) {
  const res = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function schoolPortal(req, res, token) {
  try {
    const infoRes = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/school_checkout_info`, {
      method: 'POST',
      headers: userHeaders(token),
      body: '{}',
    })
    const info = await infoRes.json()
    // "Already paying" is a refusal to start a second checkout, and the very
    // school that should reach the portal: its card, invoices and cancelling.
    if (!info?.ok && info?.reason !== 'already_paying') return res.status(403).json({ error: info?.reason || 'not_school_admin' })
    if (!info.has_customer) return res.status(400).json({ error: 'no_subscription' })

    const customerRes = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/stripe_customer_for_school`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ p_school_id: info.school_id }),
    })
    const customerId = await customerRes.json()
    if (!customerId) return res.status(400).json({ error: 'no_customer' })

    const origin = returnOrigin(req)
    if (!origin) {
      return res.status(503).json({
        error: 'not_configured',
        message: 'PUBLIC_SITE_URL is not set on the server, so there is nowhere to send you back to.',
      })
    }
    const portal = await makeStripe(STRIPE_SECRET).billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/#/school`,
    })
    return res.status(200).json({ url: portal.url })
  } catch (err) {
    await reportError('billing-portal:school', err)
    return res.status(stripeUnavailable(err) ? 503 : 502).json({ error: stripeUnavailable(err) ? 'stripe_unavailable' : 'portal_failed' })
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!STRIPE_SECRET) return res.status(503).json({ error: 'not_configured' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }

  // A school's admin managing the school's card. Same shape as a family's:
  // the caller's token says which school, and the customer id never leaves
  // the server.
  if (body?.for === 'school') return schoolPortal(req, res, token)

  try {
    // billing_status runs as the caller, so it can only ever describe their own
    // family — the customer id comes from the database, never from the request.
    const statusRes = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/billing_status`, {
      method: 'POST',
      headers: userHeaders(token),
      body: '{}',
    })
    const status = await statusRes.json()
    if (!status?.ok || !status.has_customer) {
      return res.status(400).json({ error: 'no_subscription' })
    }

    // The customer id itself is fetched with the service key, so the browser
    // never has to hold or send it.
    const customerRes = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/stripe_customer_for_family`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ p_family_id: status.family_id }),
    })
    const customerId = await customerRes.json()
    if (!customerId) return res.status(400).json({ error: 'no_customer' })

    const origin = returnOrigin(req)
    // Same as create-checkout: with no origin there is no absolute URL to
    // return to, and Stripe's rejection of a relative one told the parent
    // nothing useful.
    if (!origin) {
      return res.status(503).json({
        error: 'not_configured',
        message: 'PUBLIC_SITE_URL is not set on the server, so there is nowhere to send you back to.',
      })
    }

    const stripe = makeStripe(STRIPE_SECRET)

    // Straight to cancelling, or to a change of plan, when asked for one.
    let flow = null
    let configuration = null
    if (body?.flow !== undefined && body?.flow !== null) {
      if (!FLOWS.has(body.flow)) return res.status(400).json({ error: 'bad_request' })
      const made = await flowData(stripe, status, body.flow, origin)
      if (made.error) return res.status(made.code).json({ error: made.error })
      flow = made.flow
      configuration = made.configuration || null
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/#/parent/plan`,
      // Elite and yearly: the plan-change configuration. Everything else:
      // the default, which allows no switching.
      ...(configuration ? { configuration } : {}),
      ...(flow ? { flow_data: flow } : {}),
    })
    return res.status(200).json({ url: portal.url })
  } catch (err) {
    await reportError('billing-portal', err)
    return res.status(stripeUnavailable(err) ? 503 : 502).json({ error: stripeUnavailable(err) ? 'stripe_unavailable' : 'portal_failed' })
  }
}
