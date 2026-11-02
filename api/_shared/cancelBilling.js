/**
 * Cancel, at Stripe, the subscriptions of families that deleted their account.
 *
 * The deletion itself happens in the database (delete_family_account), which
 * cannot talk to Stripe: it writes what is to be cancelled into
 * billing_cancellations in the same transaction. This works through that
 * queue with the secret key. Three callers:
 *
 *   api/delete-account.js   straight after the deletion, for that family
 *   api/stripe-webhook.js   when Stripe sends news about a deleted family
 *   api/run-retention.js    daily, for everything still waiting
 *
 * Safe to run any number of times. A subscription already cancelled counts as
 * done, each cancel carries an idempotency key, and a row is marked done only
 * once Stripe has confirmed. Anything that fails (Stripe down, Stripe
 * refusing) stays queued with the error, for the next caller.
 *
 * The Stripe customer is not deleted. It holds the invoices and payments the
 * family made, which the operator has to keep for tax and needs if a refund
 * or a chargeback comes in later; Stripe keeps those whatever happens to the
 * customer. Nothing in RankUp's database points at it once the cancellation
 * has been confirmed for 30 days. See docs/PAYMENTS.md.
 */

/** Statuses that can still lead to a charge. */
const LIVE = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'])

const isSchools = (sub) => Boolean(sub?.metadata?.school_id) || sub?.metadata?.kind === 'school'

/** Every subscription this queued row stands for that could still charge. */
async function liveSubscriptions(stripe, row) {
  const ids = new Set()
  if (row.subscription_id) ids.add(row.subscription_id)
  if (row.customer_id) {
    // The customer's own list, not only the id the family row held: a
    // subscription the webhook had not told the database about yet (a
    // checkout just completed) is on the customer too.
    const subs = await stripe.subscriptions.list({ customer: row.customer_id, status: 'all', limit: 100 })
      .autoPagingToArray({ limit: 1000 })
    for (const sub of subs) {
      // A school's plan is the school's, never cancelled for a family.
      if (LIVE.has(sub.status) && !isSchools(sub)) ids.add(sub.id)
    }
  }
  return [...ids]
}

async function cancelOne(stripe, rowId, subscriptionId) {
  try {
    await stripe.subscriptions.cancel(
      subscriptionId,
      // At once, with no final invoice and no proration: no further charge of
      // any kind. Whether to refund part of the period is the operator's
      // call, made in Stripe.
      { invoice_now: false, prorate: false, cancellation_details: { comment: 'RankUp account deleted' } },
      { idempotencyKey: `rankup-account-deleted-${rowId}-${subscriptionId}` },
    )
  } catch (err) {
    // Already gone counts as done: an earlier try that Stripe carried out
    // but whose answer was lost, or a plan the parent had cancelled.
    if (err?.statusCode === 404 || err?.code === 'resource_missing') return
    if (Number(err?.statusCode) >= 400 && Number(err?.statusCode) < 500) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null)
      if (sub && !LIVE.has(sub.status)) return
    }
    throw err
  }
}

/**
 * Work through what is waiting. With `familyId` or `customerId`, only that
 * family's. Never throws: the outcome of each row is written back to the
 * queue, and the totals are returned.
 */
export async function cancelPendingBilling({ stripe, serviceRpc, familyId = null, customerId = null, limit = 50 }) {
  let rows
  try {
    rows = await serviceRpc('pending_billing_cancellations', {
      p_family_id: familyId, p_customer_id: customerId, p_limit: limit,
    }) || []
  } catch (err) {
    return { pending: null, cancelled: 0, failed: 0, error: err.message }
  }

  let cancelled = 0
  let failed = 0
  for (const row of rows) {
    try {
      // One at a time, in order: a handful a day at most, and Stripe's rate
      // limits are not worth testing for this.
      // eslint-disable-next-line no-await-in-loop
      const ids = await liveSubscriptions(stripe, row)
      // eslint-disable-next-line no-await-in-loop
      for (const id of ids) await cancelOne(stripe, row.id, id)
      // eslint-disable-next-line no-await-in-loop
      await serviceRpc('finish_billing_cancellation', { p_id: row.id, p_ok: true, p_error: null })
      cancelled += 1
    } catch (err) {
      failed += 1
      console.error('[cancel-billing] still queued:', row.id, err?.message)
      try {
        // eslint-disable-next-line no-await-in-loop
        await serviceRpc('finish_billing_cancellation', {
          p_id: row.id, p_ok: false, p_error: String(err?.message || 'failed').slice(0, 300),
        })
      } catch {
        // The row stays waiting either way; only the note of the error is lost.
      }
    }
  }
  return { pending: rows.length, cancelled, failed }
}
