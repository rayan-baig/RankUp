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
  same_household: 'That code belongs to your own household, so it cannot be used here.',
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

  /**
   * Counts about the caller's own invites, or null if unavailable. A parent's
   * only: a child's phone and a supporter are answered `{ ok: false }`, which
   * comes out here as null, so nothing is shown.
   *
   *   code, days (the new family's trial), cap (free months a year)
   *   claimed  families who joined with the code
   *   paying   of those, how many pay
   *   earned   free months on the family's Stripe account
   *   pending  free months on their way there
   *   banked   free months waiting for the family to choose a plan
   *   withdrawn, capped, this_year, unseen, referred
   */
  async mine() {
    if (!transport.isConfigured()) return null
    try {
      const info = await transport.rpc('my_referrals', {})
      return info && info.ok !== false ? info : null
    } catch (err) {
      console.warn('[RankUp] my_referrals:', err.message)
      return null
    }
  },

  /** "You earned a free month" was read: not shown again on any phone. */
  seen: () => call('see_referral_rewards', {}),

  async claim(rawCode) {
    const code = normalizeCode(rawCode)
    if (!CODE.test(code)) return { ok: false, reason: 'bad_code' }
    return call('claim_referral', { p_code: code })
  },
}

const n = (x) => Math.max(0, Number(x) || 0)
const months = (k) => (k === 1 ? '1 free month' : `${k} free months`)

/**
 * What the invite card says about a family's invites, from my_referrals:
 * counts only, never who. Lines that would say "0" are left out.
 */
export function inviteSummary(info) {
  if (!info) return { joined: null, rewards: [] }
  const claimed = n(info.claimed)
  const paying = n(info.paying)
  const joined = claimed === 0
    ? null
    : `${claimed === 1 ? '1 family' : `${claimed} families`} joined with your code${
      paying ? `, ${paying} ${paying === 1 ? 'pays' : 'pay'} for a plan` : ''}.`
  const rewards = []
  if (n(info.earned)) rewards.push({ id: 'earned', text: `${months(n(info.earned))} earned, taken off your bills.` })
  if (n(info.pending)) rewards.push({ id: 'pending', text: `${months(n(info.pending))} on the way to your account.` })
  if (n(info.banked)) {
    rewards.push({
      id: 'banked',
      text: `${months(n(info.banked))} banked. ${n(info.banked) === 1 ? 'It comes' : 'They come'} off your first bill when you choose a plan.`,
    })
  }
  if (n(info.withdrawn)) {
    rewards.push({
      id: 'withdrawn',
      text: `${months(n(info.withdrawn))} taken back, because that family's first payment was refunded.`,
    })
  }
  if (info.cap && n(info.this_year) >= n(info.cap)) {
    rewards.push({ id: 'cap', text: `That's ${n(info.cap)} free months this year, the most there is. Thank you!` })
  }
  return { joined, rewards }
}

/**
 * The one-time notice when a free month is earned, or null when there is
 * nothing new. Banked or on the account, it says which.
 */
export function rewardNotice(info) {
  const unseen = n(info?.unseen)
  if (!unseen) return null
  const banked = n(info.banked) > 0 && n(info.earned) + n(info.pending) === 0
  return {
    title: unseen === 1 ? 'You earned a free month!' : `You earned ${unseen} free months!`,
    body: banked
      ? 'A family you invited started paying. Your free month is banked: it comes off your first bill when you choose a plan.'
      : 'A family you invited started paying, so a month of your plan is free. It comes off your next bill.',
  }
}

/**
 * What a parent actually sends.
 *
 * Written to lead with what the OTHER family gets, because that is the only
 * part a person forwarding this can say without sounding like they are being
 * paid — which, until that family chooses to pay, they are not.
 */
export function shareText(code, days = 30) {
  return [
    `Here's ${days} days of RankUp, free.`,
    '',
    'It turns chores into a game my kids actually ask to play — they do the chore,',
    'I accept it, they level up.',
    '',
    `Use my code when you sign up: ${code}`,
  ].join('\n')
}
