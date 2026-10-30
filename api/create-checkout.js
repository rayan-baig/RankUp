/**
 * Serverless function: start a Stripe Checkout session.
 *
 * The browser never talks to Stripe directly with a secret key — it asks here,
 * this creates a session, and the person is sent to Stripe's own hosted page.
 * Card details never touch RankUp, which is most of why PCI compliance is
 * Stripe's problem rather than yours.
 *
 * The family id is carried in the session's metadata so the webhook knows who
 * paid. The caller has to prove they belong to that family first — otherwise
 * anyone could start a checkout that upgrades somebody else's account.
 */

import { makeStripe } from './_shared/stripe.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/**
 * Two ways to pay for the same two plans.
 *
 * Starter is free and has no price id at all — there is nothing to charge for,
 * and a checkout for it is refused below rather than sending somebody to Stripe
 * to be billed nothing.
 *
 * Annual exists because the cancel decision then happens once a year instead of
 * twelve times, which is most of what churn actually is in a family app. Two
 * months free is the usual shape and is priced in Stripe, not here — this file
 * only ever names a price id, so the numbers on the plan screen and the numbers
 * on the card can never disagree because of something in this code.
 */
const PRICES = {
  month: {
    standard: process.env.STRIPE_PRICE_STANDARD || '',
    elite: process.env.STRIPE_PRICE_ELITE || '',
  },
  year: {
    standard: process.env.STRIPE_PRICE_STANDARD_YEAR || '',
    elite: process.env.STRIPE_PRICE_ELITE_YEAR || '',
  },
}

/** Anything that is not the word "year" is a month. Never guess from a price. */
const cycleOf = (value) => (value === 'year' ? 'year' : 'month')

/**
 * One-off purchases: the three Flash Ticket packs.
 *
 * The ticket count lives here rather than in the request body, so a caller
 * cannot ask for the cheap pack and be credited the big one. Stripe's flat
 * per-transaction fee is why the bigger packs exist at all — on a $2.99 sale
 * that thirty cents is ten percent of the price.
 */
const PRODUCTS = {
  flash_2: { price: process.env.STRIPE_PRICE_FLASH_2 || '', tickets: 2 },
  flash_5: { price: process.env.STRIPE_PRICE_FLASH_5 || '', tickets: 5 },
  flash_12: { price: process.env.STRIPE_PRICE_FLASH_12 || '', tickets: 12 },
}

/**
 * Which family is asking, according to their own token.
 *
 * This used to call family_snapshot(0), which returns EVERY row the caller can
 * see — every quest, every submission, and every proof photo as base64 — purely
 * to read one id off the front of it. On a family with a few pending photos
 * that is megabytes across the wire to answer "who are you", on a button a
 * parent taps while deciding whether to pay.
 *
 * billing_status returns the one field, and it joins through `parents`, so a
 * child's device cannot start a checkout for their family either.
 */
async function callerBilling(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/billing_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
      body: '{}',
    })
    if (!res.ok) return null
    const status = await res.json()
    return status?.ok && status.family_id ? status : null
  } catch {
    return null
  }
}

/**
 * The family's Stripe customer, read with the service key so the id never goes
 * near the browser. Reusing it keeps one family on one customer: a new one per
 * checkout left the billing portal showing only the newest, with an older plan
 * still charging where the family could not see it to cancel it.
 */
