/**
 * No school paying twice.
 *
 * Two ways a school could end up paying for two plans, both handled here so
 * the webhook and the hourly job do the same thing:
 *
 *   1. A second plan of its own. A card checkout opened and left in another
 *      tab, then paid after the school started a plan by invoice (or after
 *      its district started paying for it). api/school-checkout.js closes
 *      every open checkout when a plan by invoice is made; if one is paid all
 *      the same, apply_school_subscription refuses to take it as the school's
 *      plan (`duplicate_plan`) and the webhook calls handBackDuplicatePlan:
 *      the new subscription is cancelled at once and its payment refunded in
 *      full. The refund's own news is then known as this, not as the
 *      school's real plan refunded (duplicate_plan_payment).
 *
 *   2. Its own plan and its district's. When a district that has paid for
 *      its plan covers a school that pays for itself, endPlansDistrictPays
 *      sets the school's own subscription to stop at the end of the period
 *      already paid for (cancel_at_period_end), and tells its admins once.
 *
 * Each step is logged, and reported to whoever runs RankUp, in plain words.
 */
import { invoicePaymentRefs } from './referralReward.js'
import { emailConfigured, emailSettings, sendEmail, districtTakeoverEmail } from './email.js'

const idOf = (value) => (typeof value === 'string' ? value : value?.id) || null

/** The subscription an invoice is for, in old and new API shapes. */
export function invoiceSubscriptionId(invoice) {
  return idOf(invoice?.subscription) || idOf(invoice?.parent?.subscription_details?.subscription) || null
}

/**
 * Refund one paid invoice of a second plan in full, once (the idempotency
 * key is the invoice), and write down which payments went back.
 */
async function refundInvoice({ stripe, serviceRpc, subscriptionId, invoice, cancelled }) {
  if (!invoice || invoice.status !== 'paid' || !(Number(invoice.amount_paid) > 0)) return false
  const refs = await invoicePaymentRefs(stripe, invoice)
  const intent = refs.find((r) => r.startsWith('pi_'))
  const charge = refs.find((r) => r.startsWith('ch_') || r.startsWith('py_'))
  if (!intent && !charge) throw new Error(`no payment found to refund for invoice ${invoice.id}`)
  // Written down first, so the refund's news, which can arrive before this
  // call returns, is recognised.
  await serviceRpc('mark_duplicate_plan', { p_subscription_id: subscriptionId, p_cancelled: cancelled, p_refunds: refs })
  await stripe.refunds.create(intent ? { payment_intent: intent } : { charge },
    { idempotencyKey: `duplicate-plan-refund:${invoice.id}` })
  return true
}

/**
 * A second plan the database refused to take as the school's: cancel it at
 * once, refund what it took, say so.
 */
export async function handBackDuplicatePlan({ stripe, serviceRpc, reportError, schoolId, subscription }) {
  const subscriptionId = idOf(subscription)
  let cancelled = false
  try {
    await stripe.subscriptions.cancel(subscriptionId, {}, { idempotencyKey: `duplicate-plan-cancel:${subscriptionId}` })
    cancelled = true
  } catch (err) {
    // Already cancelled is fine; anything else is retried with the event.
    if (!/canceled|cancelled/i.test(String(err?.message))) throw err
    cancelled = true
  }
  await serviceRpc('mark_duplicate_plan', { p_subscription_id: subscriptionId, p_cancelled: cancelled, p_refunds: [] })
  let refunded = false
  const invoiceId = idOf(subscription?.latest_invoice)
  if (invoiceId) {
    const invoice = typeof subscription.latest_invoice === 'object' && subscription.latest_invoice.status
      ? subscription.latest_invoice : await stripe.invoices.retrieve(invoiceId)
    refunded = await refundInvoice({ stripe, serviceRpc, subscriptionId, invoice, cancelled })
  }
  const words = `School ${schoolId} was already paid for, so a second plan (${subscriptionId}) was cancelled`
    + (refunded ? ' and its payment refunded in full.' : '; nothing had been paid on it yet, and anything it is paid later is refunded.')
  console.log(`[stripe-webhook] ${words}`)
  await reportError('stripe-webhook:duplicate-plan', words)
  return { cancelled, refunded }
}

/**
 * An invoice paid on a second plan after it was found (a payment that
 * cleared late): refunded too. True if this invoice was one.
 */
export async function refundLateDuplicatePayment({ stripe, serviceRpc, reportError, invoice }) {
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!subscriptionId) return false
  const dup = await serviceRpc('duplicate_plan', { p_subscription_id: subscriptionId })
  if (!dup) return false
  if (await refundInvoice({ stripe, serviceRpc, subscriptionId, invoice, cancelled: Boolean(dup.cancelled) })) {
    const words = `A payment on the second plan ${subscriptionId} (school ${dup.school_id}, already paid for) arrived late and was refunded in full.`
    console.log(`[stripe-webhook] ${words}`)
    await reportError('stripe-webhook:duplicate-plan', words)
  }
  return true
}

/**
 * Every school whose district has paid for it and which still has a plan of
 * its own set to renew: that plan is set to stop at the end of its period,
 * and the school's admins are told once. Safe to run as often as wanted.
 */
export async function endPlansDistrictPays({ stripe, serviceRpc, reportError, site = process.env.PUBLIC_SITE_URL || '' }) {
  let twice = []
  try {
    twice = (await serviceRpc('schools_paying_twice', {})) || []
  } catch (err) {
    // A database without this version's schools.sql yet answers 404.
    if (String(err.message).endsWith(': 404')) return { stopped: 0, told: 0 }
    throw err
  }
  const settings = emailSettings()
  let stopped = 0
  let told = 0
  for (const t of twice) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await stripe.subscriptions.update(t.subscription_id, { cancel_at_period_end: true },
        { idempotencyKey: `district-takeover:${t.subscription_id}` })
      stopped += 1
      console.log(`[district-takeover] school ${t.school_id}: its own plan stops at the end of its period; ${t.district} pays`)
      if (!t.told) {
        const email = districtTakeoverEmail(t, { site, replyTo: settings.replyTo })
        // eslint-disable-next-line no-await-in-loop
        const results = emailConfigured(settings) ? await Promise.all((t.recipients || []).map((to) => sendEmail({
          to, ...email, idempotencyKey: `district-takeover:${t.school_id}:${String(to).toLowerCase()}`,
        }, settings))) : []
        // eslint-disable-next-line no-await-in-loop
        await serviceRpc('mark_district_takeover', { p_school_id: t.school_id })
        told += results.filter((r) => r.ok).length
        if (results.some((r) => !r.ok) || !emailConfigured(settings)) {
          // eslint-disable-next-line no-await-in-loop
          await reportError('district-takeover', `school ${t.school_id}'s own plan was set to stop (its district pays), but its admins were not all emailed`)
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-await-in-loop
      await reportError('district-takeover', err)
    }
  }
  return { stopped, told }
}
