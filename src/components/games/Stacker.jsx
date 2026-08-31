import { useEffect, useRef, useState } from 'react'

const LANE = 260
const START_WIDTH = 120

/**
 * Stacker. A block slides across; tap to drop it. Overhang is trimmed away, so
 * the tower narrows until a miss ends the run.
 */
export default function Stacker({ onDone }) {
  const [rows, setRows] = useState([{ x: (LANE - START_WIDTH) / 2, w: START_WIDTH }])
  const [x, setX] = useState(0)
  const dir = useRef(1)
  const over = useRef(false)
  const raf = useRef(0)

  const top = rows[rows.length - 1]
  const speed = Math.min(4.2, 1.4 + rows.length * 0.18)

  useEffect(() => {
    const step = () => {
      if (over.current) return
      setX((prev) => {
        let next = prev + dir.current * speed
        if (next <= 0) { next = 0; dir.current = 1 }
        if (next + top.w >= LANE) { next = LANE - top.w; dir.current = -1 }
        return next
      })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [speed, top.w])

  const drop = () => {
    if (over.current) return
    const overlapLeft = Math.max(x, top.x)
    const overlapRight = Math.min(x + top.w, top.x + top.w)
    const w = overlapRight - overlapLeft

    if (w <= 6) {
      over.current = true
      cancelAnimationFrame(raf.current)
      // Twelve floors is a strong tower.
      onDone(Math.min(100, Math.round(((rows.length - 1) / 12) * 100)))
      return
    }
    const next = [...rows, { x: overlapLeft, w }]
    setRows(next)
    setX(0)
    dir.current = 1
    if (next.length > 14) {
      over.current = true
      cancelAnimationFrame(raf.current)
      onDone(100)
    }
  }

  return (
    <div>
      <div className="text-sm font-semibold mb-2">Floors {rows.length - 1}</div>
      <button
        type="button"
        onClick={drop}
        aria-label="Drop the block"
        className="relative w-full card-flat overflow-hidden block"
        style={{ height: 320 }}
      >
        <div className="absolute left-1/2" style={{ width: LANE, transform: 'translateX(-50%)', bottom: 0 }}>
          {[...rows].reverse().map((r, i) => (
            <div
              key={rows.length - i}
              className="absolute"
              style={{
                left: r.x,
                width: r.w,
                height: 20,
                bottom: (rows.length - 1 - i) * 21,
                background: 'var(--accent)',
                opacity: 0.55 + Math.min(0.45, i * 0.06),
                borderRadius: 4,
              }}
            />
          ))}
          {!over.current && (
            <div
              className="absolute"
              style={{
                left: x,
                width: top.w,
                height: 20,
                bottom: rows.length * 21,
                background: 'var(--accent-2)',
                borderRadius: 4,
              }}
            />
          )}
        </div>
      </button>
      <p className="text-xs text-muted mt-2 text-center">Tap anywhere to drop.</p>
    </div>
  )
}
