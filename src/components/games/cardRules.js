/**
 * Rules for Go Fish, the card game that is not poker. (Blackjack's went
 * with the game in 0.22.0: no casino games in a children's arcade.)
 *
 * Out here rather than inside the screens for the same reason hand
 * ranking is: these are the parts that are simply right or wrong, a
 * child notices instantly when they are wrong, and they can be tested
 * without a browser. tests/cards.mjs covers them.
 */

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
