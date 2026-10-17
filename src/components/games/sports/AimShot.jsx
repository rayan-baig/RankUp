import { useEffect, useRef, useState } from 'react'

/**
 * The shooting engine: pick your power, then pick your moment.
 *
 * Five of the ten sports are the same thing underneath — a golf swing, a
 * three-pointer, a field goal, a cricket shot and a swing at a fastball are
 * all "how hard, and exactly when". Writing them five times would mean five
 * chances to get the maths slightly wrong, so they share this and differ in
 * the numbers and the words, which is where the difference actually is.
 *
 * Two bars rather than one. A single bar makes the whole sport one tap, and
 * the second decision is what lets somebody get good at it: you can play safe
 * on power and take the harder timing, or the other way round.
 */

export default function AimShot({ sport, onDone }) {
  const {
    attempts, powerSpeed, aimSpeed, sweet, icon, target,
    powerLabel, aimLabel, verb, good, bad,
  } = sport

  const [stage, setStage] = useState('power')
  const [bar, setBar] = useState(0)
  const [power, setPower] = useState(null)
  const [shot, setShot] = useState(0)
  const [results, setResults] = useState([])
  const [say, setSay] = useState(powerLabel)
  const raf = useRef(0)
  const live = useRef({ bar: 0, go: 1, stage: 'power' })
  const done = useRef(false)

  live.current.stage = stage

  // One animation loop for both bars; the speed is whichever stage we are in.
  useEffect(() => {
    const step = () => {
      if (done.current) return
      raf.current = requestAnimationFrame(step)
      if (live.current.stage === 'rest') return
      const speed = live.current.stage === 'power' ? powerSpeed : aimSpeed
      let next = live.current.bar + live.current.go * speed
      if (next >= 100) { next = 100; live.current.go = -1 }
      if (next <= 0) { next = 0; live.current.go = 1 }
      live.current.bar = next
      setBar(next)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [powerSpeed, aimSpeed])

  const finish = (all) => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    const total = all.reduce((sum, r) => sum + r, 0)
    onDone(Math.max(0, Math.min(100, Math.round(total / all.length))))
  }

  const tap = () => {
    if (done.current || stage === 'rest') return

    if (stage === 'power') {
      setPower(live.current.bar)
      setStage('aim')
      live.current.bar = 0
      live.current.go = 1
      setSay(aimLabel)
      return
    }

    // Aim is scored on how close to the middle you stopped it; power on how
    // close to this sport's sweet spot. Both are forgiving near the mark and
    // fall away fast outside it, which is what makes a near miss feel near.
    const aimOff = Math.abs(live.current.bar - 50) / 50
    const powOff = Math.abs(power - sweet) / 100
    const quality = Math.max(0, 1 - aimOff * 1.25 - powOff * 1.1)
    const points = Math.round(quality * 100)

    const all = [...results, points]
    setResults(all)
    setShot(shot + 1)
    setSay(points >= 70 ? good : points >= 35 ? 'Close.' : bad)
    setStage('rest')

    setTimeout(() => {
      if (all.length >= attempts) { finish(all); return }
      setPower(null)
      live.current.bar = 0
      live.current.go = 1
      setStage('power')
      setSay(powerLabel)
    }, 1000)
  }

  const Bar = ({ value, tint, mark }) => (
    <div
      className="relative mx-auto mb-3"
      style={{
        width: '100%',
        maxWidth: 280,
        height: 22,
        borderRadius: 11,
        background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
        border: '2px solid var(--line)',
        overflow: 'hidden',
      }}
    >
      {mark !== undefined && (
        <div
          className="absolute"
          style={{ left: `${mark}%`, top: 0, bottom: 0, width: 3, background: 'var(--good)', transform: 'translateX(-50%)' }}
        />
      )}
      <div
        className="absolute"
        style={{ left: `${value}%`, top: 0, bottom: 0, width: 6, borderRadius: 3, background: tint, transform: 'translateX(-50%)' }}
      />
    </div>
  )

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {verb} {Math.min(shot + 1, attempts)} of {attempts}
      </p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 22 }}>
        {results.length ? `${Math.round(results.reduce((a, b) => a + b, 0) / results.length)} average` : target}
      </p>
      <p className="text-sm mb-3" style={{ color: 'var(--accent)' }}>{say}</p>

      <div className="text-5xl mb-3" aria-hidden="true">{icon}</div>

      {/* Power is locked in once chosen, so you can see what you committed to. */}
      <Bar value={power === null ? bar : power} tint={power === null ? 'var(--accent)' : 'var(--muted)'} mark={sweet} />
      {stage !== 'power' && <Bar value={bar} tint="var(--accent-2)" mark={50} />}

      <button
        type="button"
        className="btn btn-primary w-full"
        style={{ maxWidth: 280 }}
        disabled={stage === 'rest'}
        onClick={tap}
      >
        {stage === 'power' ? 'Set the power' : stage === 'aim' ? 'Now!' : '…'}
      </button>

      <p className="text-xs text-muted mt-3">
        Stop the first bar on the green mark for the best power, then stop the second one in the middle.
      </p>
    </div>
  )
}
