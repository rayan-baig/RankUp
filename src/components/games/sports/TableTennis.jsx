import { useEffect, useRef, useState } from 'react'
import { Crowd, Person } from './scenery.jsx'

/**
 * Table tennis. Read the spin, choose the stroke, time the contact.
 *
 * It was Pong, which was fair criticism: a ball bouncing off a bat is the
 * one thing table tennis is not about at any level above a garage. What it
 * is actually about is spin. A ball arriving with heavy backspin will go
 * into the net if you drive it, and the same ball pushed back is fine. A
 * topspin loop pushed back pops up and gets smashed. Every player's first
 * real lesson is that the stroke has to match what is coming.
 *
 * So that is the game: three strokes, three kinds of incoming ball, and a
 * timing bar for how cleanly you hit it. The counters are the real ones:
 *
 *   backspin  → push it back, or loop it up over the spin
 *   topspin   → block it, or counter-drive through it
 *   float     → drive it, because nothing is stopping you
 *
 * Scored to eleven, serve changing every two points, win by two — which is
 * how the game has been scored since 2001 and is what anybody who plays
 * will expect to see.
 */

const STROKES = [
  { id: 'push', name: 'Push', hint: 'Short and under the ball', beats: ['backspin'], soft: ['float'] },
  { id: 'loop', name: 'Loop', hint: 'Brush up, heavy topspin', beats: ['backspin', 'float'], soft: ['topspin'] },
  { id: 'block', name: 'Block', hint: 'Bat still, let it come off', beats: ['topspin'], soft: [] },
  { id: 'drive', name: 'Drive', hint: 'Flat and hard', beats: ['float'], soft: ['topspin'] },
]

const INCOMING = [
  { id: 'backspin', name: 'Backspin', arrow: '↺', tint: '#60a5fa' },
  { id: 'topspin', name: 'Topspin', arrow: '↻', tint: '#f87171' },
  { id: 'float', name: 'Float', arrow: '–', tint: '#a3a3a3' },
]

const TO_WIN = 11

