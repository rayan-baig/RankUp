import { useRef, useState } from 'react'
import { useArrowKeys, swipeHandlers, DPad } from './controls.jsx'
import { N, TOP, EMPTY, spawn, move, same, stuck } from './mergeBoard.js'

/**
 * 2048. Slide the board, equal tiles merge, try to build a big one.
 *
 * The deepest game in the arcade and the one most likely to be played by a
 * parent who picked up the phone. There is no clock and no reflex in it at
 * all — a round ends when the board is genuinely stuck, or when the player
 * decides they are happy and cashes out.
 */

const SHADE = {
  0: 'color-mix(in srgb, var(--ink) 6%, transparent)',
  2: 'color-mix(in srgb, var(--accent) 16%, transparent)',
  4: 'color-mix(in srgb, var(--accent) 28%, transparent)',
  8: 'color-mix(in srgb, var(--accent) 44%, transparent)',
  16: 'color-mix(in srgb, var(--accent) 62%, transparent)',
  32: 'color-mix(in srgb, var(--accent) 80%, transparent)',
  64: 'var(--accent)',
  128: 'color-mix(in srgb, var(--accent-2) 60%, var(--accent))',
  256: 'color-mix(in srgb, var(--accent-2) 78%, var(--accent))',
  512: 'var(--accent-2)',
  1024: 'color-mix(in srgb, var(--good) 70%, var(--accent-2))',
  2048: 'var(--good)',
}

export default function Merge({ onDone }) {
  const [cells, setCells] = useState(() => spawn(spawn(EMPTY())))
  const [over, setOver] = useState(false)
  const done = useRef(false)

  const best = cells.reduce((m, v) => Math.max(m, v), 0)
  const scoreFor = (top) => {
    if (top < 4) return 0
    return Math.max(0, Math.min(100, Math.round(((Math.log2(top) - 1) / (TOP - 1)) * 100)))
  }

  const finish = (top) => {
    if (done.current) return
    done.current = true
    onDone(scoreFor(top))
  }

  const push = (dir) => {
    if (done.current || over) return
    const moved = move(cells, dir)
    // A move that changes nothing must not hand out a new tile, or a child
    // can shove the board against a wall forever and fill it for free.
    if (same(moved, cells)) return
    const next = spawn(moved)
    setCells(next)
    const top = next.reduce((m, v) => Math.max(m, v), 0)
    if (top >= 2048) { finish(top); return }
    if (stuck(next)) {
      setOver(true)
      setTimeout(() => finish(top), 1100)
    }
  }
  useArrowKeys(push)

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {over ? 'No moves left.' : 'Slide. Matching numbers join up.'}
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        Biggest tile {best}
      </p>

      <div
        {...swipeHandlers(push)}
        role="application"
        aria-label="2048. Swipe or use the arrow keys to slide the board."
        className="grid gap-2 mx-auto p-2"
        style={{
          maxWidth: 300,
          gridTemplateColumns: `repeat(${N}, 1fr)`,
          borderRadius: 16,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
          opacity: over ? 0.6 : 1,
          transition: 'opacity 250ms ease',
          touchAction: 'none',
        }}
      >
        {cells.map((v, i) => (
          <div
            // The grid is fixed at sixteen slots and never reorders.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="grid place-items-center font-display font-extrabold"
            style={{
              aspectRatio: '1',
              borderRadius: 10,
              background: SHADE[v] || 'var(--good)',
              color: v >= 64 ? '#fff' : 'var(--ink)',
              fontSize: v >= 1000 ? 17 : v >= 100 ? 21 : 25,
              transition: 'background 140ms ease',
            }}
          >
            {v || ''}
          </div>
        ))}
      </div>

      <DPad onDir={push} label="Slide the board" />

      <button type="button" className="btn btn-ghost mt-3" onClick={() => finish(best)}>
        I&apos;m happy with that — cash in {best}
      </button>
      <p className="text-xs text-muted mt-2">
        No timer. Reach 2048 for a perfect score; every doubling counts.
      </p>
    </div>
  )
}
