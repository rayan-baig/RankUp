/**
 * The first five minutes, on a 375px phone: "See it live", then a new family.
 *
 * The demo. A parent who opens it must be able to see the whole loop (accept
 * a chore and watch a child level up, see it from the child's side, spend on
 * a reward, look at the league) and switch between parent and child from the
 * bar at the top, which always says DEMO and offers "Start for free". And it
 * must be inert: every request the page makes is recorded, and not one may go
 * to the database, to /api (where checkout lives) or to Stripe, whatever is
 * tapped. "Start for free" ends it and opens the sign-up, carrying nothing.
 *
 * Then a real family, set up the way a parent would: the getting-started
 * list, three starter chores and three starter rewards in a tap each, "We
 * share one phone", and every screen a new family can open empty showing a
 * short message and its one next step. No screen scrolls sideways at 375px.
 */
import { chromium } from 'playwright'
import { reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(`console: ${m.text()}`)
})

// Every request that leaves the page's own files.
const calls = []
let recording = false
page.on('request', (r) => {
  if (!recording) return
  const url = r.url()
  if (url.startsWith('data:') || /fonts\.(googleapis|gstatic)\.com/.test(url)) return
  const own = url.startsWith(BASE)
  if (own && !/\/api\//.test(url)) return
  calls.push(`${r.method()} ${url}`)
})

const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1') || '{}'))
const hash = () => page.evaluate(() => location.hash)
const go = async (route, wait = 700) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
const text = () => page.evaluate(() => document.body.innerText)
const sideways = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.documentElement.clientWidth)

console.log('\n=== "See it live" ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const door = page.getByTestId('see-it-live')
;(await door.isVisible()) && /See it live/.test(await door.innerText())
  ? pass('the front door offers "See it live"')
  : fail('see it live on the door', await door.innerText().catch(() => 'missing'))
;/pretend family/i.test(await text()) && /no account, no email/i.test(await text())
  ? pass('and says it is a pretend family, with no account or email')
  : fail('demo promise on the door', (await text()).slice(0, 300))
recording = true
await door.click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOT_DIR}/demolive-dashboard.png` })

const bar = page.getByTestId('demo-banner')
const barText = await bar.innerText().catch(() => '')
;/DEMO/.test(barText) && /pretend/i.test(barText)
  ? pass('the bar at the top says DEMO, and that the family is pretend')
  : fail('demo bar words', barText)
const startBox = await bar.getByRole('button', { name: 'Start for free' }).boundingBox()
startBox && startBox.x + startBox.width <= 375 && startBox.height >= 36
  ? pass('"Start for free" is on screen and easy to tap')
  : fail('start for free button', JSON.stringify(startBox))

console.log('\n=== The loop: accept, level up ===')
const before = (await store()).kids.find((k) => k.name === 'Ava')
await page.getByTestId('demo-tour').getByRole('button', { name: /Accept Ava's/ }).click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: /^Accept/ }).first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOT_DIR}/demolive-levelup.png` })
const after = (await store()).kids.find((k) => k.name === 'Ava')
after.xp > before.xp
  ? pass(`accepting Ava's chore pays her XP (${before.xp} → ${after.xp})`)
  : fail('accept pays XP', `${before.xp} → ${after.xp}`)
;/level up/i.test(await text()) && /Ava went from level/.test(await text())
  ? pass('and she levels up, on screen')
  : fail('level up shown', (await text()).slice(0, 300))
await page.getByText('Tap to carry on').click().catch(() => {})
await page.waitForTimeout(600)

console.log('\n=== The child\'s side, from the bar ===')
await bar.getByRole('button', { name: /Ava/ }).click()
await page.waitForTimeout(900)
;(await hash()) === '#/kid' && (await store()).session.kidId === after.id
  ? pass('"Ava" in the bar opens her home, as her')
  : fail('bar to kid view', await hash())
