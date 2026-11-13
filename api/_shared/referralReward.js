/**
 * The free month for bringing a friend's family, as the Stripe webhook gives it.
 *
 * Every rule lives in supabase/referrals.sql: whether an invoice counts, once
 * per invited family, never for the same household, twelve a year, and what a
 * refund takes back. This file does the two things the database cannot: read
 * what the inviting family pays from Stripe, and put the credit on (or take it
 * off) its Stripe account.
 *
 * HOW THE MONTH IS GIVEN
 *
 * As a customer balance credit, the way the Alliance and School League prizes
 * already are (api/settle-alliances.js): one month at the price of the plan
 * the family pays for, read from its own subscription, in its currency. A
 * yearly plan gets a twelfth of its yearly price. Stripe takes a credit off
 * the next invoice by itself, so nothing about the subscription is changed,
 * and the family's portal shows it as credit.
 *
 * Not a coupon: a coupon takes a percentage off the next invoice, which for a
 * yearly plan is a free year, not a free month. And not a pause or a trial
 * extension on the subscription: subscriptions here are made by Checkout and
 * changed only in Stripe's portal, and a credit touches neither.
 *
 * A family on Starter pays nothing, so there is nothing to take a month off.
 * Its month is banked in the database and credited here the moment the
 * webhook records its first subscription, at the price of the plan it chose.
 *
 * Every credit carries an idempotency key naming the invited family, so a
 * replayed event, a retry after a timeout or two deliveries at once give one
 * credit. Nothing about the invited family goes to Stripe: the description is
 * the same words for everyone and there is no metadata naming it.
 */

const LIVE = ['active', 'trialing', 'past_due']
const RANK = { starter: 0, standard: 1, elite: 2 }

/**
 * Call a referral function, or answer null if the database has none yet. A
 * project that has not run referrals.sql must still be billed: that is a 404
 * from the API, and only that is swallowed.
 */
async function referralRpc(serviceRpc, fn, args) {
  try {
    return await serviceRpc(fn, args)
  } catch (err) {
    if (String(err.message).endsWith(': 404')) return null
    throw err
  }
}

const idOf = (value) => (typeof value === 'string' ? value : value?.id) || null

/**
 * The payment ids an invoice was paid with: a refund or a dispute names the
 * charge or the payment intent, never the invoice. Older API versions put
 * them on the invoice; newer ones list them under `payments`, which an event
 * may not carry, so they are asked for when missing.
 */
export async function invoicePaymentRefs(stripe, invoice) {
  const refs = new Set([idOf(invoice?.charge), idOf(invoice?.payment_intent)])
  for (const p of invoice?.payments?.data || []) {
    refs.add(idOf(p?.payment?.payment_intent))
    refs.add(idOf(p?.payment?.charge))
  }
  refs.delete(null)
  if (refs.size === 0 && invoice?.id) {
    try {
      const listed = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 3 })
      for (const p of listed?.data || []) {
        refs.add(idOf(p?.payment?.payment_intent))
        refs.add(idOf(p?.payment?.charge))
      }
      refs.delete(null)
    } catch {
      // Without them the database recognises the first payment by when it
      // was made (referral_payment_reversed), so this is not worth failing on.
    }
  }
  return [...refs]
}

/**
 * One month of the plan this subscription pays for, in the smallest unit of
 * its currency. The plan's own line wins over any other line on it.
 */
export function oneMonthOf(subscription, priceTiers) {
  let best = null
  for (const item of subscription?.items?.data || []) {
    const price = item?.price || item?.plan
    if (!price?.unit_amount) continue
    const tier = priceTiers.get(price.id) || null
    if (!best || (RANK[tier] ?? -1) > (RANK[best.tier] ?? -1)) best = { price, tier }
  }
  if (!best) return null
  const interval = best.price.recurring?.interval || best.price.interval
  const count = Number(best.price.recurring?.interval_count || best.price.interval_count || 1)
  const months = interval === 'year' ? 12 * count : interval === 'month' ? count : null
  if (!months) return null
  return {
    amount: Math.round(best.price.unit_amount / months),
    currency: subscription.currency || best.price.currency || 'usd',
    tier: best.tier || subscription?.metadata?.tier || null,
    cycle: interval === 'year' ? 'year' : 'month',
  }
}

/**
 * Give a family every free month it is owed and can be given now: earned,
 * not yet credited, and it has a live subscription. Called after the
 * invited family pays (the month is owed to the inviter) and after any news
 * that a family's own plan is live (a banked month comes due).
 *
 * A Stripe failure throws, so the webhook answers 500 and Stripe sends the
 * event again; the idempotency key makes the retry a no-op for any credit
 * that did go through.
 */
