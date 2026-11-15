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
 * Then the reminder that a paused plan starts again: three days before
 * billing starts again after a pause (Pause instead of cancel,
 * docs/PAYMENTS.md), each parent gets one email saying when, what will be
 * charged, and that cancelling is a tap away. The same claim, send, mark
 * as above (due_pause_reminders, supabase/billing.sql), once per pause.
 *
 * Then, if ERRORS_EMAIL is set, the hourly error report to that address
 * (api/_shared/errorReport.js): crashes and server errors since the last
 * one, with nothing in it that could point at a family.
 */
import { recordRun, secretMatches, makeServiceRpc } from './_shared/job.js'
import { emailSettings, emailConfigured, sendEmail, trialEmail, pauseReminderEmail } from './_shared/email.js'
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

  // A paused plan starting again in three days.
  const pauses = { due: 0, sent: 0, failed: 0 }
  let pauseLookupFailed = false
  let pauseDue = []
  try {
    pauseDue = (await serviceRpc('due_pause_reminders', {}))?.reminders || []
  } catch {
    // A database without this version's billing.sql yet: the trial emails
    // above still went, and the run says the pause reminders did not.
    pauseLookupFailed = true
  }
  pauses.due = pauseDue.length
  for (const r of pauseDue) {
    let claimed = false
    try {
      // eslint-disable-next-line no-await-in-loop
      claimed = await serviceRpc('claim_pause_reminder', { p_pause_id: r.pause_id })
    } catch {
      continue
    }
    if (claimed !== true) continue
    const email = pauseReminderEmail({
      paidTier: r.paid_tier, cycle: r.cycle, resumesLocal: r.resumes_local, site: SITE, replyTo: settings.replyTo,
    })
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all((r.recipients || []).map((to) => sendEmail({
      to: to.email,
      ...email,
      // The pause and its date: a pause whose date moved is a new email.
      idempotencyKey: `pause-${r.pause_id}-${String(r.resumes_at).slice(0, 19)}-${String(to.email).toLowerCase()}`,
    }, settings)))
    const done = results.every((x) => x.ok)
    try {
      // eslint-disable-next-line no-await-in-loop
      await serviceRpc('finish_pause_reminder', { p_pause_id: r.pause_id, p_sent: done })
    } catch { /* the claim runs out in an hour and the idempotency key covers the retry */ }
    pauses.sent += results.filter((x) => x.ok).length
    pauses.failed += results.filter((x) => !x.ok).length
  }

  const errors = await sendErrorReport(serviceRpc, settings, { to: ERRORS_EMAIL, site: SITE })
  const problems = [
    failed ? `${failed} email(s) not sent` : '',
    pauses.failed ? `${pauses.failed} pause reminder(s) not sent` : '',
    pauseLookupFailed ? 'pause reminders not looked up' : '',
    errors.configured && !errors.ok ? 'error report not sent' : '',
  ].filter(Boolean)
  await recordRun(serviceRpc, 'send-trial-emails', problems.length === 0, problems.join('; ') || null)
  return res.status(200).json({
    ok: true, due: reminders.length, sent, failed, pauses,
    error_report: errors.configured ? { kinds: errors.kinds || 0, sent: errors.sent || 0, ...(errors.capped ? { capped: true } : {}) } : null,
  })
}
