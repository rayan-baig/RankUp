/**
 * Serverless function: settle last month's Parent Alliances.
 *
 * Run once a month, by a scheduler — see docs/PAYMENTS.md. It decides each
 * alliance's winner and gives that family 20% off their next invoice.
 *
 * THIS SPENDS REAL MONEY, so three things hold:
 *
 * 1. It is not reachable by a signed-in parent. settle_alliances is revoked
 *    from `public` in the database, so even a leaked user token cannot call it;
 *    this endpoint holds the service role key and is itself behind a shared
 *    secret that only the scheduler knows.
 *
 * 2. The winner is decided by the database, from approved submissions. Nothing
 *    in the request body names a family, a score or an amount — a caller who
 *    got past the secret still could not choose who wins.
 *
 * 3. Paying twice is impossible rather than unlikely. The award row's primary
 *    key is (alliance, month), and settle_alliances returns only the rows it
 *    actually inserted. A second run in the same month returns an empty list
 *    and therefore issues no coupons, which is what makes it safe to retry
 *    after a half-finished run.
 */

import { recordRun } from './_shared/job.js'
import { makeStripe } from './_shared/stripe.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
/** Shared with the scheduler and nothing else. No secret, no settlement. */
const CRON_SECRET = process.env.CRON_SECRET || ''
/** The prize, as a percentage off one invoice. */
const DISCOUNT_PERCENT = 20

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

/** The first day of last month, in UTC — the month being settled. */
function lastMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10)
}

/**
 * Timing-safe comparison, so a caller cannot discover the secret one character
 * at a time by measuring how long the rejection takes.
 */
function secretMatches(given) {
  if (!CRON_SECRET || given.length !== CRON_SECRET.length) return false
  let diff = 0
  for (let i = 0; i < CRON_SECRET.length; i += 1) {
    diff |= CRON_SECRET.charCodeAt(i) ^ given.charCodeAt(i)
  }
  return diff === 0
}

export default async function handler(req, res) {
  // GET as well as POST: Vercel's scheduler issues GET, and a POST-only handler
  // would 405 on every run while still looking scheduled. The shared secret,
  // not the verb, is what protects this.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Use POST or GET.' })
  }
  if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_SECRET || !CRON_SECRET) {
    return res.status(503).json({ error: 'not_configured' })
  }

  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given)) return res.status(401).json({ error: 'no' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
  // A month may be named so a missed run can be settled late. It cannot name a
  // winner, only which month to compute one for.
  const month = /^\d{4}-\d{2}-01$/.test(body?.month || '') ? body.month : lastMonth()

  let settled
  try {
    settled = await serviceRpc('settle_alliances', { p_month: month })
  } catch (err) {
    await recordRun(serviceRpc, 'settle-alliances', false, err.message)
    return res.status(502).json({ error: 'settle_failed', detail: err.message })
  }

  // Every prize still owed, not just this run's: one that failed last time
  // (a Stripe error, a run cut short) is given now. The idempotency keys
  // below make a second attempt at one already given a no-op in Stripe.
  let owed
  try {
    owed = await serviceRpc('unapplied_alliance_awards', {})
  } catch (err) {
    await recordRun(serviceRpc, 'settle-alliances', false, err.message)
    return res.status(502).json({ error: 'settle_failed', detail: err.message })
  }
  const awards = owed || []
  const stripe = makeStripe(STRIPE_SECRET)
  const applied = []
  const failed = []

  for (const award of awards) {
    // A winner with no Stripe customer has nothing to discount — they are on a
    // free or unbilled account. The award still stands, and stays unapplied.
    if (!award.stripe_customer_id) {
      failed.push({ alliance_id: award.alliance_id, reason: 'no_stripe_customer' })
      continue
    }
    const awardMonth = `${award.month_key}-01`
    try {
      /*
       * The prize, as account credit: 20% of one month at the price they pay.
       *
       * Credit rather than a percentage coupon. A coupon takes 20% off the
       * next invoice, which on a yearly plan is 20% of a year, a prize ten
       * times bigger for the same win. The price is read from their own
       * subscription (a yearly price divided by twelve), in its currency.
       *
       * Any live subscription counts, trialing and past_due included: the
       * free trial makes "trialing" common, and those winners were skipped.
       */
      const subs = await stripe.subscriptions.list({ customer: award.stripe_customer_id, status: 'all', limit: 10 })
      const sub = subs.data.find((s) => ['active', 'trialing', 'past_due'].includes(s.status))
      const price = sub?.items?.data?.[0]?.price
      if (!sub || !price?.unit_amount) {
        failed.push({ alliance_id: award.alliance_id, reason: 'no_live_subscription' })
        continue
      }
      const perMonth = price.recurring?.interval === 'year' ? price.unit_amount / 12 : price.unit_amount
      const credit = await stripe.customers.createBalanceTransaction(
        award.stripe_customer_id,
        {
          amount: -Math.round(perMonth * DISCOUNT_PERCENT / 100),
          currency: sub.currency || price.currency,
          description: `Alliance winner, ${award.month_key}: ${DISCOUNT_PERCENT}% of a month`,
          metadata: { alliance_id: award.alliance_id, month_key: award.month_key },
        },
        { idempotencyKey: `alliance-credit:${award.alliance_id}:${award.month_key}` },
      )
      await serviceRpc('mark_alliance_award_applied', {
        p_alliance_id: award.alliance_id,
        p_month: awardMonth,
        p_coupon: credit.id,
      })
      applied.push({ alliance_id: award.alliance_id, credit: credit.id })
    } catch (err) {
      // Left unapplied on purpose, so the next run tries it again rather than
      // it silently looking paid.
      failed.push({ alliance_id: award.alliance_id, reason: err.message })
    }
  }

  // A coupon Stripe refused is a failed run: the award is decided and unpaid,
  // which is exactly the state somebody has to go and look at.
  await recordRun(serviceRpc, 'settle-alliances', failed.length === 0,
    failed.length ? `${failed.length} award(s) not applied` : null)
  return res.status(200).json({ ok: true, month, decided: (settled?.awards || []).length, owed: awards.length, applied, failed })
}
