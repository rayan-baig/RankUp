import { useEffect, useRef, useState } from 'react'
import { callScore, gameWonBy } from './tennisScore.js'

/**
 * Tennis. A real point: a serve, a rally, and a ball that can land out.
 *
 * It used to be Pong with a tennis ball on it, which it should not have
 * been. The things that actually make tennis tennis, and are all here now:
 *
 *  - The ball LANDS somewhere. It is not a dot bouncing off a bat — you aim
 *    at a spot on the other side of the net, and if you aim past the lines
 *    the point is theirs.
 *  - You have to GET THERE. A shot is only returned if the player is near
 *    where it lands, so running your opponent corner to corner is the way
 *    to win a point, exactly as it is in the real game.
 *  - Being stretched costs you. Hit while still running and the shot is
 *    less accurate, which is why the second shot of a wrong-footed rally is
 *    the one that goes out.
 *  - Fifteen, thirty, forty, deuce, advantage, and you cannot take a game
 *    by a single point from deuce.
 *
 * What is deliberately not modelled: spin, net height, and the second
 * serve. Each would add a rule to explain before a nine-year-old could
 * play, and none changes the shape of a point as much as the four above.
 */

// The court, in percentages of the box. The singles lines are 10 and 90;
// the net is halfway; the baselines are near the top and bottom edges.
const LEFT = 10
const RIGHT = 90
const NET = 50
const MY_BASE = 88
const THEIR_BASE = 12
const REACH = 17
const FLIGHT = 950

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export default function Tennis({ onDone }) {
  const [mine, setMine] = useState(0)
  const [theirs, setTheirs] = useState(0)
  const [phase, setPhase] = useState('serve')
  const [say, setSay] = useState('Your serve. Tap when the arrow is where you want it.')
  const [aim, setAim] = useState(50)
  const [me, setMe] = useState(50)
  const [foe, setFoe] = useState(50)
  const [ball, setBall] = useState({ x: 50, y: MY_BASE, show: false })
  const [mark, setMark] = useState(null)

  const area = useRef(null)
  const live = useRef({
    aim: 50, dir: 1, me: 50, foe: 50, phase: 'serve',
    flight: null, mine: 0, theirs: 0,
  })
  const raf = useRef(0)
  const done = useRef(false)

  live.current.phase = phase

  const finish = (m, t) => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    // Winning the game is most of the score; points won carry the rest, so
    // losing a long deuce game beats being brushed aside.
    const won = m > t ? 65 : 0
    const got = Math.min(35, m * 8)
    onDone(clamp(Math.round(won + got), 0, 100))
  }

  const point = (toMe, why) => {
    const s = live.current
    if (toMe) s.mine += 1; else s.theirs += 1
    setMine(s.mine)
    setTheirs(s.theirs)
    setSay(why)
    s.flight = null

    const over = gameWonBy(s.mine, s.theirs)
    if (over) {
      setPhase('over')
      setTimeout(() => finish(s.mine, s.theirs), 1600)
      return
    }
    setTimeout(() => {
      if (done.current) return
      setBall({ x: 50, y: MY_BASE, show: false })
      setMark(null)
      setPhase('serve')
      setSay(`${callScore(s.mine, s.theirs)}. Your serve.`)
    }, 1300)
  }

  /** Send the ball from one end to a spot at the other. */
  const hitTo = (fromX, fromY, toX, toY, byMe) => {
    live.current.flight = {
      fromX, fromY, toX, toY, byMe, at: Date.now(),
      out: toX < LEFT || toX > RIGHT || toY < 6 || toY > 94,
    }
    setMark({ x: toX, y: toY })
  }

  useEffect(() => {
    const step = () => {
      if (done.current) return
      raf.current = requestAnimationFrame(step)
      const s = live.current

      // The aiming arrow sweeps whenever it is your shot to play.
      if (s.phase === 'serve' || s.phase === 'swing') {
        s.aim += s.dir * 1.5
        if (s.aim > RIGHT + 6) { s.aim = RIGHT + 6; s.dir = -1 }
        if (s.aim < LEFT - 6) { s.aim = LEFT - 6; s.dir = 1 }
        setAim(s.aim)
      }

      const f = s.flight
      if (!f) return

      const t = clamp((Date.now() - f.at) / FLIGHT, 0, 1)
      const x = f.fromX + (f.toX - f.fromX) * t
      const y = f.fromY + (f.toY - f.fromY) * t
      setBall({ x, y, show: true })

      // While it is in the air, the opponent runs for where it will land.
      if (f.byMe) {
        // Imperfect: it leans towards the middle and arrives slightly late,
        // so a shot into the corner can beat it.
        const want = f.toX * 0.86 + 50 * 0.14
        s.foe += clamp(want - s.foe, -2.3, 2.3)
        setFoe(s.foe)
      }

      if (t < 1) return

      // The ball has landed. Everything is decided here.
      s.flight = null
      if (f.out) {
        point(!f.byMe, f.byMe ? 'Long. Out.' : 'Their shot is out — your point.')
        return
      }

      if (f.byMe) {
        const stretch = Math.abs(s.foe - f.toX)
        if (stretch > REACH) { point(true, 'A winner. They could not reach it.'); return }
        // They return it, and how stretched they were decides how good it is.
        const panic = clamp((stretch / REACH) * 1.15, 0, 1.15)
        const aimAt = clamp(
          50 + (Math.random() - 0.5) * 70 + (Math.random() - 0.5) * 34 * panic,
          LEFT - 4 - panic * 6,
          RIGHT + 4 + panic * 6,
        )
        const depth = MY_BASE - 6 - Math.random() * 22 + panic * 10
        setSay(stretch > REACH * 0.7 ? 'They scramble it back.' : 'Rally on.')
        setPhase('swing')
        hitTo(f.toX, f.toY, aimAt, Math.min(depth, 96), false)
        return
      }

      // Their shot landed on your side: can you get there?
      const stretch = Math.abs(s.me - f.toX)
      if (stretch > REACH) { point(false, 'Past you. Their point.'); return }
      setSay('Tap to play your shot.')
      setPhase('swing')
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  /** Your shot: the arrow gives the direction, your balance gives the rest. */
  const swing = () => {
    const s = live.current
    if (done.current) return

    if (s.phase === 'serve') {
      setPhase('rally')
      // A serve goes into the service box, so it is always a real shot even
      // if the arrow is at the edge of the sweep.
      const target = clamp(s.aim, LEFT + 3, RIGHT - 3)
      hitTo(50, MY_BASE, target, 30 + Math.random() * 8, true)
      setSay('Served.')
      return
    }
    if (s.phase !== 'swing' || s.flight) return

    setPhase('rally')
    // How far you had to stretch is how wild the shot is. This is the rule
    // that makes moving your feet matter.
    const landing = mark ? mark.x : s.me
    const stretch = clamp(Math.abs(s.me - landing) / REACH, 0, 1)
    const spray = (Math.random() - 0.5) * 26 * stretch
    const target = s.aim + spray
    const depth = THEIR_BASE + 4 + Math.random() * 24 - stretch * 10
    hitTo(landing, MY_BASE - 4, target, Math.max(depth, 4), true)
  }

  const moveTo = (clientX) => {
    const box = area.current?.getBoundingClientRect()
    if (!box) return
    const x = ((clientX - box.left) / box.width) * 100
    live.current.me = clamp(x, 2, 98)
    setMe(live.current.me)
  }

  const won = gameWonBy(mine, theirs)

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {won ? (won === 'me' ? 'Game, you.' : 'Game, them.') : say}
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        🎾 {callScore(mine, theirs)}
      </p>

      <div
        ref={area}
        role="application"
        aria-label="Tennis. Drag to move along the baseline, tap the button to play your shot."
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); moveTo(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') moveTo(e.clientX) }}
        className="mx-auto"
        style={{
          width: '100%',
          maxWidth: 300,
          aspectRatio: '3 / 4',
          borderRadius: 12,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, var(--good) 15%, transparent)',
          touchAction: 'none',
          overflow: 'hidden',
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
          {/* The lines, so "out" is something you can see rather than be told. */}
          <rect x={LEFT} y="6" width={RIGHT - LEFT} height="88" fill="none" stroke="#fff" strokeWidth="0.7" opacity="0.85" />
          <line x1="2" y1={NET} x2="98" y2={NET} stroke="#fff" strokeWidth="1.4" />
          <line x1={LEFT} y1="30" x2={RIGHT} y2="30" stroke="#fff" strokeWidth="0.5" opacity="0.7" />
          <line x1={LEFT} y1="70" x2={RIGHT} y2="70" stroke="#fff" strokeWidth="0.5" opacity="0.7" />
          <line x1="50" y1="30" x2="50" y2="70" stroke="#fff" strokeWidth="0.5" opacity="0.7" />

          {/* Where the last shot is going to land. */}
          {mark && (
            <circle cx={mark.x} cy={mark.y} r="2.6" fill="none" stroke="var(--accent-2)" strokeWidth="0.8" />
          )}

          {/* The aiming arrow, on their side, while it is your shot. */}
          {(phase === 'serve' || phase === 'swing') && (
            <g>
              <line x1={aim} y1="8" x2={aim} y2={NET - 2} stroke="var(--accent)" strokeWidth="1" opacity="0.8" />
              <circle cx={aim} cy="8" r="2" fill="var(--accent)" />
            </g>
          )}

          <circle cx={foe} cy={THEIR_BASE} r="4" fill="var(--bad)" />
          <circle cx={me} cy={MY_BASE} r="4" fill="var(--accent)" />
          {ball.show && <circle cx={ball.x} cy={ball.y} r="2.2" fill="#fbbf24" stroke="#000" strokeWidth="0.3" />}
        </svg>
      </div>

      <button
        type="button"
        className="btn btn-primary w-full mt-3"
        style={{ maxWidth: 300 }}
        disabled={phase === 'rally' || phase === 'over'}
        onClick={swing}
      >
        {phase === 'serve' ? 'Serve' : phase === 'swing' ? 'Hit it' : 'Watch the ball…'}
      </button>

      <p className="text-xs text-muted mt-3">
        Drag along your baseline to get behind the ball. Hitting on the run sprays the shot —
        move your feet and it goes where you aim.
      </p>
    </div>
  )
}
