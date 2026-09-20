/**
 * Serverless function: the Sunday-evening digest.
 *
 * The Behaviour Blueprint screen has computed a family's real numbers for
 * months and almost nobody opens it, because nothing ever asks them to. This is
 * what asks: one push on a Sunday evening with the week in a sentence, and a
 * tap that lands on the charts.
 *
 * Schedule it hourly. It is safe to run that often for the same three reasons
 * send-reminders is: the database only returns families whose local evening it
 * actually is, each send is recorded against (family, week) so a second run
 * finds nothing, and a family with nothing to report is left out entirely
 * rather than being told they did nothing.
 *
 * The wording is built here rather than taken from anywhere, because everything
 * a phone displays under this app's name has to be written by this app — see
 * the note on NOTICES in send-push.js.
 */

import { recordRun, secretMatches, makeServiceRpc } from './_shared/job.js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@example.com'
const CRON_SECRET = process.env.CRON_SECRET || ''

/** Validated, not coerced: Number('sun') is NaN and NaN would make nothing ever due. */
function whole(value, fallback, min, max) {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}
const DIGEST_WEEKDAY = whole(process.env.DIGEST_WEEKDAY, 7, 1, 7)   // 7 = Sunday
const DIGEST_HOUR = whole(process.env.DIGEST_HOUR, 18, 0, 23)

/**
 * The week in one line.
 *
 * A bare number says nothing — "nine" means nothing, "nine, up from five" is
 * the whole message. And the last sentence is the only part that asks for
 * anything: a parent with photos waiting is the one case where opening the app
 * tonight actually matters.
 */
function digestMessage(d) {
  const done = Number(d.approved) || 0
  const before = Number(d.approved_last_week) || 0
  const top = (d.kids || []).find((k) => Number(k.done) > 0)

  let body
  if (done === 0) body = `A quiet week — nothing finished since last Sunday. ${before} the week before.`
  else if (before === 0) body = `${done} ${done === 1 ? 'chore' : 'chores'} done this week.`
  else if (done > before) body = `${done} chores done, up from ${before} last week.`
  else if (done < before) body = `${done} chores done, down from ${before} last week.`
  else body = `${done} chores done, the same as last week.`

  if (top && (d.kids || []).length > 1) body += ` ${top.name} led with ${top.done}.`
  if (d.quietest_day && done > 0) body += ` Quietest day: ${d.quietest_day}.`

  const waiting = Number(d.waiting_for_you) || 0
  if (waiting > 0) body += ` ${waiting} ${waiting === 1 ? 'photo is' : 'photos are'} waiting for you.`

  return {
    title: 'Your week in RankUp',
    // Trimmed, because a push notification that runs past three lines is
    // truncated by the phone at whatever word it happens to reach.
    body: body.slice(0, 220),
    tag: 'digest',
    url: waiting > 0 ? '/#/parent/approvals' : '/#/parent/blueprint',
  }
}

export default async function handler(req, res) {
  // GET as well as POST: Vercel's scheduler issues GET, and a POST-only handler
  // would 405 on every run while still looking scheduled.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Use POST or GET.' })
  }
  if (!SUPABASE_URL || !SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE || !CRON_SECRET) {
    return res.status(503).json({ error: 'not_configured' })
  }

  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given, CRON_SECRET)) return res.status(401).json({ error: 'no' })

  const serviceRpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)

  let due
  try {
    due = await serviceRpc('due_digests', { p_weekday: DIGEST_WEEKDAY, p_hour: DIGEST_HOUR })
  } catch (err) {
    await recordRun(serviceRpc, 'send-digests', false, err.message)
    return res.status(502).json({ error: 'lookup_failed', detail: err.message })
  }

  const digests = due?.digests || []
  // Nothing due is a successful run, not a skipped one. Most runs find nothing,
  // and a health check that only counted busy runs would call this job dead
  // every day except Sunday.
  if (!digests.length) {
    await recordRun(serviceRpc, 'send-digests', true)
    return res.status(200).json({ ok: true, due: 0, sent: 0 })
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  let sent = 0
  let failed = 0

  for (const d of digests) {
    let targets = []
    try {
      targets = await serviceRpc('push_targets', {
        p_family_id: d.family_id, p_role: 'parent', p_kid_id: null,
      }) || []
    } catch {
      failed += 1
      continue
    }

    const wire = JSON.stringify(digestMessage(d))
    const results = await Promise.allSettled(
      targets.map((t) => webpush.sendNotification({ endpoint: t.endpoint, keys: t.keys }, wire)),
    )

    // Marked sent even when every push failed, exactly as send-reminders does.
    // A family with no working phone registered must not be retried every hour
    // for the rest of the week; the dead endpoints are dropped below.
    try {
      await serviceRpc('mark_digest_sent', { p_family_id: d.family_id, p_week_key: d.week_key })
    } catch {
      // The next run picks it up again, which is the safe direction.
    }

    await Promise.allSettled(
      results.map((result, i) => {
        if (result.status === 'fulfilled') return null
        const status = result.reason?.statusCode
        const gone = status === 404 || status === 410
        return serviceRpc('record_push_failure', { p_endpoint: targets[i].endpoint, p_gone: gone })
      }),
    )

    sent += results.filter((x) => x.status === 'fulfilled').length
    failed += results.filter((x) => x.status === 'rejected').length
  }

  await recordRun(serviceRpc, 'send-digests', true)
  return res.status(200).json({ ok: true, due: digests.length, sent, failed })
}
