import { useRef, useState } from 'react'
import { freshDeck, bestOfSeven } from './pokerHands.js'
import PlayingCard from './PlayingCard.jsx'

/**
 * Texas Hold'em, heads-up, with no chips on the table.
 *
 * Two cards each, five shared, best five of your seven. What is missing
 * is betting — and what that leaves behind is the decision hold'em is
 * actually made of: you see more of the board at each stage and you
 * decide whether what you are holding is worth staying in for.
 *
 * So the scoring has to make folding a real choice rather than a way of
 * avoiding the game. A showdown you win is worth two, a fold is worth
 * one, a showdown you lose is worth nothing. Fold everything and you
 * finish on fifty; play everything and you finish on whatever your cards
 * were worth. Judgement beats both.
 *
 * The opponent folds on a weak board itself, which is why it is possible
 * to win a hand without reaching a showdown.
 */

const HANDS = 5
const STREETS = { preflop: 0, flop: 3, turn: 4, river: 5 }

export default function HoldEm({ onDone }) {
  const deck = useRef([])
  const [mine, setMine] = useState([])
  const [theirs, setTheirs] = useState([])
  const [board, setBoard] = useState([])
  const [street, setStreet] = useState('preflop')
  const [stage, setStage] = useState('ready')
  const [points, setPoints] = useState([])
  const [say, setSay] = useState('Five hands. No chips, no bets.')
  const finished = useRef(false)

  const finish = (all) => {
    if (finished.current) return
    finished.current = true
    onDone(Math.round((all.reduce((a, b) => a + b, 0) / (HANDS * 2)) * 100))
  }

  const nextHand = (all) => {
    if (all.length >= HANDS) { finish(all); return }
    deck.current = freshDeck()
    setMine([deck.current.pop(), deck.current.pop()])
    setTheirs([deck.current.pop(), deck.current.pop()])
    setBoard([])
    setStreet('preflop')
    setStage('decide')
    setSay('Stay in, or fold?')
  }

  const score = (n, message) => {
    const all = [...points, n]
    setPoints(all)
    setStage('shown')
    setSay(message)
    setTimeout(() => nextHand(all), 2100)
  }

  const showdown = (full) => {
    const me = bestOfSeven([...mine, ...full])
    const them = bestOfSeven([...theirs, ...full])
    setBoard(full)
    setStage('shown')
    if (me.score > them.score) score(2, `${me.hand.name} wins it.`)
    else if (me.score < them.score) score(0, `${them.hand.name} beats your ${me.hand.name.toLowerCase()}.`)
    // A split pot is nobody's win and nobody's mistake, so it scores
    // the same as a fold rather than as a loss.
    else score(1, `Split — you both have ${me.hand.name.toLowerCase()}.`)
  }

  const stay = () => {
    if (stage !== 'decide') return
    const order = ['preflop', 'flop', 'turn', 'river']
    const next = order[order.indexOf(street) + 1]
    const full = [...board]
    while (full.length < STREETS[next]) full.push(deck.current.pop())

    // The opponent gives up on a board that has missed it entirely, which
    // is the only way a hand ends before the river without you folding.
    //
    // Judged on the cards that are face up and nothing else. The first
    // version of this handed it the undealt cards so it could see how the
    // hand would finish, which made it fold exactly when it was about to
    // lose and stay exactly when it was about to win — an opponent that
    // can see the future is not difficult, it is broken.
    const seen = [...theirs, ...full]
    const theirBest = seen.length >= 5 ? bestOfSeven(seen) : null
    if (next !== 'river' && theirBest?.hand.id === 'high' && Math.random() < 0.35) {
      setBoard(full)
      setStreet(next)
      score(2, 'They folded. The hand is yours.')
      return
    }

    setBoard(full)
    setStreet(next)
    if (next === 'river') { showdown(full); return }
    setStage('decide')
    setSay(next === 'flop' ? 'The flop. Still in?' : 'The turn. Still in?')
  }

  const fold = () => {
    if (stage !== 'decide') return
    score(1, 'Folded. Nothing won, nothing lost.')
  }

  const total = points.reduce((a, b) => a + b, 0)
  const showTheirs = stage === 'shown'

  return (
    <div className="text-center">
      <p className="font-display font-extrabold mb-0.5" style={{ fontSize: 20 }}>
        Hand {Math.min(points.length + 1, HANDS)} of {HANDS}
      </p>
      <p className="text-sm text-muted mb-1">{total} of {HANDS * 2} points</p>
      <p className="text-sm mb-3" style={{ color: 'var(--accent)' }}>{say}</p>

      <p className="text-xs text-muted mb-1">Them</p>
      <div className="flex justify-center gap-1.5 mb-3" style={{ minHeight: 58 }}>
        {theirs.map((c, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <PlayingCard key={i} card={c} down={!showTheirs} size="sm" />
        ))}
      </div>

      <div
        className="flex justify-center gap-1.5 mb-3 py-2 rounded-xl"
        style={{
          minHeight: 72,
          background: 'color-mix(in srgb, var(--good) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--good) 30%, transparent)',
        }}
      >
        {board.length === 0
          ? <span className="text-xs text-muted self-center">Nothing on the table yet</span>
          // eslint-disable-next-line react/no-array-index-key
          : board.map((c, i) => <PlayingCard key={i} card={c} />)}
      </div>

      <p className="text-xs text-muted mb-1">You</p>
      <div className="flex justify-center gap-1.5 mb-4" style={{ minHeight: 66 }}>
        {/* eslint-disable-next-line react/no-array-index-key */}
        {mine.map((c, i) => <PlayingCard key={i} card={c} size="lg" />)}
      </div>

      {stage === 'ready' && (
        <button type="button" className="btn btn-primary w-full" style={{ maxWidth: 280 }} onClick={() => nextHand([])}>
          Deal
        </button>
      )}
      {stage === 'decide' && (
        <div className="flex gap-2 justify-center">
          <button type="button" className="btn btn-primary" style={{ minWidth: 118 }} onClick={stay}>Stay in</button>
          <button type="button" className="btn btn-soft" style={{ minWidth: 118 }} onClick={fold}>Fold</button>
        </div>
      )}
    </div>
  )
}
