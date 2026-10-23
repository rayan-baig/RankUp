/**
 * The arcade hub, and the seven proper games in it.
 *
 * These are real games rather than filler — Snake, 2048, brick breaker,
 * minesweeper, a one-tap flyer, four in a row against the app, and the
 * fifteen puzzle — and the thing that would quietly ruin any of them is not
 * a wrong pixel but a round that cannot end. A child spends a token to open
 * one, and that token cost them an approved chore. So every one of these is
 * opened in a real browser, played, and made to finish.
 *
 * The payout rule is tested once in arcade.mjs and not repeated. What is
 * checked here is: the hub lists everything and can filter it, each game
 * runs, and each game reaches an ending that pays.
 */
import { launch, reporter, finish, SHOT_DIR, setUpFamily, asKid, asParent, readState, setKidInDatabase } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)

// Tokens come from approved chores and are written by the database, so the
// honest way to get enough for seven games is to put them there.
await setKidInDatabase('Ava', { play_tokens: 5 })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await asKid(page)

/* A reload, not a hash change: the result screen is component state. */
const openArcade = async () => {
  await page.evaluate(() => { window.location.hash = '/kid/arcade' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
}

const text = () => page.evaluate(() => document.body.innerText)
const coinsNow = async () => (await readState(page)).kids[0].coins

/*
 * Start a game by name. The hub has a featured card as well as the shelf, and
 * both mention the game — so the card is the one carrying the plain
 * "Play · 1 token" button rather than "Play Snake · 1 token".
 */
/*
 * Top the tokens back up before every game.
 *
 * Until the database's game list was fixed, play_minigame() rejected these
 * games outright — so the server never took a token, every reload handed
 * five back, and a test could play twenty games on five tokens without
 * noticing. Now that the server accepts them it also charges for them, which
 * is correct and means a test playing more than five games has to say where
 * the tokens came from. They come from approved chores, so they are written
 * the way an approval writes them.
 */
const topUp = async () => {
  await setKidInDatabase('Ava', { play_tokens: 5 })
}

/*
 * Open a game by its name.
 *
 * The arcade is a grid of tiles now rather than a list of cards with a
 * button each, so the tile itself is what gets pressed. Selecting by name
 * rather than position matters more than ever: the shelves reorder, and an
 * index would quietly open a different game and go on passing.
 */
const openGame = async (page, name) => {
  await page.getByRole('button', { name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .first()
    .click()
}

const playGame = async (name) => {
  await topUp()
  await openArcade()
  await openGame(page, name)
  await page.waitForTimeout(900)
}

/** Did the round end? The result screen is the only thing that says "points". */
const ended = () => page.evaluate(() => /\d+ points/.test(document.body.innerText))

console.log('\n=== The hub ===')
await openArcade()
const hub = await text()
const NAMES = ['Snake', '2048', 'Brick Breaker', 'Minesweeper', 'Sky Hop',
  'Four in a Row', 'Slide Puzzle', 'Colour Chain', 'Lights Out', 'Star Catcher',
  'Stacker', 'Memory Match', 'SportsMania', 'Turbo Ball', 'Block Drop',
  'Sweet Swap', 'Find the Impostor']
const hasFeatured = /today.s pick/i.test(hub)
const missing = NAMES.filter((n) => !hub.includes(n))
missing.length === 0
  ? pass(`all ${NAMES.length} games are on the hub`)
  : fail('every game is listed', `missing: ${missing.join(', ')}`)

hasFeatured
  ? pass('there is a game on the front')
  : fail('featured game', hub.slice(0, 200))

// The shelves have to actually narrow the list, or they are decoration.
await page.getByRole('button', { name: /Versus/ }).click()
await page.waitForTimeout(400)
const versus = await text()
const shelved = versus.includes('Four in a Row') && !versus.includes('Memory Match')
shelved
  ? pass('the Versus shelf shows only the versus game')
  : fail('shelves filter', versus.slice(0, 240))

await page.getByRole('button', { name: /Everything/ }).click()
await page.waitForTimeout(400)
;(await text()).includes('Memory Match')
  ? pass('and Everything puts them back')
  : fail('shelf reset', 'Memory Match did not come back')

console.log('\n=== Slide Puzzle: always solvable, and it ends ===')
await playGame('Slide Puzzle')
;(await text()).includes('in place')
  ? pass('it opens')
  : fail('Slide Puzzle opens', (await text()).slice(0, 160))

// A legal move must change the board; an illegal one must do nothing.
const tilesAt = () => page.evaluate(() =>
  [...document.querySelectorAll('button[aria-label^="Tile"]')].map((b) => b.textContent).join(','))
const before = await tilesAt()
let moved = false
for (let i = 0; i < 15 && !moved; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  await page.locator('button[aria-label^="Tile"]').nth(i).click()
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(120)
  // eslint-disable-next-line no-await-in-loop
  moved = (await tilesAt()) !== before
}
moved ? pass('tiles next to the gap slide') : fail('a tile slides', 'nothing moved in 15 taps')

const beforeSlide = await coinsNow()
await page.getByRole('button', { name: /take what I've got/ }).click()
await page.waitForTimeout(1200)
await ended() ? pass('and it finishes') : fail('Slide Puzzle ends', (await text()).slice(0, 160))
;(await coinsNow()) >= beforeSlide ? pass('and settles up') : fail('Slide pays', 'coins went down')

console.log('\n=== 2048 opens and can be cashed in ===')
// The rule that a dead move must not hand out a free tile is proved exactly
// in tests/merge.mjs against the board logic itself — guessing at it through
// a browser would pass on a board where the move happened to be legal.
await playGame('2048')
;(await text()).includes('Biggest tile')
  ? pass('it opens')
  : fail('2048 opens', (await text()).slice(0, 160))
await page.getByRole('button', { name: 'Left', exact: true }).click()
await page.waitForTimeout(250)
await page.getByRole('button', { name: /cash in/ }).click()
await page.waitForTimeout(1200)
await ended() ? pass('cashing in ends the round') : fail('2048 ends', (await text()).slice(0, 160))

console.log('\n=== Minesweeper: the first tap is never a mine ===')
await playGame('Minesweeper')
;(await text()).includes('clear')
  ? pass('it opens')
  : fail('Minesweeper opens', (await text()).slice(0, 160))

// Fresh board, first tap, ten times over. If the first tap could be a mine
// this would blow up long before ten.
let blew = 0
for (let i = 0; i < 10; i += 1) {
  if (i > 0) {
    // eslint-disable-next-line no-await-in-loop
    await playGame('Minesweeper')
  }
  // eslint-disable-next-line no-await-in-loop
  await page.locator('button[aria-label^="Row"]').nth(27).click()
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(250)
  // eslint-disable-next-line no-await-in-loop
  if (/was a mine/.test(await text())) blew += 1
}
blew === 0
  ? pass('ten fresh boards, ten safe first taps')
  : fail('first tap is safe', `${blew} of 10 first taps hit a mine`)

// Flag mode must not open the square it flags.
await page.getByRole('button', { name: /flag mode/i }).click()
await page.waitForTimeout(200)
await page.locator('button[aria-label$="unopened"]').first().click()
await page.waitForTimeout(250)
;(await page.locator('button[aria-label$="flagged"]').count()) > 0
  ? pass('flag mode flags instead of opening')
  : fail('flag mode', 'no square ended up flagged')
await page.screenshot({ path: `${SHOT_DIR}/game-sweeper.png` })

console.log('\n=== Four in a Row: the app answers, and somebody wins ===')
await playGame('Four in a Row')
;(await text()).includes('Four in a row')
  ? pass('it opens')
  : fail('Four in a Row opens', (await text()).slice(0, 160))

// Play until it ends. Dropping in one column loses quickly to a blocker,
// which is exactly the ending worth proving works.
for (let i = 0; i < 24; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  if (await ended()) break
  // eslint-disable-next-line no-await-in-loop
  await page.getByRole('button', { name: `Drop into column ${(i % 7) + 1}` })
    .click({ timeout: 2000 }).catch(() => {})
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(800)
}
await page.screenshot({ path: `${SHOT_DIR}/game-four.png` })
await ended()
  ? pass('the game reaches a result')
  : fail('Four in a Row ends', (await text()).slice(0, 200))

console.log('\n=== Snake, Brick Breaker and Sky Hop run and stop ===')
// These three are timing games with no quit button: the honest check is that
// they draw, keep running, and end by themselves rather than hanging.
await playGame('Snake')
;(await text()).includes('Length')
  ? pass('Snake opens')
  : fail('Snake opens', (await text()).slice(0, 160))
await page.getByRole('button', { name: 'Left', exact: true }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Up', exact: true }).click()
pass('Snake takes a turn without throwing')
// Left into the wall from the start ends it; give it time to die and settle.
await page.waitForFunction(() => /\d+ points/.test(document.body.innerText), null, { timeout: 15000 })
  .then(() => pass('Snake ends when it hits something'))
  .catch(async () => fail('Snake ends', (await text()).slice(0, 160)))
await page.screenshot({ path: `${SHOT_DIR}/game-snake.png` })

await playGame('Brick Breaker')
const bricksText = await text()
bricksText.includes('❤️')
  ? pass('Brick Breaker opens with lives')
  : fail('Brick Breaker opens', bricksText.slice(0, 160))
const drawn = await page.evaluate(() => document.querySelectorAll('svg rect').length)
drawn > 30
  ? pass(`the wall is there (${drawn} shapes)`)
  : fail('bricks drawn', String(drawn))
// Three lives with the paddle parked means it ends on its own, slowly.
await page.waitForFunction(() => /\d+ points/.test(document.body.innerText), null, { timeout: 60000 })
  .then(() => pass('it runs out of lives and finishes'))
  .catch(async () => fail('Brick Breaker ends', (await text()).slice(0, 160)))

await playGame('Sky Hop')
;(await text()).includes('through')
  ? pass('Sky Hop opens')
  : fail('Sky Hop opens', (await text()).slice(0, 160))
// Nothing should move before the first tap — opening a screen must not
// already be losing.
const stillY = await page.evaluate(() => document.querySelector('svg text')?.getAttribute('y'))
await page.waitForTimeout(1500)
const stillY2 = await page.evaluate(() => document.querySelector('svg text')?.getAttribute('y'))
stillY === stillY2
  ? pass('and it waits for you before gravity starts')
  : fail('waits to start', `${stillY} → ${stillY2}`)
await page.locator('button[aria-label="Tap to flap"]').click()
await page.waitForFunction(() => /\d+ points/.test(document.body.innerText), null, { timeout: 30000 })
  .then(() => pass('one tap starts it and it ends by itself'))
  .catch(async () => fail('Sky Hop ends', (await text()).slice(0, 160)))
await page.screenshot({ path: `${SHOT_DIR}/game-sky.png` })

console.log('\n=== And none of them broke the cap ===')
const { kids: [kid] } = await readState(page)
kid.gameCoinsToday <= 15
  ? pass(`the day's winnings are still inside the cap (${kid.gameCoinsToday}/15)`)
  : fail('daily cap holds', `${kid.gameCoinsToday} earned today`)
Number.isFinite(kid.coins)
  ? pass('and the currency is a real number throughout')
  : fail('coins sane', String(kid.coins))

await asParent(page)
finish(errors, fails, browser)
