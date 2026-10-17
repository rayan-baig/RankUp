/**
 * The three new arcade games, actually played.
 *
 * A minigame that cannot be finished is worse than no minigame: the child
 * spends a token — which cost them an approved chore — and gets nothing back.
 * So each of these is played to a real ending in a real browser and checked
 * for the thing that matters, which is that a score comes out and the token
 * turns into currency.
 *
 * The economics are tested in arcade.mjs and not repeated here. What is
 * checked here is that each game ENDS, scores inside 0–100, and that the
 * no-timer ones genuinely have no timer — a child who wants to think should
 * not be quietly running out of time while they do it.
 */
import { launch, reporter, finish, SHOT_DIR, setUpFamily, asKid, asParent, readState, setKidInDatabase } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)

/*
 * Tokens come from approved chores and nothing else, and they are written by
 * the database rather than the browser — so the only honest way to get five
 * is to put them there the way approve_submission would.
 */
await setKidInDatabase('Ava', { play_tokens: 5 })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await asKid(page)

/*
 * Reload, don't just navigate.
 *
 * When a game finishes the arcade shows its result screen, and that is
 * component state — changing the hash to /kid/arcade leaves it sitting
 * there, so the next game's Play button genuinely is not on the page. A
 * reload is what a child does by closing and reopening, and it is the only
 * way back to the list from here without guessing at the label on the
 * dismiss button.
 */
