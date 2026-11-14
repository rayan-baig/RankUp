/**
 * The app on a phone without the newer functions: iPhone Safari 15.0 has no
 * Array.prototype.at, structuredClone, Object.hasOwn, findLast,
 * crypto.randomUUID, BroadcastChannel or requestIdleCallback. The build
 * rewrites newer syntax but cannot add functions, so they are taken away
 * here before the app loads, and a family's first chore is played through:
 * setup, a child's "I did it!", the parent's Accept, and the chore history
 * (which used .at(-1) and went blank on such a phone). Nothing may throw.
 * tests/oldbrowsers.mjs and tests/bundle.mjs read the code for the same.
 */
import { launch, reporter, setUpFamily, asParent, asKid, sendToParent, finish, SHOT_DIR } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()
const ok = (name, cond, detail = '') => (cond ? pass(name) : fail(name, detail))

await page.addInitScript(() => {
  delete Array.prototype.at
  delete String.prototype.at
  delete Array.prototype.findLast
  delete Array.prototype.findLastIndex
  delete Object.hasOwn
  delete window.structuredClone
  delete window.BroadcastChannel
  delete window.requestIdleCallback
  try { Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true }) } catch { /* not there */ }
})

await setUpFamily(page)
ok('setup works without them', await page.evaluate(() => typeof [].at === 'undefined' && !window.structuredClone
  && typeof crypto.randomUUID !== 'function'))

await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(500)
await page.locator('button.card').first().click()
await page.waitForTimeout(400)
await sendToParent(page)

await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: /^Accept/ }).first().click()
await page.waitForTimeout(1000)
const xp = await page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')).kids[0].xp)
ok('a chore is accepted and paid', xp > 0, `xp ${xp}`)

await page.evaluate(() => { window.location.hash = '/parent/history' })
await page.waitForTimeout(900)
ok('the chore history shows the chore, day by day', (await page.getByText('Accepted').count()) > 0)
await page.screenshot({ path: `${SHOT_DIR}/old-safari-history.png` })
ok('and nothing threw on the way', errors.filter((e) => e.startsWith('pageerror')).length === 0,
  errors.filter((e) => e.startsWith('pageerror')).join(' | '))

finish(errors, fails, browser)
