import { useEffect, useRef, useState } from 'react'

/**
 * Block Drop. Falling shapes, full rows disappear.
 *
 * Two things in here are what make the original playable rather than
 * annoying, and both are easy to leave out by accident:
 *
 * A rotation that would put a piece through a wall shifts it back into the
 * well instead of being refused. Without that, a piece against the edge
 * simply will not turn, and it feels like the game ignoring you.
 *
 * A piece only locks a moment after it lands, not instantly. That moment is
 * what lets you slide a piece into a gap at the last second, which is most
 * of the skill.
 */

const COLS = 10
const ROWS = 16
const TARGET_LINES = 10

// Each shape as the cells it fills in a 4x4 box, so rotating is one formula.
const SHAPES = [
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], tint: '#38bdf8' }, // I
  { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], tint: '#fbbf24' }, // O
  { cells: [[0, 1], [1, 0], [1, 1], [1, 2]], tint: '#a78bfa' }, // T
  { cells: [[0, 1], [0, 2], [1, 0], [1, 1]], tint: '#4ade80' }, // S
  { cells: [[0, 0], [0, 1], [1, 1], [1, 2]], tint: '#f87171' }, // Z
  { cells: [[0, 0], [1, 0], [1, 1], [1, 2]], tint: '#60a5fa' }, // J
  { cells: [[0, 2], [1, 0], [1, 1], [1, 2]], tint: '#fb923c' }, // L
]

const emptyWell = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(null))

const rotate = (cells) => cells.map(([r, c]) => [c, 3 - r])

const newPiece = () => {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]
  return { cells: shape.cells, tint: shape.tint, r: 0, c: 3 }
}

const cellsOf = (p) => p.cells.map(([r, c]) => [p.r + r, p.c + c])

const fits = (well, p) => cellsOf(p).every(([r, c]) => (
  c >= 0 && c < COLS && r < ROWS && (r < 0 || !well[r][c])
))

export default function BlockDrop({ onDone }) {
  const [well, setWell] = useState(emptyWell)
  const [piece, setPiece] = useState(newPiece)
  const [lines, setLines] = useState(0)
  const [over, setOver] = useState(false)

  const wellRef = useRef(well)
  const pieceRef = useRef(piece)
  const linesRef = useRef(0)
  const landedAt = useRef(0)
  const done = useRef(false)

  wellRef.current = well
  pieceRef.current = piece

  const finish = () => {
    if (done.current) return
    done.current = true
    onDone(Math.max(0, Math.min(100, Math.round((linesRef.current / TARGET_LINES) * 100))))
  }

  /** Settle the piece into the well, clear any full rows, hand out the next. */
  const lock = () => {
    const next = wellRef.current.map((row) => [...row])
    for (const [r, c] of cellsOf(pieceRef.current)) {
      if (r < 0) { setOver(true); setTimeout(finish, 900); return }
      next[r][c] = pieceRef.current.tint
    }
    const kept = next.filter((row) => row.some((v) => !v))
    const cleared = ROWS - kept.length
    while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null))

    if (cleared) {
      linesRef.current += cleared
      setLines(linesRef.current)
    }
    setWell(kept)
    wellRef.current = kept

    if (linesRef.current >= TARGET_LINES) { finish(); return }

    const fresh = newPiece()
    if (!fits(kept, fresh)) { setOver(true); setTimeout(finish, 900); return }
    setPiece(fresh)
    pieceRef.current = fresh
    landedAt.current = 0
  }

  useEffect(() => {
    const tick = setInterval(() => {
      if (done.current || over) return
      const moved = { ...pieceRef.current, r: pieceRef.current.r + 1 }
      if (fits(wellRef.current, moved)) {
        setPiece(moved)
        pieceRef.current = moved
        landedAt.current = 0
        return
      }
      // Landed. Give it one tick of grace before it sets, so a last-moment
      // slide into a gap is possible.
      if (!landedAt.current) { landedAt.current = Date.now(); return }
      lock()
    }, 520)
    return () => clearInterval(tick)
  }, [over])

  const nudge = (dc) => {
    if (done.current || over) return
    const moved = { ...pieceRef.current, c: pieceRef.current.c + dc }
    if (fits(wellRef.current, moved)) { setPiece(moved); pieceRef.current = moved }
  }

  const spin = () => {
    if (done.current || over) return
    const turned = { ...pieceRef.current, cells: rotate(pieceRef.current.cells) }
    // Try where it is, then nudged off each wall — a kick, so turning against
    // the edge works instead of being silently refused.
    for (const dc of [0, -1, 1, -2, 2]) {
      const tryIt = { ...turned, c: turned.c + dc }
      if (fits(wellRef.current, tryIt)) { setPiece(tryIt); pieceRef.current = tryIt; return }
    }
  }

  const slam = () => {
    if (done.current || over) return
    let p = pieceRef.current
    while (fits(wellRef.current, { ...p, r: p.r + 1 })) p = { ...p, r: p.r + 1 }
    setPiece(p)
    pieceRef.current = p
    lock()
  }

  // What to draw: the settled well with the live piece painted over it.
  const view = well.map((row) => [...row])
  if (!over) {
    for (const [r, c] of cellsOf(piece)) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) view[r][c] = piece.tint
    }
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {over ? 'The well filled up.' : 'Fill a row and it clears.'}
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {lines}/{TARGET_LINES} lines
      </p>

      <div
        className="grid mx-auto"
        style={{
          maxWidth: 230,
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gap: 1,
          padding: 4,
          borderRadius: 10,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, var(--ink) 7%, transparent)',
          opacity: over ? 0.55 : 1,
          transition: 'opacity 250ms ease',
        }}
      >
        {view.flat().map((tint, i) => (
          <div
            // The well is a fixed grid of 160 slots that never reorders.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            style={{
              aspectRatio: '1',
              borderRadius: 2,
              background: tint || 'color-mix(in srgb, var(--ink) 5%, transparent)',
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 mx-auto mt-4" style={{ maxWidth: 280 }}>
        <button type="button" aria-label="Move left" className="btn btn-soft" onClick={() => nudge(-1)}>◀</button>
        <button type="button" aria-label="Rotate" className="btn btn-soft" onClick={spin}>⟳</button>
        <button type="button" aria-label="Move right" className="btn btn-soft" onClick={() => nudge(1)}>▶</button>
        <button type="button" aria-label="Drop" className="btn btn-primary" onClick={slam}>▼</button>
      </div>

      <p className="text-xs text-muted mt-3">
        Clear {TARGET_LINES} lines for a perfect round. The drop button sends it straight down.
      </p>
    </div>
  )
}
