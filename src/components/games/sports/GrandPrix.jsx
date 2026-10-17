import { useEffect, useRef, useState } from 'react'

/**
 * Formula 1: the start, then one flying lap.
 *
 * Not a driving game. The two things that actually decide a Grand Prix and
 * fit in a phone-sized minigame are the launch — five lights out and your
 * reaction — and braking: every corner has a point where you have to get off
 * the throttle, and a tenth early or late is the whole difference.
 *
 * A false start costs you. It has to, or the only strategy is to hold the
 * button down before the lights go out.
 */

const CORNERS = 6
const REACTION_TARGET = 250 // ms. A very good human start, not a robot one.

export default function GrandPrix({ onDone }) {
  const [phase, setPhase] = useState('lights')
  const [lights, setLights] = useState(0)
  const [say, setSay] = useState('Five lights…')
  const [corner, setCorner] = useState(0)
  const [marker, setMarker] = useState(0)
  const [results, setResults] = useState([])
  const [jumped, setJumped] = useState(false)

  const litAt = useRef(0)
  const live = useRef({ marker: 0, dir: 1, phase: 'lights' })
  const zone = useRef({ from: 55, to: 72 })
  const raf = useRef(0)
  const timers = useRef([])
  const done = useRef(false)

  live.current.phase = phase

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    cancelAnimationFrame(raf.current)
  }, [])

  // The start sequence: lights on one at a time, then a random hold, then out.
  useEffect(() => {
    for (let i = 1; i <= 5; i += 1) {
      timers.current.push(setTimeout(() => setLights(i), i * 620))
    }
    timers.current.push(setTimeout(() => {
      setLights(0)
      setSay('GO!')
      litAt.current = Date.now()
    }, 5 * 620 + 700 + Math.random() * 1600))
  }, [])

  // The braking marker, once the race is running.
  useEffect(() => {
    const step = () => {
      if (done.current) return
      raf.current = requestAnimationFrame(step)
      if (live.current.phase !== 'racing') return
      let next = live.current.marker + live.current.dir * 1.9
      if (next >= 100) { next = 100; live.current.dir = -1 }
      if (next <= 0) { next = 0; live.current.dir = 1 }
      live.current.marker = next
      setMarker(next)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const finish = (all, reaction) => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    timers.current.forEach(clearTimeout)
    const corners = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length)
    // The lap is most of it; the start is worth a fifth, which is about what
    // it is worth in a real race.
    const launch = reaction === null ? 0 : Math.max(0, 1 - Math.max(0, reaction - REACTION_TARGET) / 700)
    onDone(Math.max(0, Math.min(100, Math.round(corners * 0.8 + launch * 20))))
  }

  const react = useRef(null)

  const tap = () => {
    if (done.current) return

    if (phase === 'lights') {
      if (!litAt.current) {
        // Jumped the start. In a real race that is a penalty, so it is one here.
        setJumped(true)
        setSay('Jump start — five second penalty.')
        react.current = 1200
        litAt.current = Date.now()
      } else {
        react.current = Date.now() - litAt.current
        setSay(react.current < 300 ? `${react.current}ms — brilliant launch.` : `${react.current}ms away.`)
      }
      setPhase('racing')
      // The first braking zone, and a new one for every corner after it.
      zone.current = { from: 40 + Math.random() * 35, to: 0 }
      zone.current.to = zone.current.from + 16
      return
    }

    if (phase !== 'racing') return
    const m = live.current.marker
    const { from, to } = zone.current
    const mid = (from + to) / 2
    // Inside the zone scores on how near the middle; outside it falls away
    // with distance, so a small mistake is a small loss.
    const points = m >= from && m <= to
      ? Math.round(100 - (Math.abs(m - mid) / ((to - from) / 2)) * 25)
      : Math.max(0, Math.round(55 - Math.min(Math.abs(m - from), Math.abs(m - to)) * 2.2))

    const all = [...results, points]
    setResults(all)
    setSay(points >= 80 ? 'Perfect apex.' : points >= 45 ? 'Scruffy, but through.' : 'Ran wide.')

    if (all.length >= CORNERS) { finish(all, react.current); return }
    setCorner(corner + 1)
    const from2 = 18 + Math.random() * 60
    zone.current = { from: from2, to: from2 + Math.max(11, 18 - all.length) }
  }

  const { from, to } = zone.current

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {phase === 'lights' ? 'Wait for the lights to go out.' : `Corner ${Math.min(corner + 1, CORNERS)} of ${CORNERS}`}
      </p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 22 }}>
        {results.length
          ? `${Math.round(results.reduce((a, b) => a + b, 0) / results.length)} average`
          : '🏎️ Lights out'}
      </p>
      <p className="text-sm mb-3" style={{ color: jumped ? 'var(--bad)' : 'var(--accent)' }}>{say}</p>

      {phase === 'lights' ? (
        <div className="flex justify-center gap-2 my-6" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: n <= lights ? 'var(--bad)' : 'color-mix(in srgb, var(--ink) 12%, transparent)',
                boxShadow: n <= lights ? '0 0 18px -3px var(--bad)' : 'none',
                transition: 'background 100ms linear',
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="relative mx-auto my-5"
          style={{
            width: '100%',
            maxWidth: 280,
            height: 30,
            borderRadius: 15,
            border: '2px solid var(--line)',
            background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
            overflow: 'hidden',
          }}
        >
          <div
            className="absolute"
            style={{
              left: `${from}%`,
              width: `${to - from}%`,
              top: 0,
              bottom: 0,
              background: 'color-mix(in srgb, var(--good) 45%, transparent)',
            }}
          />
          <div
            className="absolute"
            style={{ left: `${marker}%`, top: 0, bottom: 0, width: 5, background: 'var(--accent)', transform: 'translateX(-50%)' }}
          />
        </div>
      )}

      <button type="button" className="btn btn-primary w-full" style={{ maxWidth: 280 }} onClick={tap}>
        {phase === 'lights' ? 'GO when they go out' : 'Brake'}
      </button>

      <p className="text-xs text-muted mt-3">
        {phase === 'lights'
          ? 'Tap the moment the lights go out — but not before.'
          : 'Hit the green braking zone. The nearer the middle, the better the corner.'}
      </p>
    </div>
  )
}
