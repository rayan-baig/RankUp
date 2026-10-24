import { useEffect, useRef, useState } from 'react'
import { freshDeck, RANKS } from './pokerHands.js'
import { booksIn, takeRank, rankCounts, opponentAsk } from './cardRules.js'
import PlayingCard from './PlayingCard.jsx'

/**
 * Go Fish. Collect four of a kind; whoever has the most books wins.
 *
 * The one rule that makes it a game rather than a guessing contest is
 * that you may only ask for a rank you are already holding — so every
 * question you ask tells the other player something about your hand,
 * and every question they ask tells you something about theirs. The
 * buttons enforce it: you are only ever offered the ranks you hold.
 *
 * The opponent plays by the same rule, asks for whatever it holds most
 * of, and remembers which ranks you have already said no to since it
 * last drew, so it does not ask the same dead question twice. All of
 * that lives in cardRules.js, where it is tested.
 */

const HAND_SIZE = 7

export default function GoFish({ onDone }) {
  const pond = useRef([])
  const asked = useRef([])
  const finished = useRef(false)
  /*
   * Turns in a row where nothing moved and there was nothing to draw.
   *
   * Go Fish can genuinely deadlock near the end: the pond is empty, I
   * hold one seven and they hold one seven, and we take turns asking
   * each other for it for ever — the card crosses over, comes back, and
   * neither of us can ever make the book. Neither hand is empty and the
   * thirteen books are not all made, so neither of the real end
   * conditions ever fires. The browser test found this by playing two
   * hundred turns and never reaching the end.
   */
  const stall = useRef(0)
  const [mine, setMine] = useState([])
  const [theirs, setTheirs] = useState([])
  const [myBooks, setMyBooks] = useState([])
  const [theirBooks, setTheirBooks] = useState([])
  const [turn, setTurn] = useState('ready')
  const [say, setSay] = useState('Ask for a rank you already hold.')

  const start = () => {
    const deck = freshDeck()
    setMine(deck.splice(0, HAND_SIZE))
    setTheirs(deck.splice(0, HAND_SIZE))
    pond.current = deck
    asked.current = []
    stall.current = 0
    setTurn('mine')
    setSay('Your turn. Tap a rank to ask for it.')
  }

  const endIfOver = (myHand, theirHand, myB, theirB) => {
    const over = myB.length + theirB.length >= 13
      // With the pond empty, a player who is out of cards cannot come
      // back in, so there is nothing left to play for.
      || (pond.current.length === 0 && (myHand.length === 0 || theirHand.length === 0))
      || stall.current >= 3
    if (!over || finished.current) return over
    finished.current = true
    const total = myB.length + theirB.length
    // Share of the books that were actually completed, so a game that
    // runs out of cards early still scores on how it went rather than
    // on how far it got.
    onDone(total ? Math.round((myB.length / total) * 100) : 0)
    return true
  }

  const ask = (rank) => {
    if (turn !== 'mine') return
    const { taken, rest } = takeRank(theirs, rank)
    let myHand = [...mine, ...taken]
    let theirHand = rest
    let msg

    if (taken.length) {
      msg = `They hand over ${taken.length} ${rank}${taken.length > 1 ? 's' : ''}. Go again.`
    } else {
      const drawn = pond.current.pop()
      if (drawn) myHand = [...myHand, drawn]
      msg = drawn
        ? `Go fish. You drew ${drawn.rank}${drawn.rank === rank ? ' — the one you asked for!' : ''}.`
        : 'Go fish — but the pond is empty.'
      if (!drawn) stall.current += 1
    }
    if (taken.length) stall.current = 0

    const mb = [...myBooks]
    const collect = booksIn(myHand)
    if (collect.length) {
      mb.push(...collect)
      myHand = myHand.filter((c) => !collect.includes(c.rank))
      msg += ` Book of ${collect.join(' and ')}!`
    }

    setMine(myHand)
    setTheirs(theirHand)
    setMyBooks(mb)
    setSay(msg)
    if (endIfOver(myHand, theirHand, mb, theirBooks)) return
    // Asking correctly buys another turn, which is the whole reason to
    // pay attention to what the other player has been asking for.
    setTurn(taken.length ? 'mine' : 'theirs')
  }

  /*
   * Out of cards on your own turn, with cards still in the pond.
   *
   * There is nothing to ask with, so there are no buttons, so the game
   * stops dead with no way to carry on. Drawing back up is what the
   * rules say to do and it is the only thing that can happen here, so
   * it happens by itself rather than being offered as a choice of one.
   */
  useEffect(() => {
    if (turn !== 'mine' || mine.length > 0 || !pond.current.length) return undefined
    const t = setTimeout(() => {
      const drawn = pond.current.pop()
      setMine(drawn ? [drawn] : [])
      setSay(`You were out of cards, so you drew ${drawn.rank}.`)
    }, 900)
    return () => clearTimeout(t)
  }, [turn, mine])

  /* The opponent's turn, on a timer so it can be watched rather than
     happening between two frames. */
  useEffect(() => {
    if (turn !== 'theirs') return undefined
    const t = setTimeout(() => {
      const rank = opponentAsk(theirs, asked.current)
      if (!rank) {
        const drawn = pond.current.pop()
        const theirHand = drawn ? [...theirs, drawn] : theirs
        setTheirs(theirHand)
        asked.current = []
        if (!drawn) stall.current += 1
        setSay(drawn
          ? 'They have nothing to ask for, so they fish.'
          : 'They have nothing to ask for and the pond is empty.')
        if (!endIfOver(mine, theirHand, myBooks, theirBooks)) setTurn('mine')
        return
      }

      const { taken, rest } = takeRank(mine, rank)
      let theirHand = [...theirs, ...taken]
      let myHand = rest
      let msg

      if (taken.length) {
        asked.current = []
        stall.current = 0
        msg = `They asked for ${rank} and you had ${taken.length}.`
      } else {
        asked.current = [...asked.current, rank]
        const drawn = pond.current.pop()
        if (drawn) theirHand = [...theirHand, drawn]
        else stall.current += 1
        msg = `They asked for ${rank}. You said go fish.`
      }

      const tb = [...theirBooks]
      const collect = booksIn(theirHand)
      if (collect.length) {
        tb.push(...collect)
        theirHand = theirHand.filter((c) => !collect.includes(c.rank))
        msg += ` They booked ${collect.join(' and ')}.`
      }

      setMine(myHand)
      setTheirs(theirHand)
      setTheirBooks(tb)
      setSay(msg)
      if (endIfOver(myHand, theirHand, myBooks, tb)) return
      setTurn(taken.length ? 'theirs' : 'mine')
    }, 1200)
    return () => clearTimeout(t)
  }, [turn, theirs, mine, myBooks, theirBooks])

  const counts = rankCounts(mine)
  const askable = RANKS.filter((r) => counts.get(r))

  return (
    <div className="text-center">
      <p className="font-display font-extrabold mb-0.5" style={{ fontSize: 20 }}>
        You {myBooks.length} · them {theirBooks.length}
      </p>
      <p className="text-sm text-muted mb-1">{pond.current.length} left in the pond</p>
      <p className="text-sm mb-3" style={{ color: 'var(--accent)', minHeight: 20 }}>{say}</p>

      <div className="flex justify-center gap-1 mb-3 flex-wrap" style={{ minHeight: 56 }}>
        {theirs.map((c, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <PlayingCard key={i} card={c} down size="sm" />
        ))}
      </div>

      <div className="flex justify-center gap-1 mb-3 flex-wrap" style={{ minHeight: 56 }}>
        {mine.map((c, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <PlayingCard key={i} card={c} size="sm" dim={turn !== 'mine'} />
        ))}
      </div>

      {turn === 'ready' && (
        <button type="button" className="btn btn-primary w-full" style={{ maxWidth: 280 }} onClick={start}>
          Deal
        </button>
      )}

      {turn !== 'ready' && (
        <div className="flex justify-center gap-1.5 flex-wrap mx-auto" style={{ maxWidth: 300 }}>
          {askable.map((r) => (
            <button
              key={r}
              type="button"
              className="btn btn-soft"
              disabled={turn !== 'mine'}
              onClick={() => ask(r)}
              style={{ minWidth: 46, minHeight: 40, padding: '4px 10px', fontSize: 15 }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
