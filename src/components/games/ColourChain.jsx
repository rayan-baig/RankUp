import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Colour Chain. The app plays a sequence; you play it back. It gets one
 * longer every time you get it right.
 *
 * Deliberately a different kind of memory from Memory Match. That one is
 * spatial and patient — turn cards over, remember where things were. This is
 * sequential and tense: the chain is short enough to feel easy right up to the
 * moment it is not, and the failure is always your own fault, which is what
 * makes somebody spend their next token.
 *
 * Nothing here is timed. A child who wants to sit and think before each tap
 * should be allowed to, and a clock would turn a memory game into a reflex
 * game that happens to use memory.
 */

const PADS = [
  { id: 0, hue: 155, label: 'green' },
  { id: 1, hue: 10, label: 'red' },
  { id: 2, hue: 205, label: 'blue' },
  { id: 3, hue: 45, label: 'yellow' },
]

// Ten is a long chain. Past that the game stops being about memory and starts
// being about whether anybody has the patience to watch the replay.
const TARGET = 10

export default function ColourChain({ onDone }) {
  const [chain, setChain] = useState([])
  const [lit, setLit] = useState(null)
  const [showing, setShowing] = useState(true)
  const [step, setStep] = useState(0)
  const [wrong, setWrong] = useState(false)
  const timers = useRef([])
  const done = useRef(false)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  /** Play the chain back, then hand over. */
  const playBack = useCallback((seq) => {
    setShowing(true)
    setStep(0)
    clearTimers()
    // It speeds up as the chain grows, or a ten-long replay is a long wait.
    const beat = Math.max(320, 620 - seq.length * 28)
    seq.forEach((pad, i) => {
      timers.current.push(setTimeout(() => setLit(pad), i * beat))
      timers.current.push(setTimeout(() => setLit(null), i * beat + beat * 0.55))
    })
    timers.current.push(setTimeout(() => setShowing(false), seq.length * beat + 180))
  }, [])

  // Start, and grow the chain after each success.
  useEffect(() => {
    const next = [...chain, Math.floor(Math.random() * PADS.length)]
    setChain(next)
    playBack(next)
    // Only ever runs when the round number changes, which is what `chain.length`
    // being the dependency expresses — adding `chain` would loop forever.
  }, [])

  const finish = (score) => {
    if (done.current) return
    done.current = true
    clearTimers()
    onDone(Math.max(0, Math.min(100, Math.round(score))))
  }

  const tap = (pad) => {
    if (showing || done.current) return

    if (pad !== chain[step]) {
      setWrong(true)
      setLit(pad)
      // A beat to see what you got wrong, which is the part people replay for.
      timers.current.push(setTimeout(() => finish(((chain.length - 1) / TARGET) * 100), 700))
      return
    }

    setLit(pad)
    timers.current.push(setTimeout(() => setLit(null), 160))

    if (step + 1 < chain.length) {
      setStep(step + 1)
      return
    }

    if (chain.length >= TARGET) {
      finish(100)
      return
    }

    // Round survived: one longer.
    timers.current.push(setTimeout(() => {
      const next = [...chain, Math.floor(Math.random() * PADS.length)]
      setChain(next)
      playBack(next)
    }, 600))
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {wrong ? 'Not that one.' : showing ? 'Watch…' : 'Your turn'}
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 22 }}>
        Chain of {chain.length}
      </p>

      <div className="grid grid-cols-2 gap-3 mx-auto" style={{ maxWidth: 260 }}>
        {PADS.map((pad) => {
          const on = lit === pad.id
          return (
            <button
              key={pad.id}
              type="button"
              aria-label={pad.label}
              disabled={showing}
              onClick={() => tap(pad.id)}
              className="transition-transform active:scale-95"
              style={{
                height: 112,
                borderRadius: 18,
                border: '2px solid rgb(255 255 255 / 0.12)',
                // Lit pads jump in lightness rather than changing hue, so the
                // four stay tellable apart by somebody who is colour blind —
                // and each has a name on it for a screen reader.
                background: `hsl(${pad.hue} 70% ${on ? 62 : 26}%)`,
                boxShadow: on ? `0 0 26px -4px hsl(${pad.hue} 80% 55%)` : 'none',
                transition: 'background 120ms linear, box-shadow 120ms linear',
              }}
            />
          )
        })}
      </div>

      <p className="text-xs text-muted mt-3">
        Get to {TARGET} for a perfect round.
      </p>
    </div>
  )
}
