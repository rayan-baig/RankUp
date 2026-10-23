import { useEffect, useRef, useState } from 'react'

/**
 * Ice hockey: a breakaway. One defender to beat, then the goalie.
 *
 * Air hockey with a puck was the lazy version. The moment that actually
 * decides hockey games is a player coming in alone — a deke to get round
 * the defender, then picking a corner before the goalie closes it.
 *
 * The goalie moves to cover the puck with a lag, which is what makes the
 * last-second shift work: pull him one way, shoot the other. Shooting
 * straight at him is saved, as it should be.
 */

const RUNS = 6

export default function Hockey({ onDone }) {
  const [x, setX] = useState(50)
  const [y, setY] = useState(88)
  const [keeper, setKeeper] = useState(50)
  const [defender, setDefender] = useState(50)
  const [goals, setGoals] = useState(0)
  const [run, setRun] = useState(1)
  const [say, setSay] = useState('Skate in. Beat the defender, then shoot.')
  const [shot, setShot] = useState(null)
  const [resting, setResting] = useState(false)

  const area = useRef(null)
  const live = useRef({ x: 50, y: 88, keeper: 50, defender: 50, dDir: 1, resting: false, goals: 0 })
  const raf = useRef(0)
  const done = useRef(false)

  const finish = () => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    onDone(Math.max(0, Math.min(100, Math.round((live.current.goals / RUNS) * 100))))
  }

  useEffect(() => {
    const step = () => {
      if (done.current) return
      raf.current = requestAnimationFrame(step)
      const s = live.current
      if (s.resting) return

      // Skate forward on your own; you only steer.
      s.y = Math.max(26, s.y - 0.42)
      setY(s.y)

      // The defender slides to cut you off, but not instantly.
      s.defender += Math.max(-0.9, Math.min(0.9, s.x - s.defender))
      setDefender(s.defender)

      // The goalie tracks the puck with a lag — this is the lag you beat.
      s.keeper += Math.max(-0.62, Math.min(0.62, s.x - s.keeper))
      setKeeper(s.keeper)

      // Caught by the defender if you are level with him and too close.
      if (s.y < 52 && s.y > 44 && Math.abs(s.x - s.defender) < 7) {
        s.resting = true
        setResting(true)
        setSay('Stripped by the defender.')
        setTimeout(next, 1300)
        return
      }
      // Run out of ice without shooting and the chance is gone.
      if (s.y <= 26.5) {
        s.resting = true
        setResting(true)
        setSay('Ran out of ice.')
        setTimeout(next, 1300)
      }
    }

    const next = () => {
      if (done.current) return
      setRun((r) => {
        if (r >= RUNS) { finish(); return r }
        return r + 1
      })
      const s = live.current
      if (s.goals >= 0 && run >= RUNS) return
      s.x = 50; s.y = 88; s.keeper = 50; s.defender = 30 + Math.random() * 40
      s.resting = false
      setX(50); setY(88); setKeeper(50); setShot(null)
      setResting(false)
      setSay('Next one. Go.')
    }

    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [run])

  const steer = (clientX) => {
    const box = area.current?.getBoundingClientRect()
    if (!box || live.current.resting) return
    const nx = ((clientX - box.left) / box.width) * 100
    live.current.x = Math.max(12, Math.min(88, nx))
    setX(live.current.x)
  }

  const shoot = () => {
    const s = live.current
    if (done.current || s.resting) return
    s.resting = true
    setResting(true)

    // Further out is a harder shot; the goalie covers more of the net.
    const range = (s.y - 26) / 62
    const spread = 7 + range * 9
    const scored = Math.abs(s.x - s.keeper) > spread && s.y < 70

    setShot({ from: s.x, at: s.x })
    if (scored) {
      s.goals += 1
      setGoals(s.goals)
      setSay(s.y > 50 ? 'Scores! From distance.' : 'Scores! Wrong-footed him.')
    } else {
      setSay(s.y >= 70 ? 'Too far out — easy save.' : 'Right at the goalie.')
    }

    setTimeout(() => {
      if (done.current) return
      if (run >= RUNS) { finish(); return }
      setRun(run + 1)
      s.x = 50; s.y = 88; s.keeper = 50; s.defender = 30 + Math.random() * 40
      s.resting = false
      setX(50); setY(88); setKeeper(50); setShot(null)
      setResting(false)
      setSay('Next one. Go.')
    }, 1400)
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">{say}</p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        🏒 {goals} from {Math.min(run, RUNS)} of {RUNS}
      </p>

      <div
        ref={area}
        role="application"
        aria-label="Hockey breakaway. Drag to steer, then shoot."
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); steer(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') steer(e.clientX) }}
        className="mx-auto"
        style={{
          width: '100%',
          maxWidth: 300,
          aspectRatio: '3 / 4',
          borderRadius: 12,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, #38bdf8 16%, transparent)',
          touchAction: 'none',
          overflow: 'hidden',
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
          <line x1="0" y1="52" x2="100" y2="52" stroke="#60a5fa" strokeWidth="0.8" opacity="0.7" />
          <rect x="32" y="12" width="36" height="5" rx="1.5" fill="#fff" opacity="0.9" />
          <rect x={keeper - 7} y="17" width="14" height="7" rx="2.5" fill="var(--bad)" />
          <circle cx={defender} cy="48" r="4.5" fill="#7c3aed" />
          <circle cx={x} cy={y} r="4.5" fill="var(--accent)" />
          {shot && <line x1={shot.from} y1={y} x2={shot.at} y2="17" stroke="#111" strokeWidth="1" opacity="0.7" />}
        </svg>
      </div>

      <button type="button" className="btn btn-primary w-full mt-3" style={{ maxWidth: 300 }} disabled={resting} onClick={shoot}>
        Shoot
      </button>

      <p className="text-xs text-muted mt-3">
        Drag to skate across. The goalie follows you a moment late — move him, then shoot the other side.
      </p>
    </div>
  )
}
