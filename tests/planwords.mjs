/**
 * What the plan screen says each plan gives is what the app enforces.
 *
 * The words on the plan cards are worked out in src/lib/plans.js from the plan
 * list. This checks them against the code that actually decides each thing,
 * run as a family on each plan: how many children (kidLimit), the guild size
 * (guildCapacity), the XP a chore pays (calcReward), what only Elite unlocks
 * (isElite, overdriveActive), and the numbers every plan shares (the worlds,
 * the arcade's tokens and coins). It also checks the yearly saving is the
 * real difference between twelve monthly payments and one yearly one.
 *
 * tests/plans.mjs checks the same lines are on the screen in a browser.
 *
 * Needs nothing running.   node tests/planwords.mjs
 */
import { TIERS, TIER_LADDER, PLAN_COMPARISON, ELITE_KID_PERKS, createInitialState } from '../src/state/initialState.js'
import { kidLimit, guildCapacity, isElite, overdriveActive, planSummary } from '../src/state/reducer.js'
import { calcReward } from '../src/lib/xp.js'
import { KID_THEMES } from '../src/data/kidThemes.js'
import { PARENT_THEMES } from '../src/data/parentThemes.js'
import { MAX_TOKENS, DAILY_COIN_CAP } from '../src/data/minigames.js'
import {
  planLines, everyPlanHas, upgradeReason, annualSaving, yearlyNote, yearlyOffered, priceTag, priceWords, toCents,
} from '../src/lib/plans.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

/** A family paying for `tier`, with no trial running. */
function familyOn(tier, extra = {}) {
  const s = createInitialState()
  s.family = { ...s.family, tier, trialTier: null, trialEndsAt: null, ...extra }
  s.settings = { ...s.settings, overdrive: true, reduceMotion: false }
  return s
}

const all = (tier, opts) => planLines(tier, opts).join(' | ')
const ON = { guilds: true }
const OFF = { guilds: false }

console.log('\n=== Every plan: the same chores, worlds and arcade ===')
const shared = everyPlanHas().join(' ')
ok(`all ${KID_THEMES.length} worlds and ${PARENT_THEMES.length} parent looks`,
  shared.includes(`All ${KID_THEMES.length} worlds`) && shared.includes(`${PARENT_THEMES.length} looks`))
ok(`the arcade's ${MAX_TOKENS} tokens and ${DAILY_COIN_CAP} coins a day`,
  shared.includes(`${MAX_TOKENS} game tokens`) && shared.includes(`${DAILY_COIN_CAP} coins a day`))
ok('chores and rewards with no limit', /As many chores and rewards/.test(shared))
ok('the cheapest plan lists them', everyPlanHas().every((line) => planLines(TIER_LADDER[0], ON).includes(line)))

console.log('\n=== Each plan, against the code that enforces it ===')
for (const [i, tier] of TIER_LADDER.entries()) {
  const below = TIER_LADDER[i - 1]
  const state = familyOn(tier.id)
  const words = all(tier, ON)

  // Children.
  const kids = kidLimit(state)
  ok(`${tier.name}: the plan list's children (${tier.limits.maxKids}) are what kidLimit enforces`, kids === tier.limits.maxKids)
  if (!below) {
    ok(`${tier.name}: says ${kids} ${kids === 1 ? 'child' : 'children'}`, words.startsWith(`${kids} ${kids === 1 ? 'child' : 'children'}`), words)
  } else if (kids > kidLimit(familyOn(below.id))) {
    ok(`${tier.name}: says it adds children over ${below.name}`, /As many children as you have|Up to \d+ children/.test(words), words)
  } else {
    ok(`${tier.name}: does not claim more children than ${below.name}`, !/children/.test(words), words)
  }

  // Guilds: what guildCapacity gives, and nothing when guilds are off.
  const cap = guildCapacity(state)
  ok(`${tier.name}: guild size ${tier.guildSize} is what guildCapacity enforces`, cap === (tier.guildSize ?? 0))
  const belowCap = below ? guildCapacity(familyOn(below.id)) : 0
  if (cap > belowCap) ok(`${tier.name}: says guilds of up to ${cap}`, words.includes(`up to ${cap} players`), words)
  else ok(`${tier.name}: claims no bigger guild`, !/guild/i.test(words.replace(/Everything in \w+/, '')), words)
  ok(`${tier.name}: says nothing about guilds while they are switched off`, !/guild/i.test(all(tier, OFF)), all(tier, OFF))

  // XP: what a chore really pays on this plan.
  const base = 40
  const paid = calcReward({ xp: base }, { elite: isElite(state) }).xp
  ok(`${tier.name}: a ${base} XP chore pays ${base * tier.xpMultiplier} (${tier.xpMultiplier}×)`, paid === base * tier.xpMultiplier, `paid ${paid}`)
  const belowRate = below ? below.xpMultiplier : 1
  if (tier.xpMultiplier > belowRate) ok(`${tier.name}: says ${tier.xpMultiplier}× XP`, words.includes(`${tier.xpMultiplier}× XP`), words)
  else ok(`${tier.name}: makes no XP claim`, !/× XP/.test(words), words)

  // What only Elite unlocks: each one is gated by isElite in the app.
  const elite = isElite(state)
  for (const key of ['overdrive', 'profileFrames', 'consequenceEngine', 'blueprints', 'alliances']) {
    ok(`${tier.name}: ${key} ${tier.limits[key] ? 'on' : 'off'}, as isElite gates it`, Boolean(tier.limits[key]) === elite)
  }
  ok(`${tier.name}: Overdrive really runs only where the plan says`, overdriveActive(state) === Boolean(tier.limits.overdrive))
  const newTools = below ? ['overdrive', 'consequenceEngine', 'blueprints', 'alliances'].filter((k) => tier.limits[k] && !below.limits[k]) : []
  const toolWords = { overdrive: 'Overdrive', consequenceEngine: 'Consequence Engine', blueprints: 'Behaviour Blueprints', alliances: 'Parent Alliances' }
  for (const k of newTools) ok(`${tier.name}: says it adds ${toolWords[k]}`, words.includes(toolWords[k]), words)
  for (const k of Object.keys(toolWords).filter((x) => !newTools.includes(x))) {
    ok(`${tier.name}: does not claim ${toolWords[k]}`, !words.includes(toolWords[k]))
  }

  if (below) ok(`${tier.name}: says it has everything in ${below.name}`, words.includes(`Everything in ${below.name}`))
  if (below) ok(`${tier.name}: has a one-line reason to pay more`, upgradeReason(tier, ON).length > 10, upgradeReason(tier, ON))

  // Every number in the words is one of the code's.
  const known = new Set([kids, cap, belowCap, tier.xpMultiplier, KID_THEMES.length, PARENT_THEMES.length, MAX_TOKENS, DAILY_COIN_CAP, 20,
    ...(below ? [below.limits.maxKids] : [])].map(String))
  const numbers = [...words.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])
  const strays = numbers.filter((n) => !known.has(n))
  ok(`${tier.name}: every number in the words is the code's`, strays.length === 0, strays.join(', '))
}

