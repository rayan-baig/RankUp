/**
 * Pairing across real devices, via Supabase.
 *
 * This talks to Supabase's REST endpoint with plain `fetch` rather than the
 * Supabase JavaScript library. For four small calls that library is a large
 * dependency to carry, and going direct keeps the moving parts visible.
 *
 * NOT YET VERIFIED AGAINST A LIVE PROJECT — there is no Supabase project to
 * point it at. The SQL it expects is in supabase/schema.sql (the pairing_codes
 * table and the claim_pairing_code function). Once you have a project, set
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and this replaces the local
 * adapter automatically. Read docs/SYNC.md before trusting it with a real kid.
 *
 * The important design point: claiming a code is a single database function
 * call, not a read-then-write from the browser. Doing it in the browser would
 * let two parents claim the same code at the same moment, and would let a
 * tampered client skip the attempt counter entirely.
 */

const URL_BASE = import.meta.env?.VITE_SUPABASE_URL || ''
const ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || ''

export function isSupabaseConfigured() {
  return Boolean(URL_BASE && ANON_KEY)
}

function headers() {
  return {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  }
}

async function rpc(fn, body) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`)
  return res.json()
}

export const supabaseAdapter = {
  id: 'supabase',
  isReal: true,
  label: 'Across devices',

  async publishCode(record) {
    try {
      const result = await rpc('create_pairing_code', {
        p_code: record.code,
        p_kid_name: record.kidName,
        p_theme_id: record.themeId,
        p_ttl_seconds: Math.round((record.expiresAt - record.createdAt) / 1000),
      })
      // The function returns null when the code is already live for someone
      // else, so the caller can roll a new one.
      if (!result) return { ok: false, reason: 'collision' }
      return { ok: true, code: result.code, kidId: result.kid_id }
    } catch (err) {
      console.warn('[RankUp] publishCode:', err.message)
      return { ok: false, reason: 'unavailable' }
    }
  },

  async readCode(code) {
    try {
      const result = await rpc('read_pairing_code', { p_code: code })
      if (!result) return null
      return {
        code: result.code,
        kidId: result.kid_id,
        kidName: result.kid_name,
        themeId: result.theme_id,
        createdAt: Date.parse(result.created_at),
        expiresAt: Date.parse(result.expires_at),
        attempts: result.attempts,
        claimedAt: result.claimed_at ? Date.parse(result.claimed_at) : null,
        claimedByFamilyId: result.claimed_by_family_id || null,
        claimedByFamilyName: result.claimed_by_family_name || null,
        revokedAt: result.revoked_at ? Date.parse(result.revoked_at) : null,
      }
    } catch (err) {
      console.warn('[RankUp] readCode:', err.message)
      return null
    }
  },

  async revokeCode(code) {
    try {
      await rpc('revoke_pairing_code', { p_code: code })
      return { ok: true }
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  },

  /**
   * Polls every 3 seconds. Supabase does offer realtime subscriptions, but for
   * a screen that is open for ten minutes at most, a poll is fewer moving parts
   * and survives a flaky connection without needing to reconnect a socket.
   */
  watchCode(code, onChange) {
    let stopped = false
    const tick = async () => {
      if (stopped) return
      onChange(await this.readCode(code))
    }
    const poll = setInterval(tick, 3000)
    tick()
    return () => {
      stopped = true
      clearInterval(poll)
    }
  },

  async claimCode(code, { familyId, familyName }) {
    try {
      const result = await rpc('claim_pairing_code', {
        p_code: code,
        p_family_id: familyId,
        p_family_name: familyName,
      })
      if (!result?.ok) return { ok: false, reason: result?.reason || 'not_found' }
      return {
        ok: true,
        kid: { id: result.kid_id, name: result.kid_name, themeId: result.theme_id },
      }
    } catch (err) {
      console.warn('[RankUp] claimCode:', err.message)
      return { ok: false, reason: 'unavailable' }
    }
  },
}