export default function TableTennis({ onDone }) {
  const [mine, setMine] = useState(0)
  const [theirs, setTheirs] = useState(0)
  const [incoming, setIncoming] = useState(INCOMING[2])
  const [bar, setBar] = useState(0)
  const [say, setSay] = useState('Your serve.')
  const [rally, setRally] = useState(0)
  const [resting, setResting] = useState(false)
  const [ball, setBall] = useState({ x: 50, y: 58, show: true })
  const [swing, setSwing] = useState(0)

  const live = useRef({ bar: 0, dir: 1, resting: false, mine: 0, theirs: 0, rally: 0 })
  const raf = useRef(0)
  const done = useRef(false)

  // Serve changes every two points, as it does in the real game.
  const served = (m, t) => (Math.floor((m + t) / 2) % 2 === 0)

  const finish = () => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    const { mine: m, theirs: t } = live.current
    const won = m > t ? 60 : 0
    onDone(Math.max(0, Math.min(100, Math.round(won + (m / TO_WIN) * 40))))
  }

  useEffect(() => {
    const step = () => {
      if (done.current) return
      raf.current = requestAnimationFrame(step)
      const s = live.current
      if (s.resting) return
      // The bar quickens as the rally goes on, because exchanges do.
      const speed = 2.2 + Math.min(2.4, s.rally * 0.28)
      s.bar += s.dir * speed
      if (s.bar >= 100) { s.bar = 100; s.dir = -1 }
      if (s.bar <= 0) { s.bar = 0; s.dir = 1 }
      setBar(s.bar)
      // The ball sits on whichever side is about to play it.
      setBall({ x: 24 + (s.bar / 100) * 52, y: 56 - Math.sin((s.bar / 100) * Math.PI) * 14, show: true })
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const point = (toMe, why) => {
    const s = live.current
    if (toMe) s.mine += 1; else s.theirs += 1
    setMine(s.mine)
    setTheirs(s.theirs)
    setSay(why)
    s.resting = true
    s.rally = 0
    setRally(0)
    setResting(true)

    const over = (s.mine >= TO_WIN || s.theirs >= TO_WIN) && Math.abs(s.mine - s.theirs) >= 2
    setTimeout(() => {
      if (done.current) return
      if (over) { finish(); return }
      s.resting = false
      s.bar = 0
      s.dir = 1
      setResting(false)
      setIncoming(INCOMING[2])
      setSay(served(s.mine, s.theirs) ? 'Your serve.' : 'Their serve — read the spin.')
    }, 1200)
  }

  const play = (stroke) => {
    const s = live.current
    if (done.current || s.resting) return

    const clean = Math.max(0, 1 - Math.abs(s.bar - 50) / 50)
    setSwing(1)
    setTimeout(() => setSwing(0), 220)

    const right = stroke.beats.includes(incoming.id)
    const awkward = stroke.soft.includes(incoming.id)

    /*
     * The wrong stroke against spin is an error almost regardless of how
     * well you time it, which is the whole lesson. The right stroke, timed
     * badly, is only a weak ball — you stay in the rally and pay for it on
     * the next shot.
     */
    if (!right && !awkward) {
      const into = incoming.id === 'backspin' ? 'into the net' : 'off the end of the table'
      point(false, `${stroke.name} against ${incoming.name.toLowerCase()} — ${into}.`)
      return
    }
    if (clean < 0.18) {
      point(false, 'Mistimed it completely.')
      return
    }

    // Quality of your shot: right stroke and clean contact is a problem for
    // them. Awkward stroke or scruffy contact gives them a free ball.
    const quality = (right ? 0.62 : 0.3) + clean * 0.38
    s.rally += 1
    setRally(s.rally)

    // Do they deal with it? A better shot makes them likelier to miss.
    const theyMiss = Math.random() < quality * 0.42
    if (theyMiss) {
      point(true, quality > 0.85 ? 'Winner — they never moved.' : 'They put it long.')
      return
    }

    // They return with a spin of their own. A weak shot from you invites
    // the attacking topspin; a strong one forces them to push.
    const roll = Math.random()
    const next = quality > 0.72
      ? (roll < 0.6 ? INCOMING[0] : INCOMING[2])
      : (roll < 0.62 ? INCOMING[1] : roll < 0.85 ? INCOMING[2] : INCOMING[0])
    setIncoming(next)
    setSay(right
      ? (clean > 0.75 ? 'Beautiful contact. It comes back.' : 'In play.')
      : 'Awkward, but you got it back.')
  }

  const serving = served(mine, theirs)
  const matchPoint = (mine >= TO_WIN - 1 || theirs >= TO_WIN - 1) && Math.abs(mine - theirs) >= 1

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">{say}</p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 22 }}>
        🏓 {mine} – {theirs}
      </p>
      <p className="text-xs text-muted mb-2">
        To {TO_WIN}, win by two · {serving ? 'your serve' : 'their serve'}
        {matchPoint ? ' · match point' : ''}
        {rally > 0 ? ` · rally of ${rally}` : ''}
      </p>

      <div
        className="mx-auto mb-3"
        style={{
          width: '100%', maxWidth: 320, aspectRatio: '8 / 5',
          borderRadius: 12, overflow: 'hidden', border: '2px solid var(--line)',
        }}
      >
        <svg viewBox="0 0 100 62" width="100%" height="100%" aria-hidden="true">
          <rect x="0" y="0" width="100" height="62" fill="#0b1220" />
          <Crowd y={0} height="16" rows={3} seed={7} />

          {/* the hall floor */}
          <rect x="0" y="16" width="100" height="46" fill="#1e3a5f" />
          <rect x="4" y="40" width="92" height="3" rx="1" fill="#0f172a" opacity="0.35" />

          {/* the table, seen slightly from above and the side */}
          <polygon points="18,38 82,38 92,54 8,54" fill="#1d4ed8" stroke="#f8fafc" strokeWidth="0.6" />
          <line x1="50" y1="38" x2="50" y2="54" stroke="#f8fafc" strokeWidth="0.4" opacity="0.8" />
          {/* the net, across the middle of the table */}
          <rect x="47.4" y="33" width="5.2" height="0.8" fill="#f8fafc" opacity="0" />
          <polygon points="49,38 51,38 51,54 49,54" fill="#0f172a" opacity="0" />
          <g>
            <rect x="46" y="40" width="8" height="0" fill="none" />
            <line x1="50" y1="38" x2="50" y2="54" stroke="#e2e8f0" strokeWidth="0.5" opacity="0" />
          </g>
          <rect x="49.2" y="33.5" width="1.6" height="0" fill="#fff" />
          <g opacity="0.95">
            <rect x="8" y="43.6" width="84" height="0.5" fill="#f8fafc" opacity="0" />
            <polygon points="46,36 54,36 56,56 44,56" fill="none" />
          </g>
          {/* net posts and mesh, drawn across the table's short axis */}
          <rect x="47" y="34" width="0.7" height="0" fill="#fff" />
          <g>
            <rect x="49.6" y="30" width="0.8" height="0" fill="#fff" />
          </g>
          <g>
            <rect x="8" y="45" width="84" height="0" fill="#fff" />
          </g>
          <g>
            <polygon points="50,36.6 50,55.4 50,55.4" fill="none" stroke="#fff" strokeWidth="0.4" />
            <rect x="49.3" y="36.4" width="1.4" height="19" fill="#e5e7eb" opacity="0.9" />
            <rect x="49.3" y="36.4" width="1.4" height="19" fill="url(#mesh)" opacity="0.5" />
          </g>

          {/* the two players, with bats */}
          <Person x="14" y="50" scale="1.25" shirt="#2563eb" facing={1} racket="bat" swing={swing} />
          <Person x="87" y="48" scale="1.15" shirt="#dc2626" facing={-1} racket="bat" flip />

          {/* the ball, and what it is doing */}
          {ball.show && (
            <g>
              <circle cx={ball.x} cy={ball.y} r="1.5" fill="#fff" stroke="#cbd5e1" strokeWidth="0.3" />
              <text x={ball.x} y={ball.y - 3} fontSize="4" textAnchor="middle" fill={incoming.tint}>
                {incoming.arrow}
              </text>
            </g>
          )}
        </svg>
      </div>

      <p className="text-sm mb-1">
        Coming at you:{' '}
        <span className="font-semibold" style={{ color: incoming.tint }}>
          {incoming.name} {incoming.arrow}
        </span>
      </p>

      <div
        className="relative mx-auto mb-3"
        style={{
          width: '100%', maxWidth: 280, height: 20, borderRadius: 10,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, var(--ink) 8%, transparent)', overflow: 'hidden',
        }}
      >
        <div className="absolute" style={{ left: '43%', width: '14%', top: 0, bottom: 0, background: 'color-mix(in srgb, var(--good) 45%, transparent)' }} />
        <div className="absolute" style={{ left: `${bar}%`, top: 0, bottom: 0, width: 4, background: 'var(--accent)', transform: 'translateX(-50%)' }} />
      </div>

      <div className="grid grid-cols-2 gap-2 mx-auto" style={{ maxWidth: 300 }}>
        {STROKES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={resting}
            onClick={() => play(s)}
            className="btn btn-soft text-left"
            style={{ padding: '8px 10px', minHeight: 0 }}
          >
            <span className="block text-sm font-semibold">{s.name}</span>
            <span className="block text-xs text-muted">{s.hint}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted mt-3">
        Backspin needs a push or a loop. Topspin needs a block. A float ball you can drive.
        Pick the stroke, then stop the bar in the green.
      </p>
    </div>
  )
}
