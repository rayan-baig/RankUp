import { useEffect, useRef, useState } from 'react'
import { Crowd, Floodlights, GoalNet, Person } from './scenery.jsx'

/**
 * Football: a penalty shootout, five each way, in a stadium.
 *
 * The old version was one tap on a grid, which is not what taking a penalty
 * is like. Three things decide a real penalty and all three are here:
 *
 *  - The RUN-UP. A long run-up gets power behind it and commits you early,
 *    which is exactly what a goalkeeper is watching for. A short one keeps
 *    him waiting but you cannot hit it as hard. That is a genuine trade,
 *    and the keeper here actually uses it: after a long run-up he dives
 *    sooner and guesses better.
 *  - WHERE. Six places to put it, and the corners are better but smaller —
 *    aim at the top corner and a scruffy strike misses the target
 *    altogether, which is why professionals still blaze them over the bar.
 *  - The KEEPER. He guesses. He does not read your tap, because a keeper
 *    who knew where it was going would be unbeatable and an obvious cheat.
 *    He leans the way people actually shoot, so going against the odds is
 *    a real option.
 *
 * Then you go in goal for five, which is the half that makes it a shootout
 * rather than a shooting drill.
 */

const SPOTS = [
  { id: 0, name: 'top left', x: 24, y: 24, corner: true },
  { id: 1, name: 'top middle', x: 50, y: 21, corner: false },
  { id: 2, name: 'top right', x: 76, y: 24, corner: true },
  { id: 3, name: 'bottom left', x: 24, y: 45, corner: true },
  { id: 4, name: 'bottom middle', x: 50, y: 47, corner: false },
  { id: 5, name: 'bottom right', x: 76, y: 45, corner: true },
]

const ROUNDS = 5
// Where people actually shoot: wide and low far more often than straight.
const KEEPER_LEAN = [0.2, 0.07, 0.2, 0.23, 0.07, 0.23]

const guess = () => {
  const roll = Math.random()
  let run = 0
  for (let i = 0; i < KEEPER_LEAN.length; i += 1) {
    run += KEEPER_LEAN[i]
    if (roll <= run) return i
  }
  return 5
}

