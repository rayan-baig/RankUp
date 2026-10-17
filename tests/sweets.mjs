/**
 * The match-three board, and the impostor puzzle: two games whose fairness
 * is decided entirely by their generator.
 *
 * Neither failure is visible on screen. A match-three board that already
 * has a match detonates on arrival and hands out points nobody earned; one
 * with no legal swap is a dead end the player will blame themselves for. A
 * deduction round with two possible culprits tells a child who reasoned
 * correctly that they were wrong.
 *
 * So both are generated thousands of times here and checked, rather than
 * eyeballed once.
 */
import {
  SIZE, findMatches, swapped, hasMove, makeBoard, collapse,
} from '../src/components/games/sweetBoard.js'
import { makePuzzle, solve, CREW } from '../src/components/games/crewPuzzle.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== Matches are found the way a person sees them ===')
{
  // A deliberate row of three in the top-left corner, everything else quiet.
  const board = new Array(SIZE * SIZE).fill(0).map((_, i) => (i % 2 ? 1 : 2))
  board[0] = 3; board[1] = 3; board[2] = 3
  const hit = findMatches(board)
  ok('three in a row is a match', hit.has(0) && hit.has(1) && hit.has(2))
  ok('and nothing else is caught with it', hit.size === 3, `${hit.size} cells`)

  const two = [...board]
  two[2] = 4
  ok('two in a row is not a match', findMatches(two).size === 0)

  // Five in a row must take all five, not just the first three.
  const five = new Array(SIZE * SIZE).fill(0).map((_, i) => (i % 2 ? 1 : 2))
  for (let i = 0; i < 5; i += 1) five[i] = 3
  ok('a run of five takes all five', findMatches(five).size === 5)
}

console.log('\n=== Every fresh board is playable ===')
{
  let dirty = 0
  let dead = 0
  for (let i = 0; i < 3000; i += 1) {
    const board = makeBoard()
    if (findMatches(board).size) dirty += 1
    if (!hasMove(board)) dead += 1
  }
  ok('3000 boards, none already matching', dirty === 0, `${dirty} detonated on arrival`)
  ok('3000 boards, every one has a legal move', dead === 0, `${dead} dead ends`)
}

console.log('\n=== Things fall into the gaps ===')
{
  const board = new Array(SIZE * SIZE).fill(0).map((_, i) => (i % 2 ? 1 : 2))
  const bottom = SIZE * (SIZE - 1)
  board[bottom] = 3; board[bottom + 1] = 3; board[bottom + 2] = 3
  const { board: after, cleared } = collapse(board, findMatches(board))
  ok('the matched cells are counted', cleared === 3, String(cleared))
  ok('the board is still full afterwards', after.every((v) => v !== null && v !== undefined))
  ok('and it is still the right size', after.length === SIZE * SIZE)
}

console.log('\n=== A swap is only a move if it matches something ===')
{
  // Build a board where swapping two known cells makes a line, and check
  // the game would see it.
  const board = new Array(SIZE * SIZE).fill(0).map((_, i) => (i % 2 ? 1 : 2))
  board[0] = 5; board[1] = 5; board[3] = 5; board[2] = 6; board[SIZE + 2] = 5
  const better = swapped(board, 2, SIZE + 2)
  ok('swapping the fifth into line makes a match', findMatches(better).size >= 3)
  ok('and before the swap there was nothing there', findMatches(board).size === 0)
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
