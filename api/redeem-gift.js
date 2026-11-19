/**
 * Serverless function: a parent redeems a gift code.
 *
 * Only a parent of the family can (billing_status answers only for a
 * parent's own token: never a supporter's, never a child's phone), and only
 * through here, because the limits that stop a code being found by trying
 * need to know where a request came from as well as which family sent it.
 * redeem_gift_code (supabase/billing.sql) is revoked from every browser
 * role; it allows 5 codes that did not work an hour per family and 20 per
 * address, and holds every other rule: single use, two years, a refund, a
 * paid plan that renews, stacking.
 *
 * The address is never stored: a keyed hash of it is (api/_shared/gifts.js).
 */
import { reportError, userHeaders } from './_shared/job.js'
import { ipKey } from './_shared/gifts.js'
import { timedFetch } from './_shared/http.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function callerFamily(token) {
  try {
    const res = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/billing_status`, {
      method: 'POST',
      headers: userHeaders(token),
      body: '{}',
    })
    if (!res.ok) return null
    const status = await res.json()
    return status?.ok && status.family_id ? status.family_id : null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: 'not_configured' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'signed_out' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const code = typeof body?.code === 'string' ? body.code.slice(0, 40) : ''
  if (!code.trim()) return res.status(400).json({ error: 'bad_request' })

  const familyId = await callerFamily(token)
  if (!familyId) return res.status(403).json({ error: 'no_family' })

  try {
    const r = await timedFetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_gift_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        p_family_id: familyId,
        p_code: code,
        p_ip_key: await ipKey(req, process.env.GIFT_CODE_SECRET || SERVICE_KEY),
      }),
    })
    if (!r.ok) throw new Error(`redeem_gift_code failed: ${r.status}`)
    const result = await r.json()
    if (result?.ok) {
      return res.status(200).json({
        ok: true, tier: result.tier, starts_at: result.starts_at, until: result.until, stacked: Boolean(result.stacked),
      })
    }
    const reason = result?.reason || 'bad_code'
    return res.status(reason === 'too_many_tries' ? 429 : reason === 'subscription_renews' ? 409 : 400).json({ error: reason })
  } catch (err) {
    await reportError('redeem-gift', err)
    return res.status(502).json({ error: 'redeem_failed' })
  }
}
