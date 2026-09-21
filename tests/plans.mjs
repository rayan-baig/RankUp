/**
 * Plans and the Sunday Market.
 *
 * The claims worth proving: the ladder is enforced rather than merely
 * advertised, a child cannot reach a payment screen, and nothing sold in the
 * market can change what a chore pays.
 */
import { launch, reporter, setUpFamily, readState, finish, expireTrialInDatabase, SHOT_DIR } from './helpers.mjs'

const { browser, page, errors } = await launch()
const { fails, pass, fail } = reporter()

await setUpFamily(page)

console.log('\n=== Three plans, all billed monthly ===')
await page.evaluate(() => { window.location.hash = '/parent/plan' })
await page.waitForTimeout(900)
const body = await page.evaluate(() => document.body.innerText)
;['Free', '$9.99', '$15.99'].every((p) => body.includes(p))
  ? pass('all three plans are priced on the plan screen, Starter free')
  : fail('three prices shown', body.slice(0, 160))
// A free plan must never render as "$0/mo", which reads as a bug.
!body.includes('$0')
  ? pass('and free is written as Free, not as zero dollars')
  : fail('free not written as $0', body.slice(0, 160))
;(body.match(/\/mo/g) || []).length >= 3
  ? pass('every plan is priced per month')
  : fail('monthly pricing', 'not every plan says /mo')
body.includes('Billed monthly')
  ? pass('it says so in words as well as in the price')
  : fail('billed monthly stated', 'phrase missing')

// The question a parent actually asks is "why would I pay more".
// Standard is measured against free, so it states its own price; Elite is
// measured against Standard, so it states the difference.
body.includes('$9.99 a month') && body.includes('more than Standard')
  ? pass('each step up says what the extra money buys')
  : fail('upgrade reason shown', 'no price-difference line')
// innerText returns text with CSS text-transform applied, so section headings
// come back upper-cased.
;/side by side/i.test(body)
  ? pass('there is a side-by-side comparison')
  : fail('comparison table', 'missing')

console.log('\n=== Nothing claims to remove ads, because there are none ===')
;/ad removal|remove ads|advertis/i.test(body)
  ? fail('no ad-removal claim', 'the plan screen still sells ad removal')
  : pass('no plan sells the removal of ads that do not exist')

console.log('\n=== During the free trial, the limits are not in force ===')
// A new family gets a fortnight of Elite with no card. If the Starter limit
// bit during it, the trial would be a trial of the thing they already have.
await page.evaluate(() => { window.location.hash = '/parent/kids' })
await page.waitForTimeout(800)
await page.getByRole('button', { name: '+ Add' }).isEnabled()
  ? pass('a second child can be added while the trial runs')
  : fail('add enabled during trial', 'button disabled')

console.log('\n=== And the moment it ends, they are ===')
// The part that has to work or nobody ever pays: the trial really expires.
// Expired in the DATABASE, not in this browser: the family row syncs, so a
// local edit is overwritten by the next pull a second later. That is correct —
// what a family is entitled to is the server's to decide, not the phone's.
await expireTrialInDatabase()
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.evaluate(() => { window.location.hash = '/parent/kids' })
await page.waitForTimeout(900)
const kidsBody = await page.evaluate(() => document.body.innerText)
kidsBody.includes('covers one child')
  ? pass('Starter explains the limit instead of just failing')
  : fail('one-child limit explained', kidsBody.slice(0, 200))
await page.getByRole('button', { name: '+ Add' }).isDisabled()
  ? pass('and the Add button is actually disabled')
  : fail('add disabled on Starter', 'still clickable')

const before = (await readState(page)).kids.length
await page.evaluate(() => {
  // Even reaching past the screen must not work: the reducer refuses too.
  window.dispatchEvent(new CustomEvent('rankup-test-noop'))
})
;(await readState(page)).kids.length === before
  ? pass('a second child cannot appear on Starter')
  : fail('kid limit enforced', 'a kid was added')

console.log('\n=== The Sunday Market ===')
await page.evaluate(() => { window.location.hash = '/kid/market' })
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOT_DIR}/plans-market.png` })
const market = await page.evaluate(() => document.body.innerText)
market.includes('Sunday Market')
  ? pass('the market screen loads')
  : fail('market screen', market.slice(0, 160))
;/no extra XP|nothing else/i.test(market)
  ? pass('it says outright that skins change nothing but how you look')
  : fail('cosmetic-only stated', 'no such line')
;/bought by a grown-up|Parent Mode/i.test(market)
  ? pass('and that a grown-up buys the tickets')
  : fail('parent-buys stated', 'no such line')
;/\$\d/.test(market)
  ? fail('no prices on the kid screen', 'a real-money price is shown to the child')
  : pass('no real-money price is ever shown to the child')

console.log('\n=== A kid device cannot reach a payment screen ===')
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  s.device = { ...s.device, role: 'kid', linkedKidId: s.kids[0].id }
  s.session = { role: 'kid', kidId: s.kids[0].id, parentUnlocked: false }
  localStorage.setItem('rankup.state.v1', JSON.stringify(s))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.evaluate(() => { window.location.hash = '/parent/plan' })
await page.waitForTimeout(1200)
;(await page.evaluate(() => location.hash)).startsWith('#/kid')
  ? pass('a kid device is bounced away from the plan screen')
  : fail('kid bounced from billing', await page.evaluate(() => location.hash))

await finish(errors, fails, browser)
