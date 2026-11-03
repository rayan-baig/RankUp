/**
 * The plans, in words and in money, worked out from the plan list.
 *
 * Every sentence a parent reads about a plan, and every price, comes from
 * TIERS in state/initialState.js and the limits the app enforces: how many
 * children (kidLimit), the guild size (guildCapacity), the XP rate
 * (calcReward), what only Elite unlocks (isElite), and the numbers every plan
 * shares (the arcade's tokens and daily coins, the worlds). Nothing here is
 * typed by hand, so a change to a limit changes the plan screen with it.
 * tests/planwords.mjs checks the words against those limits, and
 * tests/plans.mjs checks the screen shows them.
 */
import { TIERS, TIER_LADDER } from '../state/initialState.js'
import { KID_THEMES } from '../data/kidThemes.js'
import { PARENT_THEMES } from '../data/parentThemes.js'
import { MAX_TOKENS, DAILY_COIN_CAP } from '../data/minigames.js'

/** Dollars as a price is written: 99.9 is "99.90", the way Stripe and docs/PAYMENTS.md say it. */
export const usd = (n) => Number(n).toFixed(2)

/** Whole cents, so money is never added up in floating point. */
export const toCents = (n) => Math.round(Number(n) * 100)

/** "Free", "$9.99/mo" or "$99.90/yr". */
export function priceTag(tier, cycle = 'month') {
  if (!tier || !tier.price) return 'Free'
  return cycle === 'year' && tier.yearPrice ? `$${usd(tier.yearPrice)}/yr` : `$${usd(tier.price)}/mo`
}

/** "free", "$9.99 a month" or "$99.90 a year", for sentences. */
export function priceWords(tier, cycle = 'month') {
  if (!tier || !tier.price) return 'free'
  return cycle === 'year' && tier.yearPrice ? `$${usd(tier.yearPrice)} a year` : `$${usd(tier.price)} a month`
}

/**
 * What paying for a year saves against twelve monthly payments, from the two
 * real prices. Null for a plan with no yearly price, or one that saves nothing.
 *
 *   savedCents  1998 for $9.99 a month against $99.90 a year
 *   saved       "19.98"
 *   percent     17 (rounded down, so it never claims more than it saves)
 *   monthsFree  2 when the year costs a whole number of months, else null
 */
export function annualSaving(tier) {
  if (!tier?.price || !tier?.yearPrice) return null
  const month = toCents(tier.price)
  const year = toCents(tier.yearPrice)
  const saved = month * 12 - year
  if (!(month > 0) || saved <= 0) return null
  const monthsPaid = year / month
  return {
    savedCents: saved,
    saved: usd(saved / 100),
    percent: Math.floor((saved * 100) / (month * 12)),
    monthsFree: Number.isInteger(monthsPaid) ? 12 - monthsPaid : null,
  }
}

/**
 * The line on the Monthly / Yearly switch. "2 months free" when every paid
 * plan's year is the same whole number of months; otherwise the smallest
 * saving any plan gives, as a percentage, so it never promises more than the
 * plan a parent picks.
 */
export function yearlyNote(ladder = TIER_LADDER) {
  const savings = ladder.map(annualSaving).filter(Boolean)
  if (!savings.length) return null
  const months = new Set(savings.map((s) => s.monthsFree))
  if (months.size === 1 && savings[0].monthsFree) {
    const n = savings[0].monthsFree
    return `${n} ${n === 1 ? 'month' : 'months'} free`
  }
  return `Save ${Math.min(...savings.map((s) => s.percent))}% or more`
}

/** Is yearly billing offered at all? */
export const yearlyOffered = (ladder = TIER_LADDER) => ladder.some((t) => annualSaving(t))

const children = (n) => (n === Infinity ? 'As many children as you have' : `${n} ${n === 1 ? 'child' : 'children'}`)

/**
 * What every plan has, in plain words. Nothing here changes with the plan:
 * chores, rewards, worlds and the arcade are the same on every one.
 */
export function everyPlanHas() {
  return [
    'As many chores and rewards as you like',
    'You accept every finished chore before it pays',
    `All ${KID_THEMES.length} worlds for your kids, and ${PARENT_THEMES.length} looks for you`,
    `The arcade: up to ${MAX_TOKENS} game tokens saved, up to ${DAILY_COIN_CAP} coins a day`,
  ]
}

/**
 * What a plan gives, in plain words, as lines.
 *
 * The cheapest plan says what it includes. Each plan after it says only what
 * it adds to the one below, because "why would I pay more" is the question a
 * parent is asking at that card. `guilds` is whether guilds are switched on
 * in this app: a plan must not sell a feature nobody can open.
 */
export function planLines(tier, { guilds = false } = {}) {
  const i = TIER_LADDER.findIndex((t) => t.id === tier.id)
  const below = i > 0 ? TIER_LADDER[i - 1] : null
  const lines = []
  const l = tier.limits
  if (!below) {
    lines.push(children(l.maxKids))
    lines.push(...everyPlanHas())
    if (guilds && tier.guildSize) lines.push(`Guilds of up to ${tier.guildSize} players`)
    if (tier.xpMultiplier > 1) lines.push(`${tier.xpMultiplier}× XP on every accepted chore`)
    return lines
  }
  const b = below.limits
  if (l.maxKids > b.maxKids) {
    lines.push(l.maxKids === Infinity
      ? `As many children as you have (${below.name} has ${b.maxKids})`
      : `Up to ${l.maxKids} children (${below.name} has ${b.maxKids})`)
  }
  if (guilds && tier.guildSize > (below.guildSize || 0)) {
    lines.push(below.guildSize
      ? `Bigger guilds: up to ${tier.guildSize} players instead of ${below.guildSize}`
      : `Guilds of up to ${tier.guildSize} players`)
  }
  if (tier.xpMultiplier > below.xpMultiplier) {
    lines.push(`${tier.xpMultiplier}× XP on every accepted chore`)
  }
  if (l.overdrive && !b.overdrive) lines.push('Overdrive: the richer look, on every world')
  if (l.profileFrames && !b.profileFrames) lines.push('Profile frames and rare drop styles for your kids')
  if (l.consequenceEngine && !b.consequenceEngine) lines.push('The Consequence Engine: your own house rules, with Currency Tax and Lockouts')
  if (l.blueprints && !b.blueprints) lines.push('Behaviour Blueprints: weekly charts of what got done')
  if (l.alliances && !b.alliances) lines.push('Parent Alliances: win 20% off a month')
  lines.push(`Everything in ${below.name}`)
  return lines
}

/** The one-line answer to "why pay more", beside the price: the first thing the plan adds. */
export function upgradeReason(tier, opts) {
  const adds = planLines(tier, opts).filter((x) => !x.startsWith('Everything in'))
  if (!adds.length) return ''
  const first = adds.slice(0, 2).map((x) => x.replace(/ \(.*\)$/, '').replace(/:.*$/, ''))
  return `${first.join(', ').replace(/^./, (c) => c.toLowerCase())}${adds.length > 2 ? ', and more' : ''}.`
}

/** The plan's name for a family, from what it pays for (never from the trial). */
export function paidPlanName(family) {
  return (TIERS[family?.tier] || TIERS.starter).name
}
