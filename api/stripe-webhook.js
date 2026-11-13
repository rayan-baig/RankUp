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

import { makeStripe, verifyWebhook } from './_shared/stripe.js'
import { schoolIdOf, schoolPriceId, schoolCycle } from './_shared/schoolBilling.js'
import { cancelPendingBilling } from './_shared/cancelBilling.js'
import { reportError } from './_shared/job.js'
import { applyReferralRewards, referralInvoicePaid, referralPaymentReversed } from './_shared/referralReward.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
/*
 * Every price id that maps to a tier, monthly and annual.
 *
 * The annual ids MUST be here. Without them an annual subscriber's price id
 * matches nothing, tierFor falls through to the cheapest plan, and somebody who
 * has just paid for a year of Elite is dropped to free by the webhook that was
 * supposed to give it to them. Silently, on their first renewal event.
 */
const PRICE_TIERS = new Map(
  [
    [process.env.STRIPE_PRICE_ELITE, 'elite'],
    [process.env.STRIPE_PRICE_ELITE_YEAR, 'elite'],
    [process.env.STRIPE_PRICE_STANDARD, 'standard'],
    [process.env.STRIPE_PRICE_STANDARD_YEAR, 'standard'],
    [process.env.STRIPE_PRICE_STARTER, 'starter'],
  ].filter(([id]) => id),
)

/** Vercel must not parse the body, or the signature cannot be verified. */
export const config = { api: { bodyParser: false } }

/**
 * The exact bytes Stripe signed.
 *
 * Signature verification is over the raw payload, so this must never go near a
 * JSON parse and back. On a Node host the body arrives as a stream; on
 * Cloudflare the adapter has already read it as text and hands it over
 * directly. Both end up as one string, which is what constructEventAsync wants.
 */
async function rawBody(req) {
  if (typeof req.rawBodyText === 'string') return req.rawBodyText
  let out = ''
  const decoder = new TextDecoder()
  for await (const chunk of req) {
    out += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
  }
  return out + decoder.decode()
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
  // Every item, not only the first: a subscription can carry more than one
  // line (a tax or add-on line ahead of the plan), and reading item zero alone
  // gave a paying family whatever that line happened to be. The best known
  // plan among them wins. `plan` is the same id on older API versions.
  const RANK = { starter: 0, standard: 1, elite: 2 }
  let byPrice = null
  for (const item of subscription?.items?.data || []) {
    const tier = PRICE_TIERS.get(item?.price?.id) || PRICE_TIERS.get(item?.plan?.id)
    if (tier && (!byPrice || RANK[tier] > RANK[byPrice])) byPrice = tier
  }
  if (byPrice) return byPrice
  const claimed = subscription?.metadata?.tier
  return claimed === 'elite' || claimed === 'standard' ? claimed : 'starter'
}

/**
 * The school this object belongs to, if it is a school's.
 *
 * Asked before the family question on every event: a school's subscription
 * carries no family id, and the family fallbacks would otherwise go looking
 * for one and, at best, find nothing.
 */
async function schoolIdFor(object) {
  const direct = schoolIdOf(object)
  if (direct) return direct
  const customerId = typeof object?.customer === 'string' ? object.customer : object?.customer?.id
  if (!customerId) return null
  try {
    return (await serviceRpc('school_for_customer', { p_customer_id: customerId })) || null
  } catch (err) {
    // A database without schools.sql yet has no such function (404). That
    // must not stop families being billed; anything else is retried.
    if (String(err.message).endsWith(': 404')) return null
    throw err
  }
}

/**
 * Put a school's subscription on the price for the size it is now.
 *
 * Checkout picks the price from the school's size at the moment the page is
 * opened. A school that opened checkout, then corrected its size, then went
 * back and paid on the page it already had open, was subscribed at the old
 * band's price for as long as it stayed. So the price on every live school
 * subscription is checked against the band the database holds, and moved if
 * it differs — from the next invoice, with no proration, so nobody is charged
 * a surprise amount today. Stripe's own "subscription updated" that follows
 * carries the right price and stops here.
 */
