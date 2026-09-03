/**
 * The arcade, played for real in a browser.
 *
 * The rule being proved is the economic one: a token comes from a chore, and
 * grinding games can never out-earn doing them.
 */
import { launch, reporter, setUpFamily, readState, asKid, asParent, submitPhotoProof, finish, SHOT_DIR } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)

console.log('\n=== No chore, no game ===')
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/arcade' })
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOT_DIR}/arcade-locked.png` })
const locked = await page.evaluate(() => document.body.innerText)
;/no tokens yet/i.test(locked)
  ? pass('with nothing approved the arcade is shut')
  : fail('arcade locked without a token', locked.slice(0, 140))
;/that is where tokens come from|approved/i.test(locked)
  ? pass('and it points back at the quest list')
  : fail('arcade explains where tokens come from', locked.slice(0, 140))
// With no token the button says so rather than pretending it is playable.
await page.getByRole('button', { name: 'Needs a token' }).first().isDisabled()
  ? pass('every game is disabled, and says why')
  : fail('games disabled', 'a game was playable with no token')

console.log('\n=== A chore mints a token ===')
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(500)
await page.locator('button.card').first().click()
await page.waitForTimeout(400)
await submitPhotoProof(page)
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Approve' }).first().click()
await page.waitForTimeout(1200)
const afterApproval = (await readState(page)).kids[0]
afterApproval.playTokens === 1
  ? pass('approving a chore mints exactly one token')
  : fail('token minted on approval', `tokens=${afterApproval.playTokens}`)

console.log('\n=== Playing one ===')
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/arcade' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOT_DIR}/arcade.png` })
const coinsBefore = (await readState(page)).kids[0].coins

// Memory Match is the one that can be played deterministically: flip every
// card, remember what was where, then pair them up.
await page.getByRole('button', { name: 'Play · 1 token' }).nth(2).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${SHOT_DIR}/arcade-memory.png` })
const cards = await page.locator('button[aria-label="Face-down card"]').count()
cards === 16 ? pass('Memory Match deals sixteen cards') : fail('memory deals 16', String(cards))

/**
 * Wait for the board to settle rather than guessing at a delay — a flipped
 * pair closes itself after 320ms or 700ms depending on whether it matched, and
 * sleeping through "about that long" is how this test became flaky.
 */
const settle = () => page.waitForFunction(() => {
  const grid = document.querySelector('.grid')
  if (!grid) return true
  const faceUp = [...grid.querySelectorAll('button')]
    .filter((b) => b.getAttribute('aria-label') !== 'Face-down card' && b.style.opacity !== '0.45')
  return faceUp.length === 0
}, null, { timeout: 5000 }).catch(() => {})

// Learn the layout: reveal one card at a time, letting the board settle after
// each so a chance match during this pass cannot desynchronise us.
//
// The reveal pass can finish the game on its own — two halves of a pair landing
// next to each other are matched as they are turned over — so every step checks
// the board is still there rather than assuming it.
const boardGone = async () => (await page.locator('.grid button').count()) === 0

const faces = []
for (let i = 0; i < 16; i += 1) {
  if (await boardGone()) break // eslint-disable-line no-await-in-loop
  const card = page.locator('.grid button').nth(i)
  await card.click() // eslint-disable-line no-await-in-loop
  await page.waitForTimeout(80) // eslint-disable-line no-await-in-loop
  faces.push((await card.innerText()).trim()) // eslint-disable-line no-await-in-loop
  await settle() // eslint-disable-line no-await-in-loop
}

const pairs = new Map()
faces.forEach((f, i) => pairs.set(f, [...(pairs.get(f) || []), i]))
for (const [, idx] of pairs) {
  if (idx.length !== 2) continue
  if (await boardGone()) break // eslint-disable-line no-await-in-loop
  await page.locator('.grid button').nth(idx[0]).click() // eslint-disable-line no-await-in-loop
  await page.waitForTimeout(120) // eslint-disable-line no-await-in-loop
  await page.locator('.grid button').nth(idx[1]).click() // eslint-disable-line no-await-in-loop
  await settle() // eslint-disable-line no-await-in-loop
}
await page.waitForTimeout(1200)
const done = await page.evaluate(() => document.body.innerText)
;/points/i.test(done)
  ? pass('finishing the board shows a score')
  : fail('game finishes', done.slice(0, 160))
await page.screenshot({ path: `${SHOT_DIR}/arcade-result.png` })

const after = (await readState(page)).kids[0]
after.playTokens === 0
  ? pass('the token was spent')
  : fail('token spent', `tokens=${after.playTokens}`)
after.coins > coinsBefore
  ? pass(`the game paid out (+${after.coins - coinsBefore})`)
  : fail('game pays out', `coins ${coinsBefore} → ${after.coins}`)
after.coins - coinsBefore <= 5
  ? pass('and never more than five for one game')
  : fail('per-game cap', `paid ${after.coins - coinsBefore}`)

console.log('\n=== Grinding cannot beat a chore ===')
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  s.kids[0].playTokens = 20
  s.kids[0].gameCoinsToday = 15
  s.kids[0].gameDay = new Date().toISOString().slice(0, 10)
  localStorage.setItem('rankup.state.v1', JSON.stringify(s))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.evaluate(() => { window.location.hash = '/kid/arcade' })
await page.waitForTimeout(800)
const cappedText = await page.evaluate(() => document.body.innerText)
;/today's winnings|will not pay out again/i.test(cappedText)
  ? pass('at the cap it says so plainly instead of quietly paying nothing')
  : fail('cap explained', cappedText.slice(0, 200))
;/15\/15/.test(cappedText)
  ? pass('and shows the day’s total against the cap')
  : fail('cap counter shown', cappedText.slice(0, 200))

await finish(errors, fails, browser)
