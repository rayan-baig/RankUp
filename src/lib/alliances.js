/**
 * Parent Alliances, from the app's side.
 *
 * An alliance spans families and competes for money off a real bill, so none of
 * it is computed here. The browser asks the database who is winning; it never
 * reports its own score. See supabase/alliances.sql.
 *
 * With no backend configured these report `unavailable`. An alliance is
 * inherently multi-family, so — as with guilds — there is no offline version.
 */

import { transport } from './sync/transport.js'

export const ALLIANCE_ERRORS = {
  unavailable: 'Alliances need the sync service. This device is not connected to one yet.',
  not_a_parent: 'Only a parent on the account can do this.',
  plan_has_no_alliances: 'Parent Alliances are part of the Elite plan.',
  already_in_one: 'Your family is already in an alliance. Leave that one first.',
  no_such_code: 'No alliance has that code. Check the letters and try again.',
  full: 'That alliance already has ten families in it.',
}

export function allianceError(reason) {
  return ALLIANCE_ERRORS[reason] || 'That did not work. Please try again.'
}

const call = async (fn, args = {}) => {
  if (!transport.isConfigured()) return { ok: false, reason: 'unavailable' }
  try {
    return (await transport.rpc(fn, args)) || { ok: false, reason: 'unavailable' }
  } catch (err) {
    console.warn(`[RankUp] ${fn}:`, err.message)
    return { ok: false, reason: 'unavailable', message: err.message }
  }
}

export const alliances = {
  /** The standings for the current month, or `alliance: null` if not in one. */
  standings: () => call('alliance_standings', { p_month: null }),
  create: (name) => call('create_alliance', { p_name: name }),
  join: (code) => call('join_alliance', { p_invite_code: String(code || '').toUpperCase().trim() }),
  leave: () => call('leave_alliance'),
}
