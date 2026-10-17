import { useEffect, useRef, useState } from 'react'

/**
 * Wildfire. Match the colour or the number, first to empty their hand wins.
 * Three opponents.
 *
 * Its own invented name on purpose. The game it is modelled on is somebody's
 * registered trademark, and an app being sold to families cannot ship a game
 * under that name — the rules of a card game are not owned by anybody, but
 * the name on the box very much is. So the rules here are the ordinary ones
 * — match colour or value, plus skips, pick-twos and wilds — under a name
 * that is ours.
 *
 * The opponents play simply and visibly: a matching card if they have one,
 * otherwise they draw. Nothing hidden, nothing clever, so a child can work
 * out why they did what they did.
 */

const COLOURS = [
  { id: 'r', tint: '#ef4444', name: 'red' },
  { id: 'y', tint: '#eab308', name: 'yellow' },
  { id: 'g', tint: '#22c55e', name: 'green' },
  { id: 'b', tint: '#3b82f6', name: 'blue' },
]
const PLAYERS = ['You', 'Ash', 'Bo', 'Cass']

const label = (card) => {
  if (card.wild) return 'Wild'
  if (card.kind === 'skip') return 'Skip'
  if (card.kind === 'draw2') return '+2'
  return String(card.value)
}

function buildDeck(random = Math.random) {
  const deck = []
  let id = 0
  for (const c of COLOURS) {
    for (let v = 0; v <= 9; v += 1) {
      deck.push({ id: id++, colour: c.id, value: v, kind: 'number' })
      if (v > 0) deck.push({ id: id++, colour: c.id, value: v, kind: 'number' })
    }
    deck.push({ id: id++, colour: c.id, kind: 'skip' })
    deck.push({ id: id++, colour: c.id, kind: 'draw2' })
  }
  for (let i = 0; i < 4; i += 1) deck.push({ id: id++, wild: true, kind: 'wild' })
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t
  }
  return deck
}

const playable = (card, top, colour) => (
  card.wild
  || card.colour === colour
  || (card.kind === 'number' && top.kind === 'number' && card.value === top.value)
  || (card.kind !== 'number' && card.kind === top.kind)
)

