/**
 * The deals: when each one is on, and what it says. Plain JavaScript, used by
 * the server (api/deals.js, api/create-checkout.js, api/gift-checkout.js) and
 * by Parent Mode, so the two can never disagree about whether a deal is on.
 *
 * The rules every deal keeps (docs/PAYMENTS.md, "Deals"):
 *
 *   - Only in Parent Mode, on the Give page and in email: never on a child's
 *     phone. A child's phone never asks for them.
 *   - No fake countdowns and no fake scarcity. An end date is the real one
 *     from the settings; the Founding Families places left are counted in the
 *     database, never made up, and are not shown at all when they cannot be
 *     counted.
 *   - The discount itself is a Stripe coupon whose id is a setting. No price
 *     or amount is typed here or anywhere else in the code; the percent in a
 *     setting is only what the screen says, and must be the coupon's.
 *   - One discount at a time on a checkout: Founding Families first, then the
 *     Season's deal. Gifts: the holiday sale first, then the Season's deal.
 */

const DAY = 86400000

/** "2026-11-27" (a day, UTC) or a full date-time, as a time; null when empty or not a date. */
export function settingDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text)
  return Number.isFinite(t) ? t : null
}

/** A whole number from 1 to 90, or null. Percent settings only ever say what the coupon takes. */
export function settingPercent(value) {
  const n = Number(String(value ?? '').trim())
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : null
}

/** A count from 1 up, or the default. */
export function settingCount(value, fallback) {
  const n = Number(String(value ?? '').trim())
  return Number.isInteger(n) && n >= 1 ? n : fallback
}

export const FOUNDING_DEFAULT_LIMIT = 500
/** How long a Season's deal runs from the Season's first day. */
export const SEASON_DEAL_DAYS = 14
/** How long after a family starts before "Gift a year" is suggested. */
export const GIFT_A_YEAR_AFTER_DAYS = 30
/** Months a family has paid before "keep what you've paid" is offered. */
export const SWITCH_AFTER_MONTHS = 2

/**
 * Founding Families: the first N families get the yearly plan's first year
 * at a founding price. On while a coupon is set, places are left (counted by
 * the database: `left`) and the end date (if any) has not passed. The end is
 * the last day it runs: a deal ending "2027-01-31" runs all of that day (UTC).
 */
export function foundingDeal(settings, { left = null, now = Date.now() } = {}) {
  const coupon = String(settings?.STRIPE_FOUNDING_COUPON || '').trim()
  const percent = settingPercent(settings?.FOUNDING_PERCENT)
  if (!coupon || !percent) return null
  const ends = settingDate(settings?.FOUNDING_ENDS_AT)
  const endsAt = ends === null ? null : ends + (/^\d{4}-\d{2}-\d{2}$/.test(String(settings.FOUNDING_ENDS_AT).trim()) ? DAY - 1 : 0)
  if (endsAt !== null && now > endsAt) return null
  const limit = settingCount(settings?.FOUNDING_FAMILIES_LIMIT, FOUNDING_DEFAULT_LIMIT)
  if (left !== null && !(left > 0)) return null
  return { coupon, percent, limit, left, endsAt }
}

/**
 * The holiday gift sale: gift codes a percentage off between two days (both
 * included), e.g. Black Friday to 31 December. Off when either day, the
 * coupon or the percent is missing.
 */
export function giftSale(settings, { now = Date.now() } = {}) {
  const coupon = String(settings?.STRIPE_GIFT_SALE_COUPON || '').trim()
  const percent = settingPercent(settings?.GIFT_SALE_PERCENT)
  const from = settingDate(settings?.GIFT_SALE_FROM)
  const to = settingDate(settings?.GIFT_SALE_TO)
  if (!coupon || !percent || from === null || to === null) return null
  const until = to + DAY - 1
  if (now < from || now > until) return null
  return { coupon, percent, from, until }
}

/**
 * The Season's deal: on for the first SEASON_DEAL_DAYS days of each Season,
 * from the Season's own first day (the database's), on the yearly plan or on
 * gift codes (SEASON_DEAL_ON). `season` is { number, name, startsOn }, the
 * newest Season that has started, or null.
 */
export function seasonDeal(settings, season, { now = Date.now() } = {}) {
  const coupon = String(settings?.STRIPE_SEASON_COUPON || '').trim()
  const percent = settingPercent(settings?.SEASON_DEAL_PERCENT)
  if (!coupon || !percent || !season?.startsOn) return null
  const start = settingDate(season.startsOn)
  if (start === null) return null
  const until = start + SEASON_DEAL_DAYS * DAY - 1
  if (now < start || now > until) return null
  const on = String(settings?.SEASON_DEAL_ON || 'yearly').trim() === 'gift' ? 'gift' : 'yearly'
  return { coupon, percent, on, until, number: season.number, name: season.name }
}

/** What a public answer may say about each deal: never the coupon id. */
export function publicDeals({ founding, gift, season }) {
  return {
    founding: founding ? { percent: founding.percent, limit: founding.limit, left: founding.left, ends_at: founding.endsAt ? new Date(founding.endsAt).toISOString() : null } : null,
    gift_sale: gift ? { percent: gift.percent, until: new Date(gift.until).toISOString() } : null,
    season: season ? { percent: season.percent, on: season.on, until: new Date(season.until).toISOString(), number: season.number, name: season.name } : null,
  }
}

/** "31 December", for an honest end date. */
export function dealDate(iso) {
  const t = typeof iso === 'number' ? iso : Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** "Gift a year" is suggested to a family a month in, not on day one. */
export function giftAYearDue(family, now = Date.now()) {
  const made = Number(family?.createdAt)
  return Number.isFinite(made) && made > 0 && now - made >= GIFT_A_YEAR_AFTER_DAYS * DAY
}