async function keepSchoolOnItsBand(stripe, schoolId, subscription) {
  if (!['active', 'trialing', 'past_due'].includes(subscription?.status)) return
  const item = subscription?.items?.data?.[0]
  const current = item?.price?.id
  if (!item?.id || !current) return
  const band = await serviceRpc('school_band_of', { p_school_id: schoolId })
  const cycle = schoolCycle(subscription?.metadata?.cycle
    || (item?.price?.recurring?.interval === 'year' ? 'year' : 'month'))
  const wanted = band && schoolPriceId(band, cycle)
  if (!wanted || wanted === current) return
  // Only ever from one of our own band prices to another. A price the operator
  // set by hand in Stripe (a size agreed by conversation, a special deal) is
  // theirs to keep, and is left alone.
  const ours = ['small', 'medium', 'large', 'xl'].flatMap((b) => [schoolPriceId(b, 'month'), schoolPriceId(b, 'year')])
  if (!ours.includes(current)) return
  await stripe.subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: wanted }],
    proration_behavior: 'none',
    metadata: { ...(subscription.metadata || {}), band, cycle },
  })
}

async function familyIdFor(object, stripe) {
  const direct = object?.metadata?.family_id || object?.client_reference_id
    || object?.parent?.subscription_details?.metadata?.family_id
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

const iso = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null)
const eventTime = (event) => iso(event?.created)

/**
 * The end of the period being paid for. On the subscription in older Stripe
 * API versions, on its item since 2025: reading only the old place left this
 * empty for every family.
 */
const periodEnd = (sub) => iso(sub?.current_period_end || sub?.items?.data?.[0]?.current_period_end)

/**
 * When the plan stops. `cancel_at`: a plan cancelled in the portal, still
 * running until then (Stripe sets cancel_at, or only cancel_at_period_end on
 * older versions). `ended_at`: a plan that has ended, which for one cancelled
 * at once is now, not the end of the period it would have run to.
 */
function endDates(event, sub) {
  const ended = event.type === 'customer.subscription.deleted' || ['canceled', 'unpaid', 'incomplete_expired'].includes(sub?.status)
  if (ended) return { ended_at: iso(sub?.ended_at || event.created) }
  const cancelAt = sub?.cancel_at || (sub?.cancel_at_period_end ? (sub?.current_period_end || sub?.items?.data?.[0]?.current_period_end) : null)
  return cancelAt ? { cancel_at: iso(cancelAt) } : {}
}

/** A charge handed back in full: Stripe's flag, or every penny of it. */
function refundedInFull(charge) {
  const amount = Number(charge?.amount || 0)
  return charge?.refunded === true || (amount > 0 && Number(charge?.amount_refunded || 0) >= amount)
}

const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']
const idOf = (value) => (typeof value === 'string' ? value : value?.id) || null
const customerOf = (object) => (typeof object?.customer === 'string' ? object.customer : object?.customer?.id) || null

/**
 * News about a family that deleted its account.
 *
 * Every billing write keys on the family, so for a family that is gone each
 * one failed, and Stripe retried the event for days: including the
 * "subscription deleted" that cancelling a deleted family's plan itself
 * causes. Those events are now answered and dropped. And a subscription that
 * is still live for a deleted family (a checkout page left open and paid
 * after the deletion, or a cancellation that has not gone through yet) is
 * cancelled here and now; if Stripe will not, it stays queued for
 * api/run-retention.js.
 *
 * Returns the response to send, or null for a family that exists.
 */