export default function Wildfire({ onDone }) {
  const [hands, setHands] = useState([[], [], [], []])
  const [top, setTop] = useState(null)
  const [colour, setColour] = useState('r')
  const [turn, setTurn] = useState(0)
  const [say, setSay] = useState('Your go.')
  const [over, setOver] = useState(null)
  const [pickWild, setPickWild] = useState(null)

  const deck = useRef([])
  const state = useRef({ hands: [[], [], [], []], colour: 'r', top: null })
  const done = useRef(false)

  useEffect(() => {
    const d = buildDeck()
    const dealt = [0, 1, 2, 3].map(() => d.splice(0, 7))
    // The starter must be an ordinary number card, or the first turn needs
    // rules nobody has been shown yet.
    let first = d.pop()
    while (first.kind !== 'number') { d.unshift(first); first = d.pop() }
    deck.current = d
    state.current = { hands: dealt, colour: first.colour, top: first }
    setHands(dealt)
    setTop(first)
    setColour(first.colour)
  }, [])

  const finish = (winner, myCards) => {
    if (done.current) return
    done.current = true
    // Winning is most of the score; getting close counts for the rest, so a
    // hand lost with one card left is not the same as one lost with seven.
    const left = Math.max(0, Math.min(7, myCards))
    onDone(winner === 0 ? 100 : Math.max(5, Math.round((7 - left) * 9)))
  }

  const draw = (who, n) => {
    const s = state.current
    for (let i = 0; i < n; i += 1) {
      if (!deck.current.length) deck.current = buildDeck()
      s.hands[who].push(deck.current.pop())
    }
  }

  /** Put a card down and work out whose go it is next. */
  const place = (who, card, chosenColour) => {
    const s = state.current
    s.hands[who] = s.hands[who].filter((c) => c.id !== card.id)
    s.top = card
    s.colour = card.wild ? chosenColour : card.colour

    let next = (who + 1) % 4
    if (card.kind === 'skip') {
      setSay(`${PLAYERS[who]} skipped ${PLAYERS[next]}.`)
      next = (next + 1) % 4
    } else if (card.kind === 'draw2') {
      draw(next, 2)
      setSay(`${PLAYERS[next]} picks up two.`)
      next = (next + 1) % 4
    } else {
      setSay(`${PLAYERS[who]} played ${label(card)}.`)
    }

    setHands(s.hands.map((h) => [...h]))
    setTop(s.top)
    setColour(s.colour)

    if (!s.hands[who].length) {
      setOver(who)
      setTimeout(() => finish(who, s.hands[0].length), 1500)
      return
    }
    setTurn(next)
  }

  // The opponents, one at a time with a pause so it can be followed.
  useEffect(() => {
    if (turn === 0 || over !== null || done.current || !top) return undefined
    const t = setTimeout(() => {
      const s = state.current
      const mine = s.hands[turn]
      const can = mine.filter((c) => playable(c, s.top, s.colour))
      if (!can.length) {
        draw(turn, 1)
        const drawn = s.hands[turn][s.hands[turn].length - 1]
        setHands(s.hands.map((h) => [...h]))
        if (playable(drawn, s.top, s.colour)) {
          place(turn, drawn, COLOURS[Math.floor(Math.random() * 4)].id)
        } else {
          setSay(`${PLAYERS[turn]} picked up.`)
          setTurn((turn + 1) % 4)
        }
        return
      }
      // Prefer a coloured card over a wild, so wilds get saved — which is
      // also what a person does.
      const pick = can.find((c) => !c.wild) || can[0]
      const wildColour = COLOURS
        .map((c) => ({ c, n: mine.filter((m) => m.colour === c.id).length }))
        .sort((a, b) => b.n - a.n)[0].c.id
      place(turn, pick, wildColour)
    }, 850)
    return () => clearTimeout(t)
  }, [turn, over, top])

  if (!top) return null

  const myHand = hands[0]
  const myTurn = turn === 0 && over === null
  const canPlayAnything = myHand.some((c) => playable(c, top, colour))
  const topTint = top.wild
    ? COLOURS.find((c) => c.id === colour).tint
    : COLOURS.find((c) => c.id === top.colour).tint

  const Card = ({ card, onClick, dim }) => {
    const tint = card.wild ? '#374151' : COLOURS.find((c) => c.id === card.colour).tint
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        aria-label={`${card.wild ? 'wild' : COLOURS.find((c) => c.id === card.colour).name} ${label(card)}`}
        className="grid place-items-center font-display font-extrabold"
        style={{
          width: 44,
          height: 62,
          flex: '0 0 auto',
          borderRadius: 8,
          background: tint,
          color: '#fff',
          border: '2px solid rgb(255 255 255 / 0.3)',
          opacity: dim ? 0.4 : 1,
          fontSize: label(card).length > 2 ? 12 : 18,
        }}
      >
        {label(card)}
      </button>
    )
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted mb-1">
        {over !== null
          ? over === 0 ? 'You went out. You win.' : `${PLAYERS[over]} went out first.`
          : say}
      </p>
      <p className="font-display font-extrabold mb-3" style={{ fontSize: 18 }}>
        {PLAYERS.slice(1).map((n, i) => `${n} ${hands[i + 1].length}`).join(' · ')}
      </p>

      <div className="grid place-items-center mb-1">
        <div
          className="grid place-items-center font-display font-extrabold"
          style={{
            width: 64, height: 90, borderRadius: 11, background: topTint, color: '#fff',
            border: '3px solid rgb(255 255 255 / 0.35)', fontSize: 22,
          }}
        >
          {label(top)}
        </div>
      </div>
      <p className="text-xs text-muted mb-3">
        Playing on {COLOURS.find((c) => c.id === colour).name}
      </p>

      {pickWild !== null ? (
        <div className="mb-3">
          <p className="text-sm mb-2">Pick a colour</p>
          <div className="flex justify-center gap-2">
            {COLOURS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                onClick={() => { const card = pickWild; setPickWild(null); place(0, card, c.id) }}
                style={{ width: 48, height: 48, borderRadius: 10, background: c.tint, border: 'none' }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-2 px-1" style={{ minHeight: 70 }}>
          {myHand.map((card) => {
            const ok = myTurn && playable(card, top, colour)
            return (
              <Card
                key={card.id}
                card={card}
                dim={myTurn && !ok}
                onClick={ok ? () => (card.wild ? setPickWild(card) : place(0, card, colour)) : undefined}
              />
            )
          })}
        </div>
      )}

      {myTurn && !canPlayAnything && pickWild === null && (
        <button
          type="button"
          className="btn btn-soft w-full mt-2"
          onClick={() => {
            draw(0, 1)
            setHands(state.current.hands.map((h) => [...h]))
            setSay('You picked up.')
            setTurn(1)
          }}
        >
          Nothing to play — pick up
        </button>
      )}

      <p className="text-xs text-muted mt-3">
        Match the colour or the number. Faded cards cannot be played.
      </p>
    </div>
  )
}
