/**
 * The arcade's limits, as a child reads them (src/lib/arcadeWords.js).
 *
 * How many tokens are left, how many coins can still be won today, and when
 * they come back, in plain words, with every number read from the code that
 * enforces it (MAX_TOKENS and DAILY_COIN_CAP in src/data/minigames.js),
 * never typed into the words.
 *
 * Runs the app's own code in Node; needs nothing running.
 */
import { readFileSync } from 'node:fs'
import { arcadeLimits, untilMidnight } from '../src/lib/arcadeWords.js'
import { MAX_TOKENS, DAILY_COIN_CAP } from '../src/data/minigames.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const at = (h, m = 0) => new Date(2026, 10, 3, h, m)

console.log('\n=== Tokens: how many are left, and where more come from ===')
const none = arcadeLimits({ tokens: 0, now: at(15) })
ok('none left: says so, and that an accepted chore gives one back', /No tokens left/.test(none.tokens) && /chore your parent accepts gives you 1 back/.test(none.tokens), none.tokens)
const two = arcadeLimits({ tokens: 2, now: at(15) })
ok('some left: the number, and the most a child can keep', two.tokens.includes('2 tokens left') && two.tokens.includes(`up to ${MAX_TOKENS}`), two.tokens)
const one = arcadeLimits({ tokens: 1, now: at(15) })
ok('one: "1 token", not "1 tokens"', one.tokens.includes('1 token left'), one.tokens)
const full = arcadeLimits({ tokens: MAX_TOKENS, now: at(15) })
ok('full: the most you can keep, so play one', full.tokens.includes(`${MAX_TOKENS} tokens, the most you can keep`), full.tokens)
ok('more than the most (a test database) reads as full', arcadeLimits({ tokens: 20 }).held === MAX_TOKENS)
ok('the look-around never runs out, and says why', /never run out/.test(arcadeLimits({ unlimited: true }).tokens))

console.log('\n=== Winnings: how many are left today, and when they come back ===')
const fresh = arcadeLimits({ earnedToday: 0, currency: 'gems', now: at(15) })
ok('none won yet: the whole day\'s cap', fresh.coins.includes(`win ${DAILY_COIN_CAP} gems today`) && fresh.left === DAILY_COIN_CAP, fresh.coins)
const some = arcadeLimits({ earnedToday: 6, currency: 'gems', now: at(15) })
ok('some won: what is left, and of how many', some.coins.includes(`win ${DAILY_COIN_CAP - 6} gems today`) && some.coins.includes(`won 6 of ${DAILY_COIN_CAP}`), some.coins)
const capped = arcadeLimits({ earnedToday: DAILY_COIN_CAP, currency: 'gems', now: at(19) })
ok('at the cap: all won, keep playing for fun, back at midnight', capped.left === 0
  && capped.coins.includes(`won all ${DAILY_COIN_CAP} gems for today`) && /keep playing for fun/.test(capped.coins)
  && capped.coins.endsWith('come back at midnight, in about 5 hours.'), capped.coins)
ok('over the cap is still the cap', arcadeLimits({ earnedToday: 99 }).left === 0)

console.log('\n=== "When" is this phone\'s midnight, the day the server counts too ===')
ok('7pm: in about 5 hours', untilMidnight(at(19)) === 'in about 5 hours', untilMidnight(at(19)))
ok('11:20pm: in 40 minutes', untilMidnight(at(23, 20)) === 'in 40 minutes', untilMidnight(at(23, 20)))
ok('11:59pm: in 1 minute', untilMidnight(at(23, 59)) === 'in 1 minute', untilMidnight(at(23, 59)))
ok('12:30am: in about 24 hours, never "0 hours"', /in (about 24 hours|24 hours)/.test(untilMidnight(at(0, 30))), untilMidnight(at(0, 30)))
ok('10pm: in about 2 hours', untilMidnight(at(22)) === 'in about 2 hours', untilMidnight(at(22)))

console.log('\n=== No number typed by hand ===')
const source = readFileSync('src/lib/arcadeWords.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const words = [...source.matchAll(/(['`])((?:(?!\1).)*)\1/g)].map((m) => m[2].replace(/\$\{[^}]*\}/g, ''))
const typed = words.filter((w) => /\b(?:[2-9]|1[0-9])\b/.test(w) && !/^in 24 hours$/.test(w))
ok('the limits in the words come from MAX_TOKENS and DAILY_COIN_CAP', typed.length === 0, typed.join(' | '))
const arcade = readFileSync('src/screens/kid/KidArcade.jsx', 'utf8')
ok('and the arcade shows them', /arcadeLimits\(/.test(arcade) && /limits\.tokens/.test(arcade) && /limits\.coins/.test(arcade))

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
