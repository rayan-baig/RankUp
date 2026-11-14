/**
 * Device pairing, driven as two devices.
 *
 * The parent tab uses the default store; the kid tab uses `?device=kid`, which
 * gives it a separate one. That makes this a genuine two-device test rather
 * than one tab talking to itself.
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE, SHOT_DIR, setPlanInDatabase } from './helpers.mjs'
import { readFileSync } from 'node:fs'
import { CLAIM_ERRORS, claimErrorMessage } from '../src/lib/pairing.js'

const { fails, pass, fail } = reporter()

/*
 * Every refusal the server can give when a parent types a code has words of
 * its own, so none falls through to "check the digits" when the digits were
 * fine. Read from the SQL, so a new reason fails here until it is worded.
 */
console.log('\n=== Every refusal has its own words ===')
{
  const sql = readFileSync('supabase/schema.sql', 'utf8')
  const body = sql.slice(sql.indexOf('create or replace function claim_pairing_code('))
  const reasons = [...new Set([...body.slice(0, body.indexOf('$$;')).matchAll(/'reason', '([a-z_]+)'/g)].map((m) => m[1]))]
  const unworded = reasons.filter((r) => !CLAIM_ERRORS[r])
  unworded.length === 0 && reasons.length >= 6
    ? pass(`each of the ${reasons.length} reasons claim_pairing_code gives is worded (${reasons.join(', ')})`)
    : fail('every claim refusal worded', unworded.join(', ') || `only ${reasons.length} found`)
  new Set(reasons.map(claimErrorMessage)).size === reasons.length
    ? pass('and no two of them say the same thing')
    : fail('claim messages distinct', 'two reasons share words')
  ;/10 minutes/.test(CLAIM_ERRORS.expired) && /New code/.test(CLAIM_ERRORS.expired)
    ? pass('an expired code says how long codes last and what to tap')
    : fail('expired wording', CLAIM_ERRORS.expired)
  !/Rivera|family name/i.test(CLAIM_ERRORS.claimed)
    ? pass('a phone linked elsewhere never names the other family')
    : fail('claimed wording', CLAIM_ERRORS.claimed)
}
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
const wrongSays = await parent.locator('[role=alert]').textContent().catch(() => '')
;/don't match a phone waiting/.test(wrongSays || '') && /Check them/.test(wrongSays || '')
  ? pass('a wrong code says it matches no phone, and to check the digits')
  : fail('a wrong code shows an error', wrongSays || 'no alert')
;(await kidStore()).device.role === 'kid' && !(await kidStore()).onboarded
  ? pass('a wrong code does not link anything')
  : fail('a wrong code does not link anything', 'device changed state')

console.log('\n=== An expired code says so, on both phones ===')
await kid.getByRole('button', { name: 'New code' }).click()
await kid.waitForTimeout(1500)
const stale = (await kidStore())?.pendingPairing?.code
{
  const { default: pg } = await import('pg')
  const db = new pg.Client({
    host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT || 55432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'rankup_test',
  })
  await db.connect()
  await db.query("update pairing_codes set expires_at = now() - interval '1 minute' where code = $1", [stale])
  await db.end()
}
await typeCode(stale)
const expiredSays = await parent.locator('[role=alert]').textContent().catch(() => '')
;/run out/.test(expiredSays || '') && /New code/.test(expiredSays || '')
  ? pass('the parent is told the code ran out and to tap "New code"')
  : fail('expired code message', expiredSays || 'no alert')
await kid.waitForTimeout(3500)
const kidSays = await kid.evaluate(() => document.body.innerText)
;/This code ran out/.test(kidSays) && /New code/.test(kidSays)
  ? pass('and the child\'s phone says the same, with the button to tap')
  : fail('kid sees expiry', kidSays.slice(0, 300))
const steps = await parent.getByTestId('pair-steps').innerText().catch(() => '')
;/I'm a kid/.test(steps) && /Get my code/.test(steps) && /joins that profile/.test(steps)
  ? pass('the linking screen gives the steps in the child\'s phone\'s own words')
  : fail('pairing steps', steps)

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
;/already linked to your family/i.test(reused || '')
  ? pass('a code typed again is refused, saying the phone is already in this family')
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

/*
 * A second phone for a child who already has one — a new phone, or the same
 * phone once the app is added to the home screen, which starts with empty
 * storage. The database keeps a profile with a device for that device and
 * makes the new phone its own profile; the parent's phone used to swap in the
 * old profile's id by name, so "Assign a quest" sent chores to a profile the
 * new phone cannot see.
 */
console.log('\n=== A second phone for the same name gets the profile it was linked to ===')
const kid2 = await ctx.newPage(); track(kid2, 'kid2')
await kid2.goto(`${BASE}?device=kid2`, { waitUntil: 'networkidle' })
await kid2.waitForTimeout(500)
await kid2.getByRole('button', { name: /I'm a kid/ }).click()
await kid2.waitForTimeout(400)
await kid2.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await kid2.getByRole('button', { name: 'Continue' }).click()
await kid2.waitForTimeout(400)
await kid2.getByRole('button', { name: /Sugar Rush/ }).first().click()
await kid2.waitForTimeout(300)
await kid2.getByRole('button', { name: 'Get my code' }).click()
await kid2.waitForTimeout(1500)
const code3 = await kid2.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1.kid2'))?.pendingPairing?.code)
await parent.bringToFront()
await parent.evaluate(() => { window.location.hash = '/parent/pair' })
await parent.waitForTimeout(700)
await typeCode(code3)
await parent.waitForTimeout(800)
await kid2.waitForTimeout(4000)
;(await parent.getByText(/This is a new profile for Ava/).count()) > 0
  ? pass('the parent is told this phone has a profile of its own, and why')
  : fail('the parent is told about the second profile', 'no explanation on the confirmation')
const phoneKid = await kid2.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1.kid2'))?.device?.linkedKidId)
await parent.getByRole('button', { name: 'Assign a quest' }).click()
await parent.waitForTimeout(500)
const assignTo = await parent.evaluate(() => location.hash)
phoneKid && assignTo.includes(phoneKid)
  ? pass('"Assign a quest" goes to the profile the new phone is using')
  : fail('"Assign a quest" goes to the new phone\'s profile', `phone uses ${phoneKid}, parent assigns to ${assignTo}`)
await kid2.close()

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
// Assigned rather than tested inline: a regex literal opening a line is the
// trap this repo keeps falling into, and a name reads better anyway.
const stopped = /too many/i.test(throttled || '')
stopped
  ? pass('a run of wrong codes stops the account guessing')
  : fail('a run of wrong codes stops the account guessing', `error was: ${throttled}`)

await finish(errors, fails, browser)
