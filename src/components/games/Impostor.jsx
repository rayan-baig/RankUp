import { useRef, useState } from 'react'
import { CREW, makePuzzle, sentence } from './crewPuzzle.js'

/**
 * Find the Impostor. Five crewmates, one of them is lying.
 *
 * The real game is a game about talking to people, and a single-player
 * version of that would be a pretence. So this is the part that survives
 * being played alone: the meeting. Everybody says one thing, the crew tell
 * the truth, the impostor does not, and exactly one answer fits.
 *
 * Every round is generated and then solved by brute force, and thrown away
 * unless exactly one crewmate could be guilty. A deduction game that is
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
        Meeting {round} of {ROUNDS} · {right} caught
      </p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 20 }}>
        {revealed
          ? chosen === puzzle.impostor ? 'Caught them.' : `It was ${CREW[puzzle.impostor].name}.`
          : 'One of them is lying.'}
      </p>
      <p className="text-xs text-muted mb-3">
        The crew always tell the truth. The impostor never does.
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
                style={{
                  width: 26, height: 30, borderRadius: '13px 13px 9px 9px',
                  background: who.colour, flex: '0 0 auto',
                  boxShadow: 'inset -4px -3px 0 rgb(0 0 0 / 0.18)',
                }}
              />
              <span className="min-w-0">
                <span className="block font-semibold text-sm">
                  {who.name}
                  {guilty && <span style={{ color: 'var(--bad)' }}> — the impostor</span>}
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
