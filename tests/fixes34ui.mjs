/**
 * 0.33.1 in a real browser: Pilot core 1.4.3. tests/fixes34.mjs holds the
 * rules in plain Node.
 *
 *   1. Parent Mode at 320x640, 375x667, 375x812, 390x844 and 1440x900, no
 *      key: the robot in the tab bar's slot (the sidebar's on a computer) on
 *      the first screen, on nothing; with 0.33.0's no-key workaround gone the
 *      suggestions are the whole list, the row under an answer offers each
 *      thing once, typed questions that fit are answered (nothing sent) and
 *      one that doesn't gets Pilot's "needs a key" message in the chat, the
 *      words waiting in the box;
 *   2. the gift and School League pages at the same sizes: the robot or its
 *      handle on the first screen, never over a link, a button, a box or a
 *      label;
 *   3. a computer: the chat docked down the right, the screen moved over;
 *   4. typing on a short screen (a phone's keyboard open): the window goes
 *      compact, and back once the box loses focus;
 *   5. still no Pilot on the front door, before "I'm a parent", on the world
 *      picker or a child's screen.
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
const sent = []
async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  // Nothing may leave for an AI company: Pilot has no key here.
  page.on('request', (r) => { if (/anthropic|openai|googleapis|generativelanguage|mistral|groq|x\.ai/.test(r.url())) sent.push(r.url()) })
  return { ctx, page }
}
const go = async (page, route, wait = 1200) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/rk12-${name}.png` }).catch(() => {})
const demo = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByTestId('see-it-live').click()
  await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
  await page.waitForTimeout(1500)
}
const as = async (page, who) => { await page.getByTestId('demo-banner').getByRole('button', { name: new RegExp(who) }).click(); await page.waitForTimeout(900) }
const pilotShown = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  return Boolean(root && root.isConnected && getComputedStyle(root).display !== 'none' && root.querySelector('.pilot-launcher'))
})
const pilotGone = (page) => page.evaluate(() => !document.querySelector('.pilot-root:not([hidden])') || getComputedStyle(document.querySelector('.pilot-root')).display === 'none')
async function waitForPilot(page, ms = 10000) {
  for (let t = 0; t < ms; t += 250) { if (await pilotShown(page)) return true; await page.waitForTimeout(250) }
  return false
}
/* What can be tapped to open Pilot right now: the robot (whole or tucked) or the handle, with its box. */
const reach = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  if (!root) return null
  const vis = (el) => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05
  const handle = root.querySelector('.pilot-handle')
  const away = root.classList.contains('pilot-away')
  const el = away && vis(handle) ? handle : root.querySelector('.pilot-launcher')
  const b = el.getBoundingClientRect()
  return { what: el === handle ? 'handle' : 'robot', left: b.left, top: b.top, right: b.right, bottom: b.bottom, away,
    inView: b.width > 0 && b.right > 0 && b.bottom > 0 && b.left < innerWidth && b.top < innerHeight && (el === handle || !away) }
})
/* Links, buttons, boxes and labels of the page under it as drawn (its middle and near its corners); the tab bar's slot is free. */
const under = (page, what) => page.evaluate((w) => {
  const root = document.querySelector('.pilot-root')
  const el = w === 'handle' ? root.querySelector('.pilot-handle') : root.querySelector('.pilot-launcher')
  const b = el.getBoundingClientRect()
  const pts = [[(b.left + b.right) / 2, (b.top + b.bottom) / 2], [b.left + 8, b.top + 8], [b.right - 8, b.top + 8], [b.left + 8, b.bottom - 8], [b.right - 8, b.bottom - 8]]
  const hit = []
  for (const [x, y] of pts) {
    const top = document.elementsFromPoint(x, y).find((e) => !root.contains(e))
    if (!top || top.closest('[data-pilot-dock]')) continue
    const c = top.closest('a, button, input, select, textarea, label, [role="button"], [role="tab"]')
    if (c) hit.push(`${c.tagName} ${(c.textContent || c.getAttribute('aria-label') || '').trim().slice(0, 30)}`)
  }
  return [...new Set(hit)]
}, what)
const openPilot = async (page) => {
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForSelector('.pilot-root.pilot-open .pilot-panel', { timeout: 8000 })
  await page.waitForTimeout(600)
}
const rowNow = (page) => page.evaluate(() => {
  const lis = [...document.querySelectorAll('.pilot-root .pilot-log > li')]
  const last = lis[lis.length - 1]
  return last && last.classList.contains('pilot-again') ? [...last.querySelectorAll('.pilot-pill')].map((b) => b.innerText.trim()) : []
})
const settingsOpen = async (page) => (await page.locator('.pilot-root .pilot-settings-view:not([hidden])').count()) > 0
const type = async (page, words) => {
  await page.locator('.pilot-root .pilot-input').fill(words)
  await page.locator('.pilot-root .pilot-input').press('Enter')
  await page.waitForTimeout(900)
}
const lastAnswer = (page) => page.locator('.pilot-root li.pilot-from-pilot').last().innerText().catch(() => '')
const SIZES = [[320, 640], [375, 667], [375, 812], [390, 844], [1440, 900]]

