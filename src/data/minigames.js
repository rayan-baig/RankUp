/**
 * The arcade.
 *
 * THE RULE THAT KEEPS THIS FROM WRECKING THE APP: a minigame is never a way to
 * earn. Chores are. You get one play token for each chore a parent approves, a
 * game pays a handful of currency at most, and the day's winnings are capped
 * well below what a single chore is worth. So the arcade pulls a child toward
 * the chore list rather than away from it — which is the whole point of putting
 * it behind an approval in the first place.
 *
 * Every game reports a single 0–100 score, so one payout rule covers every one
 * of them and the database can check the sum without knowing how any game is played.
 */

export const MAX_TOKENS = 5
export const DAILY_COIN_CAP = 15

/**
 * The hub's shelves. Every game carries the kind of game it is, because a
 * list of thirteen identical cards is not a hub — it is a wall. A child who
 * is tired wants the puzzle shelf; a child with four minutes wants the quick
 * shelf; and the arcade can say so.
 */
export const CATEGORIES = [
  { id: 'all', name: 'Everything', icon: '🎲' },
  { id: 'arcade', name: 'Arcade', icon: '🕹️' },
  { id: 'puzzle', name: 'Puzzles', icon: '🧩' },
  { id: 'brain', name: 'Brain', icon: '🧠' },
  { id: 'sports', name: 'Sports', icon: '🏆' },
  { id: 'versus', name: 'Versus', icon: '⚔️' },
  { id: 'cards', name: 'Cards', icon: '🃏' },
]

/*
 * `howTo` is the one line a child reads before a game starts (KidArcade shows
 * it above the game): what to do, in words a seven-year-old can follow, short
 * enough for one line on a phone. tests/howtoplay.mjs holds every game, and
 * every sport in SportsMania, to that.
 */
export const MINIGAMES = [
  {
    id: 'sports',
    minMs: 5000,
    name: 'SportsMania',
    icon: '🏆',
    category: 'sports',
    blurb: 'Ten sports in one. Football, golf, F1, cricket, hockey and more.',
    howTo: 'Pick a sport, then play one event.',
    minutes: 3,
  },
  {
    id: 'tennis',
    minMs: 30000,
    name: 'Tennis Tour',
    icon: '🎾',
    category: 'sports',
    blurb: 'A 3D career. Rankings, a tour calendar, best of three sets.',
    howTo: 'Serve, then hit it back with Topspin, Slice or Lob. Needs the internet.',
    minutes: 8,
    needsNet: true,
  },
  {
    id: 'turbo',
    minMs: 70000,
    name: 'Turbo Ball',
    icon: '🚗',
    category: 'sports',
    blurb: 'Football with cars. You cannot carry the ball, only hit it.',
    howTo: 'Drag to drive your car and push the ball into the top goal.',
    minutes: 2,
  },
  {
    id: 'blocks',
    minMs: 8000,
    name: 'Block Drop',
    icon: '🟦',
    category: 'puzzle',
    blurb: 'Falling shapes. Fill a row and it clears.',
    howTo: 'Slide, turn and drop the blocks. Fill a whole row to clear it.',
    minutes: 4,
  },
  {
    id: 'sweets',
    minMs: 10000,
    name: 'Sweet Swap',
    icon: '🍬',
    category: 'puzzle',
    blurb: 'Swap two sweets, line up three, watch the rest fall in.',
    howTo: 'Swap two sweets to make a line of three. You have twenty moves.',
    minutes: 5,
  },
  {
    id: 'impostor',
    minMs: 3000,
    name: 'Find the Impostor',
    icon: '🕵️',
    category: 'brain',
    blurb: 'Five crewmates. The crew tell the truth. One of them does not.',
    howTo: 'Read what each crewmate says and find the one who is lying.',
    minutes: 4,
  },
  {
    id: 'track',
    minMs: 10000,
    name: 'Trackstar',
    icon: '🛹',
    category: 'arcade',
    blurb: 'Three lanes, no brakes. Dodge what comes at you.',
    howTo: 'Swipe left or right to change lane, and swipe up to jump.',
    minutes: 1,
  },
  {
    id: 'wildfire',
    minMs: 5000,
    name: 'Wildfire',
    icon: '🔥',
    category: 'cards',
    blurb: 'Match the colour or the number. First to an empty hand wins.',
    howTo: 'Play a card that matches the colour or the number. Empty your hand to win.',
    minutes: 5,
  },
  {
    id: 'royal',
    minMs: 5000,
    name: 'Royal Draw',
    icon: '♠️',
    category: 'cards',
    blurb: 'Five cards. Keep what you like, swap the rest once.',
    howTo: 'Keep the cards you like, swap the rest once, and make the best hand.',
    minutes: 3,
  },
  {
    id: 'holdem',
    minMs: 8000,
    name: "Texas Hold'em",
    icon: '🃏',
    category: 'cards',
    blurb: 'Two in your hand, five on the table. Stay in or fold.',
    howTo: 'Stay in with a good hand and fold a bad one. Nothing is ever bet.',
    minutes: 4,
  },
  {
    id: 'blackjack',
    minMs: 8000,
    name: 'Blackjack',
    icon: '🂡',
    category: 'cards',
    blurb: 'Get closer to 21 than the dealer without going over.',
    howTo: 'Hit to take a card, stand to stop. Get closer to 21 than the dealer.',
    minutes: 3,
  },
  {
    id: 'gofish',
    minMs: 5000,
    name: 'Go Fish',
    icon: '🐟',
    category: 'cards',
    blurb: 'Collect four of a kind. Most books wins.',
    howTo: 'Ask for a card you already have. Collect all four to make a book.',
    minutes: 4,
  },
  {
    id: 'snake',
    minMs: 6000,
    name: 'Snake',
    icon: '🐍',
    category: 'arcade',
    blurb: 'Eat, grow, and run out of room. The one everybody already knows.',
    howTo: 'Swipe or use the arrows to steer. Eat the apples, and don’t bite yourself.',
    minutes: 2,
  },
  {
    id: 'merge',
    minMs: 60000,
    name: '2048',
    icon: '🔢',
    category: 'puzzle',
    blurb: 'Slide the board. Matching numbers join. Build the biggest tile.',
    howTo: 'Slide the tiles. Two the same join into one. Try to make 2048.',
    minutes: 6,
  },
  {
    id: 'bricks',
    minMs: 8000,
    name: 'Brick Breaker',
    icon: '🏓',
    category: 'arcade',
    blurb: 'A ball, a paddle, and a wall that will not clear itself.',
    howTo: 'Drag the paddle to bounce the ball and break the bricks.',
    minutes: 3,
  },
  {
    id: 'sweeper',
    minMs: 2000,
    name: 'Minesweeper',
    icon: '💣',
    category: 'brain',
    blurb: 'Ten mines hidden in sixty-four squares. Work out where.',
    howTo: 'Tap to open a square. A number says how many mines are touching it.',
    minutes: 5,
  },
  {
    id: 'sky',
    minMs: 15000,
    name: 'Sky Hop',
    icon: '🚀',
    category: 'arcade',
    blurb: 'One tap to fly. Gravity does the rest. Mind the gaps.',
    howTo: 'Tap to fly up, and steer through the gaps.',
    minutes: 2,
  },
  {
    id: 'four',
    minMs: 3000,
    name: 'Four in a Row',
    icon: '🔴',
    category: 'versus',
    blurb: 'You against the app. It plays properly, but you can beat it.',
    howTo: 'Drop your counters. Get four in a row before the app does.',
    minutes: 4,
  },
  {
    id: 'slide',
    minMs: 8000,
    name: 'Slide Puzzle',
    icon: '🧩',
    category: 'puzzle',
    blurb: 'Fifteen tiles, one gap, one correct order.',
    howTo: 'Tap a tile next to the gap to move it. Put them back in order.',
    minutes: 6,
  },
  {
    id: 'chain',
    minMs: 8000,
    name: 'Colour Chain',
    icon: '🟢',
    category: 'brain',
    blurb: 'Watch the colours. Play them back. It gets one longer each time.',
    howTo: 'Watch the colours light up, then tap them back in the same order.',
    minutes: 3,
  },
  {
    id: 'lights',
    minMs: 1500,
    name: 'Lights Out',
    icon: '💡',
    category: 'puzzle',
    blurb: 'Tap a tile and its neighbours flip. Turn them all off.',
    howTo: 'Tapping a light flips it and the ones next to it. Turn them all off.',
    minutes: 4,
  },
  {
    id: 'catch',
    minMs: 28000,
    name: 'Star Catcher',
    icon: '⭐',
    category: 'arcade',
    blurb: 'Stars fall. Catch them. The rocks you do not.',
    howTo: 'Drag the basket to catch the stars and dodge the rocks.',
    minutes: 1,
  },
  {
    id: 'stack',
    minMs: 3000,
    name: 'Stacker',
    icon: '🧱',
    category: 'arcade',
    blurb: 'Time your tap. Stack the tower. Do not wobble.',
    howTo: 'Tap to drop the moving block right on top of the tower.',
    minutes: 2,
  },
  {
    id: 'memory',
    minMs: 4000,
    name: 'Memory Match',
    icon: '🃏',
    category: 'brain',
    blurb: 'Flip the cards, find the pairs, beat your time.',
    howTo: 'Flip two cards at a time and find all the pairs.',
    minutes: 3,
  },
]

