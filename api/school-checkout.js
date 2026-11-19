/**
 * Serverless function: start a school's plan.
 *
 * By card: Stripe Checkout, monthly or yearly. Or, with `method: 'invoice'`,
 * a yearly plan by invoice, as a school office usually pays: a subscription
 * with `collection_method: 'send_invoice'`, which Stripe emails to the
 * address the admin gives, to be paid by card or bank transfer within
 * DISTRICT_INVOICE_DAYS (30 by default), and again each year it renews. The
 * same as a district's plan (api/district-billing.js), for one school.
 *
 * Only the school's admin can, and which price is charged comes from the
 * database (the school's size band), never from the request. The school id
 * travels in the metadata so the webhook knows which school paid. Either way
 * what is left of the school's free trial or pilot is kept: nothing is
 * charged, and no invoice is due, before it ends.
 */

import { makeStripe, stripeUnavailable } from './_shared/stripe.js'
import { schoolCycle, schoolPriceId, schoolTrialEnd } from './_shared/schoolBilling.js'
import { invoiceDays } from './_shared/districtBilling.js'
import { reportError, userHeaders, makeServiceRpc } from './_shared/job.js'
import { returnOrigin } from './_shared/site.js'
import { cleanEmail } from '../src/lib/quoteRules.js'
import { timedFetch } from './_shared/http.js'

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
    const res = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/stripe_customer_for_school`, {
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
    const res = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/school_checkout_info`, {
      method: 'POST',
      headers: userHeaders(token),
      body: '{}',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
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
  const byInvoice = body?.method === 'invoice'
  // An invoice is for a year: nobody posts an invoice every month.
  const cycle = byInvoice ? 'year' : schoolCycle(body?.cycle)

  const school = await callerSchool(token)
  if (!school?.ok) return res.status(403).json({ error: school?.reason || 'not_school_admin' })

  if (byInvoice) return invoicePlan(req, res, school, body)

  const price = schoolPriceId(school.band, cycle)
  if (!price) return res.status(503).json({ error: 'not_configured', message: `No ${cycle} price for a ${school.band} school.` })

  const origin = returnOrigin(req)
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
    // Kept so a plan by invoice can close it (see invoicePlan).
    if (SERVICE_KEY && session.id) {
      await makeServiceRpc(SUPABASE_URL, SERVICE_KEY)('record_school_checkout', { p_school_id: school.school_id, p_session_id: session.id })
        .catch((err) => reportError('school-checkout', err))
    }
    return res.status(200).json({ url: session.url })
  } catch (err) {
    await reportError('school-checkout', err)
    return res.status(stripeUnavailable(err) ? 503 : 502).json({ error: stripeUnavailable(err) ? 'stripe_unavailable' : 'checkout_failed' })
  }
}

/**
 * A yearly plan by invoice. Stripe sends the invoice to `body.email`; the
 * customer is the school's own (made here the first time, with the school's
 * name, that address and which school it is, nothing else).
 */
async function invoicePlan(req, res, school, body) {
  if (!SERVICE_KEY) return res.status(503).json({ error: 'not_configured' })
  const email = cleanEmail(body?.email)
  if (!email) return res.status(400).json({ error: 'bad_email' })
  const price = schoolPriceId(school.band, 'year')
  if (!price) return res.status(503).json({ error: 'not_configured', message: `No yearly price for a ${school.band} school.` })

  const serviceRpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)
  const stripe = makeStripe(STRIPE_SECRET)
  try {
    let customer = school.has_customer ? await existingCustomer(school.school_id) : null
    if (customer) {
      // The invoice goes where the admin said this time.
      await stripe.customers.update(customer, { email })
    } else {
      const made = await stripe.customers.create(
        { name: school.name, email, metadata: { school_id: school.school_id, kind: 'school' } },
        { idempotencyKey: `school-customer:${school.school_id}` },
      )
      customer = made.id
      await serviceRpc('attach_school_customer', { p_school_id: school.school_id, p_customer_id: customer })
    }
    const metadata = { school_id: school.school_id, band: school.band, cycle: 'year', kind: 'school' }
    const trialEnd = schoolTrialEnd(school.trial_ends_at)
    // A card checkout the admin opened and left (another tab) would make a
    // second plan if paid later: close each one first. One already paid or
    // closed is simply forgotten; if one is paid all the same, the webhook
    // cancels that plan and refunds it.
    for (const session of (await serviceRpc('open_school_checkouts', { p_school_id: school.school_id }).catch(() => null)) || []) {
      try {
        await stripe.checkout.sessions.expire(session)
        console.log(`[school-checkout] closed card checkout ${session} for school ${school.school_id}: paying by invoice`)
      } catch { /* already paid, or already closed */ }
      await serviceRpc('forget_school_checkout', { p_session_id: session }).catch(() => {})
    }
    const subscription = await stripe.subscriptions.create({
      customer,
      items: [{ price }],
      collection_method: 'send_invoice',
      days_until_due: invoiceDays(),
      description: `RankUp School League for ${school.name}, one year`,
      metadata,
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    }, {
      // Two taps on the button, or a retry after a timeout, make one plan;
      // a plan cancelled and invoiced again (the billing version moved on
      // with the cancel) is a new one, the same day or not.
      idempotencyKey: `school-invoice:${school.school_id}:v${Number(school.billing_version) || 0}:${price}`,
    })
    return res.status(200).json({ ok: true, sent_to: email, status: subscription.status || null, first_invoice_at: trialEnd || null })
  } catch (err) {
    await reportError('school-checkout', err)
    return res.status(stripeUnavailable(err) ? 503 : 502).json({ error: stripeUnavailable(err) ? 'stripe_unavailable' : 'invoice_failed' })
  }
}
