import { useRef, useState } from 'react'

/**
 * Four in a Row, against the app.
 *
 * The only game in the arcade with an opponent, which makes losing feel
 * completely different from losing to a clock. The computer plays properly —
 * it takes a win when it has one and blocks yours — but it looks one move
 * ahead and no further, so a child who concentrates beats it, and that is
 * the point.
 */

const COLS = 7
const ROWS = 6
const ME = 1
const CPU = 2

const emptyBoard = () => new Array(COLS * ROWS).fill(0)
const at = (b, r, c) => b[r * COLS + c]

const dropRow = (b, c) => {
  for (let r = ROWS - 1; r >= 0; r -= 1) if (!at(b, r, c)) return r
  return -1
}

const drop = (b, c, who) => {
  const r = dropRow(b, c)
  if (r < 0) return null
  const next = [...b]
  next[r * COLS + c] = who
  return next
}

/** The four winning lines through every square, checked the simple way. */
function winner(b) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const who = at(b, r, c)
      if (!who) continue
      for (const [dr, dc] of dirs) {
        const line = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k])
        if (line.some(([rr, cc]) => rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS)) continue
        if (line.every(([rr, cc]) => at(b, rr, cc) === who)) return { who, line }
      }
    }
  }
  return null
}

const openCols = (b) => [0, 1, 2, 3, 4, 5, 6].filter((c) => dropRow(b, c) >= 0)

/** Win if you can, block if you must, otherwise play towards the middle. */
function cpuMove(b) {
  const open = openCols(b)
  for (const c of open) { const n = drop(b, c, CPU); if (winner(n)?.who === CPU) return c }
  for (const c of open) { const n = drop(b, c, ME); if (winner(n)?.who === ME) return c }
  // Never hand over a square that lets the player win on top of it.
  const safe = open.filter((c) => {
    const n = drop(b, c, CPU)
    return !open.some((c2) => { const m = drop(n, c2, ME); return m && winner(m)?.who === ME })
  })
  const pick = safe.length ? safe : open
  return pick.sort((a, z) => Math.abs(3 - a) - Math.abs(3 - z))[0]
}

export default function FourInARow({ onDone }) {
  const [board, setBoard] = useState(emptyBoard)
  const [busy, setBusy] = useState(false)
  const [end, setEnd] = useState(null)
  const done = useRef(false)

  const finish = (score) => {
    if (done.current) return
    done.current = true
    onDone(score)
  }

  const play = (c) => {
    if (busy || end || done.current) return
    const mine = drop(board, c, ME)
    if (!mine) return
    setBoard(mine)

    const won = winner(mine)
    if (won) { setEnd(won); setTimeout(() => finish(100), 1300); return }
    if (!openCols(mine).length) { setEnd({ who: 0 }); setTimeout(() => finish(60), 1300); return }

    setBusy(true)
    // A beat before the computer answers, so it reads as somebody thinking
    // rather than the board changing under your finger.
    setTimeout(() => {
      const theirs = drop(mine, cpuMove(mine), CPU)
      setBoard(theirs)
      setBusy(false)
      const lost = winner(theirs)
      if (lost) {
        setEnd(lost)
        // Losing a close game is still a game played: counted by how much of
        // the board you filled before it ended.
        const mineCount = theirs.filter((v) => v === ME).length
        setTimeout(() => finish(Math.min(45, 12 + mineCount * 3)), 1300)
      } else if (!openCols(theirs).length) {
        setEnd({ who: 0 })
        setTimeout(() => finish(60), 1300)
      }
    }, 480)
  }

  const highlight = new Set((end?.line || []).map(([r, c]) => r * COLS + c))
  const status = end
    ? end.who === ME ? 'You win.' : end.who === CPU ? 'The app got four.' : 'A draw. Board full.'
    : busy ? 'Thinking…' : 'Your go. Drop a counter.'

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">Four in a row — across, down or slanted.</p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>{status}</p>

      <div className="mx-auto" style={{ maxWidth: 300 }}>
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {[0, 1, 2, 3, 4, 5, 6].map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Drop into column ${c + 1}`}
              disabled={busy || Boolean(end) || dropRow(board, c) < 0}
              onClick={() => play(c)}
              className="btn btn-soft"
              style={{ minHeight: 0, padding: '6px 0', fontSize: 13, lineHeight: 1 }}
            >
              ▾
            </button>
          ))}
        </div>

        <div
          className="grid gap-1 p-2"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            borderRadius: 14,
            background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
          }}
        >
          {board.map((v, i) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              style={{
                aspectRatio: '1',
                borderRadius: '50%',
                background: v === ME ? 'var(--accent-2)' : v === CPU ? 'var(--bad)' : 'var(--bg)',
                boxShadow: highlight.has(i) ? '0 0 0 3px var(--good)' : 'none',
                transition: 'background 160ms ease, box-shadow 160ms ease',
              }}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-muted mt-3">
        No timer. You are the gold counters and you always go first.
      </p>
    </div>
  )
}
