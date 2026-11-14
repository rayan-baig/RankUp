/**
 * Serverless function: the Sunday-evening digest.
 *
 * The Behaviour Blueprint screen has computed a family's real numbers for
 * months and almost nobody opens it, because nothing ever asks them to. This is
 * what asks: one push on a Sunday evening with the week in a sentence, and a
 * tap that lands on the charts.
 *
 * Schedule it hourly. It is safe to run that often, or twice at once: the
 * database only offers families whose local evening it actually is, a family
 * with nothing to report is left out entirely rather than being told they did
 * nothing, and families are claimed in batches before anything is sent and
 * marked sent as each batch goes (`claim_due_digests`, supabase/digests.sql;
 * api/_shared/pushBatch.js), so a family is told once a week. A run stops
 * starting batches before it runs out of time or of the requests a
 * Cloudflare Function may make, and the next hourly run carries on.
 *
 * The wording is built here rather than taken from anywhere, because everything
 * a phone displays under this app's name has to be written by this app — see
 * the note on NOTICES in send-push.js.
 */

import { recordRun, secretMatches, makeServiceRpc } from './_shared/job.js'
import { sendInBatches, batchLimits, topicFor } from './_shared/pushBatch.js'
import { digestNotice } from '../src/data/noticeWords.js'

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

/** The week in one line: digestNotice in src/data/noticeWords.js, with every other notice's words. */
const digestMessage = digestNotice

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

  const vapid = { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE }
  let result
  try {
    result = await sendInBatches({
      serviceRpc,
      vapid,
      limits: batchLimits(),
      // The cursor is the last family the previous batch looked at, so a run
      // does not work out the quiet families' weeks again for every batch.
      claim: async (maxPhones, after) => {
        const got = await serviceRpc('claim_due_digests', {
          p_weekday: DIGEST_WEEKDAY, p_hour: DIGEST_HOUR, p_max_targets: maxPhones,
          p_after: after || null, p_lease_seconds: 300,
        })
        return {
          more: Boolean(got?.more),
          cursor: got?.after || after || null,
          items: (got?.digests || []).map((d) => ({
            family_id: d.family_id,
            week_key: d.week_key,
            targets: d.targets || [],
            payload: JSON.stringify(digestMessage(d)),
            topic: topicFor(`digest-${d.week_key}`),
          })),
        }
      },
      finish: (items) => serviceRpc('finish_digests', {
        p_items: items.map((i) => ({ family_id: i.family_id, week_key: i.week_key })),
      }),
    })
  } catch (err) {
    await recordRun(serviceRpc, 'send-digests', false, err.message)
    return res.status(502).json({ error: 'send_failed' })
  }

  // Nothing due is a successful run, not a skipped one. Most runs find nothing,
  // and a health check that only counted busy runs would call this job dead
  // every day except Sunday.
  await recordRun(serviceRpc, 'send-digests', true)
  return res.status(200).json({
    ok: true, due: result.notices, sent: result.sent, failed: result.failed,
    batches: result.batches, more: Boolean(result.stoppedFor), stopped_for: result.stoppedFor,
  })
}
