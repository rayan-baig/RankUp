import { useRef, useState } from 'react'
import { CREW, makePuzzle, sentence } from './crewPuzzle.js'

/**
 * Find the Fibber. Five friends, and the cookie jar is empty. One of them
 * is fibbing about it.
 *
 * A logic puzzle: everybody says one thing, the honest ones tell the
 * truth, the fibber does not, and exactly one answer fits.
 *
 * Every round is generated and then solved by brute force, and thrown away
 * unless exactly one friend could be guilty. A deduction game that is
 * sometimes unfair is worse than no deduction game: a child who reasons
 * correctly and is told they are wrong learns that thinking does not pay.
 */

const ROUNDS = 3

export default function Impostor({ onDone }) {
  const [round, setRound] = useState(1)
  const [puzzle, setPuzzle] = useState(makePuzzle)
  const [chosen, setChosen] = useState(null)
  const [right, setRight] = useState(0)
  const done = useRef(false)

  const finish = (correct) => {
    if (done.current) return
    done.current = true
    onDone(Math.round((correct / ROUNDS) * 100))
  }

  const accuse = (id) => {
    if (chosen !== null || done.current || !puzzle) return
    setChosen(id)
    const correct = right + (id === puzzle.impostor ? 1 : 0)
    setRight(correct)

    setTimeout(() => {
      if (round >= ROUNDS) { finish(correct); return }
      setRound(round + 1)
      setPuzzle(makePuzzle())
      setChosen(null)
    }, 2100)
  }

  if (!puzzle) return null

  const revealed = chosen !== null

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        Case {round} of {ROUNDS} · {right} caught
      </p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 20 }}>
        {revealed
          ? chosen === puzzle.impostor ? 'Caught them.' : `It was ${CREW[puzzle.impostor].name}.`
          : 'Who emptied the cookie jar?'}
      </p>
      <p className="text-xs text-muted mb-3">
        The honest ones always tell the truth. The fibber never does.
      </p>

      <div className="space-y-2">
        {puzzle.statements.map((s) => {
          const who = CREW[s.from]
          const guilty = revealed && s.from === puzzle.impostor
          const wrongPick = revealed && s.from === chosen && chosen !== puzzle.impostor
          return (
            <button
              key={who.id}
              type="button"
              disabled={revealed}
              onClick={() => accuse(who.id)}
              className="w-full text-left flex items-center gap-3"
              style={{
                borderRadius: 14,
                padding: '10px 12px',
                border: `2px solid ${guilty ? 'var(--bad)' : wrongPick ? 'var(--line)' : 'transparent'}`,
                background: guilty
                  ? 'color-mix(in srgb, var(--bad) 18%, transparent)'
                  : 'color-mix(in srgb, var(--ink) 5%, transparent)',
                opacity: revealed && !guilty ? 0.65 : 1,
                transition: 'background 200ms ease, opacity 200ms ease',
              }}
            >
              <span
                aria-hidden="true"
                className="grid place-items-center text-lg leading-none"
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: `color-mix(in srgb, ${who.colour} 30%, transparent)`, flex: '0 0 auto',
                  border: `2px solid ${who.colour}`,
                }}
              >
                {who.face}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-sm">
                  {who.name}
                  {guilty && <span style={{ color: 'var(--bad)' }}> — the fibber</span>}
                </span>
                <span className="block text-xs text-muted">&ldquo;{sentence(s)}&rdquo;</span>
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-muted mt-3">
        Tap whoever you think it is. No timer — every round has exactly one answer that fits.
      </p>
    </div>
  )
}
