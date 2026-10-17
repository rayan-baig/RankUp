import { useRef, useState } from 'react'

/**
 * Minesweeper, on a board small enough to finish in a few minutes.
 *
 * Eight by eight with ten mines is the classic beginner board, and it is here
 * because it is pure deduction — the only game in the arcade you win by
 * reasoning out loud with somebody sitting next to you.
 *
 * The first tap is never a mine. The original punished you for the one move
 * you could not possibly have thought about, and a child who loses on tap one
 * does not come back.
 */

const N = 8
const MINES = 10

const idx = (r, c) => r * N + c
const around = (r, c) => {
  const out = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push([rr, cc])
    }
  }
  return out
}

/** Mines laid after the first tap, avoiding it and everything touching it. */
function layMines(safeR, safeC) {
  const banned = new Set([idx(safeR, safeC), ...around(safeR, safeC).map(([r, c]) => idx(r, c))])
  const mines = new Set()
  while (mines.size < MINES) {
    const i = Math.floor(Math.random() * N * N)
    if (!banned.has(i)) mines.add(i)
  }
  const counts = new Array(N * N).fill(0)
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      if (mines.has(idx(r, c))) { counts[idx(r, c)] = -1; continue }
      counts[idx(r, c)] = around(r, c).filter(([rr, cc]) => mines.has(idx(rr, cc))).length
    }
  }
  return counts
}

const NUM_COLOUR = ['', 'var(--accent)', 'var(--good)', 'var(--bad)', '#8b5cf6', '#d97706', '#0891b2', 'var(--ink)', 'var(--muted)']

export default function Sweeper({ onDone }) {
  const [counts, setCounts] = useState(null)
  const [open, setOpen] = useState(() => new Array(N * N).fill(false))
  const [flags, setFlags] = useState(() => new Array(N * N).fill(false))
  const [flagMode, setFlagMode] = useState(false)
  const [boom, setBoom] = useState(false)
  const done = useRef(false)

  const safeTotal = N * N - MINES

  const finish = (opened, won) => {
    if (done.current) return
    done.current = true
    // Most of the score is for the squares cleared, so a board lost near the
    // end still pays — and clearing it outright is worth the full hundred.
    onDone(won ? 100 : Math.max(0, Math.min(95, Math.round((opened / safeTotal) * 95))))
  }

  const tap = (r, c) => {
    if (done.current || boom) return
    const i = idx(r, c)

    if (flagMode) {
      if (open[i]) return
      const next = [...flags]
      next[i] = !next[i]
      setFlags(next)
      return
    }
    if (flags[i] || open[i]) return

    const board = counts || layMines(r, c)
    if (!counts) setCounts(board)

    if (board[i] === -1) {
      setBoom(true)
      const shown = [...open]
      board.forEach((v, j) => { if (v === -1) shown[j] = true })
      setOpen(shown)
      setTimeout(() => finish(open.filter(Boolean).length, false), 1200)
      return
    }

    // Opening a blank square opens everything blank next to it, which is what
    // makes the game quick rather than a thousand individual taps.
    const next = [...open]
    const stack = [[r, c]]
    while (stack.length) {
      const [rr, cc] = stack.pop()
      const j = idx(rr, cc)
      if (next[j] || flags[j]) continue
      next[j] = true
      if (board[j] === 0) around(rr, cc).forEach(([ar, ac]) => stack.push([ar, ac]))
    }
    setOpen(next)

    const opened = next.filter(Boolean).length
    if (opened >= safeTotal) {
      setTimeout(() => finish(opened, true), 400)
    }
  }

  const opened = open.filter((v, i) => v && (counts ? counts[i] !== -1 : true)).length
  const flagged = flags.filter(Boolean).length

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {boom ? 'That one was a mine.' : 'Ten mines. The numbers tell you how many are touching.'}
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {opened}/{safeTotal} clear · {MINES - flagged} 🚩 left
      </p>

      <div
        className="grid gap-1 mx-auto"
        style={{ maxWidth: 300, gridTemplateColumns: `repeat(${N}, 1fr)` }}
      >
        {open.map((isOpen, i) => {
          const r = Math.floor(i / N)
          const c = i % N
          const v = counts ? counts[i] : 0
          return (
            <button
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              type="button"
              onClick={() => tap(r, c)}
              aria-label={`Row ${r + 1} column ${c + 1}${isOpen ? `, ${v === -1 ? 'mine' : `${v} touching`}` : flags[i] ? ', flagged' : ', unopened'}`}
              className="grid place-items-center font-display font-extrabold"
              style={{
                aspectRatio: '1',
                borderRadius: 7,
                fontSize: 15,
                border: '1px solid var(--line)',
                color: v > 0 ? NUM_COLOUR[v] : 'var(--ink)',
                background: isOpen
                  ? 'color-mix(in srgb, var(--ink) 5%, transparent)'
                  : 'color-mix(in srgb, var(--accent) 20%, transparent)',
              }}
            >
              {isOpen ? (v === -1 ? '💣' : v || '') : flags[i] ? '🚩' : ''}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className={`btn ${flagMode ? 'btn-primary' : 'btn-soft'} mt-3`}
        aria-pressed={flagMode}
        onClick={() => setFlagMode(!flagMode)}
      >
        {flagMode ? '🚩 Flag mode is on' : '🚩 Turn on flag mode'}
      </button>
      <p className="text-xs text-muted mt-2">
        No timer. Your first tap is always safe.
      </p>
    </div>
  )
}
