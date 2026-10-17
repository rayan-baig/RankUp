/**
 * Poker hand ranking, and the card deck behind it.
 *
 * Ranking a hand is the one part of poker that is simply right or wrong,
 * and a game that tells a child their full house lost to two pair has
 * broken the only rule they walked in knowing. So every rank is checked
 * against a hand built by hand, including the three that are nearly always
 * wrong the first time:
 *
 *  - the wheel, A-2-3-4-5, where the ace counts low and the hand does not
 *    look like five consecutive numbers;
 *  - a hand that is a flush AND a straight, which must be ranked as the
 *    straight flush rather than whichever test ran first;
 *  - four of a kind, which also contains three of a kind and a pair, and
 *    will be called the lesser hand by a check written in the wrong order.
 */
import { rankHand, handScore, bestOfSeven, freshDeck, SUITS, RANKS } from '../src/components/games/pokerHands.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

/** "AS KH 3D 3C 9H" into cards, so the hands below read like hands. */
const hand = (text) => text.split(' ').map((t) => ({
  rank: t.slice(0, -1),
  suit: { S: '♠', H: '♥', D: '♦', C: '♣' }[t.slice(-1)],
}))

const is = (text, id) => ok(`${text} is ${id}`, rankHand(hand(text)).id === id,
  `got ${rankHand(hand(text)).id}`)

console.log('\n=== Every rank, in order ===')
is('2S 7H 9D JC KH', 'high')
is('2S 2H 9D JC KH', 'pair')
is('2S 2H 9D 9C KH', 'twopair')
is('2S 2H 2D 9C KH', 'three')
is('5S 6H 7D 8C 9H', 'straight')
is('2S 7S 9S JS KS', 'flush')
is('2S 2H 2D 9C 9H', 'house')
is('2S 2H 2D 2C KH', 'four')
is('5S 6S 7S 8S 9S', 'straightflush')

console.log('\n=== The ones that are usually wrong ===')
is('AS 2H 3D 4C 5H', 'straight')
is('AS 2S 3S 4S 5S', 'straightflush')
is('10S JH QD KC AH', 'straight')
is('10S JS QS KS AS', 'straightflush')
// An ace next to a king is a straight; an ace next to a two is only one if
// the ace is being counted low, and K-A-2-3-4 is not a hand.
is('KS AH 2D 3C 4H', 'high')
// Four of a kind contains three of a kind — the bigger hand must win.
ok('four of a kind is not called three of a kind',
  rankHand(hand('7S 7H 7D 7C KH')).id === 'four')
// A full house contains a pair and a three — likewise.
ok('a full house is not called three of a kind',
  rankHand(hand('7S 7H 7D KC KH')).id === 'house')

console.log('\n=== The payouts go the right way round ===')
{
  const order = ['high', 'pair', 'twopair', 'three', 'straight', 'flush', 'house', 'four', 'straightflush']
  const pays = order.map((id) => rankHand(hand({
    high: '2S 7H 9D JC KH',
    pair: '2S 2H 9D JC KH',
    twopair: '2S 2H 9D 9C KH',
    three: '2S 2H 2D 9C KH',
    straight: '5S 6H 7D 8C 9H',
    flush: '2S 7S 9S JS KS',
    house: '2S 2H 2D 9C 9H',
    four: '2S 2H 2D 2C KH',
    straightflush: '5S 6S 7S 8S 9S',
  }[id])).pays)
  const rising = pays.every((p, i) => i === 0 || p > pays[i - 1])
  ok('a better hand always pays more', rising, pays.join(' < '))
}

console.log('\n=== The deck is a real deck ===')
{
  const deck = freshDeck()
  ok('fifty-two cards', deck.length === 52, String(deck.length))
  ok('every one of them different',
    new Set(deck.map((c) => c.rank + c.suit)).size === 52)
  ok('thirteen of each suit',
    SUITS.every((s) => deck.filter((c) => c.suit === s).length === 13))
  ok('four of each rank',
    RANKS.every((r) => deck.filter((c) => c.rank === r).length === 4))

  // A shuffle that leaves cards where they were is not a shuffle. Compare
  // many decks rather than one, because one can come out tidy by chance.
  let sameSpot = 0
  const trials = 400
  for (let i = 0; i < trials; i += 1) {
    const d = freshDeck()
    if (d[0].rank === '2' && d[0].suit === '♠') sameSpot += 1
  }
  ok('and the shuffle really moves things',
    sameSpot < trials * 0.1, `the two of spades led ${sameSpot} of ${trials} decks`)
}

console.log('\n=== Two hands can be told apart, not just named ===')
{
  const beats = (a, b) => handScore(hand(a)) > handScore(hand(b))
  ok('kings beat threes, though both are a pair',
    beats('KS KH 9D 5C 2H', '3S 3H 9D 5C 2H'))
  ok('the kicker splits two identical pairs',
    beats('KS KH AD 5C 2H', 'KS KH QD 5C 2H'))
  ok('the bigger three of a kind wins',
    beats('9S 9H 9D 5C 2H', '4S 4H 4D KC QH'))
  ok('the higher straight wins',
    beats('6S 7H 8D 9C 10H', '5S 6H 7D 8C 9H'))
  ok('the wheel is the LOWEST straight, not the highest',
    beats('2S 3H 4D 5C 6H', 'AS 2H 3D 4C 5H'))
  ok('and any flush beats any straight',
    beats('2S 7S 9S JS KS', '10S JH QD KC AH'))
  ok('two genuinely identical hands tie',
    handScore(hand('KS KH 9D 5C 2H')) === handScore(hand('KD KC 9S 5H 2D')))
}

console.log('\n=== The best five out of seven ===')
{
  // The flush is there if you look; a careless reading sees only the pair.
  const seven = hand('2S 7S 9S JS KS 9H 9D')
  ok('it finds the flush hiding in seven cards',
    bestOfSeven(seven).hand.id === 'flush', bestOfSeven(seven).hand.id)
  ok('and hands back exactly five cards', bestOfSeven(seven).cards.length === 5)

  // Board-plays-itself: the best hand uses none of your cards.
  const board = hand('10S JS QS KS AS 2H 3D')
  ok('it spots a straight flush sitting on the table',
    bestOfSeven(board).hand.id === 'straightflush')

  // Seven cards with a full house available must not settle for three.
  const boat = hand('8S 8H 8D 4C 4H 2S 7D')
  ok('it takes the full house over the three of a kind',
    bestOfSeven(boat).hand.id === 'house', bestOfSeven(boat).hand.id)
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
