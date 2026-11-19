/**
 * Serverless function: a school district's plan. Yearly, by invoice.
 *
 * Districts usually pay by invoice, so this uses Stripe Invoicing rather than
 * a card checkout: a yearly subscription with `collection_method:
 * 'send_invoice'`, which Stripe emails as an invoice the district can pay by
 * card or bank transfer within DISTRICT_INVOICE_DAYS (30 by default), and
 * again every year it renews. The schools are covered from the day the plan
 * starts; an invoice that is never paid ends it (Stripe's settings decide
 * when), and each school falls back to its own plan, its trial or the free
 * level.
 *
 * Three actions, all for the district's admin only (district_checkout_info,
 * asked with the caller's own token, says which district):
 *   invoice  start the plan: the district's schools, by size and place, one
 *            Stripe price per line with a quantity; the invoice goes to the
 *            email the admin gives
 *   update   bring a live plan up to the district's schools now: Stripe
 *            invoices what was added for the rest of the year, and credits
 *            what was taken off against the next invoice
 *   portal   the district's invoices and cancelling, on Stripe's own pages
 *
 * Which schools, their sizes and so the price come from the database, never
 * from the request. The code names prices from settings, never amounts.
 */

import { makeStripe, stripeUnavailable } from './_shared/stripe.js'
import { districtItems, districtUpdate, itemsKey, invoiceDays } from './_shared/districtBilling.js'
import { reportError, userHeaders, makeServiceRpc } from './_shared/job.js'
import { returnOrigin } from './_shared/site.js'
import { cleanEmail } from '../src/lib/quoteRules.js'
import { timedFetch } from './_shared/http.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/** Which district, according to the caller's own token. */
async function callerDistrict(token) {
  try {
    const res = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/district_checkout_info`, {
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

/** How each refusal from the database is answered. */
const REFUSED = { not_district_admin: 403, too_few_schools: 400, too_many_schools: 400, bad_size: 400 }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!STRIPE_SECRET || !SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: 'not_configured' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const action = body?.action
  if (!['invoice', 'update', 'portal'].includes(action)) return res.status(400).json({ error: 'bad_action' })

  const info = await callerDistrict(token)
  if (!info) return res.status(502).json({ error: 'not_answered' })
  const paying = info.reason === 'already_paying'
  if (!info.ok && !paying) return res.status(REFUSED[info.reason] || 403).json({ error: info.reason || 'not_district_admin' })

  const serviceRpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)
  const stripe = makeStripe(STRIPE_SECRET)

  try {
    if (action === 'portal') {
      if (!info.has_customer) return res.status(400).json({ error: 'no_subscription' })
      const customer = await serviceRpc('stripe_customer_for_district', { p_district_id: info.district_id })
      if (!customer) return res.status(400).json({ error: 'no_customer' })
      const origin = returnOrigin(req)
      if (!origin) return res.status(503).json({ error: 'not_configured' })
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${origin}/#/district` })
      return res.status(200).json({ url: portal.url })
    }

    if (action === 'update') {
      if (!paying) return res.status(409).json({ error: 'not_paying' })
      if (!info.quote?.ok) return res.status(400).json({ error: info.quote?.reason || 'too_few_schools' })
      const items = districtItems(info.quote.lines)
      if (!items) return res.status(503).json({ error: 'not_configured' })
      const subscriptionId = await serviceRpc('stripe_subscription_for_district', { p_district_id: info.district_id })
      if (!subscriptionId) return res.status(409).json({ error: 'not_paying' })
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const changes = districtUpdate(subscription, items)
      if (!changes) return res.status(409).json({ error: 'custom_plan' })
      await stripe.subscriptions.update(subscriptionId, {
        items: changes,
        // An invoice now for what was added, for the rest of the year; what
        // was taken off is credited against the next invoice.
        proration_behavior: 'always_invoice',
      }, {
        // The district's billing version moves on with every real change
        // (a school added or taken off, Stripe's news), so A, then B, then A
        // again is three requests, while a second tap is the same one.
        idempotencyKey: `district-update:${info.district_id}:v${Number(info.billing_version) || 0}:${itemsKey(items)}`,
      })
      return res.status(200).json({ ok: true, schools: info.quote.schools })
    }

    // action === 'invoice'
    if (paying) return res.status(409).json({ error: 'district_already_paying' })
    const email = cleanEmail(body?.email)
    if (!email) return res.status(400).json({ error: 'bad_email' })
    const items = districtItems(info.quote?.lines)
    if (!items) return res.status(503).json({ error: 'not_configured' })

    let customer = info.has_customer
      ? await serviceRpc('stripe_customer_for_district', { p_district_id: info.district_id })
      : null
    if (customer) {
      // The invoice goes where the admin said this time.
      await stripe.customers.update(customer, { email })
    } else {
      // Nothing about any school or child: the district's name, where the
      // invoice goes, and which district it is.
      const made = await stripe.customers.create(
        { name: info.name, email, metadata: { district_id: info.district_id, kind: 'district' } },
        { idempotencyKey: `district-customer:${info.district_id}` },
      )
      customer = made.id
      await serviceRpc('attach_district_customer', { p_district_id: info.district_id, p_customer_id: customer })
    }

    const metadata = { district_id: info.district_id, kind: 'district' }
    const subscription = await stripe.subscriptions.create({
      customer,
      items,
      collection_method: 'send_invoice',
      days_until_due: invoiceDays(),
      description: `RankUp School League for ${info.name}, ${info.quote.schools} schools, one year`,
      metadata,
    }, {
      // Two taps on the button, or a retry after a timeout, make one plan;
      // a plan cancelled and invoiced again (the billing version moved on
      // with the cancel) is a new one, the same day or not.
      idempotencyKey: `district-plan:${info.district_id}:v${Number(info.billing_version) || 0}:${itemsKey(items)}`,
    })
    return res.status(200).json({ ok: true, sent_to: email, status: subscription.status || null, schools: info.quote.schools })
  } catch (err) {
    await reportError('district-billing', err)
    return res.status(stripeUnavailable(err) ? 503 : 502).json({ error: stripeUnavailable(err) ? 'stripe_unavailable' : 'billing_failed' })
  }
}