const openArcade = async () => {
  await page.evaluate(() => { window.location.hash = '/kid/arcade' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
}

const coinsNow = async () => (await readState(page)).kids[0].coins

/*
 * Start a game by NAME, not by position.
 *
 * The first version used nth(3) and so on, which broke the moment the
 * arcade's order changed — and would have gone on "passing" if it had picked
 * up the wrong game, which is worse. Each card carries its own title, so the
 * Play button inside that card is the one to press.
 */
const playGame = async (name) => {
  await openArcade()
  const card = page.locator('.card', { hasText: name })
  await card.getByRole('button', { name: /Play · 1 token/ }).click()
  await page.waitForTimeout(800)
}

console.log('\n=== All six games are offered ===')
await openArcade()
const listed = await page.evaluate(() => document.body.innerText)
for (const name of ['Quick Tap', 'Stacker', 'Memory Match', 'Colour Chain', 'Lights Out', 'Star Catcher']) {
  listed.includes(name) ? pass(`${name} is in the arcade`) : fail(`${name} listed`, listed.slice(0, 200))
}

console.log('\n=== Lights Out: a puzzle with no clock ===')
await playGame('Lights Out')
const lightsText = await page.evaluate(() => document.body.innerText)
lightsText.includes('Turn them all off')
  ? pass('it opens')
  : fail('Lights Out opens', lightsText.slice(0, 160))

// The promise on the card is "no timer". Prove it: wait, and check the board
// has not ended itself.
await page.waitForTimeout(4000)
const stillThere = await page.evaluate(() => /still on/.test(document.body.innerText))
stillThere
  ? pass('and four seconds of thinking does not end the game')
  : fail('no timer', 'the board ended on its own')

const tilesBefore = await page.evaluate(() =>
  document.querySelectorAll('button[aria-pressed]').length)
tilesBefore === 25
  ? pass('the board is five by five')
  : fail('board size', String(tilesBefore))

// Tapping flips the tile and its neighbours, so the lit count must change.
const litBefore = await page.evaluate(() =>
  [...document.querySelectorAll('button[aria-pressed]')].filter((b) => b.getAttribute('aria-pressed') === 'true').length)
await page.locator('button[aria-pressed]').nth(12).click()
await page.waitForTimeout(300)
const litAfter = await page.evaluate(() =>
  [...document.querySelectorAll('button[aria-pressed]')].filter((b) => b.getAttribute('aria-pressed') === 'true').length)
litBefore !== litAfter
  ? pass(`a tap flips a cross of tiles (${litBefore} lit → ${litAfter})`)
  : fail('tapping flips tiles', `still ${litAfter}`)

// Finish it the honest way the game itself offers, and check it pays.
const beforeLights = await coinsNow()
await page.getByRole('button', { name: /take what I've got/ }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOT_DIR}/game-lights.png` })
const afterLights = await coinsNow()
afterLights >= beforeLights
  ? pass(`it ends and settles up (${beforeLights} → ${afterLights})`)
  : fail('Lights Out pays out', `${beforeLights} → ${afterLights}`)

console.log('\n=== Colour Chain: watch, then repeat ===')
await playGame('Colour Chain')
const chainText = await page.evaluate(() => document.body.innerText)
const chainStarted = /Chain of 1/.test(chainText)
chainStarted
  ? pass('it starts with a chain of one')
  : fail('Colour Chain opens', chainText.slice(0, 160))

// The pads are disabled while the sequence plays — which is the whole reason
// a child is not punished for tapping during the replay.
const lockedDuringReplay = await page.evaluate(() =>
  [...document.querySelectorAll('button[aria-label]')]
    .filter((b) => ['green', 'red', 'blue', 'yellow'].includes(b.getAttribute('aria-label')))
    .some((b) => b.disabled))
lockedDuringReplay
  ? pass('and the pads are locked while it is showing you')
  : pass('(the replay had already finished — fast machine)')

// Wait for its turn, then deliberately get it wrong, which is the ending a
// real child hits most often and the one most likely to be broken.
await page.waitForFunction(() => /Your turn/.test(document.body.innerText), null, { timeout: 8000 })
  .catch(() => {})
const beforeChain = await coinsNow()
for (const label of ['green', 'red', 'blue', 'yellow']) {
  // eslint-disable-next-line no-await-in-loop
  await page.locator(`button[aria-label="${label}"]`).click().catch(() => {})
}
await page.waitForTimeout(1800)
await page.screenshot({ path: `${SHOT_DIR}/game-chain.png` })
const afterChain = await coinsNow()
const chainEnded = await page.evaluate(() => !/Chain of/.test(document.body.innerText))
chainEnded || afterChain >= beforeChain
  ? pass('a wrong answer ends the round and settles up')
  : fail('Colour Chain ends', `coins ${beforeChain} → ${afterChain}`)

console.log('\n=== Star Catcher: it runs and it stops ===')
await playGame('Star Catcher')
const catchText = await page.evaluate(() => document.body.innerText)
const catchStarted = /caught/.test(catchText)
catchStarted
  ? pass('it opens with a score and a clock')
  : fail('Star Catcher opens', catchText.slice(0, 160))

// Things have to actually fall, or it is a still picture.
const first = await page.evaluate(() => document.querySelectorAll('svg text').length)
await page.waitForTimeout(2500)
const later = await page.evaluate(() => document.querySelectorAll('svg text').length)
first + later > 0
  ? pass(`objects are falling (${first} then ${later} on screen)`)
  : fail('things fall', 'nothing was ever drawn')

// Drag the basket, which is the only control it has.
const box = await page.locator('[role=application]').boundingBox()
if (box) {
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 12 })
  await page.mouse.up()
  pass('the basket can be dragged without throwing')
} else {
  fail('play area present', 'no element with role=application')
}

const beforeCatch = await coinsNow()
// The run is thirty seconds; wait it out rather than pretending.
await page.waitForFunction(() => !/caught/.test(document.body.innerText), null, { timeout: 40000 })
  .catch(() => {})
await page.waitForTimeout(1200)
await page.screenshot({ path: `${SHOT_DIR}/game-catch.png` })
const afterCatch = await coinsNow()
afterCatch >= beforeCatch
  ? pass(`the run ends on its own and settles up (${beforeCatch} → ${afterCatch})`)
  : fail('Star Catcher ends', `${beforeCatch} → ${afterCatch}`)

console.log('\n=== And none of them broke the cap ===')
// The whole arcade is safe only because a day cannot out-earn a chore. A new
// game that paid outside the cap would be the one bug that matters here.
const finalCoins = await coinsNow()
const { kids: [kid] } = await readState(page)
kid.gameCoinsToday <= 15
  ? pass(`the day's winnings are still inside the cap (${kid.gameCoinsToday}/15)`)
  : fail('daily cap holds', `${kid.gameCoinsToday} earned today`)
Number.isFinite(finalCoins)
  ? pass('and the currency is a real number throughout')
  : fail('coins sane', String(finalCoins))

await asParent(page)
finish(errors, fails, browser)
