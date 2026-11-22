/**
 * 0.28.0 in a real browser: Pilot core 1.2.0 and RankUp's own welcome.
 * tests/fixes28.mjs holds the rules in plain Node.
 *
 *   - at 320, 375 and 1440: Pilot opens with "Your family's chore helper"
 *     on one line and RankUp's five pills; Review's own suggestion under
 *     them; no picture or video key settings;
 *   - with no key, "What's waiting for me?" stays in the box, key settings
 *     say it is waiting, and it is sent the moment a key is saved (to a
 *     stand-in provider: nothing leaves this machine); "Add a chore for…"
 *     only fills the box;
 *   - the robot steps back for a pop-up (Review's "Send back" dialog, and a
 *     sheet marked data-pilot-modal), stays in the tab bar's slot on a phone
 *     (opened at once on a visit's first page too: no first look, whose class
 *     would take it out of the slot) and while scrolling, and on a computer
 *     and the gift page stays inside the screen and off the page while
 *     scrolling and typing;
 *   - still absent on the front door, the world picker and a child's screens.
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
async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return { ctx, page }
}
const go = async (page, route, wait = 1200) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/rk6-${name}.png` }).catch(() => {})
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
/** The robot as drawn: its box, tucked or not, stepped back or not. */
const robot = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  const b = root.querySelector('.pilot-launcher').getBoundingClientRect()
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, peek: root.classList.contains('pilot-peek'),
    hello: root.classList.contains('pilot-hello'), yield: root.classList.contains('pilot-yield'),
    hidden: getComputedStyle(root).visibility === 'hidden' }
})
const inside = (r, w, h) => r.left >= 0 && r.top >= 0 && r.right <= w + 0.5 && r.bottom <= h + 0.5
/*
 * What of the page the robot is drawn over, at its middle and near its
 * corners: the topmost thing there that isn't Pilot (what scrolled behind the
 * tab bar is hidden by it), if it is words, a button or a box. The tab bar's
 * own slot counts as free.
 */
const underRobot = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  const b = root.querySelector('.pilot-launcher').getBoundingClientRect()
  const pts = [[(b.left + b.right) / 2, (b.top + b.bottom) / 2], [b.left + 8, b.top + 8], [b.right - 8, b.top + 8], [b.left + 8, b.bottom - 8], [b.right - 8, b.bottom - 8]]
  const hit = []
  for (const [x, y] of pts) {
    const top = document.elementsFromPoint(x, y).find((el) => !root.contains(el))
    if (!top || top.closest('[data-pilot-dock]')) continue
    const content = top.closest('button, a, input, textarea, select, label') || ([...top.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()) ? top : null)
    if (content) hit.push(content.tagName + ' ' + (content.textContent || '').trim().slice(0, 30))
  }
  return [...new Set(hit)]
})

console.log('\n=== RankUp\'s own welcome at 320, 375 and 1440 ===')
for (const [w, h] of [[320, 640], [375, 812], [1440, 900]]) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  ok(`${w}px: the robot is there in Parent Mode`, await waitForPilot(page))
  await go(page, '/parent/approvals', 1200)
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForSelector('.pilot-root .pilot-welcome', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  const head = await page.evaluate(() => {
    const t = document.querySelector('.pilot-root .pilot-tagline')
    const r = t.getBoundingClientRect()
    return { text: t.textContent, lines: Math.round(r.height / parseFloat(getComputedStyle(t).lineHeight || '18')), fits: t.scrollWidth <= t.clientWidth + 1 && r.right <= window.innerWidth }
  })
  ok(`${w}px: the tagline is "Your family's chore helper", on one line`, head.text === "Your family's chore helper" && head.lines <= 1 && head.fits, JSON.stringify(head))
  const pills = await page.locator('.pilot-root .pilot-pill').allInnerTexts()
  ok(`${w}px: RankUp's five pills`, JSON.stringify(pills.map((p) => p.trim())) === JSON.stringify(["What's waiting for me?", 'Add a chore for…', 'How is my kid doing?', 'Explain this screen', 'Add my AI key']), JSON.stringify(pills))
  const chips = await page.locator('.pilot-root .pilot-chips-welcome .pilot-chip').allInnerTexts()
  ok(`${w}px: under them, Review's own suggestion (the core's chips on the welcome), none repeating a pill`, JSON.stringify(chips) === '["Accept the oldest one"]', JSON.stringify(chips))
  ok(`${w}px: no RankUp-made row in the welcome any more`, (await page.locator('.pilot-root [data-testid="pilot-starters"], .pilot-root .rk-starters').count()) === 0)
  const lastPill = await page.locator('.pilot-root .pilot-pill').last().boundingBox()
  ok(`${w}px: the pills fit across the window`, lastPill && lastPill.x >= 0 && lastPill.x + lastPill.width <= w, JSON.stringify(lastPill))
  await shot(page, `${w}-welcome`)
  if (w === 375) {
    await page.locator('.pilot-root .pilot-pill', { hasText: 'Add a chore for' }).click()
    await page.waitForTimeout(300)
    ok('"Add a chore for…" fills the box for the parent to finish, and stays on the chat', (await page.locator('.pilot-root .pilot-input').inputValue()) === 'Add a chore for '
      && !(await page.locator('.pilot-root .pilot-settings-view').isVisible()))
    await page.locator('.pilot-root .pilot-input').fill('')
  }
  await page.locator('.pilot-root .pilot-pill', { hasText: 'Add my AI key' }).click()
  await page.waitForTimeout(600)
  const settings = await page.evaluate(() => document.querySelector('.pilot-root .pilot-settings-view').innerText)
  ok(`${w}px: "Add my AI key" opens key settings: chat keys only, no picture or video keys`, /Chat keys/.test(settings) && !/Image generation|Video generation|image key|video key/i.test(settings))
  await ctx.close()
}

