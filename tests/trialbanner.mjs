/**
 * The banner that asks a parent for money must not lie to them.
 *
 * It names what a family would lose when the free fortnight ends, in the words
 * of the family they actually have. That is what makes it land — and it is
 * also what makes it dangerous, because every line is a claim about somebody's
 * own household. The first draft told every parent their guild would close,
 * including the overwhelming majority who have never opened one, because the
 * flag it checked is set for every family at start-up.
 *
 * Pure-function checks on the same helpers the banner uses. No browser needed.
 */
import { effectiveTier, trialDaysLeft, onTrial } from '../src/state/reducer.js'
import { TIERS } from '../src/state/initialState.js'
import { readFileSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const inAFortnight = Date.now() + 14 * 86400000
const trialing = { tier: 'starter', trialTier: 'elite', trialEndsAt: inAFortnight }

console.log('\n=== It only shows while a trial is the reason they have what they have ===')
ok('a family on the free fortnight sees it',
  onTrial({ family: trialing }) === true)
ok('a family who has actually paid for Elite does not',
  onTrial({ family: { tier: 'elite', trialTier: 'elite', trialEndsAt: inAFortnight } }) === false)
ok('nor does one whose trial has run out',
  onTrial({ family: { tier: 'starter', trialTier: 'elite', trialEndsAt: Date.now() - 1 } }) === false)
ok('nor a plain free family who never had one',
  onTrial({ family: { tier: 'starter' } }) === false)

console.log('\n=== What it says would be lost is true of THAT family ===')
// The banner builds its list the same way; these are the inputs to it.
const paid = TIERS.starter
const plan = TIERS[effectiveTier(trialing)]

ok('a one-child family is not told children will be put on hold',
  !([{ name: 'Ava' }].length > paid.limits.maxKids))
ok('a two-child family is',
  [{ name: 'Ava' }, { name: 'Noah' }].length > paid.limits.maxKids)
ok('and the AI check is named, because Starter really does not have it',
  plan.limits.aiPhotoCheck && !paid.limits.aiPhotoCheck)
ok('and the XP drop is real, because Elite really is 1.5×',
  plan.xpMultiplier > paid.xpMultiplier)

console.log('\n=== And it makes no claim it cannot check ===')
// Guild membership is fetched by the guild screen and never reaches app state,
// so the banner cannot know. The flag it used to check is set for EVERY family
// in createInitialState, which made the claim false for almost all of them.
const source = readFileSync('src/components/TrialBanner.jsx', 'utf8')
ok('it does not mention guilds at all', !/guild/i.test(source.replace(/\/\*[\s\S]*?\*\//g, '')))

console.log('\n=== The countdown reads like a person wrote it ===')
ok('a fortnight is 14 days', trialDaysLeft(trialing) === 14)
ok('the final hours are "1 day", never "0 days"',
  trialDaysLeft({ trialTier: 'elite', trialEndsAt: Date.now() + 60000 }) === 1)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
