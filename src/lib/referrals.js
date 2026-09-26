/**
 * Referrals, from the app's side.
 *
 * Thin on purpose. Every rule about who may claim what, and when a reward is
 * actually earned, lives in supabase/referrals.sql where a device cannot reach
 * it — this file asks and shows the answer.
 *
 * With no backend configured there is nothing to show: a referral is an
 * agreement between two households, and there is no offline version of that.
 */

import { transport } from './sync/transport.js'

export const REFERRAL_ERRORS = {
  unavailable: 'Invites need the sync service. This device is not connected to one yet.',
  already_referred: 'This family has already used an invite code.',
  no_such_code: 'No family has that code. Check the letters and try again.',
  own_code: 'That is your own code.',
  not_a_new_family: 'Invite codes are for families who are just starting out.',
  bad_code: 'A code is six letters and numbers, like HJ4K2P.',
}

export function referralError(reason) {
  return REFERRAL_ERRORS[reason] || 'That did not work. Please try again.'
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

// The same alphabet the database generates from — no O/0 or I/1, because these
// get read out loud in a playground. Checked here so an obvious typo costs a
// message on screen instead of a round trip.
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/

export function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export const referrals = {
  available: () => transport.isConfigured(),

  /** `{ code, days, claimed, qualified, referred }`, or null if unavailable. */
  async mine() {
    if (!transport.isConfigured()) return null
    try {
      return (await transport.rpc('my_referrals', {})) || null
    } catch (err) {
      console.warn('[RankUp] my_referrals:', err.message)
      return null
    }
  },

  async claim(rawCode) {
    const code = normalizeCode(rawCode)
    if (!CODE.test(code)) return { ok: false, reason: 'bad_code' }
    return call('claim_referral', { p_code: code })
  },
}

/**
 * What a parent actually sends.
 *
 * Written to lead with what the OTHER family gets, because that is the only
 * part a person forwarding this can say without sounding like they are being
 * paid — which, until that family finishes a chore, they are not.
 */
export function shareText(code, days = 30) {
  return [
    `Here's ${days} days of RankUp, free.`,
    '',
    'It turns chores into a game my kids actually ask to play — they photograph',
    'what they did, I approve it, they level up.',
    '',
    `Use my code when you sign up: ${code}`,
  ].join('\n')
}