;(await bar.getByRole('button', { name: /Ava/ }).getAttribute('aria-pressed')) === 'true'
  ? pass('and the bar shows whose screen it is')
  : fail('bar pressed state', 'not pressed')
await page.screenshot({ path: `${SHOT_DIR}/demolive-kid.png` })

await go('/kid/shop')
const coins = (await store()).kids.find((k) => k.name === 'Ava').coins
await page.locator('.card', { hasText: "Pick Friday's film" }).getByRole('button').first().click()
await page.waitForTimeout(900)
const shop = await store()
shop.redemptions?.some((r) => r.name === "Pick Friday's film") && shop.kids.find((k) => k.name === 'Ava').coins < coins
  ? pass('she can spend what she earned on a reward')
  : fail('demo reward', JSON.stringify({ coins, now: shop.kids.find((k) => k.name === 'Ava').coins }))

await go('/kid/leaderboards', 1000)
const league = await text()
;/Ava/.test(league) && /Noah/.test(league) && /demo's family board/i.test(league)
  ? pass('the league shows the family racing, and says what a real family also gets')
  : fail('demo league', league.slice(0, 400))
await page.screenshot({ path: `${SHOT_DIR}/demolive-league.png` })

console.log('\n=== Back to the parent, and nothing sent ===')
await bar.getByRole('button', { name: /Parent/ }).click()
await page.waitForTimeout(800)
;(await hash()) === '#/parent' && (await store()).session.parentUnlocked
  ? pass('"Parent" in the bar is the parent\'s dashboard again, no PIN asked')
  : fail('bar to parent view', await hash())

await go('/parent/plan', 900)
for (const button of await page.getByRole('button', { name: /Switch to|Subscribe to/ }).all()) {
  await button.click().catch(() => {})
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Switch', exact: true }).click().catch(() => {})
  await page.waitForTimeout(300)
}
for (const route of ['/gift', '/school', '/parent/settings', '/parent/history', '/parent/money']) await go(route, 800)

const DEMO_ROUTES = ['/parent', '/parent/approvals', '/parent/assign', '/parent/kids', '/parent/settings',
  '/parent/history', '/parent/money', '/kid', '/kid/quests', '/kid/shop', '/kid/arcade', '/kid/profile', '/kid/leaderboards']
const wide = []
for (const route of DEMO_ROUTES) {
  if (route === '/kid') await bar.getByRole('button', { name: /Ava/ }).click().catch(() => {})
  await go(route, 700)
  const extra = await sideways()
  if (extra > 0) wide.push(`${route} +${extra}px`)
}
wide.length === 0
  ? pass(`no demo screen scrolls sideways at 375px (${DEMO_ROUTES.length} screens)`)
  : fail('demo screens fit 375px', wide.join(', '))

calls.length === 0
  ? pass('in all of that, not one request to the database, /api or Stripe')
  : fail('demo sends nothing', calls.slice(0, 5).join(' | '))
recording = false

console.log('\n=== "Start for free" ===')
await bar.getByRole('button', { name: 'Start for free' }).click()
await page.waitForTimeout(400)
await page.getByRole('dialog').getByRole('button', { name: 'Start for free' }).click()
  .catch(() => page.getByRole('button', { name: 'Start for free' }).last().click())
await page.waitForTimeout(1200)
const left = await store()
!left.demo && (left.kids?.length || 0) === 0 && (await page.locator('input[type=email]').count()) === 1
  ? pass('it clears the demo and opens the sign-up straight away')
  : fail('start for free', JSON.stringify({ demo: left.demo, kids: left.kids?.length }))

console.log('\n=== A new family: getting started ===')
await page.locator('input[type=email]').fill(`firstfive${Date.now()}@example.com`)
await page.locator('input[type=password]').fill('correct-horse-battery')
await page.getByRole('button', { name: 'Create account' }).click()
await page.waitForTimeout(1600)
await page.locator('input').nth(0).fill('Sam')
await page.locator('input').nth(2).fill('1234')
await page.getByRole('button', { name: 'Continue' }).click()
await page.waitForTimeout(1200)
await page.locator('input[type=checkbox]').check()
await page.locator('input[placeholder*="Samira"]').fill('Sam Test')
await page.getByRole('button', { name: /I agree/ }).click()
await page.waitForTimeout(1500)
await page.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await page.getByRole('button', { name: 'Start playing' }).click()
await page.waitForTimeout(1500)