console.log('\n=== 1. Parent Mode, no key, at every size ===')
for (const [w, h] of SIZES) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  ok(`${w}x${h}: the robot is there`, await waitForPilot(page))
  await page.waitForTimeout(1200)
  const r = await reach(page)
  const slot = await page.evaluate(() => { const b = document.querySelector('[data-pilot-dock]')?.getBoundingClientRect(); return b ? { left: b.left, right: b.right, top: b.top } : null })
  ok(`${w}x${h}: on the first screen, whole, in the ${w >= 1100 ? 'sidebar\'s' : 'tab bar\'s'} slot`, r && r.inView && r.what === 'robot' && slot
    && Math.abs((r.left + r.right) / 2 - (slot.left + slot.right) / 2) < 20 && r.bottom <= h + 1, JSON.stringify({ r, slot }))
  const hit = await under(page, 'robot')
  ok(`${w}x${h}: on nothing (no link, button, box or label under it)`, hit.length === 0, hit.join(', '))
  await shot(page, `${w}x${h}-parent`)
  await openPilot(page)
  ok(`${w}x${h}: core 1.4.3`, (await page.evaluate(() => window.PilotPanel?.VERSION)) === '1.4.3')
  await page.locator('.pilot-root .pilot-pill:visible', { hasText: "What's waiting for me?" }).first().click()
  await page.waitForTimeout(900)
  const bar = await page.locator('.pilot-root .pilot-chips:not(.pilot-chips-welcome) .pilot-chip:visible').allInnerTexts()
  ok(`${w}x${h}: once chatting with no key, the whole list of suggestions (0.33.0 left two out)`, JSON.stringify(bar) === JSON.stringify(["What's waiting for me?", 'Add a chore for…', 'How are the kids doing?', 'Summarise this']), bar.join(' | '))
  const row = await rowNow(page)
  ok(`${w}x${h}: under the answer, each thing once: not "How are the kids doing?" and "How is my kid doing?" both (one answer)`,
    row.length >= 3 && new Set(row).size === row.length && !(row.includes('How are the kids doing?') && row.includes('How is my kid doing?')) && !row.includes("What's waiting for me?"), row.join(' | '))
  await type(page, "What's waiting for me?")
  ok(`${w}x${h}: "What's waiting for me?" typed is answered at once, not a tie sent to key settings`, !(await settingsOpen(page)) && /waiting for you to review/.test(await lastAnswer(page)))
  await type(page, 'Anything pending for review?')
  ok(`${w}x${h}: "Anything pending for review?" too`, !(await settingsOpen(page)) && /without an AI key/.test(await lastAnswer(page)) && /waiting for you to review/.test(await lastAnswer(page)))
  const typedRow = await rowNow(page)
  ok(`${w}x${h}: and the row under it leaves out what it matched (and its twin)`, !typedRow.includes("What's waiting for me?") && typedRow.length >= 3, typedRow.join(' | '))
  await type(page, 'Write me a poem about dragons')
  const note = await page.locator('.pilot-root .pilot-log li.pilot-nokey').last().innerText().catch(() => '')
  const offer = await page.locator('.pilot-root .pilot-nokey-row .pilot-pill').allInnerTexts()
  ok(`${w}x${h}: one nothing fits: "I need an AI key to answer that one", in the chat`, /I need an AI key to answer that one\. Here's what I can help with right now:/.test(note) && !(await settingsOpen(page)), note)
  ok(`${w}x${h}: under it what works now, each once, then "Add my AI key"`, offer.length >= 4 && new Set(offer).size === offer.length && offer[offer.length - 1] === 'Add my AI key'
    && !(offer.includes('How are the kids doing?') && offer.includes('How is my kid doing?')), offer.join(' | '))
  ok(`${w}x${h}: the words wait in the box, and it says so`, (await page.locator('.pilot-root .pilot-input').inputValue()) === 'Write me a poem about dragons'
    && /Your message is waiting in the box/.test(await page.locator('.pilot-root .pilot-nokey-row').innerText().catch(() => '')))
  await shot(page, `${w}x${h}-nokey`)
  await page.locator('.pilot-root .pilot-nokey-row .pilot-pill', { hasText: 'Add my AI key' }).click()
  await page.waitForTimeout(500)
  ok(`${w}x${h}: its "Add my AI key" opens key settings`, await settingsOpen(page))
  await ctx.close()
}
ok('nothing was sent to an AI company', sent.length === 0, sent.join(', '))

