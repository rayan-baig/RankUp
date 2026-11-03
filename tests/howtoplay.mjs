/**
 * Every arcade game, and every sport inside SportsMania, says how to play it
 * in one short line before the first move.
 *
 * The arcade shows a game's `howTo` above it as it starts (KidArcade), and
 * SportsMania shows the sport's as it starts. A child who opens a game and
 * does not know what to press closes it, and a token is gone for nothing. So
 * each line has to be there, be one line on a phone, and say what to DO:
 * no scoring tables, no rules lawyering.
 *
 * Reads the lists in Node; needs nothing running.
 *
 *   node tests/howtoplay.mjs
 */
import { readFileSync } from 'node:fs'
import { MINIGAMES } from '../src/data/minigames.js'
import { SPORTS } from '../src/data/sports.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

// About what fits on one line of a 390-pixel phone at the arcade's text size,
// with the "How to play:" in front of it on two at most.
const MAX = 80
// Words a seven-year-old trips on, or that turn a how-to into a rulebook.
const HARD = /\b(payout|showdown|deliver(?:y|ies)|respectively|approximately|subsequently|whereas)\b|\d+%|—/i

function check(kind, list) {
  console.log(`\n=== ${kind}: ${list.length} ===`)
  const missing = list.filter((g) => typeof g.howTo !== 'string' || !g.howTo.trim())
  ok(`every one has a how-to line`, missing.length === 0, missing.map((g) => g.id).join(', '))
  const long = list.filter((g) => (g.howTo || '').length > MAX)
  ok(`each is short: ${MAX} characters at most`, long.length === 0,
    long.map((g) => `${g.id} (${g.howTo.length})`).join(', '))
  const multi = list.filter((g) => /\n/.test(g.howTo || ''))
  ok('each is one line', multi.length === 0, multi.map((g) => g.id).join(', '))
  const hard = list.filter((g) => HARD.test(g.howTo || ''))
  ok('in plain words', hard.length === 0, hard.map((g) => `${g.id}: ${g.howTo}`).join(' | '))
  const ends = list.filter((g) => !/[.!]$/.test(g.howTo || ''))
  ok('each ends as a sentence', ends.length === 0, ends.map((g) => g.id).join(', '))
  const same = list.filter((g) => g.howTo && g.howTo === g.blurb)
  ok('and says how to play, not just what the game is', same.length === 0, same.map((g) => g.id).join(', '))
}

check('Arcade games', MINIGAMES)
check('SportsMania sports', SPORTS)

console.log('\n=== And they are shown as the game starts ===')
const arcade = readFileSync('src/screens/kid/KidArcade.jsx', 'utf8')
ok('the arcade shows the game\'s line above it', /How to play:<\/span> \{meta\.howTo\}/.test(arcade))
const sports = readFileSync('src/components/games/SportsMania.jsx', 'utf8')
ok('SportsMania shows the sport\'s line above it', /\{sport\.howTo\}/.test(sports))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
