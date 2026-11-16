/**
 * Serverless function: the operator checking schools are real, and the
 * schools' pilot codes.
 *
 * GET lists every school, the ones waiting to be checked first, with who
 * signed each up, RankUp's daily usage totals for the last 30 days, and
 * every pilot code with how its pilot stands and when it ends.
 * POST does one thing to one school: verify, unverify, suspend or
 * unsuspend. A school is in no league and sees no child's name
 * until it has been verified here. Or one thing to a pilot code:
 * `create_pilot` makes a code (label, days, the date it must be used by) and
 * answers it ONCE, since only its hash is kept; `withdraw_pilot` takes back
 * one nobody has used. PILOT_DAYS is the length the form starts at (90).
 *
 * Behind OPERATOR_SECRET, its own secret rather than the scheduler's: the
 * scheduler's secret sits in a cron configuration, and this one can make a
 * school able to see children's first names.
 */

import { makeServiceRpc, reportError, secretMatches } from './_shared/job.js'
import {
  PILOT_CODE_ALPHABET, PILOT_CODE_LENGTH, PILOT_DEFAULT_DAYS, PILOT_CODE_VALID_DAYS, formatPilotCode, normalizePilotCode, pilotDays,
} from '../src/lib/pilotRules.js'

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

/** The pilot length the operator's form starts at. */
const PILOT_DAYS = () => pilotDays(process.env.PILOT_DAYS, PILOT_DEFAULT_DAYS)

/**
 * A new pilot code: ten characters from the school codes' alphabet, from the
 * runtime's cryptographic random source. Bytes at or above 224 (7 x 32) are
 * skipped so every character is equally likely.
 */
export function newPilotCode() {
  const n = PILOT_CODE_ALPHABET.length
  const limit = 256 - (256 % n)
  let out = ''
  while (out.length < PILOT_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit) out += PILOT_CODE_ALPHABET[byte % n]
      if (out.length === PILOT_CODE_LENGTH) break
    }
  }
  return out
}

/** What the database keeps: sha256 of the code without dashes, in hex. Same as redeem_school_pilot. */
export async function pilotCodeHash(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizePilotCode(code)))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Make a code and store its hash. The code is answered once, here, and never again. */
async function createPilot(rpc, body) {
  const days = Number(body?.days ?? PILOT_DAYS())
  const until = body?.code_expires_at ? new Date(body.code_expires_at)
    : new Date(Date.now() + PILOT_CODE_VALID_DAYS * 86400000)
  if (Number.isNaN(until.getTime())) return { ok: false, reason: 'bad_expiry' }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newPilotCode()
    // eslint-disable-next-line no-await-in-loop
    const made = await rpc('create_school_pilot', {
      p_code_hash: await pilotCodeHash(code),
      p_label: String(body?.label ?? '').slice(0, 200),
      p_days: Number.isInteger(days) ? days : -1,
      p_code_expires_at: until.toISOString(),
    })
    if (made?.ok) return { ...made, code: formatPilotCode(code) }
    if (made?.reason !== 'code_taken') return made || { ok: false, reason: 'failed' }
  }
  return { ok: false, reason: 'code_taken' }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' })
  if (!SUPABASE_URL || !SERVICE_KEY || !OPERATOR_SECRET) return res.status(503).json({ error: 'not_configured' })

  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given, OPERATOR_SECRET)) return res.status(401).json({ error: 'no' })

  const rpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)
  try {
    let made = null
    if (req.method === 'POST') {
      let body = req.body
      if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
      if (body?.action === 'create_pilot') {
        made = await createPilot(rpc, body)
        if (!made?.ok) return res.status(400).json({ error: made?.reason || 'bad_request' })
        // Never the code in a log.
        console.log(`[operator-schools] create_pilot ${made.id} ${made.days} days`)
      } else if (body?.action === 'withdraw_pilot') {
        if (!UUID.test(String(body?.pilot_id || ''))) return res.status(400).json({ error: 'Say which pilot code.' })
        const gone = await rpc('withdraw_school_pilot', { p_pilot_id: body.pilot_id })
        if (!gone?.ok) return res.status(409).json({ error: gone?.reason || 'not_withdrawable' })
        console.log(`[operator-schools] withdraw_pilot ${body.pilot_id}`)
      } else {
        const act = ACTIONS[body?.action]
        if (!act || !UUID.test(String(body?.school_id || ''))) {
          return res.status(400).json({ error: 'Say which school and one of: verify, unverify, suspend, unsuspend; or create_pilot, withdraw_pilot.' })
        }
        const result = await act(rpc, body.school_id)
        if (!result?.ok) return res.status(404).json({ error: 'no_such_school' })
        console.log(`[operator-schools] ${body.action} ${body.school_id}`)
      }
    }
    const [schools, usage, pilots] = await Promise.all([
      rpc('operator_schools', {}),
      // The daily usage totals for the operator's page (supabase/health.sql).
      // Counts only; a database without them still lists the schools.
      rpc('usage_daily_counts', { p_days: 30 }).catch(() => null),
      // The pilot codes (supabase/schools.sql). Likewise optional.
      rpc('operator_school_pilots', {}).catch(() => null),
    ])
    return res.status(200).json({
      ok: true, schools, usage, pilots, pilot_days: PILOT_DAYS(), pilot_code_days: PILOT_CODE_VALID_DAYS,
      // A code just made: shown once, on the page that asked for it.
      ...(made ? { made: { id: made.id, code: made.code, label: made.label, days: made.days, code_expires_at: made.code_expires_at } } : {}),
    })
  } catch (err) {
    await reportError('operator-schools', err)
    return res.status(502).json({ error: 'failed' })
  }
}
