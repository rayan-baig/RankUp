/**
 * The 2048 board, checked as maths rather than through a browser.
 *
 * Two rules decide whether this game is honest, and neither is visible in a
 * screenshot:
 *
 *  - A move that changes nothing must not count as a move. If it does, a
 *    child shoves the board against the same wall over and over and gets a
 *    free tile each time, which fills the board and ends the game for them.
 *  - A tile that has just merged must not merge again in the same slide.
 *    Without that, a row of four 2s becomes a single 8 instead of two 4s,
 *    and the whole difficulty curve collapses.
 *
 * Both are checked here against every row shape that matters, which is
 * something a browser test cannot do and would only ever sample.
 */
import { slideRow, move, same, stuck } from '../src/components/games/mergeBoard.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { fails += 1; console.log(`  FAIL ${label} — ${detail}`) }
}

console.log('\n=== Sliding a row ===')
const row = (a) => slideRow(a).join(',')
ok('gaps close up', row([0, 2, 0, 4]) === '2,4,0,0', row([0, 2, 0, 4]))
ok('a pair joins', row([2, 2, 0, 0]) === '4,0,0,0', row([2, 2, 0, 0]))
ok('four of a kind makes two pairs, not one big one',
  row([2, 2, 2, 2]) === '4,4,0,0', row([2, 2, 2, 2]))
// The case that actually separates the two rules. A pair making a 4 next to
// an existing 4 must leave two 4s, not an 8 — a merge result is finished for
// this slide. [4,2,2] cannot tell them apart, which is why it is not the test.
ok('a tile made by merging cannot merge again this slide',
  row([2, 2, 4, 0]) === '4,4,0,0', row([2, 2, 4, 0]))
ok('and the same the other way round',
  row([4, 2, 2, 0]) === '4,4,0,0', row([4, 2, 2, 0]))
ok('three in a row joins the first two only',
  row([2, 2, 2, 0]) === '4,2,0,0', row([2, 2, 2, 0]))
ok('unequal neighbours stay apart', row([2, 4, 2, 4]) === '2,4,2,4', row([2, 4, 2, 4]))
ok('a full row with no pair is unchanged', row([2, 4, 8, 16]) === '2,4,8,16', row([2, 4, 8, 16]))

console.log('\n=== A dead move is really dead ===')
// Everything already shoved left with nothing equal touching: left is dead.
const packed = [
  2, 4, 8, 16,
  4, 8, 16, 2,
  8, 16, 2, 4,
  16, 2, 4, 8,
]
ok('left changes nothing on a packed board', same(move(packed, 'left'), packed))
ok('right changes nothing either', same(move(packed, 'right'), packed))
ok('up changes nothing either', same(move(packed, 'up'), packed))
ok('and that board is properly stuck', stuck(packed))

// The same board with one pair in it is not stuck, which is the other half of
// the claim — "stuck" that fires early would end rounds for no reason.
const nearly = [...packed]
nearly[1] = 2
ok('one matching pair is enough to keep playing', !stuck(nearly))

console.log('\n=== Every direction moves the right way ===')
const left = [
  0, 0, 0, 2,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
]
ok('left puts the tile in the first column', move(left, 'left')[0] === 2)
ok('down puts it in the bottom row', move(left, 'down')[15] === 2)
ok('up leaves it where it is', move(left, 'up')[3] === 2)
ok('right leaves it where it is', move(left, 'right')[3] === 2)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
