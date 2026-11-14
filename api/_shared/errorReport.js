/**
 * The error report: one short email to ERRORS_EMAIL with what went wrong
 * since the last one. Crashes on phones (crash_reports) and errors in the
 * server functions (server_errors, written by reportError in job.js).
 *
 * Sent by the hourly email job (api/send-trial-emails.js) after the trial
 * reminders. The database decides what goes in it and keeps the rules
 * (claim_error_report, supabase/crashes.sql): each distinct error at most
 * once an hour, at most 20 reports a day, and no name, email, family id,
 * token or request in any of it. A report that could not be sent gives its
 * errors back for the next run; the idempotency key stops a retried send
 * from arriving twice.
 *
 * Optional: without ERRORS_EMAIL nothing is claimed and nothing is sent.
 */
import { sendEmail, errorReportEmail } from './email.js'

export async function sendErrorReport(serviceRpc, settings, { to, site } = {}) {
  if (!to) return { configured: false }
  let claim
  try {
    claim = await serviceRpc('claim_error_report', { p_max_kinds: 20 })
  } catch {
    return { configured: true, ok: false, error: 'claim_failed' }
  }
  const kinds = claim?.kinds || []
  if (!kinds.length || !claim.report_id) {
    return { configured: true, ok: true, kinds: 0, sent: 0, ...(claim?.capped ? { capped: true } : {}) }
  }
  const email = errorReportEmail(claim, { site })
  const result = await sendEmail({ to, ...email, idempotencyKey: `errors-${claim.report_id}` }, settings)
  try {
    await serviceRpc('finish_error_report', { p_report_id: claim.report_id, p_sent: result.ok })
  } catch { /* an unfinished claim is given back after half an hour */ }
  return { configured: true, ok: result.ok, kinds: kinds.length, sent: result.ok ? 1 : 0 }
}
