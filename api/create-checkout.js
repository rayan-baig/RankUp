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

import Stripe from 'stripe'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const PRICES = {
  standard: process.env.STRIPE_PRICE_STANDARD || '',
  elite: process.env.STRIPE_PRICE_ELITE || '',
}

async function callerFamilyId(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/family_snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_since: 0 }),
    })
    if (!res.ok) return null
    const snapshot = await res.json()
    return snapshot?.families?.[0]?.id || null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!STRIPE_SECRET || !SUPABASE_URL) return res.status(503).json({ error: 'not_configured' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const tier = body?.tier
  if (!PRICES[tier]) return res.status(400).json({ error: 'Unknown plan.' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })

  // The caller's own token decides which family this is. Trusting a family id
  // from the request body would let anyone upgrade anyone.
  const familyId = await callerFamilyId(token)
  if (!familyId) return res.status(403).json({ error: 'No family for this account.' })

  const origin = body?.origin || req.headers.origin || ''
  const stripe = new Stripe(STRIPE_SECRET)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: PRICES[tier], quantity: 1 }],
      client_reference_id: familyId,
      // Both, because different webhook events surface different ones.
      metadata: { family_id: familyId, tier },
      subscription_data: { metadata: { family_id: familyId, tier } },
      success_url: `${origin}/#/parent/plan?checkout=success`,
      cancel_url: `${origin}/#/parent/plan?checkout=cancelled`,
      allow_promotion_codes: true,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[create-checkout]', err.message)
    return res.status(502).json({ error: 'checkout_failed', message: err.message })
  }
}
