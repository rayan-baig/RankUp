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

export const MINIGAMES = [
  {
    id: 'sports',
    name: 'SportsMania',
    icon: '🏆',
    category: 'sports',
    blurb: 'Eleven sports in one. Football, tennis, golf, F1, cricket and more.',
    howTo: 'Pick a sport and play one event. Your token is only spent when it ends.',
    minutes: 3,
  },
  {
    id: 'turbo',
    name: 'Turbo Ball',
    icon: '🚗',
    category: 'sports',
    blurb: 'Football with cars. You cannot carry the ball, only hit it.',
    howTo: 'Drag to drive. Seventy-five seconds. Shove the ball into the top goal.',
    minutes: 2,
  },
  {
    id: 'blocks',
    name: 'Block Drop',
    icon: '🟦',
    category: 'puzzle',
    blurb: 'Falling shapes. Fill a row and it clears.',
    howTo: 'Slide, rotate, drop. Clear ten lines for a perfect round.',
    minutes: 4,
  },
  {
    id: 'sweets',
    name: 'Sweet Swap',
    icon: '🍬',
    category: 'puzzle',
    blurb: 'Swap two sweets, line up three, watch the rest fall in.',
    howTo: 'Twenty moves, no timer. A swap that matches nothing is free.',
    minutes: 5,
  },
  {
    id: 'impostor',
    name: 'Find the Impostor',
    icon: '🕵️',
    category: 'brain',
    blurb: 'Five crewmates. The crew tell the truth. One of them does not.',
    howTo: 'Three meetings. Work out who is lying — every round has one answer.',
    minutes: 4,
  },
  {
    id: 'track',
    name: 'Trackstar',
    icon: '🛹',
    category: 'arcade',
    blurb: 'Three lanes, no brakes. Dodge what comes at you.',
    howTo: 'Swipe to change lane, swipe up to jump. Sixty seconds.',
    minutes: 1,
  },
  {
    id: 'wildfire',
    name: 'Wildfire',
    icon: '🔥',
    category: 'cards',
    blurb: 'Match the colour or the number. First to an empty hand wins.',
    howTo: 'Three opponents. Skips, pick-twos and wilds. No timer.',
    minutes: 5,
  },
  {
    id: 'royal',
    name: 'Royal Draw',
    icon: '♠️',
    category: 'cards',
    blurb: 'Five cards. Keep what you like, swap the rest once.',
    howTo: 'Five hands. The payout table is on screen — nothing is ever bet.',
    minutes: 3,
  },
  {
    id: 'snake',
    name: 'Snake',
    icon: '🐍',
    category: 'arcade',
    blurb: 'Eat, grow, and run out of room. The one everybody already knows.',
    howTo: 'Swipe, use the pad, or the arrow keys. Reach twenty-five long.',
    minutes: 2,
  },
  {
    id: 'merge',
    name: '2048',
    icon: '🔢',
    category: 'puzzle',
    blurb: 'Slide the board. Matching numbers join. Build the biggest tile.',
    howTo: 'No timer. Every doubling scores; 2048 is perfect. Cash in whenever.',
    minutes: 6,
  },
  {
    id: 'bricks',
    name: 'Brick Breaker',
    icon: '🏓',
    category: 'arcade',
    blurb: 'A ball, a paddle, and a wall that will not clear itself.',
    howTo: 'Drag the paddle. The edge sends the ball off at an angle. Three lives.',
    minutes: 3,
  },
  {
    id: 'sweeper',
    name: 'Minesweeper',
    icon: '💣',
    category: 'brain',
    blurb: 'Ten mines hidden in sixty-four squares. Work out where.',
    howTo: 'The numbers count the mines touching. Your first tap is always safe.',
    minutes: 5,
  },
  {
    id: 'sky',
    name: 'Sky Hop',
    icon: '🚀',
    category: 'arcade',
    blurb: 'One tap to fly. Gravity does the rest. Mind the gaps.',
    howTo: 'Tap to lift. Fifteen gaps is a perfect run.',
    minutes: 2,
  },
  {
    id: 'four',
    name: 'Four in a Row',
    icon: '🔴',
    category: 'versus',
    blurb: 'You against the app. It plays properly, but you can beat it.',
    howTo: 'Drop counters. Four across, down or slanted wins. You go first.',
    minutes: 4,
  },
  {
    id: 'slide',
    name: 'Slide Puzzle',
    icon: '🧩',
    category: 'puzzle',
    blurb: 'Fifteen tiles, one gap, one correct order.',
    howTo: 'Tap a tile next to the gap. Green means it is already home. No timer.',
    minutes: 6,
  },
  {
    id: 'chain',
    name: 'Colour Chain',
    icon: '🟢',
    category: 'brain',
    blurb: 'Watch the colours. Play them back. It gets one longer each time.',
    howTo: 'No timer. Get to a chain of ten for a perfect round.',
    minutes: 3,
  },
  {
    id: 'lights',
    name: 'Lights Out',
    icon: '💡',
    category: 'puzzle',
    blurb: 'Tap a tile and its neighbours flip. Turn them all off.',
    howTo: 'A puzzle, not a race — there is no clock. Fewer moves scores more.',
    minutes: 4,
  },
  {
    id: 'catch',
    name: 'Star Catcher',
    icon: '⭐',
    category: 'arcade',
    blurb: 'Stars fall. Catch them. The rocks you do not.',
    howTo: 'Thirty seconds. Drag the basket. Twenty stars is a great run.',
    minutes: 1,
  },
  {
    id: 'stack',
    name: 'Stacker',
    icon: '🧱',
    category: 'arcade',
    blurb: 'Time your tap. Stack the tower. Do not wobble.',
    howTo: 'Tap when the moving block lines up. Miss badly and the run ends.',
    minutes: 2,
  },
  {
    id: 'memory',
    name: 'Memory Match',
    icon: '🃏',
    category: 'brain',
    blurb: 'Flip the cards, find the pairs, beat your time.',
    howTo: 'Eight pairs. Fewer flips and less time means a better score.',
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

/** Clamped to whatever is left of today's cap. */
export function payout(score, earnedToday) {
  const wanted = coinsForScore(score)
  return Math.max(0, Math.min(wanted, DAILY_COIN_CAP - (earnedToday || 0)))
}
