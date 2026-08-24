/**
 * The everyday paths a family actually walks: sending work back to be redone,
 * and completing a quest that needs no photo.
 */
import { launch, reporter, readState, setUpFamily, asParent, asKid, submitPhotoProof, finish, SHOT_DIR } from './helpers.mjs'

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
await submitPhotoProof(page)

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
;(await page.getByRole('button', { name: /Take photo proof/ }).count()) === 1
  ? pass('a sent-back quest can be redone')
  : fail('a sent-back quest can be redone', 'no submit button')
;(await page.getByText('Toys still behind the door.').count()) > 0
  ? pass('the parent\'s reason is shown to the kid')
  : fail('the parent\'s reason is shown to the kid', 'note missing')

await submitPhotoProof(page)
state = await readState(page)
state.submissions.filter((s) => s.status === 'pending').length === 1
  ? pass('a redo creates exactly one new pending submission')
  : fail('a redo creates exactly one new pending submission', 'wrong count')

await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Approve' }).first().click()
await page.waitForTimeout(1000)
state = await readState(page)
state.kids[0].xp > 0
  ? pass(`approving after a redo awards XP (xp=${state.kids[0].xp})`)
  : fail('approving after a redo awards XP', 'xp still 0')

console.log('\n=== A quest with no photo requirement ===')
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/assign' })
await page.waitForTimeout(600)
await page.locator('input[placeholder="e.g. Make your bed"]').fill('Read for 10 minutes')
await page.getByRole('switch', { name: /Require photo proof/ }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: /Assign to Ava/ }).click()
await page.waitForTimeout(700)

await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(600)
await page.getByText('Read for 10 minutes').first().click()
await page.waitForTimeout(600)
;(await page.getByRole('button', { name: 'Mark as done' }).count()) === 1
  ? pass('offers "Mark as done" instead of a camera')
  : fail('offers "Mark as done"', 'button missing')
await page.getByRole('button', { name: 'Mark as done' }).click()
await page.waitForTimeout(600)
;(await page.getByRole('button', { name: 'Retake' }).count()) === 0
  ? pass('no meaningless Retake button')
  : fail('no meaningless Retake button', 'Retake still shown')
await page.getByRole('button', { name: 'Send to parent' }).click()
await page.waitForTimeout(700)

await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
;(await page.getByText('No photo required').count()) > 0
  ? pass('the parent is told no photo was required')
  : fail('the parent is told no photo was required', 'banner missing')

await finish(errors, fails, browser)
