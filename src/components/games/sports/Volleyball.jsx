import { useEffect, useRef, useState } from 'react'

/**
 * Volleyball. Bump, set, spike — and a block waiting on the other side.
 *
 * Three touches is the whole sport. Any version that is a ball bouncing
 * off a bat has thrown away the one rule everybody who has played it knows,
 * so this is built round it: every rally you get exactly three contacts,
 * each one a timed tap, and the quality of each feeds the next. A sloppy
 * bump makes the set harder, which makes the spike harder — which is
 * exactly how it goes wrong in a real game.
 *
 * Then the spike has to beat a block that moves. Hitting straight into it
 * loses the point, so the last decision is where to put it, not how hard.
 */

const TOUCHES = [
  { id: 'bump', name: 'Bump', hint: 'Get under it. Stop the bar in the middle.', speed: 2.4 },
  { id: 'set', name: 'Set', hint: 'Lift it for the spiker.', speed: 3.0 },
  { id: 'spike', name: 'Spike', hint: 'Now pick your spot — away from the block.', speed: 3.8 },
]
const RALLIES = 5

export default function Volleyball({ onDone }) {
  const [rally, setRally] = useState(1)
  const [touch, setTouch] = useState(0)
  const [bar, setBar] = useState(0)
  const [quality, setQuality] = useState([])
  const [points, setPoints] = useState(0)
  const [lost, setLost] = useState(0)
  const [block, setBlock] = useState(50)
  const [say, setSay] = useState('Here it comes.')
  const [resting, setResting] = useState(false)

  const live = useRef({ bar: 0, dir: 1, touch: 0, block: 50, blockDir: 1, resting: false })
  const raf = useRef(0)
  const done = useRef(false)

  const finish = (won) => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    onDone(Math.max(0, Math.min(100, Math.round((won / RALLIES) * 100))))
  }

  useEffect(() => {
    const step = () => {
      if (done.current) return
      raf.current = requestAnimationFrame(step)
      const s = live.current

      // The block drifts along the net the whole time, so where it is when
      // you spike is something you can watch and wait for.
      s.block += s.blockDir * 0.55
      if (s.block > 76) { s.block = 76; s.blockDir = -1 }
      if (s.block < 24) { s.block = 24; s.blockDir = 1 }
      setBlock(s.block)

      if (s.resting) return
      const speed = TOUCHES[s.touch].speed
      s.bar += s.dir * speed
      if (s.bar >= 100) { s.bar = 100; s.dir = -1 }
      if (s.bar <= 0) { s.bar = 0; s.dir = 1 }
      setBar(s.bar)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const tap = () => {
    const s = live.current
    if (done.current || s.resting) return

    // How near the middle you stopped it, 0 to 1.
    const clean = Math.max(0, 1 - Math.abs(s.bar - 50) / 50)
    const all = [...quality, clean]
    setQuality(all)

    if (s.touch < 2) {
      s.touch += 1
      setTouch(s.touch)
      s.bar = 0
      s.dir = 1
      setBar(0)
      setSay(clean > 0.7 ? 'Good hands.' : clean > 0.4 ? 'Scrappy, but up.' : 'Barely dug out.')
      return
    }

    /*
     * The spike. Where it goes is the bar; whether it gets through is that
     * plus how good the first two touches were. A perfect spike off a bad
     * set is still a hard ball to hit.
     */
    const placed = 24 + (s.bar / 100) * 52
    const pastBlock = Math.abs(placed - s.block) > 13
    const setUp = (all[0] + all[1]) / 2
    const landedIn = clean * 0.5 + setUp * 0.5 > 0.3

    const won = pastBlock && landedIn
    if (won) { setPoints((p) => p + 1); setSay('Kill! Straight down.') } else if (!pastBlock) {
      setLost((l) => l + 1)
      setSay('Blocked at the net.')
    } else {
      setLost((l) => l + 1)
      setSay('Into the net — the set was never there.')
    }

    s.resting = true
    setResting(true)
    setTimeout(() => {
      if (done.current) return
      if (rally >= RALLIES) { finish(points + (won ? 1 : 0)); return }
      setRally(rally + 1)
      setQuality([])
      s.touch = 0
      setTouch(0)
      s.bar = 0
      s.dir = 1
      s.resting = false
      setResting(false)
      setSay('Here it comes.')
    }, 1500)
  }

  const now = TOUCHES[touch]

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">{say}</p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 22 }}>
        🏐 {points} – {lost}
      </p>
      <p className="text-xs text-muted mb-3">
        Rally {Math.min(rally, RALLIES)} of {RALLIES} · touch {touch + 1} of 3
      </p>

      <div
        className="relative mx-auto mb-3"
        style={{
          width: '100%',
          maxWidth: 300,
          aspectRatio: '3 / 2',
          borderRadius: 12,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, #f59e0b 14%, transparent)',
          overflow: 'hidden',
        }}
      >
        <svg viewBox="0 0 100 66" width="100%" height="100%" aria-hidden="true">
          <line x1="0" y1="26" x2="100" y2="26" stroke="#fff" strokeWidth="1.6" />
          <rect x={block - 9} y="18" width="18" height="8" rx="3" fill="var(--bad)" opacity="0.9" />
          {/* The three touches, filling in as they happen. */}
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={30 + i * 20}
              cy="52"
              r="5"
              fill={i < touch ? 'var(--good)' : i === touch ? 'var(--accent)' : 'transparent'}
              stroke="var(--line)"
              strokeWidth="0.8"
            />
          ))}
        </svg>
      </div>

      <p className="text-sm font-semibold mb-1">{now.name}</p>
      <p className="text-xs text-muted mb-2">{now.hint}</p>

      <div
        className="relative mx-auto mb-3"
        style={{
          width: '100%', maxWidth: 280, height: 24, borderRadius: 12,
          border: '2px solid var(--line)',
          background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
          overflow: 'hidden',
        }}
      >
        {touch < 2 && (
          <div className="absolute" style={{ left: '44%', width: '12%', top: 0, bottom: 0, background: 'color-mix(in srgb, var(--good) 45%, transparent)' }} />
        )}
        <div className="absolute" style={{ left: `${bar}%`, top: 0, bottom: 0, width: 5, background: 'var(--accent)', transform: 'translateX(-50%)' }} />
      </div>

      <button type="button" className="btn btn-primary w-full" style={{ maxWidth: 280 }} disabled={resting} onClick={tap}>
        {touch === 2 ? 'Spike' : now.name}
      </button>

      <p className="text-xs text-muted mt-3">
        Three touches every rally. The red block slides along the net — spike away from it.
      </p>
    </div>
  )
}
