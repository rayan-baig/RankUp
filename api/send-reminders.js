/**
 * Serverless function: deliver the reminders that are due.
 *
 * The app has always had reminder times, but they lived in one device's
 * settings and could only fire while RankUp was open — the one moment a
 * reminder is no use. This is the job that sends them properly. Schedule it
 * every ten or fifteen minutes; see docs/NOTIFICATIONS.md.
 *
 * Three things make it safe to run that often:
 *
 * 1. `due_reminders` only returns what has not already fired on the family's
 *    own local date, so running every ten minutes still sends each reminder
 *    once a day.
 * 2. Each one is marked sent immediately after its pushes go out, so an
 *    overlapping run cannot pick the same row up twice.
 * 3. The grace window means a missed run delivers late rather than skipping the
 *    day — but a reminder missed by hours is dropped rather than arriving at
 *    the wrong time of day.
 *
 * Like the alliance settlement job, this holds the service role key and is
 * behind a shared secret. `due_reminders` is revoked from `public` precisely
 * because it would otherwise let any signed-in account enumerate every family.
 */

import { recordRun } from './_shared/job.js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const VAPID_PUBLIC = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@example.com'
const CRON_SECRET = process.env.CRON_SECRET || ''
/**
 * How late a reminder may still be delivered, in minutes.
 *
 * Validated, not coerced: Number('2h') is NaN, NaN serialises to JSON null, and
 * the SQL comparison against null is never true — so one typo here would mean
 * no reminder is EVER due, while the job kept reporting success and the health
 * check stayed green. run-retention already guarded this; this file did not.
 */
function minutes(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
const GRACE_MINUTES = minutes(process.env.REMINDER_GRACE_MINUTES, 120)

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
  if (!SUPABASE_URL || !SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE || !CRON_SECRET) {
    return res.status(503).json({ error: 'not_configured' })
  }

  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given)) return res.status(401).json({ error: 'no' })

  let due
  try {
    due = await serviceRpc('due_reminders', { p_grace_minutes: GRACE_MINUTES })
  } catch (err) {
    await recordRun(serviceRpc, 'send-reminders', false, err.message)
    return res.status(502).json({ error: 'lookup_failed', detail: err.message })
  }

  const reminders = due?.reminders || []
  // Nothing due is a successful run, not a skipped one — most runs find nothing
  // and a health check that only counted busy runs would call a working job dead.
  if (!reminders.length) {
    await recordRun(serviceRpc, 'send-reminders', true)
    return res.status(200).json({ ok: true, due: 0, sent: 0 })
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  let sent = 0
  let failed = 0

  for (const r of reminders) {
    let targets = []
    try {
      targets = await serviceRpc('push_targets', {
        p_family_id: r.family_id, p_role: r.role, p_kid_id: r.kid_id || null,
      }) || []
    } catch {
      failed += 1
      continue
    }

    const message = JSON.stringify({
      title: String(r.label || 'RankUp').slice(0, 120),
      body: r.role === 'kid' ? 'Time for your quests.' : 'Time to check in on today’s quests.',
      tag: 'reminder',
      url: r.role === 'kid' ? '/#/kid/quests' : '/#/parent/approvals',
    })

    const results = await Promise.allSettled(
      targets.map((t) => webpush.sendNotification({ endpoint: t.endpoint, keys: t.keys }, message)),
    )

    // Marked sent even when every push failed. A family with no working phone
    // registered must not have the job retry them every ten minutes all day;
    // the dead endpoints are dropped below and they get it tomorrow.
    try { await serviceRpc('mark_reminder_sent', { p_id: r.id }) } catch { /* next run retries */ }

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

  await recordRun(serviceRpc, 'send-reminders', true)
  return res.status(200).json({ ok: true, due: reminders.length, sent, failed })
}