console.log('\n=== With no key: the question waits, and goes once a key is saved ===')
{
  const { ctx, page } = await open(375, 812)
  const bodies = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    bodies.push(route.request().postData() || '')
    const sse = (events) => events.map(([name, obj]) => `event: ${name}\ndata: ${JSON.stringify(obj)}\n\n`).join('')
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: sse([
      ['message_start', { type: 'message_start', message: { id: 'm1' } }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'One chore is waiting for you.' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' } }],
    ]) })
  })
  await demo(page)
  await waitForPilot(page)
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForSelector('.pilot-root .pilot-welcome', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
  await page.locator('.pilot-root .pilot-pill', { hasText: "What's waiting for me?" }).click()
  await page.waitForTimeout(600)
  ok('no key: the question stays in the box', (await page.locator('.pilot-root .pilot-input').inputValue()) === "What's waiting for me to review?")
  ok('and key settings open, saying it is waiting', /Your message is waiting in the box\. It sends as soon as you add a key\./.test(await page.locator('.pilot-root .pilot-settings-view').innerText()))
  ok('nothing was sent anywhere', bodies.length === 0)
  await shot(page, '375-waiting')
  await page.locator('.pilot-root .pilot-settings-view').getByRole('button', { name: '+ Add a key' }).click()
  await page.locator('.pilot-root select[aria-label="Provider"]').selectOption('anthropic')
  await page.locator('.pilot-root input[aria-label="API key"]').fill('test-key')
  await page.locator('.pilot-root input[aria-label="Model name"]').fill('test-model')
  await page.locator('.pilot-root .pilot-keyform').getByRole('button', { name: 'Save' }).click()
  for (let t = 0; t < 6000 && !bodies.length; t += 200) await page.waitForTimeout(200)
  await page.waitForTimeout(800)
  ok('the key saved: the waiting question is sent, once', bodies.length === 1 && bodies[0].includes("What's waiting for me to review?"), String(bodies.length))
  ok('and answered in the chat', /One chore is waiting for you/.test(await page.locator('.pilot-root .pilot-log').innerText().catch(() => '')))
  ok('the box is empty again', (await page.locator('.pilot-root .pilot-input').inputValue()) === '')
  const later = await page.locator('.pilot-root .pilot-chips .pilot-chip').allInnerTexts()
  ok('once chatting, the suggestions are the whole list again ("What\'s waiting for me?" first)', later[0] === "What's waiting for me?" && later.includes('Add a chore for…'), JSON.stringify(later))
  await shot(page, '375-sent')
  await ctx.close()
}

