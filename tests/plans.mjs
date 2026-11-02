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

console.log('\n=== Monthly or yearly, and yearly says what it saves ===')
// Annual is most of the revenue difference in a subscription business, and the
// thing that makes it work is that the saving is stated where the choice is
// made rather than a tap away.
await page.evaluate(() => { window.location.hash = '/parent/plan' })
await page.waitForTimeout(700)
await page.getByRole('tab', { name: /Yearly/ }).click()
await page.waitForTimeout(500)
const yearly = await page.evaluate(() => document.body.innerText)
yearly.includes('$99.9') && yearly.includes('$159.9')
  ? pass('yearly prices replace the monthly ones')
  : fail('yearly prices shown', yearly.slice(0, 200))
yearly.includes('2 months free')
  ? pass('and the control itself says what yearly buys')
  : fail('2 months free stated', 'phrase missing')
// Assigned rather than written inline: a regex literal opening a line after a
// closing paren is read as division, and the file stops parsing.
const showsSaving = /\$\d+\.\d\d saved/.test(yearly)
showsSaving
  ? pass('each plan shows the money saved in cash, not a percentage')
  : fail('saving in cash', yearly.slice(0, 200))
yearly.includes('Billed yearly')
  ? pass('and says plainly how it will be billed')
  : fail('billed yearly stated', 'phrase missing')

// Every price the screen shows, monthly and yearly, is a price in the table in
// docs/PAYMENTS.md, written the same way. "$99.9/yr" is not "$99.90 / year".
{
  const { readFileSync } = await import('node:fs')
  const doc = readFileSync(new URL('../docs/PAYMENTS.md', import.meta.url), 'utf8')
  const table = doc.slice(doc.indexOf('### 1. Create the products'), doc.indexOf('### 2.'))
  const documented = new Set([...table.matchAll(/\$(\d+\.\d\d) \/ (month|year)/g)].map((m) => `${m[1]}/${m[2] === 'month' ? 'mo' : 'yr'}`))
  const shownIn = (text) => [...text.matchAll(/\$(\d+(?:\.\d+)?)\s*\/(mo|yr)\b/g)].map((m) => `${m[1]}/${m[2]}`)
  const shown = new Set([...shownIn(body), ...shownIn(yearly)])
  const strays = [...shown].filter((p) => !documented.has(p))
  shown.size >= 4 && strays.length === 0
    ? pass(`every price on the plan screen is in docs/PAYMENTS.md (${[...shown].join(', ')})`)
    : fail('plan prices match docs/PAYMENTS.md', `shown ${[...shown].join(', ')}; not in the doc: ${strays.join(', ')}`)
  const missing = [...documented].filter((p) => !shown.has(p))
  missing.length === 0
    ? pass('and every documented price is on the plan screen')
    : fail('documented prices shown', missing.join(', '))
}

// Defaulting somebody into the larger charge is what gets refunded.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.evaluate(() => { window.location.hash = '/parent/plan' })
/*
 * Wait for the screen, not for a clock. This was a fixed 700ms, which was
 * fine until the artwork shipped with the bundle and first paint got
 * slower — then it sometimes read an empty page and failed a working app.
 */
await page.waitForFunction(() => /\$\d/.test(document.body.innerText), null, { timeout: 15000 })
  .catch(() => {})
const fresh = await page.evaluate(() => document.body.innerText)
fresh.includes('$9.99') && !fresh.includes('$99.9')
  ? pass('monthly is what a parent sees first')
  : fail('monthly is the default', fresh.slice(0, 200))

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

console.log('\n=== A payment that fails is explained on the dashboard ===')
{
  // The webhook's write, made directly: the newest family is this test's.
  const { default: pg } = await import('pg')
  const db = new pg.Client({
    host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT || 55432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'rankup_test',
  })
  await db.connect()
  const setStatus = (status) => db.query(
    `update families set subscription_status = $1, last_paid_tier = 'elite'
      where id = (select id from families order by created_at desc limit 1)`, [status])
  // Waits for the sync to bring the family row over, rather than for a time.
  const dashboardSays = async (pattern, present) => {
    await page.evaluate(() => { window.location.hash = '/parent' })
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      // eslint-disable-next-line no-await-in-loop
      const text = await page.evaluate(() => document.body.innerText)
      if (pattern.test(text) === present) return true
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(500)
    }
    return false
  }
  await setStatus('past_due')
  ;(await dashboardSays(/A payment failed[\s\S]*Elite plan/, true))
    ? pass('a declined renewal puts "A payment failed" on the dashboard, naming the plan')
    : fail('payment failure explained', (await page.evaluate(() => document.body.innerText)).slice(0, 200))
  await setStatus('active')
  ;(await dashboardSays(/A payment failed/, false))
    ? pass('and it goes once the payment is through')
    : fail('notice cleared', 'still showing')
  await db.end()
}

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