console.log('\n=== 2. The gift and School League pages ===')
for (const [w, h] of SIZES) {
  for (const route of ['/gift', '/school']) {
    const { ctx, page } = await open(w, h)
    await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
    ok(`${w}x${h} ${route}: Pilot is there`, await waitForPilot(page))
    // The first look, then the robot settles (and, hidden, the handle comes after 2 s still).
    await page.waitForTimeout(7000)
    const r = await reach(page)
    ok(`${w}x${h} ${route}: the robot or its handle on the first screen (${r && r.what})`, r && r.inView, JSON.stringify(r))
    const hit = r ? await under(page, r.what) : ['none']
    ok(`${w}x${h} ${route}: never over a link, a button, a box or a label`, hit.length === 0, `${r && r.what}: ${hit.join(', ')}`)
    await shot(page, `${w}x${h}${route.replace('/', '-')}`)
    await ctx.close()
  }
}

console.log('\n=== 3. A computer: the chat docked down the right ===')
{
  const { ctx, page } = await open(1440, 900)
  await demo(page)
  await waitForPilot(page)
  await go(page, '/parent/plan', 1500)
  await openPilot(page)
  const panel = await page.locator('.pilot-root .pilot-panel').boundingBox()
  const main = await page.evaluate(() => { const b = document.querySelector('[data-testid="plan-cards"]')?.getBoundingClientRect(); return b ? { right: b.right } : null })
  ok('1440: the chat is down the right edge, the whole height', panel && panel.x + panel.width >= 1420 && panel.y <= 20 && panel.height >= 860, JSON.stringify(panel))
  ok('1440: the screen moved over: nothing under the chat', main && panel && main.right <= panel.x + 1, JSON.stringify({ main, panel }))
  ok('1440: the robot stays in the sidebar\'s slot', await page.evaluate(() => document.querySelector('.pilot-root').classList.contains('pilot-at-bl')))
  await shot(page, '1440x900-docked')
  await ctx.close()
}

console.log('\n=== 4. Typing on a short screen ===')
{
  const { ctx, page } = await open(375, 667)
  await demo(page)
  await waitForPilot(page)
  await openPilot(page)
  const shown = () => page.evaluate(() => { const t = document.querySelector('.pilot-root .pilot-tagline'); return Boolean(t) && getComputedStyle(t).display !== 'none' })
  ok('375x667, the box not in use: the tagline shows', await shown())
  await page.locator('.pilot-root .pilot-input').focus()
  // A phone's keyboard open: the visible height drops under 500 px.
  await page.setViewportSize({ width: 375, height: 420 })
  await page.waitForTimeout(500)
  ok('the keyboard open (420 px visible) while typing: compact, the tagline and the round buttons step aside',
    await page.evaluate(() => document.querySelector('.pilot-root .pilot-panel').classList.contains('pilot-typing')) && !(await shown()))
  await shot(page, '375x420-typing')
  await page.locator('.pilot-root .pilot-input').blur()
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(500)
  ok('the box left, the keyboard closed: back as before', await shown())
  await ctx.close()
}

console.log('\n=== 5. Still absent where it must be ===')
for (const [w, h] of [[320, 640], [375, 812], [1440, 900]]) {
  const { ctx, page } = await open(w, h)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  ok(`${w}x${h}: the front door: no Pilot`, await pilotGone(page))
  await page.getByRole('button', { name: /I'm a kid/ }).click()
  await page.waitForTimeout(900)
  ok(`${w}x${h}: "I'm a kid": no Pilot`, await pilotGone(page))
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 667)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(400)
  if (await page.locator('input[type=email]').count()) {
    await page.locator('input[type=email]').fill(`fix34-${Date.now()}@example.com`)
    await page.locator('input[type=password]').fill('correct-horse-battery')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForTimeout(1600)
  }
  ok('"I\'m a parent": Pilot comes for the grown-up', await waitForPilot(page))
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
  ok('the world picker (sign-up step 2): no Pilot', (await page.getByText('picks a world').count()) > 0 && !(await pilotShown(page)))
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await waitForPilot(page)
  await as(page, 'Ava')
  const shownOn = []
  for (const r of ['/kid', '/kid/quests', '/kid/shop', '/kid/arcade', '/kid/profile']) { await go(page, r, 600); if (await pilotShown(page)) shownOn.push(r) }
  ok('a child\'s screens: none', shownOn.length === 0, shownOn.join(', '))
  await ctx.close()
}

finish(errors, fails, browser)
