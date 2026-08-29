/**
 * Notifications, driven in a real browser.
 *
 * What can be checked here: the service worker registers, permission is asked
 * for, a notification is genuinely produced by the service worker, and the
 * settings screen tells the truth about which mode is in force.
 *
 * What cannot: actual background Web Push delivery, which needs a real push
 * service the sandbox cannot reach. That path is exercised by the endpoint's
 * own checks and is marked unverified in docs/NOTIFICATIONS.md.
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE, setUpFamily } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['notifications'],
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(m.text())
})

// Notifications are shown by the service worker, so ask IT what is on screen
// rather than spying on the page. getNotifications is the real observation.
const shownNotifications = () =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    const list = await reg.getNotifications()
    return list.map((n) => ({ title: n.title, body: n.body, url: n.data?.url }))
  })

console.log('\n=== The service worker ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const swOk = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  return Boolean(reg?.active || reg?.installing || reg?.waiting)
})
swOk ? pass('the service worker registers') : fail('service worker registers', 'no registration')

console.log('\n=== Turning notifications on ===')
await setUpFamily(page)
await page.evaluate(() => { window.location.hash = '/parent/settings' })
await page.waitForTimeout(1200)
;(await page.getByText('Tell me when something happens').count()) > 0
  ? pass('the settings screen offers notifications')
  : fail('settings offers notifications', 'toggle missing')

await page.getByRole('switch', { name: /Tell me when something happens/ }).click()
await page.waitForTimeout(2000)
const granted = await page.evaluate(() => Notification.permission)
granted === 'granted' ? pass('permission is granted') : fail('permission granted', granted)

// With no VAPID key configured the app must say "while the app is open",
// not imply background delivery it cannot do.
const honest = await page.getByText(/On while RankUp is open/).count()
honest > 0
  ? pass('it says notifications only work while the app is open, rather than implying more')
  : fail('honest about local-only mode', 'no such banner')

console.log('\n=== A notification is actually produced ===')
await page.getByRole('button', { name: 'Send me a test notification' }).click()
await page.waitForTimeout(1500)
const shown = await shownNotifications()
shown.length > 0
  ? pass(`the service worker showed one ("${shown[0].title}")`)
  : fail('a notification is shown', 'nothing reached showNotification')
shown[0]?.url
  ? pass(`it carries a destination (${shown[0].url})`)
  : fail('notification has a tap destination', JSON.stringify(shown[0] || {}))

console.log('\n=== Turning them off ===')
await page.getByRole('switch', { name: /Tell me when something happens/ }).click()
await page.waitForTimeout(1000)
const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('rankup.notifications.v1') || '{}'))
prefs.enabled === false ? pass('turning them off sticks') : fail('off sticks', JSON.stringify(prefs))

await finish(errors, fails, browser)
