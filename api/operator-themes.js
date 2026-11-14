/**
 * Serverless function: the operator's inbox of themes sent for a Season.
 *
 * Children make themes in Theme Genesis; a parent may send one to RankUp,
 * and it lands here. GET lists every submission (newest first, with the
 * month it came in) and every Season. POST does one thing:
 *
 *   { action: 'pick', submission_id, season_id }   into a Season not yet started
 *   { action: 'decline', submission_id }           not this time (gone after 90 days)
 *   { action: 'remove', submission_id }            gone now, and out of its Season
 *   { action: 'season', number, name, starts_on }  the next Season
 *
 * Behind OPERATOR_SECRET, the same key as the schools page. Nothing it
 * returns names a family or a child: the database's operator_theme_inbox
 * gives the theme, its credit line, the month and what was decided.
 */

import { makeServiceRpc, reportError, secretMatches } from './_shared/job.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const OPERATOR_SECRET = process.env.OPERATOR_SECRET || ''

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

const ACTIONS = {
  pick: (rpc, b) => UUID.test(String(b.submission_id || '')) && UUID.test(String(b.season_id || ''))
    && rpc('operator_pick_theme', { p_submission_id: b.submission_id, p_season_id: b.season_id }),
  decline: (rpc, b) => UUID.test(String(b.submission_id || ''))
    && rpc('operator_decline_theme', { p_submission_id: b.submission_id }),
  remove: (rpc, b) => UUID.test(String(b.submission_id || ''))
    && rpc('operator_remove_theme', { p_submission_id: b.submission_id }),
  season: (rpc, b) => Number.isInteger(Number(b.number)) && typeof b.name === 'string' && DAY.test(String(b.starts_on || ''))
    && rpc('operator_create_season', { p_number: Number(b.number), p_name: b.name.slice(0, 40), p_starts_on: b.starts_on }),
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' })
  if (!SUPABASE_URL || !SERVICE_KEY || !OPERATOR_SECRET) return res.status(503).json({ error: 'not_configured' })

  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given, OPERATOR_SECRET)) return res.status(401).json({ error: 'no' })

  const rpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)
  try {
    if (req.method === 'POST') {
      let body = req.body
      if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
      const act = ACTIONS[body?.action]
      const pending = act ? act(rpc, body) : false
      if (!pending) {
        return res.status(400).json({ error: 'Say one of: pick, decline, remove (with submission_id), or season (number, name, starts_on).' })
      }
      const result = await pending
      // The database's reason (no_submission, season_started, …), for the page to say.
      if (!result?.ok) return res.status(409).json({ error: result?.reason || 'refused' })
      console.log(`[operator-themes] ${body.action}`)
    }
    const inbox = await rpc('operator_theme_inbox', {})
    return res.status(200).json({ ok: true, ...inbox })
  } catch (err) {
    await reportError('operator-themes', err)
    return res.status(502).json({ error: 'failed' })
  }
}
