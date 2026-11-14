/**
 * A forgotten Parent Mode PIN can be reset by the parent, and only by them.
 *
 * The parent proves who they are by signing in again with the password of
 * the account this phone uses; then they choose a new PIN. A wrong password
 * changes nothing, too many wrong ones wait, and a child's own phone has no
 * reset at all (it has no Parent Mode). The stand-in API checks passwords
 * for accounts signed up through it, as Supabase does.
 *
 * Needs the dev server and the stand-in API (supabase/test/up.sh).
 */
import { launch, reporter, setUpFamily, readState, finish, SHOT_DIR } from './helpers.mjs'
import { MAX_TRIES, LOCK_MINUTES } from '../src/lib/pinReset.js'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)   // PIN 1234, password correct-horse-battery
const RIGHT = 'correct-horse-battery'

const toSwitch = async () => {
  await page.evaluate(() => { window.location.hash = '/switch' })
  await page.waitForTimeout(500)
}
const openReset = async () => {
  await toSwitch()
  await page.getByRole('button', { name: 'Forgot your PIN?' }).click()
  await page.waitForTimeout(300)
}
const tryPassword = async (password) => {
  await page.getByLabel('Your account password').fill(password)
  await page.getByRole('button', { name: 'Check my password' }).click()
  await page.waitForTimeout(700)
}
const dialogText = () => page.locator('[role="dialog"]').innerText().catch(() => '')

console.log('\n=== The PIN screen offers a reset ===')
await openReset()
const intro = await dialogText()
;/Sign in again/.test(intro) && /t•••@example\.com/.test(intro)
  ? pass('"Forgot your PIN?" asks for the account password, naming the account (masked)')
  : fail('reset asks for the password', intro.slice(0, 200))
await page.screenshot({ path: `${SHOT_DIR}/pinreset-prove.png` })

console.log('\n=== A wrong password changes nothing ===')
await tryPassword('not-the-password')
;/That password is not right/.test(await dialogText())
  ? pass('a wrong password is refused')
  : fail('wrong password refused', await dialogText())
;(await page.getByLabel('New PIN', { exact: true }).count()) === 0
  ? pass('and no new PIN can be chosen')
  : fail('no PIN step after a wrong password', 'the new PIN box is showing')
;(await readState(page)).family.pin === '1234'
  ? pass('the PIN is still the old one')
  : fail('PIN unchanged', (await readState(page)).family.pin)

console.log(`\n=== ${MAX_TRIES} wrong passwords, and it waits ${LOCK_MINUTES} minutes ===`)
for (let i = 1; i < MAX_TRIES; i += 1) await tryPassword(`wrong-${i}`)
;/Too many wrong passwords/.test(await dialogText())
  ? pass(`after ${MAX_TRIES} wrong passwords it says to wait`)
  : fail('lockout message', await dialogText())
await page.getByLabel('Your account password').isDisabled()
  && await page.getByRole('button', { name: 'Check my password' }).isDisabled()
  ? pass('and even the right password cannot be tried until the wait is over')
  : fail('locked form', 'still usable')
await page.screenshot({ path: `${SHOT_DIR}/pinreset-locked.png` })
// Fast-forward past the wait.
await page.evaluate(() => {
  const t = JSON.parse(localStorage.getItem('rankup.pinreset.v1'))
  localStorage.setItem('rankup.pinreset.v1', JSON.stringify({ ...t, until: Date.now() - 1000 }))
})
await page.getByRole('button', { name: 'Close' }).click()
await openReset()
await page.getByLabel('Your account password').isEnabled()
  ? pass('once the wait is over it can be tried again')
  : fail('unlocked after the wait', 'still disabled')
;(await page.getByLabel('Parent PIN', { exact: true }).isVisible())
  ? pass('the PIN box itself works as before, beside the reset')
  : fail('PIN box present', 'missing')

console.log('\n=== The right password, then a new PIN ===')
await tryPassword(RIGHT)
;(await page.getByLabel('New PIN', { exact: true }).count()) === 1
  ? pass('the right password moves on to choosing a new PIN')
  : fail('PIN step shown', await dialogText())