async function existingCustomer(familyId) {
  if (!SERVICE_KEY) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stripe_customer_for_family`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ p_family_id: familyId }),
    })
    return res.ok ? (await res.json()) || null : null
  } catch {
    return null
  }
}

/**
 * What is left of the in-app free trial, as a Stripe trial end, or nothing.
 *
 * It used to be fourteen days on every checkout: cancel during the trial,
 * check out again, fourteen more, for ever; and someone paying on day 13 of
 * their in-app trial got fourteen days instead of one. Now the card carries
 * only the days the family had left, never more, and a family that has had a
 * Stripe customer before (so has had its trial) gets none. Stripe refuses a
 * trial end under two days away, so a nearly-finished trial is not carried.
 */
function trialEndFor(billing, now = Date.now()) {
  if (billing.has_customer) return undefined
  const end = new Date(billing.trial_ends_at || 0).getTime()
  if (!Number.isFinite(end) || end < now + 2 * 86400000) return undefined
  return Math.floor(end / 1000)
}

/**
 * Only our own site. PUBLIC_SITE_URL is the authority when set; otherwise the
 * request's own Origin header is allowed, because that is the browser's word
 * rather than the body's. Anything else is refused outright rather than
 * silently rewritten, so a misconfiguration is visible.
 */
function safeOrigin(candidate) {
  const allowed = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '')
  if (allowed) return allowed
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return ''
    return url.origin
  } catch {
    return ''
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!STRIPE_SECRET || !SUPABASE_URL) return res.status(503).json({ error: 'not_configured' })

  // Who is asking comes first. Validating the body first meant a caller with no
  // token at all could learn which plans and ticket packs this deployment has
  // prices configured for, one guess at a time.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  // Either a subscription (a plan) or a one-off (a ticket pack), never both.
  const product = body?.product
  const tier = body?.tier
  const cycle = cycleOf(body?.cycle)
  const oneOff = Boolean(product)
  const planPrice = oneOff ? '' : PRICES[cycle][tier] || ''
  if (oneOff ? !PRODUCTS[product]?.price : !planPrice) {
    return res.status(400).json({ error: oneOff ? 'Unknown product.' : 'Unknown plan.' })
  }

  // The caller's own token decides which family this is. Trusting a family id
  // from the request body would let anyone upgrade anyone.
  const billing = await callerBilling(token)
  if (!billing) return res.status(403).json({ error: 'No family for this account.' })
  const familyId = billing.family_id

  // A family already paying changes plan in the billing portal, where Stripe
  // swaps the price on the subscription they have. A second checkout started a
  // second subscription, billed twice, and the two then fought over the plan.
  if (!oneOff && billing.has_subscription && ['active', 'trialing', 'past_due'].includes(billing.status)) {
    return res.status(409).json({ error: 'already_subscribed' })
  }

  // Whatever lands in success_url/cancel_url is where Stripe sends the person
  // after paying, on a page carrying RankUp's name. An unvalidated origin from
  // the request body makes that an attacker's site.
  // The browser's own Origin header, never the request body: a body that named
  // any https site let a checkout page carrying RankUp's name send the payer
  // on to it afterwards.
  const origin = safeOrigin(req.headers.origin || '')
  // No origin means no absolute URL to send Stripe back to. Sending a relative
  // one produced a Stripe 400 reported to the parent as "checkout_failed",
  // which says nothing about the actual problem: PUBLIC_SITE_URL is not set.
  if (!origin) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'PUBLIC_SITE_URL is not set on the server, so there is nowhere to send you back to.',
    })
  }
  const stripe = makeStripe(STRIPE_SECRET)
  const customer = billing.has_customer ? await existingCustomer(familyId) : null
  const trialEnd = oneOff ? undefined : trialEndFor(billing)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: oneOff ? 'payment' : 'subscription',
      ...(customer ? { customer } : {}),
      line_items: [{ price: oneOff ? PRODUCTS[product].price : planPrice, quantity: 1 }],
      client_reference_id: familyId,
      // Both, because different webhook events surface different ones.
      metadata: oneOff
        ? { family_id: familyId, product, ticket_count: String(PRODUCTS[product].tickets) }
        : { family_id: familyId, tier, cycle },
      ...(oneOff ? {} : {
        subscription_data: {
          metadata: { family_id: familyId, tier, cycle },
          // What is left of the in-app trial, if anything. See trialEndFor.
          ...(trialEnd ? { trial_end: trialEnd } : {}),
        },
      }),
      success_url: oneOff
        ? `${origin}/#/parent/settings?tickets=success`
        : `${origin}/#/parent/plan?checkout=success`,
      cancel_url: oneOff
        ? `${origin}/#/parent/settings?tickets=cancelled`
        : `${origin}/#/parent/plan?checkout=cancelled`,
      allow_promotion_codes: !oneOff,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    // Logged here, not returned: Stripe's message can describe this
    // deployment's configuration ("No such price ...").
    console.error('[create-checkout]', err.message)
    return res.status(502).json({ error: 'checkout_failed' })
  }
}