console.log('\n=== The side-by-side table reads the same limits ===')
const row = (label) => PLAN_COMPARISON.find((r) => r.label === label)
ok('children', TIER_LADDER.every((t) => row('Children').value(t) === (t.limits.maxKids === Infinity ? 'Unlimited' : String(t.limits.maxKids))))
ok('guilds are marked as needing guilds switched on', row('Guilds').needs === 'guilds')
ok('XP rate', TIER_LADDER.every((t) => row('XP rate').value(t) === (t.xpMultiplier > 1 ? `${t.xpMultiplier}×` : 'Normal')))
ok('the arcade is on every plan', TIER_LADDER.every((t) => row('Arcade').value(t) === true))
ok('the kid perk about guilds needs guilds switched on', ELITE_KID_PERKS.find((p) => p.id === 'guilds')?.needs === 'guilds')
ok('and states the plan list\'s sizes', ELITE_KID_PERKS.find((p) => p.id === 'guilds').body.includes(`${TIERS.elite.guildSize} instead of ${TIERS.standard.guildSize}`))

console.log('\n=== The yearly saving is the real difference ===')
ok('yearly is offered', yearlyOffered())
for (const tier of TIER_LADDER) {
  const s = annualSaving(tier)
  if (!tier.price) { ok(`${tier.name}: free, so no saving`, s === null); continue }
  const twelve = toCents(tier.price) * 12
  const year = toCents(tier.yearPrice)
  ok(`${tier.name}: ${priceWords(tier)} × 12 is $${(twelve / 100).toFixed(2)}; a year is ${priceWords(tier, 'year')}; saves $${((twelve - year) / 100).toFixed(2)}`,
    s && s.savedCents === twelve - year && s.saved === ((twelve - year) / 100).toFixed(2), JSON.stringify(s))
  ok(`${tier.name}: the year is ${year / toCents(tier.price)} months' money, so ${s.monthsFree} free`, s.monthsFree === 12 - year / toCents(tier.price))
  ok(`${tier.name}: the percentage is not rounded up`, s.percent <= ((twelve - year) * 100) / twelve && s.percent > 0)
  ok(`${tier.name}: priced as ${priceTag(tier)} and ${priceTag(tier, 'year')}`, priceTag(tier) === `$${tier.price.toFixed(2)}/mo` && priceTag(tier, 'year') === `$${tier.yearPrice.toFixed(2)}/yr`)
}
ok(`the switch says "${yearlyNote()}"`, yearlyNote() === `${annualSaving(TIERS.standard).monthsFree} months free`)
// A plan whose year is not a whole number of months, or no yearly plan at all.
const odd = { id: 'x', price: 10, yearPrice: 100.5 }
ok('a year that is not whole months is given as a percentage, never months', annualSaving(odd).monthsFree === null
  && yearlyNote([odd]) === `Save ${annualSaving(odd).percent}% or more`)
ok('no yearly price, no saving and no switch', annualSaving({ price: 5 }) === null && !yearlyOffered([{ price: 5 }]) && yearlyNote([{ price: 5 }]) === null)
ok('a "yearly" price dearer than twelve months saves nothing', annualSaving({ price: 1, yearPrice: 13 }) === null)
ok('floating point does not leak in: 9.99 × 12 − 99.90 is exactly 19.98', annualSaving(TIERS.standard).saved === '19.98')

console.log('\n=== Settings names the plan the family is really on ===')
ok('a free Starter family is "Starter", not "Standard"', planSummary(familyOn('starter')) === TIERS.starter.name, planSummary(familyOn('starter')))
ok('Standard is "Standard"', planSummary(familyOn('standard')) === TIERS.standard.name)
ok('Elite is "Elite Pass"', planSummary(familyOn('elite')) === TIERS.elite.name)
ok('a missing or unknown tier is Starter', planSummary(familyOn(undefined)) === TIERS.starter.name && planSummary(familyOn('gold')) === TIERS.starter.name)
const trying = familyOn('starter', { trialTier: 'elite', trialEndsAt: Date.now() + 3 * 86400000 })
ok('a trial says what they pay for and what they are trying', planSummary(trying) === `${TIERS.starter.name} · trying ${TIERS.elite.name}`, planSummary(trying))
const over = familyOn('starter', { trialTier: 'elite', trialEndsAt: Date.now() - 1000 })
ok('and an ended trial is not mentioned', planSummary(over) === TIERS.starter.name)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
