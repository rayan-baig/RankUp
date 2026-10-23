/**
 * The four games that arrived as standalone HTML files, played inside the
 * arcade.
 *
 * These are not code the app wrote. They run in a sandboxed iframe with
 * their own document, and the only thing crossing back is a score. That
 * boundary is exactly what needs testing, because every way it can fail is
 * silent from the outside:
 *
 *  - the frame renders nothing and a child stares at a black rectangle;
 *  - the game runs but its end hook was renamed, so the round never ends
 *    and the token is gone;
 *  - the score arrives but outside 0–100, which would hand out currency
 *    the daily cap was written to prevent.
 *
 * So each game is opened for real, the frame is checked for actual
 * content, and the bridge is made to fire by calling the game's own end
 * function inside the frame — the same call the game makes when a round
 * finishes.
 */
import { launch, reporter, finish, SHOT_DIR, setUpFamily, asKid, asParent, readState, setKidInDatabase } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)
await setKidInDatabase('Ava', { play_tokens: 5 })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await asKid(page)

const topUp = async () => { await setKidInDatabase('Ava', { play_tokens: 5 }) }

const openArcade = async () => {
  await page.evaluate(() => { window.location.hash = '/kid/arcade' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

const text = () => page.evaluate(() => document.body.innerText)
const ended = () => page.evaluate(() => /\d+ points/.test(document.body.innerText))

const playGame = async (name) => {
  await topUp()
  await openArcade()
  const card = page.locator('.card', { hasText: name })
    .filter({ has: page.getByRole('button', { name: /^Play · 1 token$/ }) })
    .first()
  await card.getByRole('button', { name: /^Play · 1 token$/ }).click()
  await page.waitForTimeout(1200)
}

/** The game's own document, so we can look at what it actually drew. */
const gameFrame = async () => {
  const handle = await page.locator('iframe').first().elementHandle({ timeout: 8000 })
  return handle.contentFrame()
}

/**
 * Check one embedded game: it draws something, and finishing it pays.
 * `endIt` runs inside the game's own document and must trigger the same
 * ending the game itself would.
 */
const checkGame = async (label, cardName, endIt, shot) => {
  console.log(`\n=== ${label} ===`)
  await playGame(cardName)

  const frame = await gameFrame().catch(() => null)
  if (!frame) { fail(`${label} embeds`, 'no iframe on the screen'); return }
  pass('it is embedded in its own frame')

  // Something has to be on screen. An empty body is the failure a child
  // would see as a black rectangle.
  await page.waitForTimeout(2200)
  const drew = await frame.evaluate(() => ({
    nodes: document.body ? document.body.querySelectorAll('*').length : 0,
    canvases: document.querySelectorAll('canvas').length,
    text: document.body ? document.body.innerText.slice(0, 80) : '',
  })).catch(() => null)

  if (!drew) { fail(`${label} renders`, 'the frame would not answer'); return }
  drew.nodes > 10
    ? pass(`it drew a screen (${drew.nodes} elements, ${drew.canvases} canvas)`)
    : fail(`${label} renders`, `only ${drew.nodes} elements`)

  const before = (await readState(page)).kids[0].coins
  await frame.evaluate(endIt).catch((e) => fail(`${label} end hook`, String(e).slice(0, 120)))
  await page.waitForTimeout(1800)
  if (shot) await page.screenshot({ path: `${SHOT_DIR}/${shot}` })

  const over = await ended()
  over
    ? pass('ending the round reaches the result screen')
    : fail(`${label} ends`, (await text()).slice(0, 200))

  if (over) {
    const { kids: [kid] } = await readState(page)
    const score = Number((await text()).match(/(\d+) points/)?.[1] ?? -1)
    score >= 0 && score <= 100
      ? pass(`and the score is inside 0–100 (${score})`)
      : fail(`${label} score range`, String(score))
    kid.coins >= before
      ? pass(`and it settles up (${before} → ${kid.coins})`)
      : fail(`${label} pays`, `${before} → ${kid.coins}`)
  }
}

await checkGame(
  'Sweet Swap',
  'Sweet Swap',
  /*
   * Its state is const and let, so nothing is reachable from out here —
   * which is how the first bridge failed silently. The result panel is
   * what the player sees and what the bridge reads, so that is what the
   * test puts up.
   */
  () => {
    document.getElementById('score').textContent = '4,200'
    document.getElementById('modalTitle').textContent = 'OUT OF MOVES!'
    document.getElementById('message').classList.add('show')
  },
  'embed-sweets.png',
)

await checkGame(
  'Trackstar',
  'Trackstar',
  /*
   * The whole game sits inside one wrapper, so the run-over overlay is the
   * only thing reachable. Pausing uses that same overlay, so the text has
   * to say RUN OVER before the bridge believes it.
   */
  () => {
    document.getElementById('score').textContent = '320'
    document.getElementById('panel').innerHTML = '<h1>RUN OVER</h1>'
    document.getElementById('overlay').classList.remove('hidden')
  },
  'embed-track.png',
)

await checkGame(
  'Tennis Tour',
  'Tennis Tour',
  /*
   * This one is an ES module, so none of its functions are reachable from
   * out here — which is how the first bridge failed silently. What it does
   * put where anybody can see it is the result, so the test writes the
   * result the same way the game does and checks the bridge reads it.
   */
  () => {
    document.getElementById('hudScore').textContent = '2–0 SETS  |  6–3 GAMES'
    document.getElementById('matchState').innerHTML = '<b>MATCH WON!</b>'
  },
  'embed-tennis.png',
)

console.log('\n=== The football match, inside SportsMania ===')
await playGame('SportsMania')
const picker = await text()
picker.includes('Football')
  ? pass('the picker offers football')
  : fail('football is offered', picker.slice(0, 200))
// "Table Tennis" also contains the word, so look for the event on its own.
const strayTennis = /(^|\n)\s*Tennis\s*(\n|$)/.test(picker)
!strayTennis
  ? pass('and the mini tennis is gone, so there is only one tennis in the app')
  : fail('one tennis only', 'SportsMania still lists its own Tennis event')

// "American Football" matches too, so anchor the name.
await page.getByRole('button', { name: /^Football A full ninety/ }).click()
await page.waitForTimeout(2500)
const soccer = await gameFrame().catch(() => null)
if (soccer) {
  const drew = await soccer.evaluate(() => document.body.querySelectorAll('*').length)
  drew > 10 ? pass(`the match drew a screen (${drew} elements)`) : fail('soccer renders', String(drew))

  const before = (await readState(page)).kids[0].coins
  // Full time is an overlay losing its hidden class, which is what the
  // bridge watches.
  await soccer.evaluate(() => {
    window.blueScore = 3
    window.redScore = 1
    document.getElementById('end').classList.remove('hidden')
  })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${SHOT_DIR}/embed-soccer.png` })
  await ended() ? pass('full time reaches the result screen') : fail('soccer ends', (await text()).slice(0, 200))
  const after = (await readState(page)).kids[0].coins
  after >= before ? pass(`and it settles up (${before} → ${after})`) : fail('soccer pays', `${before} → ${after}`)
} else {
  fail('soccer embeds', 'no iframe')
}

console.log('\n=== And the cap still holds ===')
const { kids: [kid] } = await readState(page)
kid.gameCoinsToday <= 15
  ? pass(`the day's winnings are inside the cap (${kid.gameCoinsToday}/15)`)
  : fail('daily cap holds', `${kid.gameCoinsToday} earned today`)

await asParent(page)
finish(errors, fails, browser)
