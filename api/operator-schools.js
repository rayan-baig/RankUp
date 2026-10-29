/**
 * Serverless function: the operator checking schools are real.
 *
 * GET lists every school, the ones waiting to be checked first, with who
 * signed each up. POST does one thing to one school: verify, unverify,
 * suspend or unsuspend. A school is in no league and sees no child's name
 * until it has been verified here.
 *
 * Behind OPERATOR_SECRET, its own secret rather than the scheduler's: the
 * scheduler's secret sits in a cron configuration, and this one can make a
 * school able to see children's first names.
 */

import { makeServiceRpc, secretMatches } from './_shared/job.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const OPERATOR_SECRET = process.env.OPERATOR_SECRET || ''

const ACTIONS = {
  verify: (rpc, id) => rpc('verify_school', { p_school_id: id, p_verified: true }),
  unverify: (rpc, id) => rpc('verify_school', { p_school_id: id, p_verified: false }),
  suspend: (rpc, id) => rpc('set_school_status', { p_school_id: id, p_status: 'suspended' }),
  unsuspend: (rpc, id) => rpc('unsuspend_school', { p_school_id: id }),
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
      if (!act || !UUID.test(String(body?.school_id || ''))) {
        return res.status(400).json({ error: 'Say which school and one of: verify, unverify, suspend, unsuspend.' })
      }
      const result = await act(rpc, body.school_id)
      if (!result?.ok) return res.status(404).json({ error: 'no_such_school' })
      console.log(`[operator-schools] ${body.action} ${body.school_id}`)
    }
    return res.status(200).json({ ok: true, schools: await rpc('operator_schools', {}) })
  } catch (err) {
    console.error('[operator-schools]', err.message)
    return res.status(502).json({ error: 'failed' })
  }
}
