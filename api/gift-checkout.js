/**
 * Serverless function: start paying for a gift ("a year of RankUp").
 *
 * The buyer needs no RankUp account: a grandparent, an aunt or an uncle buys
 * a year of Standard or Elite Pass for a family from the Give page (#/gift).
 * This keeps what they typed (start_gift_order, which checks it all again)
 * and sends them to Stripe Checkout for ONE payment at the yearly price.
 *
 * No code is made here. A code exists only once Stripe's webhook says this
 * checkout is paid (api/_shared/gifts.js), so an abandoned checkout leaves
 * nothing anybody could redeem; its order is deleted by retention after 14
 * days.
 *
 * Why one-time Stripe prices of their own (STRIPE_PRICE_GIFT_STANDARD_YEAR,
 * STRIPE_PRICE_GIFT_ELITE_YEAR) rather than the yearly subscription prices
 * or an amount worked out here: Checkout's one-off payments take only
 * one-time prices, and an amount written in this code would break the rule
 * that the code names a price and Stripe holds the money (docs/PAYMENTS.md,
 * "Changing a price"). Separate prices also keep gifts apart in Stripe's
 * reports and give the receipt its own name.
 */
import { makeStripe, stripeUnavailable } from './_shared/stripe.js'
import { reportError } from './_shared/job.js'
import { returnOrigin } from './_shared/site.js'
import { checkGiftForm, giftPlan } from '../src/lib/giftRules.js'
import { ipKey } from './_shared/gifts.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/** The two one-time prices, at the yearly amounts in TIERS. */
const GIFT_PRICES = {
  standard: process.env.STRIPE_PRICE_GIFT_STANDARD_YEAR || '',
  elite: process.env.STRIPE_PRICE_GIFT_ELITE_YEAR || '',
}

async function serviceRpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!STRIPE_SECRET || !SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: 'not_configured' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const { ok, errors, clean } = checkGiftForm({
    plan: body?.plan, delivery: body?.delivery, buyerEmail: body?.buyerEmail,
    fromName: body?.fromName, toName: body?.toName, toEmail: body?.toEmail, message: body?.message,
  })
  if (!ok) return res.status(400).json({ error: 'invalid', fields: Object.keys(errors) })
  const price = GIFT_PRICES[clean.plan]
  if (!price) return res.status(503).json({ error: 'not_configured' })

  // Stripe sends the buyer back here afterwards: this site only.
  const origin = returnOrigin(req)
  if (!origin) return res.status(503).json({ error: 'not_configured' })

  let order
  try {
    order = await serviceRpc('start_gift_order', {
      p_plan: clean.plan,
      p_delivery: clean.delivery,
      p_buyer_email: clean.buyerEmail,
      p_from_name: clean.fromName || null,
      p_to_name: clean.toName || null,
      // Only kept when the gift is to be emailed: "I'll give it myself"
      // needs nobody's address.
      p_to_email: clean.delivery === 'email' ? clean.toEmail : null,
      p_message: clean.message || null,
      // At most 10 started an hour from one address: a keyed hash of it.
      p_ip_key: await ipKey(req, process.env.GIFT_CODE_SECRET || SERVICE_KEY),
    })
  } catch (err) {
    await reportError('gift-checkout', err)
    return res.status(502).json({ error: 'checkout_failed' })
  }
  if (!order?.ok) {
    return res.status(['busy', 'too_many_gifts'].includes(order?.reason) ? 429 : 400).json({ error: order?.reason || 'invalid' })
  }

  const plan = giftPlan(clean.plan)
  try {
    const stripe = makeStripe(STRIPE_SECRET)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      customer_email: clean.buyerEmail,
      client_reference_id: order.order_id,
      // `kind` is what the webhook looks for first. Nothing about who the
      // gift is for goes to Stripe: that stays in RankUp's database, and
      // goes on the day the privacy policy says.
      metadata: { kind: 'gift', gift_order: order.order_id, plan: clean.plan },
      payment_intent_data: {
        description: `RankUp gift: ${plan.name}, 1 year`,
        metadata: { kind: 'gift', gift_order: order.order_id },
      },
      submit_type: 'pay',
      success_url: `${origin}/#/gift?paid=1`,
      cancel_url: `${origin}/#/gift?cancelled=1`,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    await reportError('gift-checkout', err)
    return res.status(stripeUnavailable(err) ? 503 : 502).json({ error: stripeUnavailable(err) ? 'stripe_unavailable' : 'checkout_failed' })
  }
}
