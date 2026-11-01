/**
 * Serverless function: user counts for the owner's console.
 *
 * MTRX Horizon shows how many people use each app. This answers it with two
 * numbers, families and families active in the last 30 days, and nothing
 * about any one of them. Off unless STATS_KEY is set; answered only to that
 * key, which is the same value as the console's MTRX_STATS_KEY.
 */
import { makeServiceRpc, secretMatches } from './_shared/job.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const STATS_KEY = process.env.STATS_KEY || ''

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' })
  if (!STATS_KEY) return res.status(404).json({ error: 'Not found.' })
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given, STATS_KEY)) return res.status(401).json({ error: 'unauthorized' })
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: 'database_not_configured' })
  try {
    const counts = await makeServiceRpc(SUPABASE_URL, SERVICE_KEY)('usage_counts', {})
    return res.status(200).json({
      users: Number(counts?.families) || 0,
      active_users: Number(counts?.active_families) || 0,
    })
  } catch {
    return res.status(503).json({ error: 'unavailable' })
  }
}
