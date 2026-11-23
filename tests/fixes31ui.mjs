/**
 * 0.31.0 in a real browser: Pilot core 1.4.0, useful before an AI key.
 * tests/fixes31.mjs holds the rules in plain Node.
 *
 *   - at 320x640, 375x667, 375x812 and 1440x900, in the demo's Parent Mode
 *     with no key: "What's waiting for me?" answers at once with the chores
 *     waiting (by count and name), "How are the kids doing?" with the
 *     dashboard's own This week numbers, "Explain this screen" with the
 *     screen in plain words; the key is offered under them; no child's name;
 *     not one request leaves the page's own site;
 *   - "Add a chore for…" and an answer's "Open Review" go to RankUp's own
 *     screens, closing Pilot;
 *   - the robot: in the tab bar's slot on a phone and the sidebar's on a
 *     computer, as before; on a phone page with no tab bar (the gift page,
 *     the parent's sign-up) it opens in a bottom corner and never sits in a
 *     top corner over a link or button (core 1.4.0);
 *   - still absent on the front door, "I'm a kid", the world picker and a
 *     child's screens.
 */
import { chromium } from 'playwright'
import { finish, BASE, SHOT_DIR } from './helpers.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails.push(label) }
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors = []
const SITE = new URL(BASE).host
const NAMES = /\b(Ava|Noah|Rivera)\b/

