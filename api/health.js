/**
 * Serverless function: is anything wrong?
 *
 * One URL to look at instead of worrying. Point a free uptime monitor at it and
 * you will hear about a problem before a parent emails you about one.
 *
 * TWO DEPTHS, on purpose.
 *
 *   GET /api/health                    — shallow. Is the app up and can it
 *                                        reach the database? Public, so an
 *                                        uptime monitor can poll it, and it
 *                                        says nothing an outsider could use.
 *
 *   GET /api/health  + CRON_SECRET     — deep. Which scheduled jobs have gone
 *                                        quiet, how big the undeleted-photo
 *                                        backlog is, how many crashes today.
 *
 * The split matters: crash counts and job names are operational detail, and a
 * health endpoint that hands them to anybody is a free map of your weak points.
 *
 * "Stale" is the thing this exists to catch. All three jobs are scheduled
 * outside this codebase and all three fail by going silent — no error, no
 * alert, just reminders that stop arriving and photos that stop being deleted.
 */

import { makeServiceRpc, secretMatches } from './_shared/job.js'
import { aiStatus } from './_shared/ai.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || ''

/** Booleans only. Whether a key is set is useful; the key itself is not. */
function configured() {
  return {
    database: Boolean(SUPABASE_URL && SERVICE_KEY),
    payments: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    push: Boolean(process.env.VAPID_PRIVATE_KEY &&
      (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY)),
    ai_photo_check: Boolean(process.env.ANTHROPIC_API_KEY),
    // Which model is answering, and what it turned out to accept. Worth
    // reporting because the model that serves a request is not always the one
    // asked for, and because comparing models on real photographs is the only
    // honest way to decide whether a dearer one earns its price.
    ai_model: aiStatus().model,
    scheduled_jobs: Boolean(CRON_SECRET),
    // Without this, Stripe has nowhere to send a parent back to and checkout
    // refuses to start. It is the easiest one to forget because nothing breaks
    // until somebody actually tries to pay.
    site_url: Boolean(process.env.PUBLIC_SITE_URL),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Use GET.' })
  }

  const conf = configured()
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  const deep = secretMatches(given, CRON_SECRET)

  // Even the failures obey the split. Saying WHICH part of the stack is down,
  // and quoting the database's own error text, is exactly the operational
  // detail the secret exists to keep in. A public caller gets the fact that
  // something is wrong, which is all an uptime monitor needs.
  if (!conf.database) {
    return deep
      ? res.status(503).json({ ok: false, reason: 'database_not_configured', configured: conf })
      : res.status(503).json({ ok: false })
  }

  const serviceRpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)

  let snapshot
  try {
    snapshot = await serviceRpc('health_snapshot', {})
  } catch (err) {
    // Reaching the database at all is the shallow check, so failing here is a
    // genuine outage — but the reason why is still not public.
    return deep
      ? res.status(503).json({ ok: false, reason: 'database_unreachable', detail: err.message })
      : res.status(503).json({ ok: false })
  }

  if (!deep) return res.status(200).json({ ok: true })

  const ok = Boolean(snapshot?.ok)
  return res.status(ok ? 200 : 503).json({ ...snapshot, configured: conf })
}
