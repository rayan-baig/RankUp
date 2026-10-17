import { useEffect, useRef, useState } from 'react'

/**
 * Sky Hop. One button, gravity, and a lot of gaps to get through.
 *
 * The whole game is one tap, which makes it the easiest thing in the arcade
 * to pick up and the hardest to put down. The gaps start generous and tighten
 * slowly: the first few are winnable by anybody, so nobody bounces off it in
 * the first ten seconds.
 */

const W = 300
const H = 400
const X = 76
const SIZE = 24
const GRAVITY = 0.42
const FLAP = -6.6
const SPEED = 2.1
const TARGET = 15

export default function SkyHop({ onDone }) {
  const [y, setY] = useState(H / 2)
  const [tilt, setTilt] = useState(0)
  const [pipes, setPipes] = useState([])
  const [passed, setPassed] = useState(0)
  const [dead, setDead] = useState(false)
  const [started, setStarted] = useState(false)

  const pos = useRef({ y: H / 2, v: 0 })
  const pipesRef = useRef([])
  const passedRef = useRef(0)
  const startedRef = useRef(false)
  const raf = useRef(0)
  const done = useRef(false)
  const nextId = useRef(1)

  const finish = () => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    onDone(Math.max(0, Math.min(100, Math.round((passedRef.current / TARGET) * 100))))
  }

  const flap = () => {
    if (done.current || dead) return
    startedRef.current = true
    setStarted(true)
    pos.current.v = FLAP
  }

  useEffect(() => {
    const step = () => {
      if (done.current) return
      raf.current = requestAnimationFrame(step)
      // Nothing moves until the first tap, so the game never starts without
      // the player — opening a screen should not already be losing.
      if (!startedRef.current) return

      pos.current.v += GRAVITY
      pos.current.y += pos.current.v
      setY(pos.current.y)
      setTilt(Math.max(-26, Math.min(70, pos.current.v * 6)))

      const list = pipesRef.current
      const last = list[list.length - 1]
      if (!last || last.x < W - 128) {
        // The gap narrows with every pipe but never below something a child
        // can fly through with an ordinary tap.
        const gap = Math.max(104, 150 - passedRef.current * 3)
        const top = 44 + Math.random() * (H - gap - 108)
        list.push({ id: nextId.current++, x: W + 30, top, gap, scored: false })
      }

      for (const p of list) {
        p.x -= SPEED
        if (!p.scored && p.x + 44 < X) {
          p.scored = true
          passedRef.current += 1
          setPassed(passedRef.current)
          if (passedRef.current >= TARGET) { finish(); return }
        }
      }
      pipesRef.current = list.filter((p) => p.x > -60)
      setPipes([...pipesRef.current])

      const hitGround = pos.current.y > H - SIZE || pos.current.y < 0
      const hitPipe = pipesRef.current.some((p) => (
        X + SIZE > p.x && X < p.x + 44
        && (pos.current.y < p.top || pos.current.y + SIZE > p.top + p.gap)
      ))
      if (hitGround || hitPipe) {
        setDead(true)
        setTimeout(finish, 850)
      }
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {dead ? 'Down you come.' : started ? 'Keep tapping.' : 'Tap to start. Tap to fly.'}
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {passed} through · {TARGET} is perfect
      </p>

      <button
        type="button"
        onPointerDown={flap}
        aria-label="Tap to flap"
        className="mx-auto block"
        style={{
          width: '100%',
          maxWidth: W,
          aspectRatio: `${W} / ${H}`,
          borderRadius: 16,
          border: '2px solid var(--line)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent)',
          overflow: 'hidden',
          padding: 0,
          touchAction: 'none',
          opacity: dead ? 0.6 : 1,
          transition: 'opacity 200ms ease',
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true">
          {pipes.map((p) => (
            <g key={p.id} fill="var(--accent)" opacity="0.85">
              <rect x={p.x} y={0} width={44} height={p.top} rx={6} />
              <rect x={p.x} y={p.top + p.gap} width={44} height={H - p.top - p.gap} rx={6} />
            </g>
          ))}
          <text
            x={X}
            y={y + SIZE - 4}
            style={{ fontSize: SIZE }}
            transform={`rotate(${tilt} ${X + SIZE / 2} ${y + SIZE / 2})`}
          >
            🚀
          </text>
        </svg>
      </button>

      <p className="text-xs text-muted mt-3">One tap lifts you. Gravity does the rest.</p>
    </div>
  )
}