async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  // Every request the page makes to anywhere but its own site and the local
  // stand-in API (what the app itself syncs with in these tests).
  const away = []
  page.on('request', (r) => { const u = new URL(r.url()); if (u.host !== SITE && u.hostname !== 'localhost' && u.protocol !== 'data:' && u.protocol !== 'blob:') away.push(r.url()) })
  return { ctx, page, away }
}
const go = async (page, route, wait = 1200) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/rk9-${name}.png` }).catch(() => {})
const demo = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByTestId('see-it-live').click()
  await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
  await page.waitForTimeout(600)
}
const as = async (page, who) => { await page.getByTestId('demo-banner').getByRole('button', { name: new RegExp(who) }).click(); await page.waitForTimeout(900) }
const pilotShown = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  return Boolean(root && root.isConnected && getComputedStyle(root).display !== 'none' && root.querySelector('.pilot-launcher'))
})
const pilotGone = (page) => page.evaluate(() => !document.querySelector('.pilot-root') && document.documentElement.dataset.pilot !== 'on')
async function waitForPilot(page, ms = 10000) {
  for (let t = 0; t < ms; t += 250) { if (await pilotShown(page)) return true; await page.waitForTimeout(250) }
  return false
}
const robot = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  const b = root.querySelector('.pilot-launcher').getBoundingClientRect()
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, peek: root.classList.contains('pilot-peek') }
})
/* Links and buttons of the page under the robot as drawn (its middle and near its corners); the tab bar's slot is free. */
const linksUnder = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  const b = root.querySelector('.pilot-launcher').getBoundingClientRect()
  const pts = [[(b.left + b.right) / 2, (b.top + b.bottom) / 2], [b.left + 8, b.top + 8], [b.right - 8, b.top + 8], [b.left + 8, b.bottom - 8], [b.right - 8, b.bottom - 8]]
  const hit = []
  for (const [x, y] of pts) {
    const top = document.elementsFromPoint(x, y).find((el) => !root.contains(el))
    if (!top || top.closest('[data-pilot-dock]')) continue
    const c = top.closest('a, button, input, select, textarea')
    if (c) hit.push(`${c.tagName} ${(c.textContent || c.getAttribute('aria-label') || '').trim().slice(0, 30)}`)
  }
  return [...new Set(hit)]
})
const log = (page) => page.locator('.pilot-root .pilot-log').innerText().catch(() => '')
const openPilot = async (page) => {
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForSelector('.pilot-root .pilot-welcome', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
}
const pressPill = async (page, label) => { await page.locator('.pilot-root .pilot-pill:visible', { hasText: label }).click(); await page.waitForTimeout(500) }
const pressChip = async (page, label) => { await page.locator('.pilot-root .pilot-chip:visible', { hasText: label }).first().click(); await page.waitForTimeout(500) }

console.log('\n=== With no key: RankUp answers itself, at 320, 375x667, 375x812 and 1440 ===')
for (const [w, h] of [[320, 640], [375, 667], [375, 812], [1440, 900]]) {
  const { ctx, page, away } = await open(w, h)
  await demo(page)
  ok(`${w}x${h}: the robot is there in Parent Mode`, await waitForPilot(page))
  // What the screens themselves show, to compare with Pilot's answers.
  const shown = await page.evaluate(() => {
    const cell = (k) => document.querySelector(`[data-testid="this-week"] [data-week="${k}"] .font-display`)?.textContent.trim()
    return { chores: cell('chores'), xp: cell('xp'), streak: cell('streak') }
  })
  // The chores waiting, from the family's own saved state.
  const titles = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('rankup.state.v1') || '{}')
    return (st.submissions || []).filter((x) => x.status === 'pending').map((x) => (st.quests || []).find((q) => q.id === x.questId)?.title).filter(Boolean)
  })
  await openPilot(page)
  await pressPill(page, "What's waiting for me?")
  const one = await log(page)
  ok(`${w}x${h}: "What's waiting for me?" answers at once: how many, and each chore's name`, /\d+ chores? (is|are) waiting for you to review/.test(one)
    && titles.length > 0 && titles.every((t) => one.includes(t)) && one.includes(`${titles.length} chore`), JSON.stringify(titles) + ' ' + one.slice(0, 300))
  ok(`${w}x${h}: with a link to Review`, (await page.locator('.pilot-root .pilot-log a', { hasText: 'Open Review' }).count()) === 1)
  ok(`${w}x${h}: and under it, the key offered ("Want more? …" and Key settings)`, (await page.locator('.pilot-root .pilot-more').count()) === 1
    && /Want more\? Add your AI key to ask anything\./.test(one))
  ok(`${w}x${h}: no key settings opened, nothing waiting in the box`, !(await page.locator('.pilot-root .pilot-settings-view').isVisible()) && (await page.locator('.pilot-root .pilot-input').inputValue()) === '')
  // 0.33.0: with no key the suggestions leave out what a pill does; the pill
  // "How is my kid doing?" (the same answer) is offered again under the answer.
  await page.locator('.pilot-root .pilot-pill:visible', { hasText: 'How is my kid doing?' }).first().click()
  await page.waitForTimeout(500)
  const two = await log(page)
  ok(`${w}x${h}: "How is my kid doing?": the dashboard's own This week numbers`, shown.chores && two.includes(`Chores done: ${shown.chores}`)
    && two.includes(`XP earned: ${shown.xp}`) && two.includes(`Days in a row: ${shown.streak}`), JSON.stringify(shown) + ' ' + two.slice(-400))
  ok(`${w}x${h}: no child's or family's name in Pilot's answers`, !NAMES.test(two.replace(/^.*?(?=What's waiting)/s, '')), two.slice(0, 200))
  ok(`${w}x${h}: the answers fit the window (no sideways scroll)`, await page.evaluate(() => { const l = document.querySelector('.pilot-root .pilot-log'); return l.scrollWidth <= l.clientWidth + 1 }))
  if (w === 375 && h === 812) await shot(page, `${w}x${h}-answers`)
  if (w === 1440) await shot(page, '1440-answers')
  await page.locator('.pilot-root .pilot-clear').click().catch(() => {})
  await page.waitForTimeout(400)
  await go(page, '/parent/approvals', 900)
  if (!(await page.locator('.pilot-root .pilot-panel').isVisible())) await openPilot(page)
  if (await page.locator('.pilot-root .pilot-pill:visible', { hasText: 'Explain this screen' }).count()) await pressPill(page, 'Explain this screen')
  else await pressChip(page, 'What can I do here?')
  const three = await log(page)
  // 0.32.0: Review's own counts (the chores waiting and the oldest), tests/fixes32.mjs.
  ok(`${w}x${h}: "Explain this screen" on Review: the screen in plain words, with its counts`, /This is Review\./.test(three) && /Right now: \d+ chores? waiting for review, the oldest sent [^.]+\./.test(three), three.slice(-400))
  if (w === 320) await shot(page, '320-explain')
  ok(`${w}x${h}: nothing left the site (no AI call, no key, nothing sent)`, away.length === 0, away.slice(0, 3).join(' | '))
  await ctx.close()
}

console.log('\n=== Links go to RankUp\'s own screens, and Pilot closes ===')
{
  const { ctx, page, away } = await open(375, 667)
  await demo(page)
  await waitForPilot(page)
  await openPilot(page)
  await pressPill(page, 'Add a chore for…')
  await page.waitForTimeout(500)
  ok('"Add a chore for…" opens Assign', await page.evaluate(() => location.hash === '#/parent/assign'))
  ok('and Pilot closes, so Assign shows', !(await page.locator('.pilot-root .pilot-panel').isVisible()) && /Assign a quest/.test(await page.locator('h1').first().innerText()))
  await openPilot(page)
  await pressPill(page, "What's waiting for me?")
  await page.locator('.pilot-root .pilot-log a', { hasText: 'Open Review' }).click()
  await page.waitForTimeout(800)
  ok('an answer\'s "Open Review" opens Review in the same tab, and Pilot closes', await page.evaluate(() => location.hash === '#/parent/approvals')
    && !(await page.locator('.pilot-root .pilot-panel').isVisible()) && ctx.pages().length === 1)
  ok('the answer is kept in the chat, marked as RankUp\'s own (not the AI\'s)', await page.evaluate(() => {
    const chat = JSON.parse(sessionStorage.getItem('rankup-pilot-chat') || localStorage.getItem('rankup-pilot-chat') || '[]')
    const list = Array.isArray(chat) ? chat : chat.messages || []
    return list.some((m) => m.role === 'assistant' && m.local === true)
  }))
  ok('nothing left the site', away.length === 0, away.join(' | '))
  await ctx.close()
}

console.log('\n=== The robot: its slots as before, and never a top corner on a phone ===')
for (const [w, h] of [[320, 640], [375, 667], [375, 812]]) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  await waitForPilot(page)
  await page.waitForTimeout(800)
  const slot = await page.evaluate(() => { const b = document.querySelector('[data-pilot-dock]').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top } })
  for (const y of [0, 600]) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await page.waitForTimeout(500)
    const r = await robot(page)
    ok(`${w}x${h}: Parent Mode, scrolled ${y}px: in the tab bar's slot, whole`, !r.peek && Math.abs((r.left + r.right) / 2 - (slot.left + slot.right) / 2) < 8 && r.top > h / 2, JSON.stringify({ r, slot }))
  }
  await ctx.close()
  // A page with no tab bar: the core places the robot (1.4.0). Core 1.3.0
  // tucked it into the top right here, over the page's own button; 1.4.0
  // tries the bottom corners first, and takes a top corner only where it
  // covers nothing at all.
  const gift = await open(w, h)
  await gift.page.goto(`${BASE}/#/gift`, { waitUntil: 'networkidle' })
  await waitForPilot(gift.page)
  await gift.page.waitForTimeout(4500)
  const first = await robot(gift.page)
  ok(`${w}x${h}: the gift page as it opens: a bottom corner, not the top`, first.top > h / 2, JSON.stringify(first))
  let worst = null
  for (const y of [0, 250, 500, 800, 1400, 99999]) {
    await gift.page.evaluate((v) => window.scrollTo(0, v), y)
    await gift.page.waitForTimeout(700)
    const r = await robot(gift.page)
    const under = await linksUnder(gift.page)
    if (r.top < h / 2 && under.length) worst = { y, r, under }
  }
  ok(`${w}x${h}: scrolled top to bottom: never in a top corner over a link or button`, worst === null, JSON.stringify(worst))
  if (w === 375 && h === 667) await shot(gift.page, '375x667-gift')
  await gift.ctx.close()
}
{
  const { ctx, page } = await open(1440, 900)
  await demo(page)
  await waitForPilot(page)
  await page.waitForTimeout(1200)
  const r = await robot(page)
  const slot = await page.evaluate(() => { const b = document.querySelector('[data-pilot-dock]').getBoundingClientRect(); return { left: b.left, right: b.right } })
  ok('1440px: in the sidebar\'s slot, bottom left, whole', !r.peek && r.left < 110 && r.bottom > 800 && Math.abs((r.left + r.right) / 2 - (slot.left + slot.right) / 2) < 20, JSON.stringify({ r, slot }))
  await ctx.close()
}