await page.screenshot({ path: `${SHOT_DIR}/pinreset-choose.png` })
await page.getByLabel('New PIN', { exact: true }).fill('9876')
await page.getByLabel('The new PIN again').fill('9875')
await page.waitForTimeout(200)
;/not the same/.test(await dialogText()) && await page.getByRole('button', { name: 'Save the new PIN' }).isDisabled()
  ? pass('two different PINs are not accepted')
  : fail('mismatch refused', await dialogText())
await page.getByLabel('New PIN', { exact: true }).fill('98')
await page.getByLabel('The new PIN again').fill('98')
await page.getByRole('button', { name: 'Save the new PIN' }).isDisabled()
  ? pass('nor a PIN shorter than 4 digits')
  : fail('short PIN refused', 'save enabled')
await page.getByLabel('New PIN', { exact: true }).fill('9876')
await page.getByLabel('The new PIN again').fill('9876')
await page.getByRole('button', { name: 'Save the new PIN' }).click()
await page.waitForTimeout(700)
const after = await readState(page)
after.family.pin === '9876'
  ? pass('the new PIN is saved')
  : fail('new PIN saved', after.family.pin)
;(await page.evaluate(() => location.hash)).startsWith('#/parent')
  ? pass('and Parent Mode opens')
  : fail('parent mode opened', await page.evaluate(() => location.hash))

console.log('\n=== The old PIN no longer opens Parent Mode; the new one does ===')
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  s.session = { ...s.session, parentUnlocked: false }
  localStorage.setItem('rankup.state.v1', JSON.stringify(s))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await toSwitch()
await page.getByLabel('Parent PIN', { exact: true }).fill('1234')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.waitForTimeout(500)
;(await page.evaluate(() => location.hash)).startsWith('#/switch')
  ? pass('the old PIN is refused')
  : fail('old PIN refused', await page.evaluate(() => location.hash))
await page.getByLabel('Parent PIN', { exact: true }).fill('9876')
await page.waitForTimeout(600)
;(await page.evaluate(() => location.hash)).startsWith('#/parent')
  ? pass('the new PIN opens Parent Mode')
  : fail('new PIN works', await page.evaluate(() => location.hash))

console.log('\n=== A phone with no account to prove has no reset ===')
await page.evaluate(() => {
  for (const k of Object.keys(localStorage)) if (k.startsWith('rankup.session.v1')) localStorage.removeItem(k)
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  s.session = { ...s.session, parentUnlocked: false }
  localStorage.setItem('rankup.state.v1', JSON.stringify(s))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
if (await page.getByRole('button', { name: 'Forgot your PIN?' }).count() === 0) await toSwitch()
await page.getByRole('button', { name: 'Forgot your PIN?' }).click().catch(() => {})
await page.waitForTimeout(300)
;(await page.locator('[data-testid="pin-reset-unavailable"]').count()) === 1
  && (await page.getByLabel('Your account password').count()) === 0
  ? pass('signed out, it says there is nothing to prove who you are with, and offers nothing')
  : fail('no reset when signed out', await dialogText())

console.log("\n=== A child's own phone has no reset ===")
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  s.device = { ...s.device, role: 'kid', linkedKidId: s.kids[0].id }
  s.session = { role: 'kid', kidId: s.kids[0].id, parentUnlocked: false }
  localStorage.setItem('rankup.state.v1', JSON.stringify(s))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.evaluate(() => { window.location.hash = '/switch' })
await page.waitForTimeout(900)
;(await page.evaluate(() => location.hash)).startsWith('#/kid')
  && (await page.getByText('Forgot your PIN?').count()) === 0
  ? pass("a child's phone is sent back to its own home, with no PIN screen and no reset")
  : fail('kid phone has no reset', await page.evaluate(() => location.hash))
const { pinResetAvailability } = await import('../src/lib/pinReset.js')
pinResetAvailability({ device: { role: 'kid' } }) === 'kid_device'
  ? pass('and the reset itself refuses a child\'s phone, whatever is signed in')
  : fail('reset refuses kid device', pinResetAvailability({ device: { role: 'kid' } }))

await finish(errors, fails, browser)
