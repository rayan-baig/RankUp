/**
 * Serverless function: start a school's Stripe Checkout.
 *
 * Only the school's admin can, and which price is charged comes from the
 * database (the school's size band), never from the request. The school id
 * travels in the metadata so the webhook knows which school paid.
 */

import { makeStripe } from './_shared/stripe.js'
import { schoolCycle, schoolPriceId, schoolTrialEnd } from './_shared/schoolBilling.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/**
 * The Stripe customer the school already has, if any. Read with the service
 * key so the id never goes to the browser. Reusing it keeps one school on one
 * customer: a fresh one per checkout left the billing portal opening an old
 * account while the live subscription sat on a new one.
 */
async function existingCustomer(schoolId) {
  if (!SERVICE_KEY) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stripe_customer_for_school`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ p_school_id: schoolId }),
    })
    return res.ok ? (await res.json()) || null : null
  } catch {
    return null
  }
}

/** Which school, according to the caller's own token. Admins only. */
async function callerSchool(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/school_checkout_info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
      body: '{}',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Same rule as create-checkout: only our own site gets sent back to. */
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

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const cycle = schoolCycle(body?.cycle)

  const school = await callerSchool(token)
  if (!school?.ok) return res.status(403).json({ error: school?.reason || 'not_school_admin' })

  const price = schoolPriceId(school.band, cycle)
  if (!price) return res.status(503).json({ error: 'not_configured', message: `No ${cycle} price for a ${school.band} school.` })

  const origin = safeOrigin(body?.origin || req.headers.origin || '')
  if (!origin) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'PUBLIC_SITE_URL is not set on the server, so there is nowhere to send you back to.',
    })
  }

  const metadata = { school_id: school.school_id, band: school.band, cycle, kind: 'school' }
  const trialEnd = schoolTrialEnd(school.trial_ends_at)
  const customer = school.has_customer ? await existingCustomer(school.school_id) : null
  try {
    const session = await makeStripe(STRIPE_SECRET).checkout.sessions.create({
      mode: 'subscription',
      ...(customer ? { customer } : {}),
      line_items: [{ price, quantity: 1 }],
      client_reference_id: school.school_id,
      metadata,
      subscription_data: {
        metadata,
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      success_url: `${origin}/#/school?checkout=success`,
      cancel_url: `${origin}/#/school?checkout=cancelled`,
      allow_promotion_codes: true,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[school-checkout]', err.message)
    return res.status(502).json({ error: 'checkout_failed', message: err.message })
  }
}
