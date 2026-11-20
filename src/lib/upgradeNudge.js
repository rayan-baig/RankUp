/**
 * The Elite nudge: a short offer to a parent, at a moment it is true.
 *
 * Two moments only, and only for a family on Standard (not on a gift, not
 * paused, not behind on a payment):
 *
 *   limit  the family hit something Standard stops at: its guild is full at
 *          Standard's size, or a parent opened one of the Elite-only tools
 *          (the screen behind it, EliteGate, writes that down)
 *   week   a great week: GREAT_WEEK_CHORES or more chores accepted in seven
 *          days, when Elite's XP boost would have counted for the most
 *
 * At most once every NUDGE_EVERY_DAYS days on this phone, and a parent can
 * dismiss it. Parent Mode only: never on a child's phone, never in the
 * child's half of a shared phone, never in the look-around. Every number in
 * the words comes from the plan list, never typed here.
 *
 * Kept as plain functions of the app's state and a clock, so the rules are
 * tested without a browser (tests/upgradenudge.mjs); the card is
 * components/UpgradeNudge.jsx.
 */
import { TIERS } from '../state/initialState.js'
import { effectiveTier, onGift, planPaused, guildCapacity } from '../state/reducer.js'
import { priceTag, annualSaving } from './plans.js'

const DAY = 86400000

/** At most once in this many days. */
export const NUDGE_EVERY_DAYS = 14

/** Chores accepted in seven days that make "a great week". */
export const GREAT_WEEK_CHORES = 10

/** Statuses that mean a payment is the problem: no upsell then. */
const PAYMENT_TROUBLE = ['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'refunded']

/** Chores accepted in the seven days up to `now`, across the family. */
export function choresAcceptedThisWeek(state, now) {
  const since = now - 7 * DAY
  return (state?.submissions || []).filter((s) => s.status === 'approved' && Number(s.decidedAt) >= since && Number(s.decidedAt) <= now).length
}

/** Is this Parent Mode, on a parent's phone, in a real family? */
export function inParentMode(state) {
  return Boolean(state && !state.demo && state.device?.role !== 'kid'
    && state.session?.role === 'parent' && state.session?.parentUnlocked)
}

/**
 * Why Elite would help this family now, or null.
 * { kind: 'limit', what: 'guild' | 'tool' } or { kind: 'week', count }.
 */
export function nudgeReason(state, now) {
  if (!inParentMode(state)) return null
  const family = state.family
  if (effectiveTier(family) !== 'standard' || onGift(state) || planPaused(family)) return null
  if (PAYMENT_TROUBLE.includes(family?.subscriptionStatus)) return null

  const seen = state.settings?.upgradeNudge || {}
  if (seen.limitAt && now - seen.limitAt >= 0 && now - seen.limitAt < NUDGE_EVERY_DAYS * DAY) {
    return { kind: 'limit', what: seen.limitWhat === 'guild' ? 'guild' : 'tool' }
  }
  const capacity = guildCapacity(state)
  const filled = (state.kids?.length || 0) + (state.guild?.invitedMates?.length || 0)
  if (capacity > 0 && (state.guild?.invitedMates?.length || 0) > 0 && filled >= capacity) {
    return { kind: 'limit', what: 'guild' }
  }
  const count = choresAcceptedThisWeek(state, now)
  if (count >= GREAT_WEEK_CHORES) return { kind: 'week', count }
  return null
}

/**
 * The reason to show it now, or null: a reason, and nothing shown or
 * dismissed on this phone in the last NUDGE_EVERY_DAYS days.
 */
export function nudgeDue(state, now) {
  const reason = nudgeReason(state, now)
  if (!reason) return null
  const seen = state.settings?.upgradeNudge || {}
  const last = Math.max(Number(seen.shownAt) || 0, Number(seen.dismissedAt) || 0)
  if (last && now - last < NUDGE_EVERY_DAYS * DAY) return null
  return reason
}

/** The words on the card, from the plan list. */
export function nudgeWords(reason) {
  const elite = TIERS.elite
  const boost = `${elite.name} gives ${elite.xpMultiplier}× XP on every chore`
  const button = `See ${elite.name} · ${priceTag(elite)}`
  if (reason?.kind === 'week') {
    return {
      title: `Great week: ${reason.count} chores accepted`,
      body: `${boost}. A week like this one would have earned your kids more.`,
      button,
    }
  }
  if (reason?.what === 'guild') {
    return {
      title: `Your guild is full at ${TIERS.standard.guildSize}`,
      body: `${elite.name} guilds hold ${elite.guildSize}. And ${boost}.`,
      button,
    }
  }
  return {
    title: `That one is an ${elite.name} tool`,
    body: `${elite.name} adds Pause and limits, Blueprints and Parent Alliances. And ${boost}.`,
    button,
  }
}

/**
 * The "Switch to yearly" offer in Settings: a parent paying monthly, live,
 * not paused and not ending. The saving is worked out from the two real
 * prices (annualSaving), never typed.
 */
export function yearlyOffer(state, { live = false } = {}) {
  if (!live || !inParentMode(state)) return null
  const family = state.family
  const tier = TIERS[family?.tier]
  if (!tier?.price || family?.billingCycle !== 'month' || family?.subscriptionStatus !== 'active') return null
  if (planPaused(family) || (family?.subscriptionEndsAt && Date.parse(family.subscriptionEndsAt) > Date.now())) return null
  const saving = annualSaving(tier)
  if (!saving) return null
  return {
    tier,
    saving,
    title: `Switch to yearly — save about ${saving.percent}%`,
    body: `${tier.name} for a year is ${priceTag(tier, 'year')} instead of twelve payments of ${priceTag(tier)}: $${saving.saved} less. Stripe shows you the change before anything is charged.`,
  }
}
