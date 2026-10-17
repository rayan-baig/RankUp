import { useEffect, useRef, useState } from 'react'
import { swipeHandlers } from './controls.jsx'

/**
 * Trackstar. Three lanes, you run forwards whether you like it or not,
 * things come at you.
 *
 * An endless runner lives or dies on one number: how far ahead you can see.
 * Too little and it is a memory test with no warning, which feels like the
 * game cheating. Obstacles here appear at the far end and take a bit over a
 * second to arrive at the slowest speed, which is enough time to decide and
 * swipe without it being a walk.
 *
 * Swipe left and right to change lane, swipe up to jump. Jumping clears the
 * low barriers only, so the lane you are in still matters — otherwise the
 * whole game is holding the jump.
 */

const LANES = 3
const RUN_MS = 60000
const TARGET = 28 // obstacles cleared for a perfect run
const LANE_X = [22, 50, 78]
const FLOOR = 78

export default function Trackstar({ onDone }) {
  const [lane, setLane] = useState(1)
  const [jump, setJump] = useState(0)
  const [things, setThings] = useState([])
  const [cleared, setCleared] = useState(0)
  const [hits, setHits] = useState(0)
  const [left, setLeft] = useState(Math.round(RUN_MS / 1000))

  const laneRef = useRef(1)
  const jumpUntil = useRef(0)
  const list = useRef([])
  const clearedRef = useRef(0)
  const hitsRef = useRef(0)
  const started = useRef(Date.now())
  const nextDrop = useRef(0)
  const nextId = useRef(1)
  const raf = useRef(0)
  const done = useRef(false)

  const finish = () => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    // Distance is the score; crashes take a bite out of it rather than
    // ending the run, so one mistake forty seconds in does not wipe it out.
    const got = (clearedRef.current / TARGET) * 100
    onDone(Math.max(0, Math.min(100, Math.round(got - hitsRef.current * 6))))
  }

  const steer = (dir) => {
    if (done.current) return
    if (dir === 'up') { jumpUntil.current = Date.now() + 620; return }
    if (dir === 'left') laneRef.current = Math.max(0, laneRef.current - 1)
    if (dir === 'right') laneRef.current = Math.min(LANES - 1, laneRef.current + 1)
    setLane(laneRef.current)
  }

  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ' ': 'up' }
      if (!map[e.key]) return
      e.preventDefault()
      steer(map[e.key])
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const step = () => {
      if (done.current) return
      const now = Date.now()
      const elapsed = now - started.current
      if (elapsed >= RUN_MS) { finish(); return }
      setLeft(Math.max(0, Math.ceil((RUN_MS - elapsed) / 1000)))

      const progress = elapsed / RUN_MS
      const speed = 0.85 + progress * 0.95
      setJump(now < jumpUntil.current ? 1 : 0)

      if (now >= nextDrop.current) {
        nextDrop.current = now + 860 - progress * 330
        // Never block all three lanes at once: a runner must always have a
        // way through, or the game is deciding when you lose rather than you.
        const blocked = Math.random() < 0.3 ? 2 : 1
        const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, blocked)
        for (const l of lanes) {
          list.current.push({
            id: nextId.current++,
            lane: l,
            z: 0,
            low: Math.random() < 0.45,
            counted: false,
          })
        }
      }

      const jumping = now < jumpUntil.current
      for (const t of list.current) {
        t.z += speed
        if (!t.counted && t.z >= FLOOR) {
          t.counted = true
          const sameLane = t.lane === laneRef.current
          const dodged = !sameLane || (t.low && jumping)
          if (dodged) {
            clearedRef.current += 1
            setCleared(clearedRef.current)
          } else {
            hitsRef.current += 1
            setHits(hitsRef.current)
          }
        }
      }
      list.current = list.current.filter((t) => t.z < 100)
      setThings([...list.current])

      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        Swipe to change lane. Swipe up to jump the low ones.
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {cleared} dodged · {hits > 0 ? `${hits} hit · ` : ''}{left}s
      </p>

      <div
        {...swipeHandlers(steer, 18)}
        role="application"
        aria-label="Trackstar. Swipe left or right to change lane, up to jump."
        className="relative mx-auto"
        style={{
          width: '100%',
          maxWidth: 300,
          aspectRatio: '3 / 4',
          borderRadius: 16,
          border: '2px solid var(--line)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, transparent), transparent)',
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        {/* The three rails, drawn as a perspective fan from a vanishing point. */}
        <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          {[8, 50, 92].map((x) => (
            <line key={x} x1="50" y1="12" x2={x} y2="100" stroke="var(--line)" strokeWidth="0.6" />
          ))}
          <line x1="0" y1={FLOOR} x2="100" y2={FLOOR} stroke="var(--line)" strokeDasharray="3 3" strokeWidth="0.5" />
        </svg>

        {things.map((t) => {
          // Near the vanishing point things are small and bunched together;
          // the lanes only spread out as they come towards you.
          const depth = t.z / 100
          const y = 12 + depth * 88
          const x = 50 + (LANE_X[t.lane] - 50) * depth
          const size = 3 + depth * 13
          return (
            <div
              key={t.id}
              className="absolute grid place-items-center"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: `${size}%`,
                height: `${size}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: `${size * 0.9}px`,
              }}
              aria-hidden="true"
            >
              {t.low ? '🚧' : '🚚'}
            </div>
          )
        })}

        <div
          className="absolute"
          style={{
            left: `${LANE_X[lane]}%`,
            top: `${FLOOR - (jump ? 11 : 0)}%`,
            transform: 'translate(-50%, -50%)',
            fontSize: 28,
            transition: 'left 130ms ease, top 130ms ease',
          }}
          aria-hidden="true"
        >
          🛹
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mx-auto mt-3" style={{ maxWidth: 280 }}>
        <button type="button" aria-label="Left" className="btn btn-soft" onClick={() => steer('left')}>◀</button>
        <button type="button" aria-label="Jump" className="btn btn-primary" onClick={() => steer('up')}>Jump</button>
        <button type="button" aria-label="Right" className="btn btn-soft" onClick={() => steer('right')}>▶</button>
      </div>

      <p className="text-xs text-muted mt-3">
        Jumping clears the low barriers only — the lorries you have to go round.
      </p>
    </div>
  )
}