const list = page.getByTestId('first-week')
;/Getting started/.test(await list.innerText().catch(() => ''))
  ? pass('a new parent sees "Getting started"')
  : fail('getting started shown', 'missing')
await page.getByTestId('how-it-works').getByRole('button', { name: 'Got it' }).click().catch(() => {})
await page.waitForTimeout(300)
await page.screenshot({ path: `${SHOT_DIR}/demolive-checklist.png` })

// Every screen a new family can open with nothing on it yet.
const EMPTY = [
  ['/parent/approvals', 'empty-review', 'Add a chore', '#/parent/assign'],
  ['/parent/history', 'empty-history', 'Add a chore', '#/parent/assign'],
  ['/parent/money', 'empty-money', 'Add a paid chore', '#/parent/assign'],
]
for (const [route, id, label, to] of EMPTY) {
  await go(route, 900)
  const box = page.getByTestId(id)
  const words = await box.innerText().catch(() => '')
  const button = box.getByRole('button', { name: label })
  const tall = (await button.boundingBox().catch(() => null))?.height || 0
  if (words && (await button.count()) === 1 && tall >= 40) {
    if (route === '/parent/approvals') await page.screenshot({ path: `${SHOT_DIR}/demolive-empty-review.png` })
    await button.click()
    await page.waitForTimeout(600)
    ;(await hash()).startsWith(to)
      ? pass(`${route} empty: "${words.split('\n').filter(Boolean)[1] || words}", and "${label}" goes there`)
      : fail(`${route} empty action`, await hash())
  } else {
    fail(`${route} empty state`, `${words} / button ${await button.count()} ${tall}px`)
  }
}

await go('/parent', 900)
;(await page.getByTestId('empty-rewards').count()) === 1
  ? pass('no rewards yet: the dashboard says so, with three to add')
  : fail('empty rewards card', 'missing')
await page.getByTestId('starter-rewards').click()
await page.waitForTimeout(600)
;(await store()).rewards.length === 3 && (await page.getByTestId('empty-rewards').count()) === 0
  ? pass('one tap adds three starter rewards, and the card goes')
  : fail('starter rewards', String((await store()).rewards.length))

await page.locator('[data-step="assign"] [data-testid="starter-chores"]').click()
await page.waitForTimeout(700)
;(await store()).quests.length === 3 && (await page.locator('[data-step="assign"]').getAttribute('data-done')) === 'true'
  ? pass('one tap adds three starter chores, and "Add a first chore" ticks')
  : fail('starter chores', String((await store()).quests.length))
await page.locator('[data-step="pair"] [data-testid="shared-phone"]').click()
await page.waitForTimeout(500)
;(await page.locator('[data-step="pair"]').getAttribute('data-done')) === 'true'
  ? pass('"We share one phone" ticks the phone step')
  : fail('shared phone ticks', 'not ticked')

const NEW_ROUTES = ['/parent', '/parent/approvals', '/parent/assign', '/parent/kids', '/parent/pair',
  '/parent/settings', '/parent/history', '/parent/money', '/parent/school', '/parent/leaderboards']
const wideNew = []
for (const route of NEW_ROUTES) {
  await go(route, 700)
  const extra = await sideways()
  if (extra > 0) wideNew.push(`${route} +${extra}px`)
}
wideNew.length === 0
  ? pass(`no new-family screen scrolls sideways at 375px (${NEW_ROUTES.length} screens)`)
  : fail('new family screens fit 375px', wideNew.join(', '))

await finish(errors, fails, browser)
