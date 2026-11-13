/**
 * Serverless function: work the leaderboards out again.
 *
 * Run every ten minutes, by a scheduler (docs/LAUNCH.md). The database ranks
 * every Arena child and every all-Arena guild on every board, worldwide and
 * by country, and keeps each child's numbers for the family and guild
 * boards (refresh_leaderboards in supabase/leaderboards.sql). Opening a board
 * then reads one stored page instead of ranking everybody again.
 *
 * Nothing here reads or sends anything about a child: the work is all in the
 * database, in one transaction, and the answer is counts. Safe to run twice
 * at once (the second steps aside) and safe to miss a run: the next one
 * starts from the rows, not from the last run. Weekly and monthly boards
 * reset on the UTC boundary itself, not at the next run.
 *
 * Like the other jobs this holds the service key behind CRON_SECRET, and
 * refresh_leaderboards is revoked from every browser role.
 */
import { recordRun, secretMatches, makeServiceRpc } from './_shared/job.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || ''

export default async function handler(req, res) {
  // GET as well as POST: Vercel's scheduler sends GET.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Use POST or GET.' })
  }
  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
    return res.status(503).json({ error: 'not_configured' })
  }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given, CRON_SECRET)) return res.status(401).json({ error: 'no' })

  const serviceRpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)
  try {
    const result = await serviceRpc('refresh_leaderboards', {})
    await recordRun(serviceRpc, 'refresh-leaderboards', true)
    return res.status(200).json(result || { ok: true })
  } catch (err) {
    await recordRun(serviceRpc, 'refresh-leaderboards', false, err.message)
    return res.status(502).json({ error: 'refresh_failed' })
  }
}
