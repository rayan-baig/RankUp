/**
 * The rules that keep the game honest. If any of these break, a kid can get XP
 * they did not earn, a lockout can outlast its timer, or a deleted child's
 * photos can survive on the device. Those are the failures worth a browser.
 */
import { launch, reporter, readState, setUpFamily, asParent, asKid, submitPhotoProof, finish, SHOT_DIR } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)

console.log('\n=== One chore pays out exactly once ===')
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/quests' })
await page.waitForTimeout(500)
await page.locator('button.card').first().click()
await page.waitForTimeout(400)
const questUrl = page.url()
await submitPhotoProof(page)

let state = await readState(page)
const questId = state.submissions[0].questId
state.submissions.length === 1
  ? pass('one submission after the first send')
  : fail('one submission after the first send', `got ${state.submissions.length}`)

// The exploit: reopen an already-submitted quest and try to send a second photo.
await page.goto(questUrl, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(700)
await page.screenshot({ path: `${SHOT_DIR}/submitted-quest.png` })
const resubmitButtons = await page.getByRole('button', { name: /Take photo proof|Mark as done/ }).count()
resubmitButtons === 0
  ? pass('an already-submitted quest offers no way to send again')
  : fail('an already-submitted quest offers no way to send again', `${resubmitButtons} submit buttons still shown`)
;(await page.getByText('Sent to your parent').count()) > 0
  ? pass('the kid is told it is already with the parent')
  : fail('the kid is told it is already with the parent', 'banner missing')

await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/approvals' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Approve' }).first().click()
await page.waitForTimeout(1000)
state = await readState(page)
const approvals = state.events.filter((e) => e.type === 'quest_approved' && e.meta.questId === questId)
approvals.length === 1
  ? pass(`XP awarded exactly once (xp=${state.kids[0].xp})`)
  : fail('XP awarded exactly once', `${approvals.length} approval events`)

console.log('\n=== A Dimension Lockout really ends when it says it will ===')
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  const past = Date.now() - 60000
  s.family.tier = 'elite'
  s.overrides = [{ id: 'ovr_test', kidId: s.kids[0].id, kind: 'dimension', reason: 'test',
                   consequence: '', minutes: 30, until: past, createdAt: past - 1800000, liftedAt: null }]
  s.kids[0].lockout = { type: 'dimension', until: past, reason: 'test', overrideId: 'ovr_test' }
  s.session = { role: 'parent', kidId: s.kids[0].id, parentUnlocked: true }
  localStorage.setItem('rankup.state.v1', JSON.stringify(s))
  window.location.hash = '/parent/override'
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${SHOT_DIR}/expired-override.png` })
;(await page.getByText('Expired', { exact: true }).count()) > 0
  ? pass('history says Expired, not Active and not Lifted')
  : fail('history says Expired', 'chip missing')
state = await readState(page)
state.kids[0].lockout === null
  ? pass('the lockout was cleared from the kid')
  : fail('the lockout was cleared from the kid', JSON.stringify(state.kids[0].lockout))
state.overrides[0].liftedAt
  ? pass('the override is recorded as ended')
  : fail('the override is recorded as ended', 'liftedAt still null')

console.log('\n=== A session pointing at a removed kid does not blank the app ===')
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  s.session = { role: 'kid', kidId: 'kid_does_not_exist', parentUnlocked: false }
  localStorage.setItem('rankup.state.v1', JSON.stringify(s))
  window.location.hash = '/kid'
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(900)
;(await page.getByText(/Hi Ava/).count()) > 0
  ? pass('falls back to the first kid instead of rendering nothing')
  : fail('falls back to the first kid', 'no greeting rendered')

console.log('\n=== Removing a kid removes their photos ===')
const before = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rankup.photos.v1') || '{}')).length)
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  s.session = { role: 'parent', kidId: s.kids[0].id, parentUnlocked: true }
  localStorage.setItem('rankup.state.v1', JSON.stringify(s))
  window.location.hash = '/parent/kids'
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Remove Ava/ }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Remove', exact: true }).click()
await page.waitForTimeout(1200)
const after = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rankup.photos.v1') || '{}')).length)
before > 0 && after === 0
  ? pass(`photos purged on kid removal (${before} → ${after})`)
  : fail('photos purged on kid removal', `before=${before} after=${after}`)

await finish(errors, fails, browser)