console.log('\n=== Still absent where it must be ===')
{
  const { ctx, page } = await open(375, 667)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  ok('the front door: no Pilot', await pilotGone(page))
  await page.getByRole('button', { name: /I'm a kid/ }).click()
  await page.waitForTimeout(900)
  ok('"I\'m a kid": no Pilot', await pilotGone(page))
  await page.getByRole('button', { name: /Back/ }).first().click().catch(() => {})
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(400)
  if (await page.locator('input[type=email]').count()) {
    await page.locator('input[type=email]').fill(`fix31-${Date.now()}@example.com`)
    await page.locator('input[type=password]').fill('correct-horse-battery')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForTimeout(1600)
  }
  ok('"I\'m a parent", step 1: Pilot is there', await waitForPilot(page))
  await page.waitForTimeout(4500)
  const r = await robot(page)
  const under = await linksUnder(page)
  ok('step 1 at 375x667: the robot never in a top corner, never over a link or button', r.top > 667 / 2 && under.length === 0, JSON.stringify({ r, under }))
  await shot(page, '375x667-signup')
  await openPilot(page)
  await pressPill(page, "What's waiting for me?")
  ok('step 1: the pills answer kindly with no family yet', /Once your family is set up/.test(await log(page)))
  await page.locator('.pilot-root .pilot-win[aria-label="Close Pilot"]').click().catch(() => {})
  await page.locator('input').nth(0).fill('Sam')
  await page.locator('input').nth(1).fill('The Fix family')
  await page.locator('input').nth(2).fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1200)
  if (await page.getByText('What RankUp collects about your child').count()) {
    await page.locator('input[type=checkbox]').check()
    await page.locator('input[placeholder*="Samira"]').fill('Sam Fix')
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /I agree/ }).click()
    await page.waitForTimeout(1500)
  }
  await page.waitForSelector('text=picks a world', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2000)
  ok('the world picker (sign-up step 2): no Pilot', !(await pilotShown(page)))
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await waitForPilot(page)
  await as(page, 'Ava')
  const shownOn = []
  for (const r of ['/kid', '/kid/quests', '/kid/shop', '/kid/arcade', '/kid/profile']) { await go(page, r, 500); if (!(await pilotGone(page))) shownOn.push(r) }
  ok('a child\'s screens: none', shownOn.length === 0, shownOn.join(', '))
  await ctx.close()
}

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await finish(errors, fails, browser)
