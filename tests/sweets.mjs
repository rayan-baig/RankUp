/**
 * The impostor puzzle, whose fairness is decided entirely by its generator.
 *
 * The failure is invisible on screen: a round with two possible culprits
 * tells a child who reasoned correctly that they were wrong, and nothing
 * about the screen would show it. So the rounds are generated thousands of
 * times here and solved by brute force, rather than eyeballed once.
 *
 * This file used to test the match-three board as well. That board was
 * replaced by a supplied HTML game, so its code no longer ships and its
 * tests went with it; the new game is tested through its frame in
 * tests/embedded.mjs.
 */
import { makePuzzle, solve, CREW } from '../src/components/games/crewPuzzle.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== Every impostor round has exactly one answer ===')
{
  let ambiguous = 0
  let ungenerated = 0
  let wrong = 0
  const caught = new Set()
  for (let i = 0; i < 5000; i += 1) {
    const p = makePuzzle()
    if (!p) { ungenerated += 1; continue }
    const answers = solve(p.statements)
    if (answers.length !== 1) ambiguous += 1
    else if (answers[0] !== p.impostor) wrong += 1
    caught.add(p.impostor)
  }
  ok('5000 rounds all generated', ungenerated === 0, `${ungenerated} gave up`)
  ok('every round has exactly one possible culprit', ambiguous === 0, `${ambiguous} ambiguous`)
  ok('and that culprit is the one the game blames', wrong === 0, `${wrong} disagreed`)
  ok('all five crewmates get to be the impostor', caught.size === CREW.length, `${caught.size} of 5`)
}

console.log('\n=== And the crew really do tell the truth ===')
{
  // The rule the player is told. If a crewmate could say something false,
  // the puzzle is unsolvable by the stated rules even when it has one answer.
  let liars = 0
  for (let i = 0; i < 2000; i += 1) {
    const p = makePuzzle()
    if (!p) continue
    for (const s of p.statements) {
      const trueNow = s.kind === 'accuse' ? s.about === p.impostor : s.about !== p.impostor
      const shouldBeTrue = s.from !== p.impostor
      if (trueNow !== shouldBeTrue) liars += 1
    }
  }
  ok('no crewmate ever lies, and the impostor always does', liars === 0, `${liars} bad statements`)
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
