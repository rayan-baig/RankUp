import { useRef, useState } from 'react'
import { freshDeck } from './pokerHands.js'
import { handTotal, isBlackjack, dealerShouldHit, settle } from './cardRules.js'
import PlayingCard from './PlayingCard.jsx'

/**
 * Blackjack. Get closer to twenty-one than the dealer without going over.
 *
 * Nothing is bet and nothing is staked. That is not squeamishness: the
 * betting is the part of blackjack that is gambling, and the part that
 * is a game is the decision in front of you — sixteen against a dealer's
 * ten, hit or stand. Six hands, and the score is how many you took.
 *
 * The dealer plays by a rule rather than by judgement (hit below
 * seventeen, stand on seventeen, soft or hard) and the rule is printed
 * on screen, so the child is deciding against something knowable instead
 * of against a machine that might be doing anything.
 *
 * The rules themselves live in cardRules.js and are tested there,
 * because a hand that says A-A-9 is thirty-one has broken the one thing
 * the player walked in knowing.
 */

const HANDS = 6

export default function Blackjack({ onDone }) {
  const deck = useRef([])
  const [player, setPlayer] = useState([])
  const [dealer, setDealer] = useState([])
  const [stage, setStage] = useState('ready')
  const [results, setResults] = useState([])
  const [say, setSay] = useState('Six hands. Nothing is ever bet.')
  const finished = useRef(false)

  const draw = () => {
    if (deck.current.length < 12) deck.current = freshDeck()
    return deck.current.pop()
  }

  const finish = (all) => {
    if (finished.current) return
    finished.current = true
    // A push is half a hand: it is not a win, and scoring it as a loss
    // would punish correct play for the dealer's luck.
    const won = all.reduce((n, r) => n + (r === 'player' ? 1 : r === 'push' ? 0.5 : 0), 0)
    onDone(Math.round((won / HANDS) * 100))
  }

  const next = (all) => {
    if (all.length >= HANDS) { finish(all); return }
    const p = [draw(), draw()]
    const d = [draw(), draw()]
    setPlayer(p)
    setDealer(d)
    if (isBlackjack(p)) {
      // No decision to make on a blackjack, so do not pretend there is one.
      const res = settle(p, d)
      setStage('shown')
      setSay(res === 'player' ? 'Blackjack!' : 'Blackjack — but so has the dealer.')
      setResults([...all, res])
      setTimeout(() => next([...all, res]), 1700)
      return
    }
    setStage('play')
    setSay('Hit or stand?')
  }

  const start = () => { deck.current = freshDeck(); next([]) }

  const hit = () => {
    if (stage !== 'play') return
    const p = [...player, draw()]
    setPlayer(p)
    if (handTotal(p).bust) {
      const all = [...results, 'dealer']
      setResults(all)
      setStage('shown')
      setSay(`Bust on ${handTotal(p).total}.`)
      setTimeout(() => next(all), 1600)
    }
  }

  const stand = () => {
    if (stage !== 'play') return
    let d = dealer
    while (dealerShouldHit(d)) d = [...d, draw()]
    setDealer(d)
    const res = settle(player, d)
    const all = [...results, res]
    setResults(all)
    setStage('shown')
    const dt = handTotal(d)
    setSay(
      res === 'push' ? `Push on ${handTotal(player).total}.`
        : res === 'player' ? (dt.bust ? `Dealer bust on ${dt.total}. You win.` : `${handTotal(player).total} beats ${dt.total}.`)
        : `${dt.total} beats your ${handTotal(player).total}.`,
    )
    setTimeout(() => next(all), 1900)
  }

  const pt = handTotal(player)
  const dt = handTotal(dealer)
  const hideHole = stage === 'play'
  const wins = results.filter((r) => r === 'player').length

  return (
    <div className="text-center">
      <p className="font-display font-extrabold mb-0.5" style={{ fontSize: 20 }}>
        Hand {Math.min(results.length + 1, HANDS)} of {HANDS}
      </p>
      <p className="text-sm text-muted mb-1">{wins} won</p>
      <p className="text-sm mb-3" style={{ color: 'var(--accent)' }}>{say}</p>

      <p className="text-xs text-muted mb-1">
        Dealer{!hideHole && dealer.length ? ` · ${dt.total}${dt.bust ? ' bust' : ''}` : ''}
      </p>
      <div className="flex justify-center gap-1.5 mb-3" style={{ minHeight: 66 }}>
        {dealer.map((c, i) => (
          // Cards sit in fixed slots and the slot is the identity; two
          // sevens in one hand are not the same card.
          // eslint-disable-next-line react/no-array-index-key
          <PlayingCard key={i} card={c} down={hideHole && i === 1} />
        ))}
      </div>

      <p className="text-xs text-muted mb-1">
        You{player.length ? ` · ${pt.total}${pt.soft ? ' soft' : ''}${pt.bust ? ' bust' : ''}` : ''}
      </p>
      <div className="flex justify-center gap-1.5 mb-4 flex-wrap" style={{ minHeight: 66 }}>
        {player.map((c, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <PlayingCard key={i} card={c} />
        ))}
      </div>

      {stage === 'ready' && (
        <button type="button" className="btn btn-primary w-full" style={{ maxWidth: 280 }} onClick={start}>
          Deal
        </button>
      )}
      {stage === 'play' && (
        <div className="flex gap-2 justify-center">
          <button type="button" className="btn btn-primary" style={{ minWidth: 118 }} onClick={hit}>Hit</button>
          <button type="button" className="btn btn-soft" style={{ minWidth: 118 }} onClick={stand}>Stand</button>
        </div>
      )}

      <p className="text-xs text-muted mt-4 mx-auto" style={{ maxWidth: 280 }}>
        Aces are eleven, or one if eleven would bust you. The dealer hits
        below 17 and stands on 17 or more, every time.
      </p>
    </div>
  )
}
