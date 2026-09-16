/**
 * The crash barrier, proved by actually breaking a screen.
 *
 * A boundary nobody has ever triggered is a boundary you are guessing about, so
 * this forces a real React render error on one screen and checks three things:
 * the app survives, the navigation still works, and the crash is reported once
 * rather than on every render.
 */
import { setUpFamily, asKid, launch, reporter, finish, BASE } from './helpers.mjs'

const { pass, fail, fails } = reporter()
const { browser, page } = await launch()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

const reports = []
await page.route('**/rpc/record_crash', async (route) => {
  reports.push(JSON.parse(route.request().postData() || '{}'))
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
})

await setUpFamily(page)
await asKid(page)

console.log('\n=== A screen that throws does not take the app with it ===')

// Break exactly one screen. `rewards` is read by the shop and by nothing above
// it, so the throw happens inside renderRoute — which is the case this boundary
// exists for. Corrupting something the provider reads is a different failure
// and belongs to the root boundary.
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('rankup.state.v1'))
  st.rewards = 'not-an-array'
  localStorage.setItem('rankup.state.v1', JSON.stringify(st))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.evaluate(() => { window.location.hash = '/kid/shop' })
await page.waitForTimeout(1500)

const bodyText = await page.locator('body').innerText()
const screenCard = /This screen broke/i.test(bodyText)
const rootCard = /Something broke/i.test(bodyText)

if (screenCard) pass('the broken screen shows an explanation, not a white screen')
else if (rootCard) fail('the ROOT boundary caught it — the whole app went down for one screen')
else fail('no crash card appeared at all', bodyText.slice(0, 120))

const navAlive = await page.locator('nav').count()
if (screenCard) {
  if (navAlive > 0) pass('and the navigation bar is still there, so the app is still usable')
  else fail('the navigation was lost with the screen')
}

console.log('\n=== Walking away recovers it ===')
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('rankup.state.v1'))
  st.rewards = []
  localStorage.setItem('rankup.state.v1', JSON.stringify(st))
})
await page.evaluate(() => { window.location.hash = '/kid' })
await page.waitForTimeout(1200)
const home = await page.locator('body').innerText()
const stillBroken = /This screen broke/i.test(home)
if (stillBroken) fail('the crash card followed us to another screen')
else pass('another screen renders normally')

console.log('\n=== It is reported, and only once ===')
if (screenCard) {
  reports.length >= 1
    ? pass(`the crash was reported (${reports.length})`)
    : fail('nothing was reported, so nobody would ever learn about it')
  reports.length <= 2
    ? pass('and not once per render')
    : fail(`reported ${reports.length} times — a crash loop would flood the table`)
  const body = JSON.stringify(reports[0] || {})
  const leaked = /Ava|Sam|photo/i.test(body)
  if (leaked) fail('the report contained family data', body.slice(0, 120))
  else pass('the report carries no names or photos')
}

finish(errs.filter((e) => !/deliberate test crash/.test(e)), fails, browser)