/**
 * The game on the front of the hub, which changes every day.
 *
 * Picked from the date rather than at random, so every child in the family
 * sees the same one and it is the same all day — a featured game that
 * reshuffles on every screen change is just a flashing light.
 */
export function featuredGame(dayStamp) {
  const digits = String(dayStamp || '').replace(/\D/g, '')
  const n = Number(digits.slice(-6)) || 0
  return MINIGAMES[n % MINIGAMES.length]
}

export function findGame(id) {
  return MINIGAMES.find((g) => g.id === id) || null
}

/**
 * What a 0–100 score is worth.
 *
 * Mirrored exactly in play_minigame() in supabase/schema.sql — the database is
 * the authority, this copy exists so the app still works with no server and so
 * the child can be shown the number straight away. If you change one, change
 * both; supabase/test/09-minigames.sql checks they agree.
 */
export function coinsForScore(score) {
  const s = Math.max(0, Math.min(100, Math.round(score || 0)))
  return Math.max(1, Math.min(5, Math.round(s / 20)))
}

/**
 * The best score a round of this game could have reached in `elapsedMs`.
 *
 * `minMs` on each game is the quickest a perfect round can be played; a score
 * is possible only in proportion to the time played. Mirrored exactly in
 * minigame_possible_score() in supabase/sync.sql, which is the authority —
 * tests/gameids.mjs fails if the floors disagree. No time at all allows 50.
 */
export function possibleScore(gameId, elapsedMs) {
  const game = findGame(gameId)
  if (!game?.minMs) return 0
  if (elapsedMs == null || !Number.isFinite(elapsedMs)) return 50
  return Math.min(100, Math.floor((100 * Math.max(0, elapsedMs)) / game.minMs))
}

/** Clamped to whatever is left of today's cap. */
export function payout(score, earnedToday) {
  const wanted = coinsForScore(score)
  return Math.max(0, Math.min(wanted, DAILY_COIN_CAP - (earnedToday || 0)))
}
