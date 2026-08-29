/**
 * Serverless function: open Stripe's customer portal.
 *
 * Cancelling, changing a card and downloading invoices all happen there rather
 * than being rebuilt here. That is not laziness: those flows carry legal
 * obligations about how cancellation is presented, and Stripe keeps theirs
 * current.
 */

import Stripe from 'stripe'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

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

  try {
    // billing_status runs as the caller, so it can only ever describe their own
    // family — the customer id comes from the database, never from the request.
    const statusRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/billing_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
      body: '{}',
    })
    const status = await statusRes.json()
    if (!status?.ok || !status.has_customer) {
      return res.status(400).json({ error: 'no_subscription' })
    }

    // The customer id itself is fetched with the service key, so the browser
    // never has to hold or send it.
    const customerRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stripe_customer_for_family`, {
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

    const stripe = new Stripe(STRIPE_SECRET)

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${body.origin || req.headers.origin || ''}/#/parent/plan`,
    })
    return res.status(200).json({ url: portal.url })
  } catch (err) {
    console.error('[billing-portal]', err.message)
    return res.status(502).json({ error: 'portal_failed', message: err.message })
  }
}
