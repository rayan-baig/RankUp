/**
 * The other grown-ups, from the app's side.
 *
 * Every rule about who may invite, join or remove whom lives in
 * supabase/coparents.sql, where a device cannot reach it. This asks and shows
 * the answer.
 *
 * There is no offline version. A second adult is by definition a second
 * device with its own account, so without a backend there is nobody to invite.
 */

import { transport } from './sync/transport.js'

export const ADULT_ERRORS = {
  unavailable: 'Inviting another grown-up needs the sync service. This device is not connected to one yet.',
  too_many_adults: 'This family already has as many grown-ups as it can hold.',
  role_not_available: 'That is not something you can invite yet.',
  no_such_code: 'No invitation has that code. Check the letters and try again.',
  already_used: 'That invitation has already been used.',
  code_burned: 'That invitation has been tried too many times. Ask for a new one.',
  revoked: 'That invitation was cancelled.',
  expired: 'That invitation has expired. Ask for a new one.',
  too_many: 'Too many wrong codes. Wait ten minutes and try again.',
  already_in_family: 'This account is already in a family of its own.',
  this_is_a_kid_device: "This phone is set up as a kid's. Invitations are for grown-ups.",
  not_the_owner: 'Only the person who set the family up can remove someone.',
  cannot_remove_owner: 'The person who set the family up cannot be removed.',
  no_such_adult: 'That person is no longer in this family.',
  bad_code: 'A code is six letters and numbers, like HJ4K2P.',
}

export function adultError(reason) {
  return ADULT_ERRORS[reason] || 'That did not work. Please try again.'
}

const call = async (fn, args) => {
  if (!transport.isConfigured()) return { ok: false, reason: 'unavailable' }
  try {
    return (await transport.rpc(fn, args)) ?? { ok: false, reason: 'unavailable' }
  } catch (err) {
    console.warn(`[RankUp] ${fn}:`, err.message)
    return { ok: false, reason: 'unavailable' }
  }
}

// The same alphabet the database generates from — no O/0 or I/1, because one
// parent reads this down the phone to the other.
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/

export function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export const adults = {
  available: () => transport.isConfigured(),

  /** `{ me, adults: [...], invites: [...], max }`, or null if unavailable. */
  async list() {
    if (!transport.isConfigured()) return null
    try {
      return (await transport.rpc('family_adults', {})) || null
    } catch (err) {
      console.warn('[RankUp] family_adults:', err.message)
      return null
    }
  },

  invite: () => call('create_parent_invite', { p_role: 'parent' }),

  revoke: (code) => call('revoke_parent_invite', { p_code: normalizeCode(code) }),

  remove: (parentId) => call('remove_adult', { p_parent_id: parentId }),

  async join(rawCode, name) {
    const code = normalizeCode(rawCode)
    if (!CODE.test(code)) return { ok: false, reason: 'bad_code' }
    return call('claim_parent_invite', { p_code: code, p_name: String(name || '').trim() })
  },
}

/**
 * What one parent sends the other.
 *
 * Short, because it is going in a text message and the code is the only part
 * that matters. It says what the app is, because the other parent may never
 * have heard of it.
 */
export function inviteText(code) {
  return [
    "I've set up RankUp for the kids' chores — you can see and approve everything from your phone too.",
    '',
    `Open the app, tap "I'm a parent", then "join a family" and enter: ${code}`,
  ].join('\n')
}
