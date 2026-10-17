import { useEffect, useRef, useState } from 'react'

/**
 * Turbo Ball. Football with cars, from above.
 *
 * The thing that makes the real game fun is that you cannot carry the ball —
 * you can only hit it, so every touch is a decision about angle. That part
 * carries over to two dimensions perfectly well; the flying does not, so it
 * is not here pretending to be.
 *
 * You drag to steer. The car accelerates towards your finger rather than
 * teleporting to it, which is the whole reason it feels like driving.
 */

const W = 300
const H = 420
const CAR = 17
const BALL = 13
const GOAL_W = 110
const RUN_MS = 75000

export default function TurboBall({ onDone }) {
  const [mine, setMine] = useState(0)
  const [theirs, setTheirs] = useState(0)
  const [left, setLeft] = useState(Math.round(RUN_MS / 1000))
  const [, redraw] = useState(0)

  const area = useRef(null)
  const target = useRef(null)
  const me = useRef({ x: W / 2, y: H - 70, vx: 0, vy: 0 })
  const foe = useRef({ x: W / 2, y: 70, vx: 0, vy: 0 })
  const ball = useRef({ x: W / 2, y: H / 2, vx: 0, vy: 0 })
  const score = useRef({ mine: 0, theirs: 0 })
  const raf = useRef(0)
  const started = useRef(Date.now())
  const done = useRef(false)

  const finish = () => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    const { mine: m, theirs: t } = score.current
    // Goals scored carry the score; winning is a bonus rather than the whole
    // thing, so a 4–5 defeat still beats a 1–0 win, which is the honest way
    // round for a game that is mostly about whether you could hit the ball.
    const got = Math.min(60, m * 15)
    const won = m > t ? 25 : m === t ? 12 : 0
    const kept = Math.max(0, 15 - t * 4)
    onDone(Math.max(0, Math.min(100, Math.round(got + won + kept))))
  }

  const kickOff = (towardsMe) => {
    ball.current = { x: W / 2, y: H / 2, vx: 0, vy: towardsMe ? 1.2 : -1.2 }
    me.current = { x: W / 2, y: H - 70, vx: 0, vy: 0 }
    foe.current = { x: W / 2, y: 70, vx: 0, vy: 0 }
  }

  useEffect(() => {
    /** Push two round things apart and swap some speed between them. */
    const bump = (a, b, ra, rb, bounce) => {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 0.0001
      if (dist >= ra + rb) return false
      const nx = dx / dist
      const ny = dy / dist
      const overlap = ra + rb - dist
      b.x += nx * overlap
      b.y += ny * overlap
      // The car's speed along the line of contact is what the ball receives.
      const push = (a.vx * nx + a.vy * ny) * bounce + 1.6
      b.vx += nx * push
      b.vy += ny * push
      return true
    }

    const step = () => {
      if (done.current) return
      const elapsed = Date.now() - started.current
      if (elapsed >= RUN_MS) { finish(); return }
      setLeft(Math.max(0, Math.ceil((RUN_MS - elapsed) / 1000)))

      // Me: accelerate towards the finger, with drag so it coasts.
      const m = me.current
      if (target.current) {
        const dx = target.current.x - m.x
        const dy = target.current.y - m.y
        const d = Math.hypot(dx, dy) || 1
        if (d > 4) { m.vx += (dx / d) * 0.55; m.vy += (dy / d) * 0.55 }
      }

      // Them: drive at the ball, but aim at the side of it that sends the
      // ball my way. A car that drove straight at the ball would be useless.
      const f = foe.current
      const b = ball.current
      const aimX = b.x
      const aimY = b.y - 16
      const fdx = aimX - f.x
      const fdy = aimY - f.y
      const fd = Math.hypot(fdx, fdy) || 1
      f.vx += (fdx / fd) * 0.42
      f.vy += (fdy / fd) * 0.42

      for (const c of [m, f]) {
        c.vx *= 0.92
        c.vy *= 0.92
        c.x = Math.max(CAR, Math.min(W - CAR, c.x + c.vx))
        c.y = Math.max(CAR, Math.min(H - CAR, c.y + c.vy))
      }

      b.vx *= 0.985
      b.vy *= 0.985
      b.x += b.vx
      b.y += b.vy
      if (b.x < BALL) { b.x = BALL; b.vx = Math.abs(b.vx) }
      if (b.x > W - BALL) { b.x = W - BALL; b.vx = -Math.abs(b.vx) }

      bump(m, b, CAR, BALL, 1.15)
      bump(f, b, CAR, BALL, 1.15)
      // Cars shove each other too, which is most of the fun.
      bump(m, f, CAR, CAR, 0.5)

      const inMouth = Math.abs(b.x - W / 2) < GOAL_W / 2
      if (b.y < BALL) {
        if (inMouth) {
          score.current.mine += 1
          setMine(score.current.mine)
          kickOff(true)
        } else { b.y = BALL; b.vy = Math.abs(b.vy) }
      } else if (b.y > H - BALL) {
        if (inMouth) {
          score.current.theirs += 1
          setTheirs(score.current.theirs)
          kickOff(false)
        } else { b.y = H - BALL; b.vy = -Math.abs(b.vy) }
      }

      redraw((n) => n + 1)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const toArena = (e) => {
    const box = area.current?.getBoundingClientRect()
    if (!box) return null
    const scale = W / box.width
    return { x: (e.clientX - box.left) * scale, y: (e.clientY - box.top) * scale }
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">Shove the ball into the top goal.</p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        You {mine} – {theirs} Them · {left}s
      </p>

      <div
        ref={area}
        role="application"
        aria-label="Turbo Ball. Drag to drive your car."
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); target.current = toArena(e) }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') target.current = toArena(e) }}
        onPointerUp={() => { target.current = null }}
        className="mx-auto"
        style={{
          width: '100%',
          maxWidth: W,
          aspectRatio: `${W} / ${H}`,
          borderRadius: 14,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, var(--good) 10%, transparent)',
          touchAction: 'none',
          overflow: 'hidden',
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true">
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--line)" strokeDasharray="6 6" />
          <rect x={(W - GOAL_W) / 2} y={0} width={GOAL_W} height={6} fill="var(--accent-2)" />
          <rect x={(W - GOAL_W) / 2} y={H - 6} width={GOAL_W} height={6} fill="var(--accent)" />
          <circle cx={foe.current.x} cy={foe.current.y} r={CAR} fill="var(--bad)" />
          <circle cx={me.current.x} cy={me.current.y} r={CAR} fill="var(--accent)" />
          <circle cx={ball.current.x} cy={ball.current.y} r={BALL} fill="var(--ink)" />
        </svg>
      </div>

      <p className="text-xs text-muted mt-3">
        You are the blue car. You cannot carry the ball, only hit it — so think about the angle.
      </p>
    </div>
  )
}