console.log('\n=== Out of the way: pop-ups, the tab bar\'s slot, scrolling, typing ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await waitForPilot(page)
  const first = await robot(page)
  const slot = await page.evaluate(() => { const b = document.querySelector('[data-pilot-dock]').getBoundingClientRect(); return { left: b.left, right: b.right } })
  ok('375px: on the visit\'s first page, no first look (revealMs: 0); in the tab bar\'s slot, whole', !first.hello && !first.peek
    && Math.abs((first.left + first.right) / 2 - (slot.left + slot.right) / 2) < 8 && inside(first, 375, 812), JSON.stringify({ first, slot }))
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForSelector('.pilot-root .pilot-welcome', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(300)
  const early = await page.evaluate(() => {
    const root = document.querySelector('.pilot-root')
    const i = root.querySelector('.pilot-pill .pilot-icon')
    return { position: getComputedStyle(root).position, padding: getComputedStyle(root).paddingTop, stroke: getComputedStyle(i).stroke !== 'none' }
  })
  ok('opened at once: Pilot stays fixed in its place, the window drawn as it should be (no greeting style on the robot)',
    early.position === 'fixed' && early.padding === '0px' && early.stroke, JSON.stringify(early))
  await page.locator('.pilot-root .pilot-win[aria-label="Close Pilot"]').click().catch(() => {})
  await page.waitForTimeout(800)
  const closed = await robot(page)
  ok('closed again: back in the slot', Math.abs(closed.left - first.left) < 2 && Math.abs(closed.top - first.top) < 2, JSON.stringify({ closed, first }))
  await page.waitForTimeout(3500)
  const afterLook = await robot(page)
  ok('a few seconds on, still in the slot, never tucked or shrunk', !afterLook.peek && Math.abs(afterLook.left - first.left) < 2 && Math.abs(afterLook.top - first.top) < 2, JSON.stringify(afterLook))
  for (const y of [300, 900, 2000]) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await page.waitForTimeout(500)
    const r = await robot(page)
    const under = await underRobot(page)
    ok(`375px: scrolled to ${y}px, still in the slot over nothing of the screen`, !r.peek && Math.abs(r.left - first.left) < 2 && under.length === 0, JSON.stringify({ r, under }))
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await go(page, '/parent/approvals', 1000)
  await page.getByRole('button', { name: /^Send back/ }).first().click()
  await page.waitForTimeout(700)
  const behind = await robot(page)
  ok('Review\'s "Send back" dialog: the robot steps back', behind.yield && behind.hidden, JSON.stringify(behind))
  await shot(page, '375-dialog')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(700)
  ok('and comes back when it closes', !(await robot(page)).yield)
  await page.evaluate(() => {
    const sheet = document.createElement('div')
    sheet.id = 'test-sheet'
    sheet.setAttribute('data-pilot-modal', '')
    sheet.textContent = 'Sign in again'
    document.body.appendChild(sheet)
  })
  await page.waitForTimeout(600)
  ok('a sheet marked data-pilot-modal (the "sign in again" sheet): the robot steps back', (await robot(page)).yield)
  await page.evaluate(() => document.getElementById('test-sheet').remove())
  await page.waitForTimeout(600)
  ok('and comes back after', !(await robot(page)).yield)
  await ctx.close()
}
{
  const { ctx, page } = await open(1440, 900)
  await demo(page)
  await waitForPilot(page)
  await page.waitForTimeout(4500)
  for (const y of [0, 600, 1400]) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await page.waitForTimeout(600)
    const r = await robot(page)
    const under = await underRobot(page)
    ok(`1440px: scrolled to ${y}px, inside the screen and over nothing of the page`, inside(r, 1440, 900) && under.length === 0, JSON.stringify({ r, under }))
  }
  await go(page, '/parent/assign', 1200)
  const field = page.getByPlaceholder('e.g. Make your bed')
  if (await field.count()) {
    await field.click()
    await field.type('Water the plants')
    await page.waitForTimeout(600)
    const r = await robot(page)
    const fb = await field.boundingBox()
    const apart = fb && (r.right <= fb.x || r.left >= fb.x + fb.width || r.bottom <= fb.y || r.top >= fb.y + fb.height)
    ok('1440px: typing in a chore\'s name, the robot is off the box and inside the screen', apart && inside(r, 1440, 900), JSON.stringify({ r, fb }))
  } else ok('1440px: (a text box on Assign to type in)', false, 'none found')
  await shot(page, '1440-assign')
  await ctx.close()
}
for (const [w, h] of [[320, 640], [375, 812]]) {
  const { ctx, page } = await open(w, h)
  await page.goto(`${BASE}/#/gift`, { waitUntil: 'networkidle' })
  ok(`${w}px: on the gift page (no tab bar) the robot is there`, await waitForPilot(page))
  await page.waitForTimeout(4500)
  let worst = null
  for (const y of [0, 400, 1200, 99999]) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await page.waitForTimeout(500)
    const r = await robot(page)
    if (!inside(r, w, h)) worst = r
  }
  ok(`${w}px: scrolling the gift page, never hanging off the edge (keepInViewport)`, worst === null, JSON.stringify(worst))
  await shot(page, `${w}-gift`)
  await ctx.close()
}

console.log('\n=== Still absent where it must be ===')
{
  const { ctx, page } = await open(375, 812)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  ok('the front door, before anyone says whose phone it is: no Pilot', await pilotGone(page))
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  ok('"I\'m a parent", step 1: Pilot with RankUp\'s welcome', await waitForPilot(page))
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await waitForPilot(page)
  await as(page, 'Ava')
  const shownOn = []
  for (const r of ['/kid', '/kid/quests', '/kid/shop', '/kid/arcade', '/kid/profile', '/kid/leaderboards']) { await go(page, r, 500); if (!(await pilotGone(page))) shownOn.push(r) }
  ok('a child\'s screens: none', shownOn.length === 0, shownOn.join(', '))
  await ctx.close()
}

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await finish(errors, fails, browser)
