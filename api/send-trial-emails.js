/**
 * Serverless function: the free trial's two reminder emails.
 *
 * Three days before a family's trial ends, and on the day, each parent in the
 * family gets one short email saying so, what they will be on afterwards,
 * and that nothing is charged by itself. The trial banner already says this
 * in the app; this is for the parent who has not opened it this week.
 *
 * Schedule it hourly. It is safe to run that often, or twice at once: the
 * database decides who is due, in each family's own time zone
 * (due_trial_reminders, supabase/digests.sql); each reminder is claimed
 * before it is sent, so only one run sends it; and it is marked sent after,
 * so it goes once per family, ever. A send that fails gives its claim back
 * and the next run tries again. Each email carries an idempotency key, so a
 * run that died after sending and before marking cannot send it twice.
 *
 * Needs EMAIL_API_KEY and EMAIL_FROM (docs/EMAILS.md). Without them it
 * answers not_configured, records no run, and /api/health shows it as never
 * run, which is the point: an email nobody set up should not look healthy.
 *
 * Then, if ERRORS_EMAIL is set, the hourly error report to that address
 * (api/_shared/errorReport.js): crashes and server errors since the last
 * one, with nothing in it that could point at a family.
 */
import { recordRun, secretMatches, makeServiceRpc } from './_shared/job.js'
import { emailSettings, emailConfigured, sendEmail, trialEmail } from './_shared/email.js'
import { sendErrorReport } from './_shared/errorReport.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || ''
const SITE = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '')
const ERRORS_EMAIL = (process.env.ERRORS_EMAIL || '').trim()

export default async function handler(req, res) {
  // GET as well as POST: Vercel's scheduler issues GET.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Use POST or GET.' })
  }
  const settings = emailSettings()
  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET || !emailConfigured(settings)) {
    return res.status(503).json({ error: 'not_configured' })
  }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given, CRON_SECRET)) return res.status(401).json({ error: 'no' })

  const serviceRpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)

  let due
  try {
    due = await serviceRpc('due_trial_reminders', {})
  } catch (err) {
    await recordRun(serviceRpc, 'send-trial-emails', false, err.message)
    return res.status(502).json({ error: 'lookup_failed' })
  }

  const reminders = due?.reminders || []
  let sent = 0
  let failed = 0

  for (const r of reminders) {
    let claimed = false
    try {
      // eslint-disable-next-line no-await-in-loop
      claimed = await serviceRpc('claim_trial_reminder', {
        p_family_id: r.family_id, p_kind: r.kind, p_trial_ends_at: r.trial_ends_at,
      })
    } catch {
      continue
    }
    if (claimed !== true) continue

    const email = trialEmail({
      kind: r.kind, trialTier: r.trial_tier, paidTier: r.paid_tier,
      endsLocal: r.ends_local, daysLeft: r.days_left, site: SITE, replyTo: settings.replyTo,
    })
    // One email per parent, each to their own address: co-parents' addresses
    // are not shown to each other.
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all((r.recipients || []).map((to) => sendEmail({
      to: to.email,
      ...email,
      idempotencyKey: `trial-${r.kind}-${r.family_id}-${String(to.email).toLowerCase()}`,
    }, settings)))
    const allSent = results.length > 0 && results.every((x) => x.ok)
    // Nobody to write to counts as done: there is nobody to try again for.
    const done = allSent || results.length === 0
    try {
      // eslint-disable-next-line no-await-in-loop
      await serviceRpc('finish_trial_reminder', { p_family_id: r.family_id, p_kind: r.kind, p_sent: done })
    } catch { /* the claim runs out in an hour and the idempotency key covers the retry */ }
    sent += results.filter((x) => x.ok).length
    failed += results.filter((x) => !x.ok).length
  }

  const errors = await sendErrorReport(serviceRpc, settings, { to: ERRORS_EMAIL, site: SITE })
  const problems = [
    failed ? `${failed} email(s) not sent` : '',
    errors.configured && !errors.ok ? 'error report not sent' : '',
  ].filter(Boolean)
  await recordRun(serviceRpc, 'send-trial-emails', problems.length === 0, problems.join('; ') || null)
  return res.status(200).json({
    ok: true, due: reminders.length, sent, failed,
    error_report: errors.configured ? { kinds: errors.kinds || 0, sent: errors.sent || 0, ...(errors.capped ? { capped: true } : {}) } : null,
  })
}