async function goneFamily(stripe, familyId, object, { subscriptionId = null, live = false } = {}) {
  const customerId = customerOf(object)
  const fate = await serviceRpc('billing_family_gone', {
    p_family_id: familyId || null,
    p_customer_id: customerId,
    p_subscription_id: subscriptionId,
    p_live: live,
  })
  if (fate === 'present') return null
  if (fate !== 'deleted') return { received: true, ignored: 'no_family' }
  // Anything still waiting for this family, the subscription just queued
  // included. Stripe is evidently answering, so it is a good moment to try.
  const outcome = await cancelPendingBilling({
    stripe, serviceRpc, familyId: familyId || null, customerId: familyId ? null : customerId,
  })
  return { received: true, ignored: 'family_deleted', billing_cancellations: outcome }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!STRIPE_SECRET || !WEBHOOK_SECRET || !SERVICE_KEY) {
    return res.status(503).json({ error: 'not_configured' })
  }

  const stripe = makeStripe(STRIPE_SECRET)
  const body = await rawBody(req)

  let event
  try {
    // Async form: WebCrypto's digest is async, so this is the only shape that
    // verifies on Cloudflare. It works on Node too, so there is no branch.
    event = await verifyWebhook(stripe, body, req.headers['stripe-signature'], WEBHOOK_SECRET)
  } catch (err) {
    // An unverified event is an attacker or a misconfiguration. Never act on it.
    await reportError('stripe-webhook:signature', `bad signature: ${err.message}`)
    return res.status(400).json({ error: 'invalid_signature' })
  }

  try {
    const object = event.data.object

    // ---- schools: their own plans, never a family's tier ----
    const schoolId = await schoolIdFor(object)
    if (schoolId) {
      const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id
      if (event.type === 'checkout.session.completed') {
        if (customerId) await serviceRpc('attach_school_customer', { p_school_id: schoolId, p_customer_id: customerId })
      } else if (event.type.startsWith('customer.subscription.')) {
        await serviceRpc('apply_school_subscription', {
          p_school_id: schoolId,
          p_status: event.type === 'customer.subscription.deleted' ? 'canceled' : object.status,
          p_customer_id: customerId || null,
          p_subscription_id: object.id,
          p_stripe_event: event.id,
          p_payload: { type: event.type, ...endDates(event, object) },
          // Stripe does not deliver in order: older news than the school's
          // latest is ignored, as it is for a family.
          p_event_created: eventTime(event),
          p_period_end: periodEnd(object),
        })
        if (event.type !== 'customer.subscription.deleted') await keepSchoolOnItsBand(stripe, schoolId, object)
      } else if (event.type === 'charge.refunded') {
        // Answered and dropped before this: a school refunded in full stayed
        // in the league as a paying school. See apply_school_refund.
        await serviceRpc('apply_school_refund', {
          p_school_id: schoolId,
          p_charge_id: object.id,
          p_full: refundedInFull(object),
          p_event_created: eventTime(event),
          p_charge_created: object.created ? new Date(object.created * 1000).toISOString() : null,
        })
      } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
        const paid = Number(object.amount_paid ?? object.amount_due ?? 0)
        if (paid > 0) {
          await serviceRpc('record_school_payment', {
            p_school_id: schoolId,
            // The invoice, not the event: Stripe sends both invoice.paid and
            // invoice.payment_succeeded for one payment, and each has its own
            // event id, so keying on the event counted every invoice twice.
            p_stripe_event: `invoice:${object.id}`,
            p_amount_pence: paid,
            p_currency: String(object.currency || 'usd'),
          })
        }
      }
      // A failed card needs nothing here: Stripe retries it, and the
      // subscription events that follow say whether the plan survived.
      return res.status(200).json({ received: true, school: true })
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const familyId = object.metadata?.family_id || object.client_reference_id
      const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id
      if (familyId) {
        // Paid on a page opened before the account was deleted: the new
        // subscription is cancelled before it ever renews.
        const subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id || null
        const gone = await goneFamily(stripe, familyId, object, { subscriptionId, live: Boolean(subscriptionId) })
        if (gone) return res.status(200).json(gone)
      }
      if (familyId && customerId) {
        await serviceRpc('attach_stripe_customer', { p_family_id: familyId, p_customer_id: customerId })
      }
      /**
       * A Flash Ticket pack is a one-off payment, so there is no subscription
       * event coming after this one — this is where it gets credited. Guarded
       * on payment_status because a session can complete unpaid.
       *
       * A payment that clears later (a bank debit, say) completes unpaid and
       * arrives as async_payment_succeeded, which used to be ignored: the
       * family paid and got nothing. Keyed on the session rather than the
       * event, so whichever of the two arrives paid credits once.
       */
      if (String(object.metadata?.product || '').startsWith('flash_') && object.payment_status === 'paid' && familyId) {
        await serviceRpc('credit_flash_tickets', {
          p_family_id: familyId,
          p_count: Number(object.metadata?.ticket_count) || 3,
          p_stripe_event: `checkout:${object.id}`,
          p_payload: {
            type: event.type,
            amount_pence: Number(object.amount_total || 0) || null,
            currency: String(object.currency || 'gbp').toUpperCase(),
            // What a refund of this pack takes back, and how it is recognised:
            // a refund names the payment, never the checkout session.
            count: Number(object.metadata?.ticket_count) || 3,
            payment_intent: typeof object.payment_intent === 'string'
              ? object.payment_intent : object.payment_intent?.id || null,
          },
        })
      }
      // For a subscription, the events that follow carry the authoritative
      // status, so nothing is granted here.
      return res.status(200).json({ received: true })
    }

    if (event.type.startsWith('customer.subscription.')) {
      const familyId = await familyIdFor(object, stripe)
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : object.status
      const gone = await goneFamily(stripe, familyId, object, {
        subscriptionId: object.id || null, live: LIVE_STATUSES.includes(status),
      })
      if (gone) {
        if (gone.ignored === 'no_family') console.warn('[stripe-webhook] no family for', event.type)
        return res.status(200).json(gone)
      }
      await serviceRpc('apply_subscription_change', {
        p_family_id: familyId,
        p_status: status,
        p_tier: tierFor(object),
        p_customer_id: typeof object.customer === 'string' ? object.customer : null,
        p_subscription_id: object.id,
        p_period_end: periodEnd(object),
        p_stripe_event: event.id,
        // When a plan cancelled in the portal will stop, and when an ended
        // one did: the plan screen says so.
        p_payload: { type: event.type, ...endDates(event, object) },
        // Stripe does not deliver in order. Older news than the family's
        // latest is ignored by the database.
        p_event_created: eventTime(event),
      })
      // A family whose plan is live may have a free month waiting: one banked
      // while it was on Starter comes due the moment it subscribes.
      if (['active', 'trialing', 'past_due'].includes(status)) {
        await applyReferralRewards({ stripe, serviceRpc, familyId, priceTiers: PRICE_TIERS })
      }
      return res.status(200).json({ received: true })
    }

    /*
     * The recurring charge, which is where almost all the revenue is.
     *
     * Nothing was recording it. The subscription events carry a status and no
     * price, so a Charity Week total built on those alone would have been
     * close to zero — and the one number this company publishes about itself
     * had better be the real one.
     */
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      const familyId = await familyIdFor(object, stripe)
      const paid = Number(object.amount_paid ?? object.amount_due ?? 0)
      // Money taken from a family that has since deleted its account is
      // still money taken: counted, against no family.
      const gone = familyId ? await goneFamily(stripe, familyId, object) : null
      if (familyId && paid > 0) {
        await serviceRpc('record_payment', {
          p_family_id: gone ? null : familyId,
          // Keyed on the invoice for the same reason as a school's: one
          // payment arrives as two events.
          p_stripe_event: `invoice:${object.id}`,
          p_type: event.type,
          // Stripe already works in minor units, which is the same unit this
          // app stores money in everywhere. No conversion, nothing to round.
          p_amount_pence: paid,
          p_currency: String(object.currency || 'gbp').toUpperCase(),
        })
      }
      /*
       * Bring a friend: the first invoice an invited family pays earns the
       * family who invited it one free month (supabase/referrals.sql decides,
       * once; api/_shared/referralReward.js credits it). Only an invoice that
       * took money: a trial's $0 invoice is not paying, and a failed one never
       * arrives as invoice.paid.
       */
      let referral = null
      if (familyId && !gone && paid > 0) {
        referral = await referralInvoicePaid({ stripe, serviceRpc, familyId, invoice: object, event, priceTiers: PRICE_TIERS })
        // And this family's own months, if it was waiting to pay for them.
        await applyReferralRewards({ stripe, serviceRpc, familyId, priceTiers: PRICE_TIERS })
      }
      return res.status(200).json({ received: true, ...(referral ? { referral } : {}) })
    }

    /*
     * A payment handed back. A Flash Ticket pack refunded in full takes its
     * tickets back (never below zero); the plan refunded in full drops the
     * family to Starter, as an unpaid renewal does; a partial refund changes
     * nothing. The database tells the two kinds apart by the payment, and
     * acts once per charge however often this arrives. See apply_charge_refund.
     */
    if (event.type === 'charge.refunded') {
      const familyId = await familyIdFor(object, stripe)
      // A refund to a deleted family is the operator's to give, in Stripe;
      // there is no plan or ticket left here to take back.
      const gone = await goneFamily(stripe, familyId, object)
      if (gone) return res.status(200).json(gone)
      const full = refundedInFull(object)
      const result = await serviceRpc('apply_charge_refund', {
        p_family_id: familyId,
        p_charge_id: object.id,
        p_payment_intent: typeof object.payment_intent === 'string'
          ? object.payment_intent : object.payment_intent?.id || null,
        p_full: full,
        p_event_created: eventTime(event),
        // When the refunded payment was made: refunding last month's charge
        // after this month's was paid leaves the current period standing.
        p_charge_created: object.created ? new Date(object.created * 1000).toISOString() : null,
      })
      // A plan payment handed back in full: if it was an invited family's
      // first, within 14 days, the free month it earned is withdrawn (unused).
      // Asked on a replay too: it acts once, and a first try that failed
      // half way is finished by the retry.
      let referral = null
      if (full && result?.kind !== 'tickets') {
        referral = await referralPaymentReversed({
          stripe, serviceRpc, familyId, event, kind: 'refund', chargeCreated: object.created,
          refs: [object.id, idOf(object.payment_intent), idOf(object.invoice)],
        })
      }
      return res.status(200).json({ received: true, refund: result?.kind || result?.tier || result?.ignored || null, ...(referral ? { referral } : {}) })
    }

    /*
     * A payment disputed (a chargeback). The plan is left to the subscription
     * events, as for a failed payment; only a free month earned by that
     * payment is withdrawn, under the same rules as a refund. A dispute names
     * the charge, not the customer, so the charge is asked for.
     */
    if (event.type === 'charge.dispute.created') {
      const chargeId = idOf(object.charge)
      let charge = typeof object.charge === 'object' && object.charge ? object.charge : null
      if (!charge && chargeId) {
        // A charge Stripe does not know is nothing to act on; Stripe not
        // answering is a 500, so the dispute is sent again.
        try { charge = await stripe.charges.retrieve(chargeId) } catch (err) {
          if (Number(err?.statusCode) !== 404) throw err
          charge = null
        }
      }
      const familyId = charge ? await familyIdFor(charge, stripe) : null
      const gone = familyId ? await goneFamily(stripe, familyId, charge) : { ignored: 'no_family' }
      if (gone) return res.status(200).json({ received: true, ignored: gone.ignored })
      const referral = await referralPaymentReversed({
        stripe, serviceRpc, familyId, event, kind: 'dispute', chargeCreated: charge?.created,
        refs: [chargeId, idOf(object.payment_intent), idOf(charge?.payment_intent),
          idOf(charge?.invoice)],
      })
      return res.status(200).json({ received: true, ...(referral ? { referral } : {}) })
    }

    /*
     * invoice.payment_failed needs nothing here. The subscription's own
     * customer.subscription.updated says past_due when it matters, with a time
     * the database can order. Acting on this one as well downgraded families
     * who had already paid, when it arrived late or was retried.
     */

    return res.status(200).json({ received: true, ignored: event.type })
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient failure.
    await reportError('stripe-webhook', `${event?.type || 'event'}: ${err.message}`)
    return res.status(500).json({ error: 'handler_failed' })
  }
}
