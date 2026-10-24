/**
 * Rules for the two card games that are not poker.
 *
 * Out here rather than inside the screens for the same reason hand
 * ranking is: these are the parts that are simply right or wrong, a
 * child notices instantly when they are wrong, and they can be tested
 * without a browser. tests/cards.mjs covers them.
 */

import { valueOf } from './pokerHands.js'

/* ---------------------------------------------------------------- */
/* Blackjack                                                         */

/**
 * The total of a blackjack hand, with the aces sorted out.
 *
 * An ace is eleven until that would bust you, and then it is one — and
 * a hand can hold several of them, so A-A-9 is 21 and not 31 or 11.
 * Counting every ace as eleven and then stepping each one down to one
 * while the hand is bust is the version of this that handles all of
 * them; the usual bug is stepping only the first ace down.
 *
 * `soft` means an ace is still counting as eleven, which is what the
 * difference between a soft 17 and a hard 17 means.
 */
export function handTotal(cards) {
  let total = 0
  let aces = 0
  for (const c of cards) {
    if (c.rank === 'A') { aces += 1; total += 11 } else { total += Math.min(10, valueOf(c)) }
  }
  let big = aces
  while (total > 21 && big > 0) { total -= 10; big -= 1 }
  return { total, soft: big > 0, bust: total > 21 }
}

/** Twenty-one in the first two cards, which beats a twenty-one built up to. */
export const isBlackjack = (cards) => cards.length === 2 && handTotal(cards).total === 21

/**
 * The dealer has no choices to make: hit below seventeen, stand on
 * seventeen or better, soft or hard. Playing it as a rule rather than
 * as a judgement is the point — the dealer is the fixed thing the
 * player's own decisions get measured against.
 */
export const dealerShouldHit = (cards) => handTotal(cards).total < 17

/** Who won: 'player', 'dealer' or 'push'. */
export function settle(player, dealer) {
  const p = handTotal(player)
  const d = handTotal(dealer)
  if (p.bust) return 'dealer'
  if (d.bust) return 'player'
  const pBJ = isBlackjack(player)
  const dBJ = isBlackjack(dealer)
  if (pBJ && dBJ) return 'push'
  if (pBJ) return 'player'
  if (dBJ) return 'dealer'
  if (p.total === d.total) return 'push'
  return p.total > d.total ? 'player' : 'dealer'
}

/* ---------------------------------------------------------------- */
/* Go Fish                                                           */

/** How many cards of each rank a hand holds. */
export function rankCounts(cards) {
  const counts = new Map()
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) || 0) + 1)
  return counts
}

/** The ranks this hand has all four of — a completed book. */
export function booksIn(cards) {
  return [...rankCounts(cards).entries()].filter(([, n]) => n >= 4).map(([r]) => r)
}

/** Pull every card of a rank out of a hand. */
export function takeRank(cards, rank) {
  return {
    taken: cards.filter((c) => c.rank === rank),
    rest: cards.filter((c) => c.rank !== rank),
  }
}

/**
 * What the opponent asks for.
 *
 * Only ever a rank it already holds, because that is the one rule of Go
 * Fish that stops it being a guessing game — you may not fish for
 * something you have none of. It asks for the rank it holds most of,
 * which is both the sensible play and the one a child can see the logic
 * of when it is explained.
 *
 * `avoid` is the set of ranks it has already asked for and been told no
 * about since it last drew, so it does not loop on the same question.
 */
export function opponentAsk(hand, avoid = []) {
  const counts = [...rankCounts(hand).entries()]
    .filter(([r, n]) => n < 4 && !avoid.includes(r))
    .sort((a, b) => b[1] - a[1])
  return counts.length ? counts[0][0] : null
}
