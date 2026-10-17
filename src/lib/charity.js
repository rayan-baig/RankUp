/**
 * Charity Week.
 *
 * Seven days every year, starting 22 June, when what the app takes goes to
 * charity instead of to us.
 *
 * Two things about this are engineering problems rather than marketing ones,
 * and both are why this file exists instead of a hardcoded banner.
 *
 * It has to be AUDITABLE. "All profits go to charity" is a number somebody
 * will eventually ask you to show, and the honest version of that is a total
 * computed from the payments that actually happened in the window — not an
 * estimate written down afterwards. charity_week_total() in
 * supabase/charity.sql reads the billing events themselves.
 *
 * And it has to be right about WHEN. A week is not "seven days from now", it
 * is a window with two ends, and the app has to agree with the server about
 * both of them across timezones and year boundaries. The window is defined in
 * UTC here and in the database, so a family in Auckland and a family in
 * Vancouver are in it or out of it at the same instant.
 */

/** The day it starts, every year. */
export const CHARITY_MONTH = 5 // June, zero-indexed as Date wants it
export const CHARITY_DAY = 22
export const CHARITY_DAYS = 7

/**
 * The window for a given year, as timestamps.
 *
 * Starts at midnight UTC on the 22nd and runs for seven days, so it ends at
 * midnight UTC on the 29th. Half-open on purpose — the end is the first
 * instant NOT in the week, which is the only way to express "seven whole
 * days" without an off-by-one argument about the last second.
 */
export function charityWindow(year) {
  const from = Date.UTC(year, CHARITY_MONTH, CHARITY_DAY)
  const to = Date.UTC(year, CHARITY_MONTH, CHARITY_DAY + CHARITY_DAYS)
  return { from, to, year }
}

/** Is this instant inside the week? */
export function inCharityWeek(at = Date.now()) {
  const { from, to } = charityWindow(new Date(at).getUTCFullYear())
  return at >= from && at < to
}

/**
 * The next window that has not finished yet.
 *
 * On 30 June it is next year's; on 1 June it is this year's; during the week
 * it is the one running. Used for the countdown, which has to say "starts in
 * three days" and "two days left" from the same function.
 */
export function nextCharityWindow(at = Date.now()) {
  const thisYear = charityWindow(new Date(at).getUTCFullYear())
  return at < thisYear.to ? thisYear : charityWindow(thisYear.year + 1)
}

/** Whole days until it starts, or 0 once it has. */
export function daysUntilCharityWeek(at = Date.now()) {
  const { from } = nextCharityWindow(at)
  return Math.max(0, Math.ceil((from - at) / 86400000))
}

/** Whole days left of the one running, or 0 when none is. */
export function daysLeftOfCharityWeek(at = Date.now()) {
  if (!inCharityWeek(at)) return 0
  const { to } = charityWindow(new Date(at).getUTCFullYear())
  return Math.max(1, Math.ceil((to - at) / 86400000))
}

/**
 * What to say, and why it is worded like this.
 *
 * "Every penny we take this week" rather than "all profits". Profit is
 * revenue minus costs, and a company that says profit while meaning revenue
 * is making a claim it cannot show — the number a family can check is what
 * they were charged, so that is the number promised. It is also the larger
 * and more generous of the two, so there is nothing lost by being exact.
 */
export const CHARITY_COPY = {
  name: 'Charity Week',
  promise: 'Every penny RankUp takes this week goes to charity.',
  short: 'Every penny we take this week goes to charity.',
  dates: '22–28 June, every year',
}

/** "22–28 June 2027", for a specific year. */
export function charityDatesLabel(year) {
  const end = new Date(Date.UTC(year, CHARITY_MONTH, CHARITY_DAY + CHARITY_DAYS - 1))
  const start = new Date(Date.UTC(year, CHARITY_MONTH, CHARITY_DAY))
  const month = new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(start)
  return `${start.getUTCDate()}–${end.getUTCDate()} ${month} ${year}`
}
