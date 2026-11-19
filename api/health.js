/**
 * Serverless function: is anything wrong?
 *
 * One URL to look at instead of worrying. Point a free uptime monitor at it and
 * you will hear about a problem before a parent emails you about one.
 *
 * THREE ADDRESSES, from cheapest to deepest (docs/OPERATIONS.md says which to
 * give a monitor):
 *
 *   GET /api/healthz                   — is the site's server answering at
 *                                        all? Touches nothing else, so it is
 *                                        free to ask every minute.
 *   GET /api/health                    — that, and can it reach the database?
 *   GET /api/ready                     — that, and is everything it needs in
 *                                        place: the required settings, every
 *                                        scheduled job run recently, no
 *                                        deleted family still waiting for
 *                                        Stripe to cancel.
 *
 * Each answers 200 or 503 with only { ok, version } to anybody. With the
 * CRON_SECRET, /api/health and /api/ready also say WHY: which scheduled jobs
 * have gone quiet, which settings are missing (by name, never the value),
 * whether a deleted family's billing is still waiting to be cancelled, how
 * many crashes today.
 *
 * The split matters: crash counts and job names are operational detail, and a
 * health endpoint that hands them to anybody is a free map of your weak points.
 *
 * "Stale" is the thing this exists to catch. Every job is scheduled outside
 * this codebase and every one fails by going silent — no error, no alert,
 * just reminders and trial emails that stop arriving and old rows that stop
 * being deleted. /api/ready turns that silence into a 503 a monitor can see.
 *
 * Cheap on purpose: a public answer is kept for CACHE_MS, so a monitor (or
 * anybody else) asking every few seconds costs the database one small query
 * every quarter of a minute, not one per ask. The database is given
 * HEALTH_TIMEOUT_MS to answer; a slower one counts as down.
 */

import { makeServiceRpc, secretMatches } from './_shared/job.js'
// The version, from the one place it is written. Public at every depth: it
// says which build answered, which is the first thing to know when something
// looks wrong after a deploy, and nothing an outsider could use.
import pkg from '../package.json' with { type: 'json' }

const VERSION = pkg.version
export const HEALTH_TIMEOUT_MS = 5000
export const CACHE_MS = 15_000

/** Read when asked, not when loaded: on Workers the settings arrive per request. */
const setting = (name) => String(globalThis.process?.env?.[name] || '')
const supabaseUrl = () => setting('SUPABASE_URL') || setting('VITE_SUPABASE_URL')

/** Booleans only. Whether a key is set is useful; the key itself is not. */
export function configured() {
  return {
    database: Boolean(supabaseUrl() && setting('SUPABASE_SERVICE_ROLE_KEY')),
    // The functions ask the database as the signed-in parent with this key; a
    // real Supabase turns them away without it (api/_shared/job.js).
    public_key: Boolean(setting('VITE_SUPABASE_ANON_KEY')),
    payments: Boolean(setting('STRIPE_SECRET_KEY') && setting('STRIPE_WEBHOOK_SECRET')),
    push: Boolean(setting('VAPID_PRIVATE_KEY') && (setting('VAPID_PUBLIC_KEY') || setting('VITE_VAPID_PUBLIC_KEY'))),
    email: Boolean(setting('EMAIL_API_KEY') && setting('EMAIL_FROM')),
    scheduled_jobs: Boolean(setting('CRON_SECRET')),
    // Without this, Stripe has nowhere to send a parent back to and checkout
    // refuses to start. It is the easiest one to forget because nothing breaks
    // until somebody actually tries to pay.
    site_url: Boolean(setting('PUBLIC_SITE_URL')),
  }
}

/**
 * The settings the site cannot work properly without, by the names in
 * `configured`. Payments only once billing is switched on: a site running
 * free has no use for Stripe's keys. Push and email are not here: each is
 * optional, and the job that needs email says so in its own last_error.
 */
export function missingSettings(conf = configured()) {
  const required = ['database', 'public_key', 'scheduled_jobs', 'site_url']
  if (setting('VITE_STRIPE_ENABLED') === 'true') required.push('payments')
  return required.filter((name) => !conf[name])
}

/*
 * The last public look at the database, for CACHE_MS. Per running copy of
 * the function, which is all it needs to be: it only has to stop a flood of
 * asks becoming a flood of queries.
 */
let kept = null

/** For tests/failsoft.mjs, which asks the same running copy many times. */
export function forgetKeptAnswer() { kept = null }

/** health_snapshot, or { unreachable: true }. Never throws. */
async function lookAtDatabase(useKept) {
  if (useKept && kept && Date.now() - kept.at < CACHE_MS) return kept.result
  let result
  try {
    const snapshot = await makeServiceRpc(supabaseUrl(), setting('SUPABASE_SERVICE_ROLE_KEY'), HEALTH_TIMEOUT_MS)('health_snapshot', {})
    result = { snapshot }
  } catch (err) {
    // The database's own error text goes to the log, never into an answer.
    console.error('[health] database unreachable:', err?.message)
    result = { unreachable: true }
  }
  kept = { at: Date.now(), result }
  return result
}

/**
 * The answer, as { status, body }. `ready` asks the whole question
 * (/api/ready); without it, only whether the database answers (/api/health).
 * `deep` is the CRON_SECRET having been given: the reasons as well.
 */
export async function healthAnswer({ ready = false, deep = false } = {}) {
  const conf = configured()
  const missing = missingSettings(conf)

  // Even the failures obey the split. Saying WHICH part of the stack is down,
  // and quoting the database's own error text, is exactly the operational
  // detail the secret exists to keep in. A public caller gets the fact that
  // something is wrong, which is all an uptime monitor needs.
  if (!conf.database) {
    return deep
      ? { status: 503, body: { ok: false, version: VERSION, reason: 'database_not_configured', configured: conf, missing_settings: missing } }
      : { status: 503, body: { ok: false, version: VERSION } }
  }

  const look = await lookAtDatabase(!deep)
  if (look.unreachable) {
    return deep
      ? { status: 503, body: { ok: false, version: VERSION, reason: 'database_unreachable', configured: conf, missing_settings: missing } }
      : { status: 503, body: { ok: false, version: VERSION } }
  }

  const allWell = Boolean(look.snapshot?.ok) && missing.length === 0
  if (!deep) {
    const ok = ready ? allWell : true
    return { status: ok ? 200 : 503, body: { ok, version: VERSION } }
  }
  return {
    status: allWell ? 200 : 503,
    body: { ...look.snapshot, ok: allWell, version: VERSION, configured: conf, missing_settings: missing },
  }
}

/** The handler for /api/health and, with `ready`, /api/ready. */
export async function answerHealth(req, res, { ready = false } = {}) {
  // HEAD as well: some uptime monitors ask with it by default.
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'method_not_allowed', version: VERSION })
  }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  const deep = secretMatches(given, setting('CRON_SECRET'))
  const { status, body } = await healthAnswer({ ready, deep })
  // Never kept by a browser or a cache in between: a monitor must see now.
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

export default function handler(req, res) {
  return answerHealth(req, res, { ready: false })
}
