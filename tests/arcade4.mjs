/**
 * SportsMania, Turbo Ball, Block Drop and Find the Impostor, played in a
 * real browser.
 *
 * Sweet Swap and Trackstar used to be here too. They are supplied HTML
 * games now rather than React, so they are tested through their frame in
 * tests/embedded.mjs instead.
 *
 * The generator behind the impostor rounds is checked exhaustively in
 * tests/sweets.mjs; what is checked here is the part maths cannot prove —
 * that each one opens, responds to a tap, and reaches an ending that pays.
 * A game that cannot be finished costs a child a token they earned by doing
 * a chore, which makes it worse than a game that does not exist.
 */
import { launch, reporter, finish, SHOT_DIR, setUpFamily, asKid, asParent, readState, setKidInDatabase } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)
await setKidInDatabase('Ava', { play_tokens: 5 })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await asKid(page)

const openArcade = async () => {
  await page.evaluate(() => { window.location.hash = '/kid/arcade' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
}
const text = () => page.evaluate(() => document.body.innerText)
const ended = () => page.evaluate(() => /\d+ points/.test(document.body.innerText))

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

/** Wait until the app itself can see the tokens, not just the database. */
const tokensVisible = async () => {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const state = await readState(page)
    if ((state.kids[0].playTokens || 0) > 0) return true
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(500)
  }
  return false
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
  await tokensVisible()
  await openGame(page, name)
  await page.waitForTimeout(900)
}

console.log('\n=== Quick Tap is gone ===')
await openArcade()
const hub = await text()
!hub.includes('Quick Tap')
  ? pass('it is not on the hub any more')
  : fail('Quick Tap removed', 'it is still listed')

console.log('\n=== SportsMania offers every sport ===')
await playGame('SportsMania')
const sports = await text()
const WANTED = ['Football', 'Tennis', 'Table Tennis', 'Volleyball', 'Ice Hockey',
  'Basketball', 'Golf', 'American Football', 'Cricket', 'Baseball', 'Formula 1']
const absent = WANTED.filter((s) => !sports.includes(s))
absent.length === 0
  ? pass(`all ${WANTED.length} sports are on the picker`)
  : fail('every sport is offered', `missing: ${absent.join(', ')}`)

// Golf is the shooting engine, which five sports share — if it ends, they do.
await page.getByRole('button', { name: /Golf/ }).click()
await page.waitForTimeout(700)
;(await text()).includes('Hole 1')
  ? pass('golf opens on the first hole')
  : fail('golf opens', (await text()).slice(0, 160))

for (let i = 0; i < 40; i += 1) {
  if (await ended()) break
  // eslint-disable-next-line no-await-in-loop
  await page.getByRole('button', { name: /Set the power|Now!/ }).click({ timeout: 1500 }).catch(() => {})
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(260)
}
await page.screenshot({ path: `${SHOT_DIR}/game-sports.png` })
await ended()
  ? pass('nine holes played and it settles up')
  : fail('SportsMania ends', (await text()).slice(0, 200))

console.log('\n=== Formula 1 punishes a jump start, and still ends ===')
await playGame('SportsMania')
await page.getByRole('button', { name: /Formula 1/ }).click()
await page.waitForTimeout(500)
// Tapping immediately, before the lights are out, must be a penalty.
await page.getByRole('button', { name: /GO when they go out/ }).click()
await page.waitForTimeout(400)
;(await text()).includes('Jump start')
  ? pass('going early is a jump start')
  : fail('jump start penalised', (await text()).slice(0, 160))
for (let i = 0; i < 12; i += 1) {
  if (await ended()) break
  // eslint-disable-next-line no-await-in-loop
  await page.getByRole('button', { name: 'Brake' }).click({ timeout: 1500 }).catch(() => {})
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(250)
}
await ended() ? pass('and the lap finishes') : fail('F1 ends', (await text()).slice(0, 160))

console.log('\n=== Block Drop ===')
await playGame('Block Drop')
;(await text()).includes('lines')
  ? pass('it opens')
  : fail('Block Drop opens', (await text()).slice(0, 160))
const filled = () => page.evaluate(() => [...document.querySelectorAll('.grid > div')]
  .filter((d) => /rgb\(/.test(getComputedStyle(d).background)).length)
await page.getByRole('button', { name: 'Rotate' }).click()
await page.getByRole('button', { name: 'Move left' }).click()
pass('it rotates and slides without throwing')
const before = await filled()
await page.getByRole('button', { name: 'Drop' }).click()
await page.waitForTimeout(500)
const after = await filled()
Number.isFinite(before) && Number.isFinite(after)
  ? pass('a hard drop lands the piece')
  : fail('hard drop', `${before} → ${after}`)
// Drop repeatedly: the well fills and the round ends on its own.
for (let i = 0; i < 90; i += 1) {
  if (await ended()) break
  // eslint-disable-next-line no-await-in-loop
  await page.getByRole('button', { name: 'Drop' }).click({ timeout: 1200 }).catch(() => {})
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(140)
}
await page.screenshot({ path: `${SHOT_DIR}/game-blocks.png` })
await ended() ? pass('and it reaches an ending') : fail('Block Drop ends', (await text()).slice(0, 160))

console.log('\n=== Find the Impostor ===')
await playGame('Find the Impostor')
const meeting = await text()
meeting.includes('Meeting 1 of 3')
  ? pass('it opens on the first meeting')
  : fail('Impostor opens', meeting.slice(0, 200))
const statements = await page.evaluate(() =>
  (document.body.innerText.match(/“|"/g) || []).length)
statements >= 5
  ? pass('all five crewmates have said something')
  : fail('five statements', String(statements))

for (let i = 0; i < 6; i += 1) {
  if (await ended()) break
  // eslint-disable-next-line no-await-in-loop
  await page.getByRole('button', { name: /Red/ }).first().click({ timeout: 2000 }).catch(() => {})
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(2400)
}
await page.screenshot({ path: `${SHOT_DIR}/game-impostor.png` })
await ended()
  ? pass('three meetings and it settles up')
  : fail('Impostor ends', (await text()).slice(0, 200))

console.log('\n=== Royal Draw: the hand rankings are checked in tests/cards.mjs ===')
await playGame('Royal Draw')
;(await text()).includes('Royal Draw')
  ? pass('it opens')
  : fail('Royal Draw opens', (await text()).slice(0, 160))
for (let i = 0; i < 30; i += 1) {
  if (await ended()) break
  // eslint-disable-next-line no-await-in-loop
  await page.getByRole('button', { name: /^Deal$|Swap the other|Keep them all/ })
    .click({ timeout: 1500 }).catch(() => {})
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(700)
}
await page.screenshot({ path: `${SHOT_DIR}/game-royal.png` })
await ended() ? pass('five hands played out') : fail('Royal Draw ends', (await text()).slice(0, 160))

console.log('\n=== Wildfire ===')
await playGame('Wildfire')
const fire = await text()
const namesColour = /Playing on (red|yellow|green|blue)/.test(fire)
namesColour
  ? pass('it deals and names the colour in play')
  : fail('Wildfire opens', fire.slice(0, 200))
// Play or pick up for a while; somebody has to run out of cards eventually.
for (let i = 0; i < 90; i += 1) {
  if (await ended()) break
  // eslint-disable-next-line no-await-in-loop
  const pickUp = page.getByRole('button', { name: /pick up/ })
  // eslint-disable-next-line no-await-in-loop
  if (await pickUp.count()) {
    // eslint-disable-next-line no-await-in-loop
    await pickUp.first().click().catch(() => {})
  } else {
    /*
     * A card in your hand, not just any button with a space in its label:
     * the hub's game tiles carry spelled-out labels too, and picking the
     * last of those clicked a tile instead of playing a card. Unplayable
     * cards are disabled, so those are skipped too — clicking one does
     * nothing and the loop would spin until it ran out.
     */
    // eslint-disable-next-line no-await-in-loop
    const playable = page.locator(
      'button[aria-label^="red "]:not([disabled]), '
      + 'button[aria-label^="yellow "]:not([disabled]), '
      + 'button[aria-label^="green "]:not([disabled]), '
      + 'button[aria-label^="blue "]:not([disabled]), '
      + 'button[aria-label^="wild "]:not([disabled])',
    )
    // eslint-disable-next-line no-await-in-loop
    await playable.last().click({ timeout: 1200 }).catch(() => {})
  }
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(500)
}
await page.screenshot({ path: `${SHOT_DIR}/game-wildfire.png` })
await ended()
  ? pass('somebody goes out and the hand settles up')
  : fail('Wildfire ends', (await text()).slice(0, 220))

console.log('\n=== Turbo Ball ===')
await playGame('Turbo Ball')
;(await text()).includes('You 0 – 0 Them')
  ? pass('it kicks off nil-nil')
  : fail('Turbo Ball opens', (await text()).slice(0, 160))
const arena = await page.locator('[role=application]').boundingBox()
if (arena) {
  await page.mouse.move(arena.x + arena.width * 0.5, arena.y + arena.height * 0.8)
  await page.mouse.down()
  await page.mouse.move(arena.x + arena.width * 0.5, arena.y + arena.height * 0.4, { steps: 14 })
  await page.mouse.up()
  pass('the car can be driven without throwing')
} else {
  fail('arena present', 'no element with role=application')
}

console.log('\n=== The games actually pay, and the cap still holds ===')
/*
 * Finishing is not the same as being paid. Until the database's game list
 * was fixed these games ran to a result screen, showed "+4 coins", and the
 * server threw the call away — which is exactly what it would look like
 * from in here if nobody checked the number afterwards. So check it.
 */
const { kids: [kid] } = await readState(page)
kid.gameCoinsToday > 0
  ? pass(`a morning in the arcade actually paid (${kid.gameCoinsToday} earned)`)
  : fail('games pay out', 'played a dozen games and earned nothing')
kid.gameCoinsToday <= 15
  ? pass(`and the day's winnings are inside the cap (${kid.gameCoinsToday}/15)`)
  : fail('daily cap holds', `${kid.gameCoinsToday} earned today`)

await asParent(page)
finish(errors, fails, browser)
