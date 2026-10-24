/**
 * The three card games, played to the end in a real browser.
 *
 * A card game that compiles is not a card game that works: the failures
 * these catch are a turn that never comes back, a deal that leaves the
 * hand empty, and a game that reaches its last hand and then sits there
 * instead of paying out. So each one is played by clicking whatever is
 * on screen until the arcade says the round is over, with a cap so a
 * game that has hung fails rather than hanging the test too.
 */
import { launch, finish, BASE, SHOT_DIR } from './helpers.mjs'

// An array of the labels that failed, not a count: finish() reads
// fails.length to pick the exit code, and a number has no .length, so a
// counter here makes every run exit 0 however much is broken.
const fails = []
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails.push(label) }
}

const { browser, page, errors } = await launch()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Have a look around/ }).click()
await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 8000 })

/**
 * Open a game from the arcade by its name.
 *
 * Setting the hash is not enough on its own: the previous game's result
 * screen is still mounted over the arcade, so the tiles are not there to
 * click. Anything offering a way out gets pressed first.
 */
async function open(name) {
  for (let i = 0; i < 4; i += 1) {
    const back = page.getByRole('button', { name: /Back|Done|Finish|Arcade|Nice/i }).first()
    if (await back.count()) await back.click({ timeout: 2000 }).catch(() => {})
    await page.evaluate(() => { window.location.hash = '/kid/arcade' })
    await page.waitForTimeout(700)
    const tile = page.getByRole('button', { name: new RegExp(name, 'i') }).first()
    if (await tile.count()) {
      await tile.click()
      await page.waitForTimeout(600)
      const play = page.getByRole('button', { name: /^(Play|Start|Deal)$/ }).first()
      if (await play.count()) { await play.click(); await page.waitForTimeout(500) }
      return
    }
  }
  const text = await page.evaluate(() => document.body.innerText)
  throw new Error(`could not reach "${name}" from:\n${text.slice(0, 400)}`)
}

/**
 * Click through a game until it finishes. Returns how it ended.
 *
 * It presses whatever action button is offered, in a fixed preference
 * order so the run is the same every time, and gives up after a
 * generous number of clicks — a game that needs more than this to
 * finish six hands has a turn that is not coming back.
 */
async function playOut(labels, maxClicks = 120) {
  for (let i = 0; i < maxClicks; i += 1) {
    const text = await page.evaluate(() => document.body.innerText)
    if (/You (earned|scored)|Coins|Back to the arcade|Nice round/i.test(text)
        && !/Hand \d+ of/i.test(text)) {
      return { done: true, clicks: i }
    }
    let clicked = false
    for (const label of labels) {
      const b = page.getByRole('button', { name: label }).and(page.locator(':not([disabled])')).first()
      if (await b.count()) { await b.click({ timeout: 2000 }).catch(() => {}); clicked = true; break }
    }
    await page.waitForTimeout(clicked ? 320 : 600)
  }
  return { done: false, clicks: maxClicks }
}

console.log('\n=== Blackjack ===')
{
  await open('Blackjack')
  const before = await page.evaluate(() => document.body.innerText)
  ok('it deals a hand', /Hand 1 of 6/.test(before), before.slice(0, 120))
  // Stand every time: six hands, no bust loops, and the dealer has to
  // play itself out each time.
  const out = await playOut([/^Stand$/, /^Deal$/])
  ok('six hands play out and the round ends', out.done, `gave up after ${out.clicks} clicks`)
  await page.screenshot({ path: `${SHOT_DIR}/cards-blackjack.png` })
}

console.log("\n=== Texas Hold'em ===")
{
  await open("Texas Hold")
  const before = await page.evaluate(() => document.body.innerText)
  ok('it deals a hand', /Hand 1 of 5/.test(before), before.slice(0, 120))
  const out = await playOut([/^Stay in$/, /^Deal$/])
  ok('five hands play out and the round ends', out.done, `gave up after ${out.clicks} clicks`)
  await page.screenshot({ path: `${SHOT_DIR}/cards-holdem.png` })
}

console.log('\n=== Go Fish ===')
{
  await open('Go Fish')
  const before = await page.evaluate(() => document.body.innerText)
  ok('it deals both hands', /in the pond/.test(before), before.slice(0, 120))
  // Only ranks the player actually holds are offered, so clicking any
  // enabled rank button is always a legal ask.
  const out = await playOut([/^(2|3|4|5|6|7|8|9|10|J|Q|K|A)$/, /^Deal$/], 200)
  ok('the game reaches an end', out.done, `gave up after ${out.clicks} clicks`)
  await page.screenshot({ path: `${SHOT_DIR}/cards-gofish.png` })
}

finish(errors, fails, browser)
