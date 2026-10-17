import { useRef, useState } from 'react'
import { freshDeck, rankHand, HANDS } from './pokerHands.js'

/**
 * Royal Draw. You are dealt five cards, you keep what you like, and the rest
 * are replaced once.
 *
 * Draw poker rather than a game against an opponent, deliberately. Poker
 * against a computer is mostly about bluffing, and a machine that cannot be
 * bluffed and does not bluff back is not poker — it is a slot machine
 * pretending. This version is the part that is really a game of judgement:
 * looking at five cards and deciding what to throw away.
 *
 * Nothing is bet and nothing is lost. The payout table is on screen the
 * whole time so the decision is informed rather than a guess.
 */

const HANDS_PER_ROUND = 5

export default function RoyalDraw({ onDone }) {
  const deck = useRef([])
  const [cards, setCards] = useState([])
  const [held, setHeld] = useState([])
  const [stage, setStage] = useState('ready')
  const [hand, setHand] = useState(0)
  const [results, setResults] = useState([])
  const [say, setSay] = useState('Tap deal to start.')
  const done = useRef(false)

  const finish = (all) => {
    if (done.current) return
    done.current = true
    const total = all.reduce((a, b) => a + b, 0)
    onDone(Math.max(0, Math.min(100, Math.round(total / all.length))))
  }

  const deal = () => {
    if (done.current) return
    if (deck.current.length < 10) deck.current = freshDeck()
    setCards(deck.current.splice(0, 5))
    setHeld([])
    setStage('draw')
    setSay('Tap the cards you want to keep.')
  }

  const draw = () => {
    if (stage !== 'draw' || done.current) return
    const next = cards.map((c, i) => (held.includes(i) ? c : deck.current.pop() || c))
    setCards(next)
    const made = rankHand(next)
    const all = [...results, made.pays]
    setResults(all)
    setHand(hand + 1)
    setStage('shown')
    setSay(made.pays > 0 ? `${made.name}.` : 'Nothing this time.')

    setTimeout(() => {
      if (all.length >= HANDS_PER_ROUND) { finish(all); return }
      deal()
    }, 1800)
  }

  const toggle = (i) => {
    if (stage !== 'draw') return
    setHeld(held.includes(i) ? held.filter((h) => h !== i) : [...held, i])
  }

  const average = results.length
    ? Math.round(results.reduce((a, b) => a + b, 0) / results.length)
    : 0

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        Hand {Math.min(hand + 1, HANDS_PER_ROUND)} of {HANDS_PER_ROUND}
      </p>
      <p className="font-display font-extrabold mb-1" style={{ fontSize: 22 }}>
        {results.length ? `${average} average` : 'Royal Draw'}
      </p>
      <p className="text-sm mb-3" style={{ color: 'var(--accent)' }}>{say}</p>

      <div className="flex justify-center gap-1.5 mb-3" style={{ minHeight: 92 }}>
        {cards.map((c, i) => {
          const red = c.suit === '♥' || c.suit === '♦'
          const keep = held.includes(i)
          return (
            <button
              // A hand is five fixed slots; the card inside a slot changes.
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              type="button"
              onClick={() => toggle(i)}
              disabled={stage !== 'draw'}
              aria-pressed={keep}
              aria-label={`${c.rank} of ${c.suit}${keep ? ', keeping' : ''}`}
              className="grid place-items-center font-display font-extrabold"
              style={{
                width: 54,
                height: 78,
                borderRadius: 9,
                background: '#fff',
                color: red ? '#dc2626' : '#111827',
                border: keep ? '3px solid var(--good)' : '2px solid rgb(0 0 0 / 0.18)',
                transform: keep ? 'translateY(-6px)' : 'none',
                transition: 'transform 140ms ease, border-color 140ms ease',
                fontSize: 17,
                lineHeight: 1.1,
              }}
            >
              <span>{c.rank}<br />{c.suit}</span>
            </button>
          )
        })}
      </div>

      {stage === 'ready' && (
        <button type="button" className="btn btn-primary w-full" style={{ maxWidth: 280 }} onClick={deal}>
          Deal
        </button>
      )}
      {stage === 'draw' && (
        <button type="button" className="btn btn-primary w-full" style={{ maxWidth: 280 }} onClick={draw}>
          {held.length === 5 ? 'Keep them all' : `Swap the other ${5 - held.length}`}
        </button>
      )}

      <div className="text-xs text-muted mt-4 mx-auto" style={{ maxWidth: 280 }}>
        {[...HANDS].reverse().filter((h) => h.pays > 0).map((h) => (
          <div key={h.id} className="flex justify-between">
            <span>{h.name}</span>
            <span>{h.pays}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
