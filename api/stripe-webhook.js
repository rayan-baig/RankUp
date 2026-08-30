/**
 * Serverless function: Stripe's webhook.
 *
 * This is the ONLY thing that decides what a family has paid for. Nothing in
 * the app can set its own tier — the database refuses — so if this endpoint is
 * not deployed and reachable, nobody ever gets Elite no matter what they pay.
 * That is the correct failure direction, but it does mean this is not optional.
 *
 * TWO THINGS MUST BE RIGHT
 *
 * 1. The signature is verified against the raw body. Without it, anyone who
 *    finds this URL can post "subscription active" and hand themselves Elite,
 *    for ever, for free. That is why the body is read as a raw buffer: a JSON
 *    parser re-serialises, the bytes change, and the signature check fails —
 *    which people then "fix" by skipping the check.
 *
 * 2. Handling is idempotent. Stripe retries deliveries, and a retry that
 *    replayed an old "canceled" event would downgrade a family who had already
 *    resubscribed. apply_subscription_change records each event id and ignores
 *    repeats.
 */

import Stripe from 'stripe'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
const ELITE_PRICE = process.env.STRIPE_PRICE_ELITE || ''
const STANDARD_PRICE = process.env.STRIPE_PRICE_STANDARD || ''
const STARTER_PRICE = process.env.STRIPE_PRICE_STARTER || ''

/** Vercel must not parse the body, or the signature cannot be verified. */
export const config = { api: { bodyParser: false } }

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function serviceRpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/**
 * Which tier does this subscription actually buy?
 *
 * The price id is the authority — it is what Stripe actually charged. Metadata
 * is only a fallback, and anything unrecognised falls to the cheapest plan
 * rather than to a plan nobody paid for.
 */
function tierFor(subscription) {
  const priceId = subscription?.items?.data?.[0]?.price?.id
  if (ELITE_PRICE && priceId === ELITE_PRICE) return 'elite'
  if (STANDARD_PRICE && priceId === STANDARD_PRICE) return 'standard'
  if (STARTER_PRICE && priceId === STARTER_PRICE) return 'starter'
  const claimed = subscription?.metadata?.tier
  return claimed === 'elite' || claimed === 'standard' ? claimed : 'starter'
}

async function familyIdFor(object, stripe) {
  const direct = object?.metadata?.family_id || object?.client_reference_id
  if (direct) return direct
  const customerId = typeof object?.customer === 'string' ? object.customer : object?.customer?.id
  if (!customerId) return null
  // Events like invoice.payment_failed carry only the customer.
  const found = await serviceRpc('family_for_customer', { p_customer_id: customerId })
  if (found) return found
  // Last resort: the subscription's own metadata.
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1 })
    return subs.data[0]?.metadata?.family_id || null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!STRIPE_SECRET || !WEBHOOK_SECRET || !SERVICE_KEY) {
    return res.status(503).json({ error: 'not_configured' })
  }

  const stripe = new Stripe(STRIPE_SECRET)
  const body = await rawBody(req)

  let event
  try {
    event = stripe.webhooks.constructEvent(body, req.headers['stripe-signature'], WEBHOOK_SECRET)
  } catch (err) {
    // An unverified event is an attacker or a misconfiguration. Never act on it.
    console.error('[stripe-webhook] bad signature:', err.message)
    return res.status(400).json({ error: 'invalid_signature' })
  }

  try {
    const object = event.data.object

    if (event.type === 'checkout.session.completed') {
      const familyId = object.metadata?.family_id || object.client_reference_id
      const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id
      if (familyId && customerId) {
        await serviceRpc('attach_stripe_customer', { p_family_id: familyId, p_customer_id: customerId })
      }
      /**
       * A Flash Ticket pack is a one-off payment, so there is no subscription
       * event coming after this one — this is where it gets credited. Guarded
       * on payment_status because a session can complete unpaid.
       */
      if (object.metadata?.product === 'flash_tickets' && object.payment_status === 'paid' && familyId) {
        await serviceRpc('credit_flash_tickets', {
          p_family_id: familyId,
          p_count: Number(object.metadata?.ticket_count) || 3,
          p_stripe_event: event.id,
          p_payload: { type: event.type },
        })
      }
      // For a subscription, the events that follow carry the authoritative
      // status, so nothing is granted here.
      return res.status(200).json({ received: true })
    }

    if (event.type.startsWith('customer.subscription.')) {
      const familyId = await familyIdFor(object, stripe)
      if (!familyId) {
        console.warn('[stripe-webhook] no family for', event.type)
        return res.status(200).json({ received: true, ignored: 'no_family' })
      }
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : object.status
      await serviceRpc('apply_subscription_change', {
        p_family_id: familyId,
        p_status: status,
        p_tier: tierFor(object),
        p_customer_id: typeof object.customer === 'string' ? object.customer : null,
        p_subscription_id: object.id,
        p_period_end: object.current_period_end
          ? new Date(object.current_period_end * 1000).toISOString()
          : null,
        p_stripe_event: event.id,
        p_payload: { type: event.type },
      })
      return res.status(200).json({ received: true })
    }

    if (event.type === 'invoice.payment_failed') {
      const familyId = await familyIdFor(object, stripe)
      if (familyId) {
        await serviceRpc('apply_subscription_change', {
          p_family_id: familyId,
          p_status: 'past_due',
          p_tier: 'standard',
          p_stripe_event: event.id,
          p_payload: { type: event.type },
        })
      }
      return res.status(200).json({ received: true })
    }

    return res.status(200).json({ received: true, ignored: event.type })
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient failure.
    console.error('[stripe-webhook]', event?.type, err.message)
    return res.status(500).json({ error: 'handler_failed' })
  }
}
