import { useEffect, useRef, useState } from 'react'

const ROUND_MS = 20000

/**
 * Quick Tap. Targets appear one at a time and get quicker; every hit scores.
 *
 * Scored out of 100 so one payout rule can cover every game — see
 * src/data/minigames.js.
 */
export default function QuickTap({ theme, onDone }) {
  const [left, setLeft] = useState(ROUND_MS)
  const [spot, setSpot] = useState({ x: 50, y: 50, id: 0 })
  const hits = useRef(0)
  const misses = useRef(0)
  const started = useRef(Date.now())
  const over = useRef(false)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      const remaining = ROUND_MS - (Date.now() - started.current)
      setLeft(Math.max(0, remaining))
      if (remaining <= 0 && !over.current) {
        over.current = true
        clearInterval(t)
        // Twenty-five hits is a very good round; misses take the edge off.
        onDone(Math.max(0, Math.round((hits.current / 25) * 100) - misses.current * 2))
      }
    }, 100)
    return () => clearInterval(t)
  }, [onDone])

  // A fresh target after each hit, and on a timer, so dawdling costs you.
  useEffect(() => {
    if (over.current) return undefined
    const life = Math.max(450, 1200 - hits.current * 30)
    const t = setTimeout(() => {
      if (over.current) return
      misses.current += 1
      setSpot({ x: 12 + Math.random() * 76, y: 12 + Math.random() * 76, id: Math.random() })
    }, life)
    return () => clearTimeout(t)
  }, [spot.id])

  const hit = () => {
    if (over.current) return
    hits.current += 1
    tick((n) => n + 1)
    setSpot({ x: 12 + Math.random() * 76, y: 12 + Math.random() * 76, id: Math.random() })
  }

  return (
    <div>
      <div className="flex justify-between text-sm font-semibold mb-2">
        <span>Hits {hits.current}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(left / 1000).toFixed(1)}s</span>
      </div>
      <div className="relative w-full card-flat overflow-hidden" style={{ height: 320 }}>
        {!over.current && (
          <button
            type="button"
            onClick={hit}
            aria-label="Tap the target"
            className="absolute rounded-full grid place-items-center text-2xl anim-pop"
            style={{
              left: `${spot.x}%`,
              top: `${spot.y}%`,
              width: 68,
              height: 68,
              transform: 'translate(-50%, -50%)',
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            {theme.currency.icon}
          </button>
        )}
      </div>
    </div>
  )
}
