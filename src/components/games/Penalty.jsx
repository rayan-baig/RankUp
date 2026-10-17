import { useRef, useState } from 'react'

/**
 * Penalty Shootout. Five each way: you take five, then you go in goal.
 *
 * The sports game in the arcade, and penalties are the right sport to pick —
 * every round is one decision, which means a nine-year-old and a grown-up are
 * playing the same game, and nobody loses because their thumbs are slower.
 *
 * The keeper guesses rather than cheats. It picks a corner at random and gets
 * a small bonus for going the way people actually shoot, so a player who
 * notices that and goes against it does better. A keeper that read your tap
 * would be unbeatable and an obvious lie.
 */

const ZONES = [
  { id: 0, name: 'top left', x: 18, y: 26 },
  { id: 1, name: 'top middle', x: 50, y: 20 },
  { id: 2, name: 'top right', x: 82, y: 26 },
  { id: 3, name: 'bottom left', x: 18, y: 62 },
  { id: 4, name: 'bottom middle', x: 50, y: 66 },
  { id: 5, name: 'bottom right', x: 82, y: 62 },
]

const ROUNDS = 5

// People shoot low and wide far more than they shoot down the middle, and the
// keeper knowing that is what makes going down the middle a real option.
const KEEPER_BIAS = [0.2, 0.08, 0.2, 0.22, 0.08, 0.22]

const weightedZone = () => {
  const roll = Math.random()
  let run = 0
  for (let i = 0; i < KEEPER_BIAS.length; i += 1) {
    run += KEEPER_BIAS[i]
    if (roll <= run) return i
  }
  return ZONES.length - 1
}

export default function Penalty({ onDone }) {
  const [phase, setPhase] = useState('shoot')
  const [round, setRound] = useState(1)
  const [mine, setMine] = useState(0)
  const [theirs, setTheirs] = useState(0)
  const [ball, setBall] = useState(null)
  const [keeper, setKeeper] = useState(null)
  const [say, setSay] = useState('Pick a corner.')
  const [busy, setBusy] = useState(false)
  const done = useRef(false)

  const finish = (me, them) => {
    if (done.current) return
    done.current = true
    /*
     * Half the score is for goals scored, half for saves made, so a good
     * keeper who cannot finish still gets a decent round. Winning the
     * shootout is worth a bonus on top, which is what makes the last kick
     * matter.
     */
    const scored = (me / ROUNDS) * 45
    const saved = ((ROUNDS - them) / ROUNDS) * 45
    const won = me > them ? 10 : 0
    onDone(Math.max(0, Math.min(100, Math.round(scored + saved + won))))
  }

  const pick = (zone) => {
    if (busy || done.current) return
    setBusy(true)
    const guess = weightedZone()
    setBall(zone)
    setKeeper(guess)

    const beaten = zone !== guess
    setTimeout(() => {
      if (phase === 'shoot') {
        const me = mine + (beaten ? 1 : 0)
        setMine(me)
        setSay(beaten ? 'Goal!' : 'Saved.')
        setTimeout(() => {
          setBall(null)
          setKeeper(null)
          if (round < ROUNDS) {
            setRound(round + 1)
            setSay('Pick a corner.')
          } else {
            setPhase('save')
            setRound(1)
            setSay('Your turn in goal. Pick where to dive.')
          }
          setBusy(false)
        }, 1000)
        return
      }

      // In goal: the zone you picked is your dive, the keeper roll is the shot.
      const conceded = zone !== guess
      const them = theirs + (conceded ? 1 : 0)
      setTheirs(them)
      setSay(conceded ? 'In the net.' : 'Saved it!')
      setTimeout(() => {
        setBall(null)
        setKeeper(null)
        if (round < ROUNDS) {
          setRound(round + 1)
          setSay('Pick where to dive.')
          setBusy(false)
        } else {
          finish(mine, them)
        }
      }, 1000)
    }, 700)
  }

  const shooting = phase === 'shoot'

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {shooting ? `Taking penalty ${round} of ${ROUNDS}` : `In goal — kick ${round} of ${ROUNDS}`}
      </p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 26 }}>
        You {mine} – {theirs} Them
      </p>
      <p className="text-sm mb-3" style={{ color: 'var(--accent)' }}>{say}</p>

      <div
        className="relative mx-auto"
        style={{
          width: '100%',
          maxWidth: 320,
          aspectRatio: '16 / 10',
          borderRadius: 14,
          border: '3px solid var(--line)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--good) 14%, transparent), transparent)',
        }}
      >
        {/* The keeper, shown only once both have committed. */}
        {keeper !== null && (
          <div
            className="absolute text-3xl"
            style={{
              left: `${ZONES[keeper].x}%`,
              top: `${ZONES[keeper].y}%`,
              transform: 'translate(-50%, -50%)',
              transition: 'left 320ms ease, top 320ms ease',
            }}
            aria-hidden="true"
          >
            🧤
          </div>
        )}
        {ball !== null && (
          <div
            className="absolute text-2xl"
            style={{
              left: `${ZONES[ball].x}%`,
              top: `${ZONES[ball].y}%`,
              transform: 'translate(-50%, -50%)',
              transition: 'left 320ms ease, top 320ms ease',
            }}
            aria-hidden="true"
          >
            ⚽
          </div>
        )}

        <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-1 p-1">
          {ZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              disabled={busy}
              onClick={() => pick(z.id)}
              aria-label={shooting ? `Shoot ${z.name}` : `Dive ${z.name}`}
              style={{
                borderRadius: 8,
                border: '1px dashed color-mix(in srgb, var(--ink) 22%, transparent)',
                background: 'transparent',
              }}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-muted mt-3">
        {shooting
          ? 'Tap the part of the goal you are aiming at. The keeper guesses.'
          : 'Tap where you are diving. Guess right and you save it.'}
      </p>
    </div>
  )
}
