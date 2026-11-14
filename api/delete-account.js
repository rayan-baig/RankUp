/**
 * Serverless function: delete a family's account, and stop its billing.
 *
 * The deletion is the database's (delete_family_account), called with the
 * parent's own token, so the same rules apply as from the app: only a parent
 * of the family, only with the typed confirmation. It removes the family and,
 * in the same transaction, queues the family's Stripe subscription for
 * cancellation.
 *
 * Then this cancels it at Stripe, at once, with the secret key, which never
 * goes near a browser. Before this endpoint the app called the database
 * directly, the family vanished, and its subscription went on charging the
 * card every month with nothing left in RankUp that could stop it.
 *
 * The order matters. The account is deleted whatever Stripe does: Stripe
 * being down, slow, or refusing must not keep a family's data that the parent
 * asked to have removed. A cancellation that does not go through stays queued
 * and is retried by the daily api/run-retention.js (and by the webhook, the
 * next time Stripe says anything about it) until Stripe confirms.
 */

import { makeStripe } from './_shared/stripe.js'
import { makeServiceRpc, reportError, userHeaders } from './_shared/job.js'
import { cancelPendingBilling } from './_shared/cancelBilling.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!SUPABASE_URL) return res.status(503).json({ error: 'not_configured' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Sign in first.' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }

  let result
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_family_account`, {
      method: 'POST',
      headers: userHeaders(token),
      body: JSON.stringify({ p_confirm: String(body?.confirm ?? '') }),
    })
    // The database refusing (not a parent of any family) arrives as an error.
    if (!r.ok) return res.status(r.status >= 500 ? 502 : 403).json({ ok: false, reason: 'not_allowed' })
    result = await r.json()
  } catch (err) {
    await reportError('delete-account', err)
    return res.status(502).json({ ok: false, reason: 'database_unreachable' })
  }
  if (!result?.ok) return res.status(400).json({ ok: false, reason: result?.reason || 'not_deleted' })

  // The account is gone. Now the billing, which cannot undo that.
  let billing = 'none'
  if (result.billing === 'cancel_queued') {
    billing = 'queued'
    if (STRIPE_SECRET && SERVICE_KEY && result.family_id) {
      const outcome = await cancelPendingBilling({
        stripe: makeStripe(STRIPE_SECRET),
        serviceRpc: makeServiceRpc(SUPABASE_URL, SERVICE_KEY),
        familyId: result.family_id,
      })
      if (outcome.pending !== null && outcome.failed === 0) billing = 'cancelled'
    }
  }

  // The family id stays here: the browser has no use for it any more.
  return res.status(200).json({
    ok: true,
    billing,
    ...(result.sign_in_kept ? { sign_in_kept: true } : {}),
  })
}
