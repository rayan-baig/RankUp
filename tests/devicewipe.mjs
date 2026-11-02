/**
 * Two things a phone has to handle on its own, driven in a real browser
 * against the real database.
 *
 *   - Storage full. Saving used to fail without a word, and everything done
 *     since the last good save was gone the next time the app opened. The
 *     phone now says so, keeps working, and keeps syncing.
 *   - Unlinked. A parent unlinking a child's phone cut it off on the server
 *     and left the child's name, chores and progress on the phone. The phone
 *     now notices it belongs to no family and erases itself, sign-in and all.
 *
 * Needs the local backend: supabase/test/up.sh
 */
import { chromium } from 'playwright'
import { BASE, setPlanInDatabase } from './helpers.mjs'

const fails = []
const pass = (n) => console.log('  PASS', n)
const fail = (n, d) => { fails.push(n); console.log('  FAIL', n, '—', d) }
const check = (n, cond, d = '') => (cond ? pass(n) : fail(n, d))

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const errors = []
const track = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))
  p.on('console', (m) => {
    // The quota errors are this test's own doing.
    if (m.type() === 'error' && !/ERR_CONNECTION|Quota/.test(m.text())) errors.push(`${tag}: ${m.text()}`)
  })
}
const parent = await ctx.newPage(); track(parent, 'parent')
const kid = await ctx.newPage(); track(kid, 'kid')
const stamp = Date.now()
const FAMILY = `The Wipes ${stamp}`

