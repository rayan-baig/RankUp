/**
 * Ranking a five-card poker hand.
 *
 * Separate from the screen because hand ranking is the one part of poker
 * that is simply right or wrong, and a game that tells a child their full
 * house lost to two pair has broken the only rule they came in knowing.
 * tests/cards.mjs checks every rank against hands built by hand, including
 * the two that are almost always wrong the first time: the wheel straight
 * (A-2-3-4-5, where the ace counts low) and a hand that is both a flush and
 * a straight.
 */

export const SUITS = ['♠', '♥', '♦', '♣']
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

export const valueOf = (card) => RANKS.indexOf(card.rank) + 2

export function freshDeck(random = Math.random) {
  const deck = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank })
  // Fisher-Yates, backwards, which is the version that does not bias.
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = deck[i]
    deck[i] = deck[j]
    deck[j] = tmp
  }
  return deck
}

export const HANDS = [
  { id: 'high', name: 'High card', pays: 0 },
  { id: 'pair', name: 'A pair', pays: 10 },
  { id: 'twopair', name: 'Two pair', pays: 30 },
  { id: 'three', name: 'Three of a kind', pays: 48 },
  { id: 'straight', name: 'A straight', pays: 64 },
  { id: 'flush', name: 'A flush', pays: 76 },
  { id: 'house', name: 'A full house', pays: 88 },
  { id: 'four', name: 'Four of a kind', pays: 96 },
  { id: 'straightflush', name: 'A straight flush', pays: 100 },
]

const byId = (id) => HANDS.find((h) => h.id === id)

/**
 * A number that sorts hands correctly against each other.
 *
 * Ranking alone is not enough once two people have a hand: a pair of kings
 * beats a pair of threes, and two identical pairs are split by the other
 * cards. So this is the rank followed by the values that matter, in the
 * order they matter, packed into one number — which makes comparing two
 * hands a single greater-than and removes a whole family of tie bugs.
 */
export function handScore(cards) {
  const made = rankHand(cards)
  const tier = HANDS.findIndex((h) => h.id === made.id)

  const counts = new Map()
  for (const c of cards) counts.set(valueOf(c), (counts.get(valueOf(c)) || 0) + 1)
  // Sort by how many of them there are first, then by how high they are, so
  // the three in a full house outranks the pair regardless of face value.
  const ordered = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))
    .map(([v]) => v)

  const values = cards.map(valueOf).sort((a, b) => b - a)
  const wheel = [...new Set(values)].sort((a, b) => a - b).join(',') === '2,3,4,5,14'
  // In the wheel the ace is the low end, so the hand's top card is the five.
  const ranked = (made.id === 'straight' || made.id === 'straightflush') && wheel
    ? [5, 4, 3, 2, 1]
    : ordered

  let score = tier
  for (let i = 0; i < 5; i += 1) score = score * 15 + (ranked[i] || 0)
  return score
}

/** The best five-card hand out of seven, which is what hold'em needs. */
export function bestOfSeven(cards) {
  let best = null
  let bestScore = -1
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]]
            const score = handScore(five)
            if (score > bestScore) { bestScore = score; best = five }
          }
        }
      }
    }
  }
  return { cards: best, score: bestScore, hand: rankHand(best) }
}

export function rankHand(cards) {
  const values = cards.map(valueOf).sort((a, b) => a - b)
  const counts = {}
  for (const v of values) counts[v] = (counts[v] || 0) + 1
  const groups = Object.values(counts).sort((a, b) => b - a)

  const flush = cards.every((c) => c.suit === cards[0].suit)

  const unique = [...new Set(values)]
  let straight = unique.length === 5 && unique[4] - unique[0] === 4
  // The wheel: ace low, 5-4-3-2-A. The ace is stored as 14, so this is the
  // one straight that does not show up as five consecutive numbers.
  if (!straight && unique.join(',') === '2,3,4,5,14') straight = true

  if (straight && flush) return byId('straightflush')
  if (groups[0] === 4) return byId('four')
  if (groups[0] === 3 && groups[1] === 2) return byId('house')
  if (flush) return byId('flush')
  if (straight) return byId('straight')
  if (groups[0] === 3) return byId('three')
  if (groups[0] === 2 && groups[1] === 2) return byId('twopair')
  if (groups[0] === 2) return byId('pair')
  return byId('high')
}
