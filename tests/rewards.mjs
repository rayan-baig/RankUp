/**
 * The rewards loop, end to end: a parent adds a reward, a child earns the
 * currency and spends it, and the parent hands it over.
 *
 * The last step was the broken one. A child's request appeared nowhere a
 * parent looks: not on the dashboard, not in the review queue, only inside the
 * collapsed "Rewards catalogue" panel at the bottom of Settings. A child who
 * spent their coins on "Pick Friday's film" waited for a parent who had no way
 * of knowing.
 */
import { launch, reporter, readState, setUpFamily, asParent, asKid, submitPhotoProof, finish } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)

console.log('\n=== A parent adds a reward ===')
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/settings' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Rewards catalogue/ }).click()
await page.waitForTimeout(200)
await page.locator('input[placeholder="e.g. Pick Friday\'s film"]').fill('Pick the film')
await page.getByLabel('Cost').fill('3')
await page.getByRole('button', { name: 'Add reward' }).click()
// The app saves a moment after things settle; give it the chance.
let saved = false
for (let i = 0; i < 10 && !saved; i += 1) {
  await page.waitForTimeout(300) // eslint-disable-line no-await-in-loop
  saved = (await readState(page)).rewards.some((r) => r.name === 'Pick the film') // eslint-disable-line no-await-in-loop
}
saved
  ? pass('the reward is in the catalogue')
  : fail('the reward is in the catalogue', 'not saved')

console.log('\n=== The child earns enough and spends it ===')
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(500)
await page.locator('button.card').first().click()
await page.waitForTimeout(400)
await submitPhotoProof(page)
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Accept' }).first().click()
await page.waitForTimeout(800)
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/shop' })
await page.waitForTimeout(600)
const coinsBefore = (await readState(page)).kids[0].coins
await page.getByRole('button', { name: /3$/ }).first().click()
await page.waitForTimeout(800)
let state = await readState(page)
state.redemptions.some((r) => r.name === 'Pick the film' && r.status === 'requested') && state.kids[0].coins === coinsBefore - 3
  ? pass('the child spends their currency on it')
  : fail('the child spends their currency on it', JSON.stringify({ coinsBefore, after: state.kids[0].coins, r: state.redemptions }))

console.log('\n=== The parent is told, where they look, and hands it over ===')
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent' })
await page.waitForTimeout(800)
;(await page.getByText(/to hand over/).count()) > 0
  ? pass('the request is on the parent dashboard')
  : fail('the request is on the parent dashboard', 'nothing about it on /parent')
const give = page.getByRole('button', { name: 'Mark given' })
if (await give.count()) {
  await give.first().click()
  await page.waitForTimeout(800)
  state = await readState(page)
  state.redemptions.find((r) => r.name === 'Pick the film')?.status === 'given'
    ? pass('"Mark given" on the dashboard hands it over')
    : fail('"Mark given" hands it over', JSON.stringify(state.redemptions))
  ;(await page.getByText(/to hand over/).count()) === 0
    ? pass('and it leaves the dashboard')
    : fail('a given reward leaves the dashboard', 'still shown')
} else {
  fail('"Mark given" is on the dashboard', 'no button')
}

await finish(errors, fails, browser)
