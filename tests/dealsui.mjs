/**
 * The deals in the app (0.23.0), with payments on (its own dev server with
 * VITE_STRIPE_ENABLED=true on a free port), and /api/deals answered here as
 * the server would:
 *
 *   - the plan screen: the Founding Families card with the places left and
 *     the real end date, "Save 30%" and "months free" from the plan list's
 *     own prices, "Standard or Elite?", and a yearly checkout that asks for
 *     the founding price;
 *   - the dashboard: the holiday gift sale, and "Gift a year" a month in,
 *     gone for good with "Not now";
 *   - the Give page: the sale;
 *   - and not one deal, price or offer on a child's screens, which never even
 *     ask for them.
 */
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import pg from 'pg'

const freePort = () => new Promise((resolve, reject) => {
  const srv = createServer()
  srv.on('error', reject)
  srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
})
const PORT = await freePort()
const OWN = `http://localhost:${PORT}`
process.env.BASE_URL = OWN
const { launch, reporter, setUpFamily, asKid, finish, SHOT_DIR } = await import('./helpers.mjs')
const { TIERS } = await import('../src/state/initialState.js')
const { annualSaving } = await import('../src/lib/plans.js')

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, VITE_STRIPE_ENABLED: 'true' }, stdio: 'ignore', detached: true,
})
const stopVite = () => { try { process.kill(-vite.pid, 'SIGKILL') } catch { /* gone */ } }
let up = false
for (let i = 0; i < 80 && !up; i += 1) {
  try { up = (await fetch(`${OWN}/`)).ok } catch { /* not yet */ }
  if (!up) await new Promise((r) => setTimeout(r, 500))
}
if (!up) { stopVite(); console.log('FAIL the dev server with payments on did not start'); process.exit(1) }

const { fails, pass, fail } = reporter()
const check = (name, cond, detail = '') => (cond ? pass(name) : fail(name, detail))
const { browser, page, errors } = await launch()
const DEALS = {
  ok: true,
  founding: { percent: 40, limit: 500, left: 312, ends_at: '2027-01-31T23:59:59.999Z' },
  gift_sale: { percent: 25, until: '2026-12-31T23:59:59.999Z' },
  season: null,
}
let dealAsks = 0
await page.route('**/api/deals', async (route) => {
  dealAsks += 1
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DEALS) })
})
let checkoutBody = null
await page.route('**/api/create-checkout', async (route) => {
  checkoutBody = JSON.parse(route.request().postData() || '{}')
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `${OWN}/#/parent/plan?checkout=cancelled` }) })
})
const text = () => page.evaluate(() => document.body.innerText)
const go = async (route, wait = 1200) => { await page.evaluate((r) => { window.location.hash = r }, route); await page.waitForTimeout(wait) }

await setUpFamily(page)
const family = await page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1')).family)

console.log('\n=== The plan screen ===')
await go('/parent/plan', 2000)
let plan = await text()
check('the Founding Families card: the percent, the places left (counted), the real end date', /Founding Families: your first year 40% off/.test(plan)
  && /312 places left/.test(plan) && /January 31/.test(plan), plan.slice(0, 400))
check('it says what happens after the first year, and one per family', /renews at the plan's normal yearly price/.test(plan) && /One per family/.test(plan))
const std = annualSaving(TIERS.standard)
check(`"Save ${std.percent}%" on Standard, from the plan list's prices`, (await page.getByTestId('save-badge-standard').innerText().catch(() => '')).includes(`Save ${std.percent}%`))
check('"Standard or Elite?", line by line', (await page.getByTestId('standard-or-elite').innerText().catch(() => '')).includes('Everything in Standard, and:'))
await page.getByTestId('founding-choose').click()
await page.waitForTimeout(500)
plan = await text()
check('choosing it shows the yearly plans, each marked "First year 40% off"', (await page.getByTestId('founding-badge-elite').count()) === 1)
await page.screenshot({ path: `${SHOT_DIR}/deals-plan.png`, fullPage: true })
await page.getByRole('button', { name: /Subscribe to Elite Pass/ }).click()
await page.waitForTimeout(1200)
check('the yearly checkout asks the server for the founding price (the server decides)', checkoutBody?.deal === 'founding' && checkoutBody?.cycle === 'year', JSON.stringify(checkoutBody))

console.log('\n=== The dashboard and the Give page ===')
await go('/parent', 1500)
check('the holiday gift sale, with its real end date', /Gift a year of RankUp: 25% off/.test(await text()) && /December 31/.test(await text()))
check('no "Gift a year" suggestion in the first month', (await page.getByTestId('gift-a-year').count()) === 0)
const db = new pg.Client({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test' })
await db.connect()
await db.query("update families set created_at = now() - interval '31 days' where id = $1", [family.id])
// The holiday sale's banner takes the place of "Gift a year" while it is on.
DEALS.gift_sale = null
await page.reload({ waitUntil: 'networkidle' })
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await page.waitForTimeout(2500)
await go('/parent/settings', 600)
await go('/parent', 1500)
check('a month in, "Know a family who would like this?"', (await page.getByTestId('gift-a-year').count()) === 1)
await page.getByTestId('gift-a-year').getByRole('button', { name: 'Not now' }).click()
await page.waitForTimeout(1500)
await page.reload({ waitUntil: 'networkidle' })
await go('/parent', 1200)
check('gone for good with "Not now"', (await page.getByTestId('gift-a-year').count()) === 0)
DEALS.gift_sale = { percent: 25, until: '2026-12-31T23:59:59.999Z' }
await go('/gift', 1500)
check('the Give page shows the sale', /25% off/.test(await text()))

console.log('\n=== A child\'s screens: no deal, no price, no offer ===')
await go('/parent', 600)
await asKid(page)
dealAsks = 0
let seen = []
for (const route of ['/kid', '/kid/quests', '/kid/shop', '/kid/market', '/kid/profile', '/kid/arcade', '/kid/leaderboards']) {
  // eslint-disable-next-line no-await-in-loop
  await go(route, 900)
  // eslint-disable-next-line no-await-in-loop
  const t = await text()
  if (/Founding Families|% off|Gift a year|Give a year|\$\d|places left/.test(t)) seen.push(`${route}: ${t.match(/Founding Families|% off|Gift a year|Give a year|\$\d|places left/)[0]}`)
}
check('not one, on any of them', seen.length === 0, seen.join('; '))
check('and a child\'s screens never even ask for the deals', dealAsks === 0, String(dealAsks))

await db.end()
stopVite()
finish(errors, fails, browser)