export default function Football({ onDone }) {
  const [phase, setPhase] = useState('runup')
  const [half, setHalf] = useState('taking')
  const [round, setRound] = useState(1)
  const [mine, setMine] = useState(0)
  const [theirs, setTheirs] = useState(0)
  const [power, setPower] = useState(0)
  const [locked, setLocked] = useState(null)
  const [ball, setBall] = useState(null)
  const [keeper, setKeeper] = useState(null)
  const [stride, setStride] = useState(0)
  const [say, setSay] = useState('Set your run-up. Longer is harder to hit, and he reads it.')

  const live = useRef({ power: 0, dir: 1, phase: 'runup', mine: 0, theirs: 0 })
  const raf = useRef(0)
  const done = useRef(false)

  live.current.phase = phase

  const finish = (m, t) => {
    if (done.current) return
    done.current = true
    cancelAnimationFrame(raf.current)
    const scored = (m / ROUNDS) * 45
    const saved = ((ROUNDS - t) / ROUNDS) * 45
    onDone(Math.max(0, Math.min(100, Math.round(scored + saved + (m > t ? 10 : 0)))))
  }

  useEffect(() => {
    const step = () => {
      if (done.current) return
      raf.current = requestAnimationFrame(step)
      const s = live.current
      if (s.phase !== 'runup') return
      s.power += s.dir * 1.9
      if (s.power >= 100) { s.power = 100; s.dir = -1 }
      if (s.power <= 0) { s.power = 0; s.dir = 1 }
      setPower(s.power)
      setStride((s.power / 100) * 2)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const nextRound = (m, t) => {
    setTimeout(() => {
      if (done.current) return
      setBall(null)
      setKeeper(null)
      setLocked(null)
      if (half === 'taking') {
        if (round < ROUNDS) {
          setRound(round + 1)
          setPhase('runup')
          setSay('Set your run-up.')
        } else {
          setHalf('keeping')
          setRound(1)
          setPhase('dive')
          setSay('Now you go in goal. Pick where to dive — you have to commit.')
        }
        return
      }
      if (round < ROUNDS) {
        setRound(round + 1)
        setPhase('dive')
        setSay('Pick where to dive.')
      } else {
        finish(m, t)
      }
    }, 1500)
  }

  const lockRunUp = () => {
    if (phase !== 'runup' || done.current) return
    live.current.phase = 'aim'
    setPhase('aim')
    setSay(power > 66
      ? 'A long run-up. Plenty of power, but he has seen it.'
      : power > 33
        ? 'A steady run-up.'
        : 'Barely a step. He will have to wait for you.')
  }

  const shoot = (spot) => {
    if (phase !== 'aim' || done.current) return
    const s = live.current
    setPhase('watch')
    setLocked(spot.id)

    /*
     * A long run-up gives the keeper a better read. A short one gives you
     * less power, and a weak shot into a corner is the one he reaches.
     */
    const read = 0.18 + (s.power / 100) * 0.26
    const dived = Math.random() < read ? spot.id : guess()
    setKeeper(dived)
    setBall(spot.id)

    // Corners are better but less forgiving: a soft, hurried strike at the
    // top corner is how penalties end up in the crowd.
    const control = 0.45 + (s.power / 100) * 0.5
    const missed = spot.corner && Math.random() > control
    const saved = dived === spot.id && Math.random() < 0.82

    setTimeout(() => {
      if (missed) {
        setSay('Over the bar. Into the crowd.')
      } else if (saved) {
        setSay('Saved! He went the right way.')
      } else {
        s.mine += 1
        setMine(s.mine)
        setSay(spot.corner ? 'Top corner. Unstoppable.' : 'Scores.')
      }
      nextRound(s.mine, s.theirs)
    }, 750)
  }

  const dive = (spot) => {
    if (phase !== 'dive' || done.current) return
    const s = live.current
    setPhase('watch')
    const struck = guess()
    setKeeper(spot.id)
    setBall(struck)

    setTimeout(() => {
      if (spot.id === struck && Math.random() < 0.85) {
        setSay('Saved it! Right way, strong hand.')
      } else {
        s.theirs += 1
        setTheirs(s.theirs)
        setSay(spot.id === struck ? 'Got a hand to it, but it is in.' : 'Wrong way. In the net.')
      }
      nextRound(s.mine, s.theirs)
    }, 750)
  }

  const taking = half === 'taking'
  const choosing = (taking && phase === 'aim') || (!taking && phase === 'dive')

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {taking ? `Penalty ${round} of ${ROUNDS}` : `In goal — kick ${round} of ${ROUNDS}`}
      </p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 24 }}>
        ⚽ You {mine} – {theirs} Them
      </p>
      <p className="text-sm mb-2" style={{ color: 'var(--accent)', minHeight: 20 }}>{say}</p>

      <div
        className="mx-auto mb-3"
        style={{
          width: '100%', maxWidth: 320, aspectRatio: '8 / 7',
          borderRadius: 12, overflow: 'hidden', border: '2px solid var(--line)',
        }}
      >
        <svg viewBox="0 0 100 88" width="100%" height="100%" aria-hidden="true">
          <rect x="0" y="0" width="100" height="88" fill="#0b1220" />
          <Floodlights y={3} />
          <Crowd y={9} height="14" rows={3} seed={3} />

          {/* the pitch, running away from us towards the goal */}
          <polygon points="0,88 100,88 86,23 14,23" fill="#15803d" />
          <polygon points="0,88 100,88 86,23 14,23" fill="url(#none)" opacity="0" />
          {[32, 44, 58, 72].map((y) => (
            <line key={y} x1={14 + (88 - y) * 0.02} y1={y} x2={86 - (88 - y) * 0.02} y2={y} stroke="#16a34a" strokeWidth="2.6" opacity="0.35" />
          ))}
          <rect x="22" y="23" width="56" height="30" fill="none" stroke="#f8fafc" strokeWidth="0.4" opacity="0.5" />

          <GoalNet x={18} y={20} w={64} h={30} />

          {/* the keeper, on his line */}
          <g style={{ transition: 'transform 320ms ease' }}
            transform={keeper === null ? 'translate(0 0)' : `translate(${SPOTS[keeper].x - 50} ${(SPOTS[keeper].y - 34) * 0.35})`}
          >
            <Person x="50" y="50" scale="1.5" shirt="#facc15" shorts="#111827" facing={1} swing={keeper === null ? 0 : 0.8} />
          </g>

          {/* the six places you can put it */}
          {choosing && SPOTS.map((s) => (
            <g key={s.id}>
              <circle
                cx={s.x} cy={s.y} r={s.corner ? 4.4 : 5.6}
                fill="var(--accent)" opacity="0.16"
                stroke="var(--accent)" strokeWidth="0.5" strokeDasharray="1.5 1.2"
              />
            </g>
          ))}

          {/* the ball: on the spot, or on its way */}
          <circle
            cx={ball === null ? 50 : SPOTS[ball].x}
            cy={ball === null ? 72 : SPOTS[ball].y}
            r={ball === null ? 2.2 : 1.7}
            fill="#fff" stroke="#0f172a" strokeWidth="0.4"
            style={{ transition: 'cx 420ms ease, cy 420ms ease, r 420ms ease' }}
          />

          {/* the taker, walking back for the run-up */}
          {taking && (
            <Person
              x="50" y={84 - (phase === 'runup' ? power * 0.04 : 0)}
              scale="1.7" shirt="#2563eb" shorts="#1e3a8a"
              facing={1} run={stride} swing={phase === 'watch' ? 0.9 : 0}
            />
          )}
        </svg>
      </div>

      {taking && phase === 'runup' && (
        <>
          <div
            className="relative mx-auto mb-2"
            style={{
              width: '100%', maxWidth: 280, height: 22, borderRadius: 11,
              border: '2px solid var(--line)',
              background: 'color-mix(in srgb, var(--ink) 8%, transparent)', overflow: 'hidden',
            }}
          >
            <div className="absolute" style={{ left: 0, width: `${power}%`, top: 0, bottom: 0, background: 'linear-gradient(90deg, var(--good), var(--accent-2), var(--bad))' }} />
          </div>
          <button type="button" className="btn btn-primary w-full" style={{ maxWidth: 280 }} onClick={lockRunUp}>
            Stop the run-up
          </button>
          <p className="text-xs text-muted mt-2">
            More run-up means more power — and a keeper who has worked out where you are going.
          </p>
        </>
      )}

      {choosing && (
        <>
          <div className="grid grid-cols-3 gap-2 mx-auto" style={{ maxWidth: 300 }}>
            {SPOTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="btn btn-soft"
                style={{ padding: '10px 4px', minHeight: 0, fontSize: 12 }}
                onClick={() => (taking ? shoot(s) : dive(s))}
              >
                {s.name}
                {taking && s.corner && <span className="block text-muted" style={{ fontSize: 10 }}>harder</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            {taking
              ? 'Corners beat a keeper who guesses right — but miss by a little and it is over the bar.'
              : 'You have to commit before he strikes it. Guess right and you save it.'}
          </p>
        </>
      )}

      {locked !== null && phase === 'watch' && (
        <p className="text-xs text-muted mt-2">You went for the {SPOTS[locked].name}.</p>
      )}
    </div>
  )
}
