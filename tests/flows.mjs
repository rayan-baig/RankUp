/**
 * The everyday paths a family actually walks: sending work back to be redone,
 * and completing a quest that needs no photo.
 */
import { launch, reporter, readState, setUpFamily, asParent, asKid, sendToParent, finish, SHOT_DIR } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)

console.log('\n=== Send back → redo → approve ===')
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(500)
await page.locator('button.card').first().click()
await page.waitForTimeout(400)
const questUrl = page.url()
await sendToParent(page)

await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Send back' }).first().click()
await page.waitForTimeout(300)
await page.locator('input[placeholder*="duvet"]').fill('Toys still behind the door.')
await page.getByRole('button', { name: 'Send back' }).last().click()
await page.waitForTimeout(800)

let state = await readState(page)
state.quests.find((q) => q.id === state.submissions[0].questId).status === 'redo'
  ? pass('the quest goes back onto the kid\'s list')
  : fail('the quest goes back onto the kid\'s list', 'wrong status')

await asKid(page)
await page.goto(questUrl, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOT_DIR}/redo-quest.png` })
;(await page.getByRole('button', { name: /I did it/ }).count()) === 1
  ? pass('a sent-back quest can be redone')
  : fail('a sent-back quest can be redone', 'no submit button')
;(await page.getByText('Toys still behind the door.').count()) > 0
  ? pass('the parent\'s reason is shown to the kid')
  : fail('the parent\'s reason is shown to the kid', 'note missing')

await sendToParent(page)
state = await readState(page)
state.submissions.filter((s) => s.status === 'pending').length === 1
  ? pass('a redo creates exactly one new pending submission')
  : fail('a redo creates exactly one new pending submission', 'wrong count')

await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Accept' }).first().click()
await page.waitForTimeout(1000)
state = await readState(page)
state.kids[0].xp > 0
  ? pass(`approving after a redo awards XP (xp=${state.kids[0].xp})`)
  : fail('approving after a redo awards XP', 'xp still 0')

console.log('\n=== A quest that does not ask for a photo ===')
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/assign' })
await page.waitForTimeout(600)
// A family with no chores yet opens on the packs.
await page.getByRole('tab', { name: 'Write one' }).click()
await page.locator('input[placeholder="e.g. Make your bed"]').fill('Read for 10 minutes')
await page.getByRole('switch', { name: /Ask to see a photo/ }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: /Assign to Ava/ }).click()
await page.waitForTimeout(700)

await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(600)
await page.getByText('Read for 10 minutes').first().click()
await page.waitForTimeout(600)
;(await page.getByText('Show your parent').count()) === 0
  ? pass('it does not ask the kid to show a photo')
  : fail('no photo request', 'still asks for one')
await page.getByRole('button', { name: /I did it/ }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Send to parent' }).click()
await page.waitForTimeout(700)

await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
;(await page.getByText('Want to see it first?').count()) === 0
  ? pass('the parent is not prompted for a photo on a quest that did not ask for one')
  : fail('no photo prompt', 'prompt shown')
;(await page.locator('img[alt^="Proof for"]').count()) === 0
  ? pass('and RankUp shows no photo anywhere')
  : fail('no photo in RankUp', 'an image is shown')

await finish(errors, fails, browser)
