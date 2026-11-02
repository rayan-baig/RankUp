/**
 * Serverless function: throw away what nothing reads any more.
 *
 * Run it once a day; see docs/LAUNCH.md. It trims the activity log, crash
 * reports and the spent pairing rows, and retries any deleted family's Stripe cancellation that has
 * not gone through yet.
 *
 * WHY THIS IS NOT OPTIONAL. These tables grow forever and are only ever read
 * over a short recent window, so without this job the database's largest
 * contents are things the app cannot show anybody:
 *
 *   events    ~10 rows per family per day, forever; the dashboard reads 8
 *   pairing   a six-digit code lives ten minutes; the row lived for ever
 *
 * Like the other scheduled jobs this holds the service role key behind a
 * shared secret, and run_retention is revoked from `public`: it deletes across
 * every family at once, which no signed-in account should be able to ask for.
 */

import { recordRun } from './_shared/job.js'
import { makeStripe } from './_shared/stripe.js'
import { cancelPendingBilling } from './_shared/cancelBilling.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''

/**
 * Days to keep. Generous by default: the job exists to bound growth, not to be
 * clever about how little can be kept.
 *
 * Validated rather than coerced, because Number('90d') is NaN, NaN serialises
 * to JSON null, and the SQL floors then take over: greatest(1, null) is 1, so a
 * single typo in an environment variable would quietly cut event retention from
 * ninety days to seven and empty the charts a parent reads.
 */
function days(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

const EVENT_DAYS = days(process.env.RETENTION_EVENT_DAYS, 90)
const PAIRING_DAYS = days(process.env.RETENTION_PAIRING_DAYS, 2)

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
  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
    return res.status(503).json({ error: 'not_configured' })
  }

  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given)) return res.status(401).json({ error: 'no' })

  try {
    const result = await serviceRpc('run_retention', {
      p_event_days: EVENT_DAYS,
      p_pairing_days: PAIRING_DAYS,
    })
    /*
     * Deleted families whose Stripe subscription is not yet confirmed
     * cancelled: Stripe was down or refused when the account was deleted
     * (api/delete-account.js), or the app that deleted it called the database
     * directly. Tried again every day until Stripe confirms; a failure here
     * stays queued, does not fail the clean-up above, and health_snapshot
     * reports it once it is a day old.
     */
    const billing = STRIPE_SECRET
      ? await cancelPendingBilling({ stripe: makeStripe(STRIPE_SECRET), serviceRpc, limit: 200 })
      : { skipped: 'stripe_not_configured' }
    await recordRun(serviceRpc, 'run-retention', true)
    return res.status(200).json({ ...(result || { ok: true }), billing_cancellations: billing })
  } catch (err) {
    await recordRun(serviceRpc, 'run-retention', false, err.message)
    return res.status(502).json({ error: 'retention_failed', detail: err.message })
  }
}
