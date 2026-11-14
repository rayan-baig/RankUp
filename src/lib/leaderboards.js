/**
 * Leaderboards, from the app's side: every call is a database function
 * (supabase/leaderboards.sql), which decides what this child may see. The
 * numbers are the server's, worked out by a scheduled job every ten minutes;
 * a phone never sends a score.
 *
 * With no backend the public boards do not exist (there is nobody else to
 * race), and these report `unavailable`.
 */
import { transport } from './sync/transport.js'

const call = async (fn, args) => {
  if (!transport.isConfigured()) return { ok: false, reason: 'unavailable' }
  try {
    return (await transport.rpc(fn, args)) || { ok: false, reason: 'unavailable' }
  } catch (err) {
    console.warn(`[RankUp] ${fn}:`, err.message)
    return { ok: false, reason: 'unavailable', message: err.message }
  }
}

export const leaderboards = {
  available: () => transport.isConfigured(),

  /** This child's mode, nickname and country. */
  me: (kidId) => call('leaderboard_me', { p_kid_id: kidId }),

  board: (kidId, board, period, scope, game = '') =>
    call('leaderboard_board', { p_kid_id: kidId, p_board: board, p_period: period, p_scope: scope, p_game: game }),

  /** Three pieces from the lists; the server accepts nothing else. Once a week. */
  setNickname: (kidId, { first, second, number }) =>
    call('set_leaderboard_nickname', { p_kid_id: kidId, p_first: first, p_second: second, p_number: number }),

  /** 'arena' needs a parent; 'adventure' anyone acting for the child. */
  setMode: (kidId, mode) => call('set_leaderboard_mode', { p_kid_id: kidId, p_mode: mode }),

  /** Parent Mode: every child's mode and nickname, and the family's country. */
  familySettings: () => call('leaderboard_family_settings', {}),

  setCountry: (code) => call('set_leaderboard_country', { p_country: code || '' }),
}

/*
 * One answer per child per visit, for the mode badge on Home and Profile, so
 * drawing the home screen does not ask the server every time.
 */
const meCache = new Map()

export async function cachedMe(kidId, { fresh = false } = {}) {
  if (!fresh && meCache.has(kidId)) return meCache.get(kidId)
  const res = await leaderboards.me(kidId)
  if (res.ok) meCache.set(kidId, res)
  return res
}

export function forgetMe(kidId) {
  meCache.delete(kidId)
}

/* ---------- "Enter the Arena": shown once, on the child's phone ---------- */

const seenKey = (kidId) => `rankup:arena-seen:${kidId}`

/** Has this phone shown the Arena moment for this switch-on? */
export function arenaMomentSeen(kidId, since) {
  if (!since) return true
  try { return localStorage.getItem(seenKey(kidId)) === String(since) } catch { return true }
}

export function markArenaMomentSeen(kidId, since) {
  try { localStorage.setItem(seenKey(kidId), String(since)) } catch { /* private window: shown again next time */ }
}
