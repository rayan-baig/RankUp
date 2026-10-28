/**
 * The School League's side of billing, kept apart from the families'.
 *
 * Pure functions only, so the decisions that cost or save a school money can
 * be tested without Stripe or a database: which price a school is charged,
 * and how much of its free trial carries onto the card.
 */

/** One Stripe price per size band and billing cycle. Named in env, never here. */
export const SCHOOL_PRICE_ENV = {
  month: {
    small: 'STRIPE_PRICE_SCHOOL_SMALL',
    medium: 'STRIPE_PRICE_SCHOOL_MEDIUM',
    large: 'STRIPE_PRICE_SCHOOL_LARGE',
    xl: 'STRIPE_PRICE_SCHOOL_XL',
  },
  year: {
    small: 'STRIPE_PRICE_SCHOOL_SMALL_YEAR',
    medium: 'STRIPE_PRICE_SCHOOL_MEDIUM_YEAR',
    large: 'STRIPE_PRICE_SCHOOL_LARGE_YEAR',
    xl: 'STRIPE_PRICE_SCHOOL_XL_YEAR',
  },
}

/** Anything that is not the word "year" is a month. */
export const schoolCycle = (value) => (value === 'year' ? 'year' : 'month')

/**
 * The price id for a school's band. The band comes from the database, so a
 * school cannot ask for a smaller school's price. Empty when not configured.
 */
export function schoolPriceId(band, cycle, env = process.env) {
  const name = SCHOOL_PRICE_ENV[schoolCycle(cycle)]?.[band]
  return (name && env[name]) || ''
}

/**
 * What is left of the free trial, as a Stripe trial end.
 *
 * A school that pays on day three keeps the other twenty-seven days: the card
 * is first charged when the trial it was promised ends. Stripe refuses a
 * trial end less than two days away, so a trial that is nearly over is simply
 * not carried, and billing starts now.
 */
export function schoolTrialEnd(trialEndsAt, now = Date.now()) {
  const end = new Date(trialEndsAt || 0).getTime()
  if (!Number.isFinite(end) || end < now + 2 * 86400000) return undefined
  return Math.floor(end / 1000)
}

/** Whether a Stripe object belongs to a school rather than a family. */
export function schoolIdOf(object) {
  return object?.metadata?.school_id
    || object?.subscription_details?.metadata?.school_id
    || null
}

/**
 * What to do with a Champion's free month.
 *
 * A paying school gets a coupon for one free month on its next invoice. A
 * school still on its trial gets thirty more days of trial instead. Anything
 * else (a plan that has ended) waits: the award stays owed and is tried again
 * next month, rather than vanishing.
 */
export function championReward(award) {
  if (award?.status === 'active' && award?.stripe_customer_id) return 'coupon'
  if (award?.status === 'trial') return 'extend_trial'
  return 'wait'
}
