/**
 * Device pairing, driven as two devices.
 *
 * The parent tab uses the default store; the kid tab uses `?device=kid`, which
 * gives it a separate one. That makes this a genuine two-device test rather
 * than one tab talking to itself.
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE, SHOT_DIR, setPlanInDatabase } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
const track = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  p.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(`${tag}: ${m.text()}`)
  })
}

const parent = await ctx.newPage(); track(parent, 'parent')
const kid = await ctx.newPage(); track(kid, 'kid')

const kidStore = () => kid.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1.kid')))
const parentStore = () => parent.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')))
const typeCode = async (value) => {
  await parent.locator('input[inputmode=numeric]').fill(value)
  await parent.waitForTimeout(1200)
}

console.log('\n=== Setup: a parent device and a kid device ===')
await parent.goto(BASE, { waitUntil: 'networkidle' })
await parent.waitForTimeout(500)
;(await parent.getByRole('button', { name: /I'm a parent/ }).count()) === 1 &&
(await parent.getByRole('button', { name: /I'm a kid/ }).count()) === 1
  ? pass('a fresh device asks whose phone it is')
  : fail('a fresh device asks whose phone it is', 'fork missing')

await parent.getByRole('button', { name: /I'm a parent/ }).click()
await parent.waitForTimeout(400)
// Setup opens with an account, so the family exists before consent is signed.
await parent.locator('input[type=email]').fill(`pair${Date.now()}@example.com`)
await parent.locator('input[type=password]').fill('correct-horse-battery')
await parent.getByRole('button', { name: 'Create account' }).click()
await parent.waitForTimeout(1600)
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.waitForTimeout(400)
await parent.locator('input').nth(0).fill('Sam')
await parent.locator('input').nth(1).fill('The Rivera family')
await parent.locator('input').nth(2).fill('1234')
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.waitForTimeout(1200)
// Consent stands between the family details and the first child.
if (await parent.getByText('What RankUp collects about your child').count()) {
  await parent.locator('input[type=checkbox]').check()
  await parent.locator('input[placeholder*="Samira"]').fill('Test Parent')
  await parent.waitForTimeout(200)
  await parent.getByRole('button', { name: /I agree/ }).click()
  await parent.waitForTimeout(1200)
}
await parent.locator('input[placeholder="e.g. Ava"]').fill('Jonah')
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.waitForTimeout(200)
await parent.getByRole('button', { name: 'Start playing' }).click()
await parent.waitForTimeout(1200)

// This family ends up with two children — Jonah, then Ava on the paired phone —
// and Starter covers one. Put it on Standard the way Stripe's webhook would.
await setPlanInDatabase('The Rivera family')
await parent.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await parent.waitForTimeout(2500)

await kid.goto(`${BASE}?device=kid`, { waitUntil: 'networkidle' })
await kid.waitForTimeout(500)
await kid.getByRole('button', { name: /I'm a kid/ }).click()
await kid.waitForTimeout(400)
await kid.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await kid.getByRole('button', { name: 'Continue' }).click()
await kid.waitForTimeout(400)
await kid.getByRole('button', { name: /Sugar Rush/ }).first().click()
await kid.waitForTimeout(300)
await kid.getByRole('button', { name: 'Get my code' }).click()
await kid.waitForTimeout(1500)
await kid.evaluate(() => window.scrollTo(0, 0))
await kid.screenshot({ path: `${SHOT_DIR}/pairing-code.png` })

let store = await kidStore()
const code = store?.pendingPairing?.code
;/^[0-9]{6}$/.test(code || '')
  ? pass(`the kid device shows a six-digit code (${code})`)
  : fail('the kid device shows a six-digit code', String(code))
store.kids.length === 0 && store.quests.length === 0
  ? pass('nothing is stored about the child before a parent claims the device')
  : fail('nothing is stored before claiming', `${store.kids.length} kids, ${store.quests.length} quests`)

console.log('\n=== A wrong code is refused ===')
await parent.evaluate(() => { window.location.hash = '/parent/pair' })
await parent.waitForTimeout(700)
const wrong = String((Number(code) + 7) % 1000000).padStart(6, '0')
await typeCode(wrong)
const alerted = await parent.locator('[role=alert]').count()
alerted > 0 ? pass('a wrong code shows an error') : fail('a wrong code shows an error', 'no alert')
;(await kidStore()).device.role === 'kid' && !(await kidStore()).onboarded
  ? pass('a wrong code does not link anything')
  : fail('a wrong code does not link anything', 'device changed state')

console.log('\n=== A fresh code links the two devices ===')
await kid.getByRole('button', { name: 'New code' }).click()
await kid.waitForTimeout(1500)
const code2 = (await kidStore())?.pendingPairing?.code
code2 && code2 !== code ? pass('"New code" issues a different code') : fail('"New code" issues a different code', String(code2))

await typeCode(code2)
await parent.waitForTimeout(600)
await parent.screenshot({ path: `${SHOT_DIR}/pairing-linked.png` })
;(await parent.getByText(/Ava is linked/).count()) > 0
  ? pass('the parent sees the link confirmed')
  : fail('the parent sees the link confirmed', 'no confirmation')

const pStore = await parentStore()
pStore.kids.some((k) => k.name === 'Ava' && k.pairedDeviceAt)
  ? pass('the kid joins the family as a paired device')
  : fail('the kid joins the family as a paired device', JSON.stringify(pStore.kids.map((k) => k.name)))

await kid.waitForTimeout(4000)
store = await kidStore()
store.onboarded && store.device.role === 'kid' && store.kids[0]?.name === 'Ava'
  ? pass('the kid device knows it is linked and who it belongs to')
  : fail('the kid device knows it is linked', JSON.stringify(store.device))
store.family.name === 'The Rivera family'
  ? pass('the kid device learns the family name')
  : fail('the kid device learns the family name', store.family.name)
;(await kid.evaluate(() => location.hash)) === '#/kid'
  ? pass('the kid lands on their own home screen')
  : fail('the kid lands on their own home screen', await kid.evaluate(() => location.hash))

console.log('\n=== A used code cannot be used twice ===')
await parent.getByRole('button', { name: 'Link another' }).click()
await parent.waitForTimeout(400)
await typeCode(code2)
const reused = await parent.locator('[role=alert]').textContent().catch(() => '')
;/already been linked/i.test(reused || '')
  ? pass('a claimed code is refused the second time')
  : fail('a claimed code is refused the second time', `error was: ${reused}`)

console.log('\n=== A kid device has no parent side ===')
await kid.evaluate(() => { window.location.hash = '/parent/approvals' })
await kid.waitForTimeout(800)
;(await kid.evaluate(() => location.hash)) === '#/kid'
  ? pass('navigating to Parent Mode on a kid device bounces back')
  : fail('Parent Mode is unreachable on a kid device', await kid.evaluate(() => location.hash))

await kid.evaluate(() => { window.location.hash = '/kid/profile' })
await kid.waitForTimeout(800)
await kid.screenshot({ path: `${SHOT_DIR}/pairing-kid-profile.png` })
;(await kid.getByText(/Only on your parent's phone/).count()) > 0
  ? pass('the theme lock cannot be opened with an empty PIN on a kid device')
  : fail('the theme lock holds on a kid device', 'PIN prompt still offered')

/**
 * A code is six digits, so the only thing standing between a stranger and
 * someone else's child is how many guesses they get. The counter on a code
 * itself is not enough — it never moves for a guess at a code that does not
 * exist — so the account doing the guessing is what gets cut off. Last,
 * because it deliberately locks this parent out.
 */
console.log('\n=== Guessing at codes gets the account cut off ===')
await parent.evaluate(() => { window.location.hash = '/parent/pair' })
await parent.waitForTimeout(700)
let throttled = ''
for (let i = 0; i < 12; i += 1) {
  const guess = String((Number(code2) + 100 + i) % 1000000).padStart(6, '0')
  await typeCode(guess) // eslint-disable-line no-await-in-loop
  throttled = await parent.locator('[role=alert]').textContent().catch(() => '') // eslint-disable-line no-await-in-loop
  if (/too many/i.test(throttled || '')) break
}
;/too many/i.test(throttled || '')
  ? pass('a run of wrong codes stops the account guessing')
  : fail('a run of wrong codes stops the account guessing', `error was: ${throttled}`)

await finish(errors, fails, browser)
