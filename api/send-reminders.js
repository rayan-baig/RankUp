/**
 * Serverless function: deliver the reminders that are due.
 *
 * The app has always had reminder times, but they lived in one device's
 * settings and could only fire while RankUp was open — the one moment a
 * reminder is no use. This is the job that sends them properly. Schedule it
 * every ten or fifteen minutes; see docs/NOTIFICATIONS.md.
 *
 * What makes it safe to run that often, or twice at once:
 *
 * 1. The database decides what is due: a reminder fires once a day, on the
 *    family's own local date, however often the job runs.
 * 2. Reminders are claimed in batches before anything is sent
 *    (`claim_due_reminders`, supabase/reminders.sql), so two runs never send
 *    the same one, and each batch is marked sent as soon as its pushes have
 *    gone. A run stops starting batches before it runs out of time or of the
 *    requests a Cloudflare Function may make, and the next run carries on
 *    (api/_shared/pushBatch.js). 10,000 due at once take several runs; none
 *    is sent twice for that, and none is dropped.
 * 3. The grace window means a missed run delivers late rather than skipping the
 *    day — but a reminder missed by hours is dropped rather than arriving at
 *    the wrong time of day.
 *
 * Like the alliance settlement job, this holds the service role key and is
 * behind a shared secret. The claim is revoked from `public`, `anon` and
 * `authenticated` precisely because it would otherwise let any signed-in
 * account enumerate every family, and their phones.
 */

import { recordRun } from './_shared/job.js'
import { sendInBatches, batchLimits, topicFor } from './_shared/pushBatch.js'
import { reminderPush } from '../src/data/noticeWords.js'

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

  const vapid = { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE }
  let result
  try {
    result = await sendInBatches({
      serviceRpc,
      vapid,
      limits: batchLimits(),
      claim: async (maxPhones) => {
        const got = await serviceRpc('claim_due_reminders', {
          p_grace_minutes: GRACE_MINUTES, p_max_targets: maxPhones, p_lease_seconds: 300,
        })
        return {
          more: Boolean(got?.more),
          items: (got?.reminders || []).map((r) => ({
            id: r.id,
            targets: r.targets || [],
            // The words are in src/data/noticeWords.js, the same as the app's own.
            payload: JSON.stringify(reminderPush(r.label, r.role)),
            // Held by the push service only as long as it would still be on
            // time: a phone that was off all morning should not get the
            // breakfast reminder at lunch. Late, or not at all, as with the
            // grace window.
            ttl: GRACE_MINUTES * 60,
            topic: topicFor(r.id),
          })),
        }
      },
      finish: (items) => serviceRpc('finish_reminders', { p_ids: items.map((i) => i.id) }),
    })
  } catch (err) {
    // Whatever was claimed and not finished is sent again once its claim
    // runs out; whatever was not claimed is still due.
    await recordRun(serviceRpc, 'send-reminders', false, err.message)
    return res.status(502).json({ error: 'send_failed' })
  }

  // Nothing due is a successful run, not a skipped one — most runs find nothing
  // and a health check that only counted busy runs would call a working job dead.
  await recordRun(serviceRpc, 'send-reminders', true)
  return res.status(200).json({
    ok: true, due: result.notices, sent: result.sent, failed: result.failed,
    batches: result.batches, more: Boolean(result.stoppedFor), stopped_for: result.stoppedFor,
  })
}
