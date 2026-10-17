import { useRef, useState } from 'react'
import { SIZE, findMatches, swapped, adjacent, hasMove, makeBoard, collapse } from './sweetBoard.js'

/**
 * Sweet Swap. Swap two next to each other, line up three, they vanish and
 * the rest fall in.
 *
 * Moves rather than a clock. A match-three on a timer is a different and
 * much more stressful game, and the whole appeal of this one is that you can
 * stare at the board for a minute looking for the good move.
 *
 * A swap that matches nothing is given back rather than spent. The original
 * does the same, and for the same reason: punishing somebody for being wrong
 * about a board they are still learning to read is how you stop them
 * learning to read it.
 */

const SWEETS = ['🍬', '🍭', '🍫', '🍪', '🧁', '🍇']
const MOVES = 20
// Forty cleared in twenty moves means most moves found a match and some
// chained. It is a good round, not a perfect one.
const TARGET = 40

export default function SweetSwap({ onDone }) {
  const [board, setBoard] = useState(makeBoard)
  const [picked, setPicked] = useState(null)
  const [moves, setMoves] = useState(0)
  const [cleared, setCleared] = useState(0)
  const [busy, setBusy] = useState(false)
  const [say, setSay] = useState('Swap two that are next to each other.')
  const done = useRef(false)

  const finish = (total) => {
    if (done.current) return
    done.current = true
    onDone(Math.max(0, Math.min(100, Math.round((total / TARGET) * 100))))
  }

  /** Clear everything matching, let it fall, and keep going while it chains. */
  const settle = (start, totalSoFar, usedMoves) => {
    let current = start
    let total = totalSoFar
    let chain = 0

    const run = () => {
      const hit = findMatches(current)
      if (!hit.size) {
        // A board with no legal move left is reshuffled rather than ending
        // the round — running out of moves should be the player's doing.
        if (!hasMove(current)) {
          current = makeBoard()
          setSay('Nothing left to match — fresh board.')
        }
        setBoard(current)
        setBusy(false)
        if (usedMoves >= MOVES) finish(total)
        return
      }
      chain += 1
      const next = collapse(current, hit)
      total += next.cleared
      current = next.board
      setCleared(total)
      setBoard(current)
      if (chain > 1) setSay(`Chain of ${chain}!`)
      setTimeout(run, 280)
    }
    run()
  }

  const tap = (i) => {
    if (busy || done.current) return

    if (picked === null) { setPicked(i); return }
    if (picked === i) { setPicked(null); return }
    if (!adjacent(picked, i)) { setPicked(i); return }

    const tryIt = swapped(board, picked, i)
    setPicked(null)

    if (!findMatches(tryIt).size) {
      // Not a move. Show the swap and put it back, so it reads as refused
      // rather than as the tap not registering.
      setBoard(tryIt)
      setSay('That makes nothing — try another.')
      setBusy(true)
      setTimeout(() => { setBoard(board); setBusy(false) }, 320)
      return
    }

    const used = moves + 1
    setMoves(used)
    setBoard(tryIt)
    setBusy(true)
    setSay(used >= MOVES ? 'Last one.' : 'Nice.')
    setTimeout(() => settle(tryIt, cleared, used), 180)
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">{say}</p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {cleared} cleared · {MOVES - moves} moves left
      </p>

      <div
        className="grid gap-1 mx-auto"
        style={{ maxWidth: 300, gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}
      >
        {board.map((kind, i) => (
          <button
            // The grid is fixed at forty-nine slots and never reorders; what
            // changes is which sweet is in each one.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            type="button"
            onClick={() => tap(i)}
            aria-label={`Row ${Math.floor(i / SIZE) + 1} column ${(i % SIZE) + 1}, ${SWEETS[kind]}`}
            aria-pressed={picked === i}
            className="grid place-items-center transition-transform active:scale-90"
            style={{
              aspectRatio: '1',
              fontSize: 21,
              borderRadius: 9,
              border: picked === i ? '2px solid var(--accent)' : '2px solid transparent',
              background: picked === i
                ? 'color-mix(in srgb, var(--accent) 22%, transparent)'
                : 'color-mix(in srgb, var(--ink) 5%, transparent)',
            }}
          >
            {SWEETS[kind]}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted mt-3">
        No timer. A swap that matches nothing does not cost you a move.
      </p>
    </div>
  )
}
