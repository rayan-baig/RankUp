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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
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
    return res.status(502).json({ error: 'settle_failed', detail: err.message })
  }

  const awards = settled?.awards || []
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
    try {
      // A fresh coupon per award, redeemable once, so a coupon id that leaked
      // could not be reused by anyone else.
      const coupon = await stripe.coupons.create({
        percent_off: DISCOUNT_PERCENT,
        duration: 'once',
        max_redemptions: 1,
        name: `Alliance winner ${month.slice(0, 7)}`,
      })
      await stripe.customers.update(award.stripe_customer_id, { coupon: coupon.id })
      await serviceRpc('mark_alliance_award_applied', {
        p_alliance_id: award.alliance_id,
        p_month: month,
        p_coupon: coupon.id,
      })
      applied.push({ alliance_id: award.alliance_id, coupon: coupon.id })
    } catch (err) {
      // Left unapplied on purpose. The award row is already written, so the
      // next run will not re-decide the month — but it also will not silently
      // look paid, and the failure is visible in alliance_results.
      failed.push({ alliance_id: award.alliance_id, reason: err.message })
    }
  }

  return res.status(200).json({ ok: true, month, decided: awards.length, applied, failed })
}