export async function applyReferralRewards({ stripe, serviceRpc, familyId, priceTiers }) {
  if (!familyId) return []
  const owed = await referralRpc(serviceRpc, 'referral_rewards_owed', { p_family_id: familyId })
  const given = []
  for (const reward of owed || []) {
    const subs = await stripe.subscriptions.list({ customer: reward.customer_id, status: 'all', limit: 10 })
    const sub = (subs?.data || []).find((s) => LIVE.includes(s.status))
    const month = sub && oneMonthOf(sub, priceTiers)
    // Stripe has no live plan for it yet (the database is a moment ahead):
    // it stays owed, and the next event about this family gives it.
    if (!month || month.amount <= 0) continue
    const credit = await stripe.customers.createBalanceTransaction(
      reward.customer_id,
      {
        amount: -month.amount,
        currency: month.currency,
        description: 'A free month: a family you invited started paying',
      },
      { idempotencyKey: `referral-reward:${reward.invited_family_id}` },
    )
    await serviceRpc('mark_referral_reward_applied', {
      p_invited: reward.invited_family_id,
      p_credit: credit.id,
      p_amount: month.amount,
      p_currency: month.currency,
      p_tier: month.tier,
      p_cycle: month.cycle,
    })
    given.push({ credit: credit.id, amount: month.amount })
  }
  return given
}

/**
 * An invoice of a family's plan was paid. If this family was invited and this
 * is its first payment, its inviter's free month is decided, and given at
 * once if the inviter pays.
 */
export async function referralInvoicePaid({ stripe, serviceRpc, familyId, invoice, event, priceTiers }) {
  const paid = Number(invoice?.amount_paid ?? 0)
  if (!familyId || !(paid > 0)) return null
  const subscription = idOf(invoice?.subscription) || idOf(invoice?.parent?.subscription_details?.subscription)
  if (!subscription) return null
  const refs = await invoicePaymentRefs(stripe, invoice)
  const result = await referralRpc(serviceRpc, 'earn_referral_reward', {
    p_family_id: familyId,
    p_invoice: invoice.id,
    p_amount: paid,
    p_refs: refs,
    p_customer: idOf(invoice.customer),
    p_paid_at: event?.created ? new Date(event.created * 1000).toISOString() : null,
  })
  // Owed now, or owed still after a failed try (a replay comes back
  // `duplicate` with the same state, and gives what the first try did not).
  if (result?.state === 'owed' && result.referrer_family_id) {
    await applyReferralRewards({ stripe, serviceRpc, familyId: result.referrer_family_id, priceTiers })
  }
  return result?.state || result?.ignored || null
}

/**
 * A payment of a family handed back in full, or disputed. If it was the
 * invited family's first payment and it was within 14 days, the inviter's
 * month is withdrawn if it is still unused.
 *
 * "Unused" is read from the inviter's Stripe balance: if it still holds at
 * least this much credit, the credit is taken back; if it holds less, an
 * invoice has already used it, and it is left. Either way the database
 * writes down what happened.
 */
export async function referralPaymentReversed({ stripe, serviceRpc, familyId, refs, kind, event, chargeCreated }) {
  if (!familyId) return null
  const result = await referralRpc(serviceRpc, 'referral_payment_reversed', {
    p_family_id: familyId,
    p_refs: refs.filter(Boolean),
    p_kind: kind,
    p_at: event?.created ? new Date(event.created * 1000).toISOString() : null,
    p_charge_created: chargeCreated ? new Date(chargeCreated * 1000).toISOString() : null,
  })
  if (result?.action !== 'reverse_credit') return result?.withdrawn ? 'withdrawn' : result?.kept ? 'kept' : null
  const amount = Number(result.amount || 0)
  let reversed = false
  let reversal = null
  if (result.customer_id && amount > 0) {
    const customer = await stripe.customers.retrieve(result.customer_id)
    // A negative balance is credit the customer has not used yet.
    if (-Number(customer?.balance || 0) >= amount) {
      const back = await stripe.customers.createBalanceTransaction(
        result.customer_id,
        {
          amount,
          currency: String(result.currency || 'usd').toLowerCase(),
          description: 'Free month withdrawn: the invited family\'s first payment was refunded',
        },
        { idempotencyKey: `referral-withdraw:${result.invited_family_id}` },
      )
      reversed = true
      reversal = back.id
    }
  }
  await serviceRpc('finish_referral_withdrawal', {
    p_invited: result.invited_family_id,
    p_reversed: reversed,
    p_kind: result.kind,
    p_reversal: reversal,
  })
  return reversed ? 'withdrawn' : 'kept'
}