console.log('\n=== A family with a child on their own phone ===')
await parent.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await parent.waitForTimeout(600)
await parent.getByRole('button', { name: /I'm a parent/ }).click()
await parent.waitForTimeout(400)
await parent.locator('input[type=email]').fill(`w${stamp}@example.com`)
await parent.locator('input[type=password]').fill('correct-horse-battery')
await parent.getByRole('button', { name: 'Create account' }).click()
await parent.waitForTimeout(1200)
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.locator('input').nth(0).fill('Sam')
await parent.locator('input').nth(1).fill(FAMILY)
await parent.locator('input').nth(2).fill('1234')
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.waitForTimeout(1500)
if (await parent.getByText('What RankUp collects about your child').count()) {
  await parent.locator('input[type=checkbox]').check()
  await parent.locator('input[placeholder*="Samira"]').fill('Sam Wipe')
  await parent.waitForTimeout(200)
  await parent.getByRole('button', { name: /I agree/ }).click()
  await parent.waitForTimeout(1500)
}
await parent.locator('input[placeholder="e.g. Ava"]').fill('Jonah')
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.waitForTimeout(200)
await parent.getByRole('button', { name: 'Start playing' }).click()
await parent.waitForTimeout(2500)
await setPlanInDatabase(FAMILY)
await parent.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await parent.waitForTimeout(2000)

await kid.goto(`${BASE}/?device=kid`, { waitUntil: 'networkidle' })
await kid.waitForTimeout(600)
await kid.getByRole('button', { name: /I'm a kid/ }).click()
await kid.waitForTimeout(400)
await kid.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await kid.getByRole('button', { name: 'Continue' }).click()
await kid.waitForTimeout(400)
await kid.getByRole('button', { name: /Sugar Rush/ }).first().click()
await kid.waitForTimeout(300)
await kid.getByRole('button', { name: 'Get my code' }).click()
await kid.waitForTimeout(2500)
const kidStorage = () => kid.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).filter((k) => k.endsWith('.kid')).map((k) => [k, localStorage.getItem(k)])))
const kidState = async () => JSON.parse((await kidStorage())['rankup.state.v1.kid'] || 'null')
const code = (await kidState())?.pendingPairing?.code
await parent.evaluate(() => { window.location.hash = '/parent/pair' })
await parent.waitForTimeout(800)
await parent.locator('input[inputmode=numeric]').fill(code || '')
await parent.waitForTimeout(2500)
await kid.waitForTimeout(4000)
check('the child\'s phone is paired', Boolean((await kidState())?.onboarded))

const assign = async (title) => {
  await parent.evaluate(() => { window.location.hash = '/parent/assign' })
  await parent.waitForTimeout(800)
  await parent.locator('select').first().selectOption({ label: 'Ava' })
  await parent.waitForTimeout(300)
  await parent.locator('input[placeholder="e.g. Make your bed"]').fill(title)
  await parent.getByRole('button', { name: /Assign to Ava/ }).click()
  await parent.waitForTimeout(2500)
}
const reachesKid = async (title) => {
  for (let i = 0; i < 12; i += 1) {
    await kid.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await kid.waitForTimeout(1500)
    if ((await kidState())?.quests?.some((q) => q.title === title)) return true
  }
  return false
}
await assign('Tidy the bookshelf')
check('a chore assigned on the parent\'s phone is on the child\'s', await reachesKid('Tidy the bookshelf'))

console.log('\n=== The parent\'s phone runs out of storage ===')
await parent.evaluate(() => {
  const original = Storage.prototype.setItem
  window.__restoreStorage = () => { Storage.prototype.setItem = original }
  Storage.prototype.setItem = function setItem(k, v) {
    if (k === 'rankup.state.v1') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    return original.call(this, k, v)
  }
})
await assign('Water the plants')
const banner = parent.getByTestId('storage-full')
check('the parent is told the phone\'s storage is full', await banner.isVisible().catch(() => false))
check('in words that say what to do', /storage is full/i.test(await banner.textContent().catch(() => '')))
check('the app keeps working: the new chore is on screen',
  (await parent.getByText('Water the plants').count()) > 0 || (await parent.evaluate(() => document.body.innerText)).includes('Water'))
check('and still syncing: it reaches the child\'s phone', await reachesKid('Water the plants'))
await parent.evaluate(() => window.__restoreStorage())
await assign('Feed the fish')
check('once there is room, the warning goes by itself', !(await banner.isVisible().catch(() => false)))
const saved = await parent.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')))
check('and what was done meanwhile is saved', ['Water the plants', 'Feed the fish'].every((t) => saved.quests.some((q) => q.title === t)))

console.log('\n=== The parent unlinks the child\'s phone ===')
const before = await kidStorage()
check('(before: the phone holds the child\'s name, chores and sign-in)',
  JSON.stringify(before).includes('Tidy the bookshelf') && Boolean(before['rankup.session.v1.kid']))
await parent.evaluate(() => { window.location.hash = '/parent/pair' })
await parent.waitForTimeout(800)
await parent.getByRole('button', { name: 'Unlink' }).first().click()
await parent.waitForTimeout(2500)
let wiped = false
for (let i = 0; i < 20 && !wiped; i += 1) {
  await kid.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await kid.waitForTimeout(2000)
  wiped = Boolean((await kidState())?.deviceWiped)
}
check('the child\'s phone notices it belongs to no family', wiped)
const after = await kidStorage()
const text = JSON.stringify(after)
check('nothing about the child is left on it: no name, no chores', !text.includes('Ava') && !text.includes('bookshelf') && !text.includes(FAMILY),
  text.slice(0, 200))
check('no sign-in, no outbox, no sync cursor, no pairing record',
  !after['rankup.session.v1.kid'] && !after['rankup.outbox.v1.kid'] && !after['rankup.sync.cursor.v1.kid'] && !after['rankup.sync.shadow.v1.kid'])
await kid.waitForTimeout(500)
check('it opens at the front door, saying why, naming nobody',
  await kid.getByTestId('device-wiped').isVisible().catch(() => false))
const parentState = await parent.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')))
check('the child, their XP and their chores stay with the family on the parent\'s phone',
  parentState.kids.some((k) => k.name === 'Ava') && parentState.quests.some((q) => q.title === 'Tidy the bookshelf'))

console.log('\nJS errors on the page:', errors.length)
errors.slice(0, 8).forEach((e) => console.log('  ', e))
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
await browser.close()
process.exit(fails.length ? 1 : 0)
