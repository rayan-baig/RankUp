import { useEffect, useRef, useState } from 'react'

/**
 * The rally engine: you at the bottom, the machine at the top, something
 * bouncing between you.
 *
 * Tennis, table tennis and air hockey are the same sport played with
 * different objects at different speeds, so they share this and differ in
 * the numbers. The opponent is deliberately imperfect: it tracks the ball
 * with a lag and a wobble, so it misses sometimes, and a human who hits the
 * ball into the corner it is drifting away from makes it miss more. An
 * opponent that simply matched the ball's position could never be beaten.
 */

const W = 300
const H = 400

export default function Rally({ sport, onDone }) {
  const { paddle: PW, speed, foeSkill, upTo, puck, icon, surface } = sport

  const [mine, setMine] = useState(0)
  const [theirs, setTheirs] = useState(0)
  const [, redraw] = useState(0)

  const area = useRef(null)
  const me = useRef(W / 2)
  const foe = useRef(W / 2)
  const ball = useRef({ x: W / 2, y: H / 2, vx: speed * 0.6, vy: speed })
  const score = useRef({ mine: 0, theirs: 0 })
  const raf = useRef(0)
  const done = useRef(false)

  useEffect(() => {
    const serve = (towardsMe) => {
      ball.current = {
        x: W / 2,
        y: H / 2,
        vx: (Math.random() - 0.5) * speed * 1.4,
        vy: towardsMe ? speed : -speed,
      }
    }

    const finish = () => {
      if (done.current) return
      done.current = true
      cancelAnimationFrame(raf.current)
      const { mine: m, theirs: t } = score.current
      // Winning is most of it, but points won still count — losing 5–4 is a
      // much better game than losing 5–0 and should not score the same.
      const won = m > t ? 60 : 0
      const got = (m / upTo) * 40
      onDone(Math.max(0, Math.min(100, Math.round(won + got))))
    }

    const step = () => {
      if (done.current) return
      const b = ball.current

      // The opponent chases with a lag, so a ball played across it beats it.
      const want = b.x + (Math.random() - 0.5) * 40
      foe.current += Math.max(-speed * foeSkill, Math.min(speed * foeSkill, want - foe.current))
      foe.current = Math.max(PW / 2, Math.min(W - PW / 2, foe.current))

      b.x += b.vx
      b.y += b.vy
      if (b.x < puck) { b.x = puck; b.vx = Math.abs(b.vx) }
      if (b.x > W - puck) { b.x = W - puck; b.vx = -Math.abs(b.vx) }

      const hit = (padX, atTop) => {
        const edge = atTop ? 22 : H - 22
        const coming = atTop ? b.vy < 0 : b.vy > 0
        if (!coming) return false
        if (Math.abs(b.y - edge) > puck + 6) return false
        if (Math.abs(b.x - padX) > PW / 2 + puck) return false
        // Where it strikes the bat decides the angle, same as the real thing.
        const off = (b.x - padX) / (PW / 2)
        b.vx = off * speed * 1.1
        b.vy = atTop ? Math.abs(b.vy) : -Math.abs(b.vy)
        b.y = atTop ? edge + puck + 6 : edge - puck - 6
        return true
      }
      hit(foe.current, true)
      hit(me.current, false)

      if (b.y < -20) {
        score.current.mine += 1
        setMine(score.current.mine)
        if (score.current.mine >= upTo) { finish(); return }
        serve(true)
      } else if (b.y > H + 20) {
        score.current.theirs += 1
        setTheirs(score.current.theirs)
        if (score.current.theirs >= upTo) { finish(); return }
        serve(false)
      }

      redraw((n) => n + 1)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [PW, speed, foeSkill, upTo, puck, onDone])

  const moveTo = (clientX) => {
    const box = area.current?.getBoundingClientRect()
    if (!box) return
    const x = (clientX - box.left) * (W / box.width)
    me.current = Math.max(PW / 2, Math.min(W - PW / 2, x))
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">First to {upTo}. Drag to move your bat.</p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        {icon} You {mine} – {theirs} Them
      </p>

      <div
        ref={area}
        role="application"
        aria-label="Rally. Drag left and right to move your bat."
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); moveTo(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') moveTo(e.clientX) }}
        className="mx-auto"
        style={{
          width: '100%',
          maxWidth: W,
          aspectRatio: `${W} / ${H}`,
          borderRadius: 14,
          border: '2px solid var(--line)',
          background: surface,
          touchAction: 'none',
          overflow: 'hidden',
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true">
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--line)" strokeDasharray="8 8" />
          <rect x={foe.current - PW / 2} y={14} width={PW} height={10} rx={5} fill="var(--bad)" />
          <rect x={me.current - PW / 2} y={H - 24} width={PW} height={10} rx={5} fill="var(--accent)" />
          <circle cx={ball.current.x} cy={ball.current.y} r={puck} fill="var(--ink)" />
        </svg>
      </div>

      <p className="text-xs text-muted mt-3">
        Hit it with the edge of the bat to send it across — that is how you beat the machine.
      </p>
    </div>
  )
}
