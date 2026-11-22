/**
 * The fixes from the strict review at 83% (0.29.0), in a real browser.
 * tests/fixes29.mjs holds the rules in plain Node.
 *
 *   - Parent Mode on a computer (1100px and 1440px): the tab bar is a sidebar
 *     down the left edge, over no card at any scroll, on the dashboard,
 *     Review, Assign, Settings and Plans; Pilot's robot in its slot at the
 *     foot and its window beside the sidebar, its welcome asking for the key
 *     once (core 1.3.0); the dashboard's two columns
 *     about the same length; below 1100px the bar is at the bottom as before;
 *   - a one-phone family: "Link a phone" and "We share one phone" side by
 *     side, the same size; a chore done on the parent's phone and accepted
 *     finishes "Getting started" with nothing more tapped;
 *   - sign-up at 375px: the consent notice folded, the signature on the
 *     first screen, "Open all" showing every line; six worlds and "See all
 *     15", no big card;
 *   - a child: Claim bursts the world's coins and says so, with a chime
 *     while Sounds is on and none once it is switched off on the You
 *     screen; under reduce motion nothing flies; the weekly goal moment
 *     once a week, gone for the week after "Yay!", reload included;
 *   - a computer: the front door centred up and down with a bigger demo
 *     phone; the child's world beside their frame at 1440px, none at 1100px;
 *   - the trial banner: "What you get" shows the three plans in words, no
 *     price, Pilot optional on the parent's own key, all on one 375px screen.
 */
import { chromium } from 'playwright'
import { finish, BASE, SHOT_DIR, setUpFamily, asKid, asParent, sendToParent } from './helpers.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails.push(label) }
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors = []
async function open(width, height, { chimes = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  // Counts the notes RankUp plays (lib/chime.js) without needing speakers.
  if (chimes) {
    await ctx.addInitScript(() => {
      window.__notes = 0
      const Real = window.AudioContext
      if (Real) window.AudioContext = class extends Real { createOscillator() { window.__notes += 1; return super.createOscillator() } }
    })
  }
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return { ctx, page }
}
const go = async (page, route, wait = 1200) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${SHOT_DIR}/rk7-${name}.png`, fullPage }).catch(() => {})
const box = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }
}, sel)
const demo = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByTestId('see-it-live').click()
  await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
  await page.waitForTimeout(800)
}
const as = async (page, who) => { await page.getByTestId('demo-banner').getByRole('button', { name: new RegExp(who) }).click(); await page.waitForTimeout(900) }
const dismiss = async (page) => {
  for (const name of [/Continue|Awesome|Nice|Close|Keep going/]) await page.getByRole('button', { name }).first().click({ timeout: 1200 }).catch(() => {})
}
/** Cards (and the screen's buttons) the tab bar sits over, if any. */
const underBar = (page) => page.evaluate(() => {
  const bar = document.querySelector('nav.tabbar').getBoundingClientRect()
  const hit = (b) => b.width && b.left < bar.right - 1 && b.right > bar.left + 1 && b.top < bar.bottom - 1 && b.bottom > bar.top + 1
  return [...document.querySelectorAll('.shell .card, .shell .card-flat, .shell button, .shell h1, .shell h2')]
    .filter((el) => hit(el.getBoundingClientRect())).map((el) => (el.innerText || el.className).replace(/\s+/g, ' ').slice(0, 30))
})
const robot = async (page, ms = 10000) => {
  for (let t = 0; t < ms; t += 250) {
    const r = await page.evaluate(() => {
      const root = document.querySelector('.pilot-root')
      const l = root && root.isConnected && root.querySelector('.pilot-launcher')
      if (!l || getComputedStyle(root).display === 'none') return null
      const b = l.getBoundingClientRect()
      return b.width ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom } : null
    })
    if (r) return r
    await page.waitForTimeout(250)
  }
  return null
}

console.log('\n=== 1. Parent Mode on a computer: a sidebar, never over a card ===')
for (const [w, h] of [[1440, 900], [1100, 800]]) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  const nav = await box(page, 'nav.tabbar')
  ok(`${w}px: the tab bar is a sidebar down the left edge, top to bottom`, nav && nav.left === 0 && Math.abs(nav.width - 104) <= 1 && nav.top <= 0 && nav.bottom >= h - 1, JSON.stringify(nav))
  const tabs = await page.evaluate(() => [...document.querySelectorAll('nav.tabbar .tab')].map((b) => Math.round(b.getBoundingClientRect().top)))
  ok(`${w}px: its five tabs one under another`, tabs.length === 5 && tabs.every((t, i) => i === 0 || t > tabs[i - 1]), tabs.join(','))
  for (const y of [0, 500, 2000]) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await page.waitForTimeout(300)
    const under = await underBar(page)
    ok(`${w}px: the dashboard scrolled to ${y}px: the bar is over nothing`, under.length === 0, under.join(' | '))
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  const cols = await page.evaluate(() => ['.dash-main', '.dash-side'].map((s) => document.querySelector(s).getBoundingClientRect().height))
  ok(`${w}px: the two columns are about the same length (the shorter at least 70% of the longer)`, Math.min(...cols) / Math.max(...cols) >= 0.7, cols.map(Math.round).join(' / '))
  ok(`${w}px: the numbers head the right-hand column`, await page.evaluate(() => {
    const first = document.querySelector('.dash-side').firstElementChild
    return Boolean(first && /To review/i.test(first.innerText))
  }))
  const r = await robot(page)
  ok(`${w}px: Pilot's robot sits in the sidebar's slot at its foot`, r && r.left >= 0 && r.right <= 105 && r.bottom <= h && r.top > tabs[4] + 40, JSON.stringify(r))
  if (w === 1440) {
    await shot(page, 'd-dashboard')
    await page.locator('.pilot-root .pilot-launcher').click()
    await page.waitForSelector('.pilot-root .pilot-panel', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(500)
    const win = await box(page, '.pilot-root .pilot-panel')
    ok('1440px: Pilot\'s window opens beside the sidebar, inside the screen', win && win.left >= 104 && win.right <= w && win.bottom <= h && win.top >= 0, JSON.stringify(win))
    const words = await page.evaluate(() => document.querySelector('.pilot-root .pilot-panel').innerText)
    ok('1440px: the welcome asks for the key once: the "Add my AI key" pill, no key card as well (core 1.3.0)',
      (words.match(/Add my AI key/g) || []).length === 1 && !/Your own AI key|Bring Your Own API Key/.test(words), words.replace(/\s+/g, ' ').slice(0, 300))
    ok('1440px: and one short grown-ups line', /AI keys are for grown-ups \(18\+\)\./.test(words) && !/private code a grown-up makes/.test(words))
    await shot(page, 'd-pilot-open')
    await page.keyboard.press('Escape')
    await page.locator('.pilot-root .pilot-win[aria-label="Close Pilot"]').click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(400)
    for (const route of ['/parent/approvals', '/parent/assign', '/parent/settings', '/parent/plan']) {
      await go(page, route, 1300)
      const bar = await box(page, 'nav.tabbar')
      const under = await underBar(page)
      ok(`1440px ${route}: the sidebar is there, over nothing`, bar && bar.left === 0 && Math.abs(bar.width - 104) <= 1 && under.length === 0, under.join(' | '))
      ok(`1440px ${route}: nothing scrolls sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    }
    await go(page, '/parent/approvals', 900)
    await shot(page, 'd-review')
  }
  await ctx.close()
}
{
  const { ctx, page } = await open(1024, 768)
  await demo(page)
  const nav = await box(page, 'nav.tabbar')
  ok('1024px: below 1100px the bar is at the bottom, as before', nav && nav.bottom > 700 && nav.width > 500, JSON.stringify(nav))
  await ctx.close()
}

console.log('\n=== 6. A computer: the front door, and a child\'s world ===')
for (const [w, h] of [[1440, 900], [1920, 1080]]) {
  const { ctx, page } = await open(w, h)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  // 0.32.0: the strip of screens under the door (tests/fixes32ui.mjs) is centred with it.
  await page.waitForSelector('[data-testid="door-strip"]', { timeout: 4000 }).catch(() => {})
  const g = await box(page, '.door-grid')
  const strip = await box(page, '[data-testid="door-strip"]')
  const group = g && { top: g.top, bottom: Math.max(g.bottom, strip ? strip.bottom : 0) }
  ok(`${w}x${h}: the front door (with its strip of screens) is centred up and down`, group && Math.abs(group.top - (h - group.bottom)) <= 4 && group.top >= 30,
    JSON.stringify({ g, strip }))
  const phone = await box(page, '.door-demo > :first-child')
  ok(`${w}px: a bigger demo phone (over 280px across)`, phone && phone.width >= 280, JSON.stringify(phone))
  const steps = await box(page, '.door-steps')
  ok(`${w}px: the four steps still have room beside it (over 200px)`, steps && steps.width >= 200, JSON.stringify(steps))
  if (w === 1440) await shot(page, 'd-door')
  await ctx.close()
}
for (const [w, h, art] of [[1440, 900, true], [1100, 800, false]]) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  await as(page, 'Noah')
  await go(page, '/kid', 1500)
  await dismiss(page)
  const a = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="world-art"]')
    if (!el) return null
    const img = el.querySelector('img')
    const left = el.querySelector('.world-art-left').getBoundingClientRect()
    const frame = document.querySelector('.shell').getBoundingClientRect()
    return { hidden: el.getAttribute('aria-hidden'), loaded: Boolean(img && img.complete && img.naturalWidth), name: el.innerText.trim(), leftEdge: left.right, frame: frame.left }
  })
  if (art) {
    ok('1440px: the child\'s world beside the frame: their character and the world\'s name', a && a.loaded && /Pegasus Horizon/i.test(a.name), JSON.stringify(a))
    ok('1440px: beside the frame, never under it, and hidden from screen readers', a && a.leftEdge <= a.frame && a.hidden === 'true', JSON.stringify(a))
    await shot(page, 'd-noah')
  } else {
    ok('1100px: no world art (no room for it)', a === null, JSON.stringify(a))
  }
  await ctx.close()
}

console.log('\n=== 5. A child\'s celebrations ===')
{
  const { ctx, page } = await open(375, 812, { chimes: true })
  await demo(page)
  await go(page, '/parent/approvals', 1000)
  await page.getByRole('button', { name: 'Accept' }).first().click()
  await page.waitForTimeout(1200)
  await dismiss(page)
  // A goal of 1 a week, so the chore just accepted reaches it whatever day
  // of the week this runs.
  await go(page, '/parent/settings', 1000)
  await page.getByRole('button', { name: /Weekly goal/ }).first().click()
  await page.waitForTimeout(300)
  await page.getByTestId('settings-weekly-goal').selectOption('1')
  await page.waitForTimeout(400)
  await as(page, 'Ava')
  await go(page, '/kid', 1200)
  await dismiss(page)
  const goal = page.getByTestId('weekly-goal-moment')
  ok('the weekly goal reached: "You hit your weekly goal!" at the top of Home', (await goal.count()) === 1 && /You hit your weekly goal!/.test(await goal.innerText()))
  const before = await page.evaluate(() => window.__notes)
  ok('with a fanfare (Sounds is on)', before >= 4, String(before))
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot(page, 'm-weekly-goal')
  await goal.getByRole('button', { name: 'Yay!' }).click()
  await page.waitForTimeout(400)
  ok('"Yay!" puts it away', (await page.getByTestId('weekly-goal-moment').count()) === 0)
  await page.getByTestId('chore-bonus').scrollIntoViewIfNeeded()
  const n0 = await page.evaluate(() => window.__notes)
  await page.getByTestId('chore-bonus').getByRole('button', { name: 'Claim' }).click()
  await page.waitForTimeout(250)
  const moment = page.getByTestId('claim-moment')
  ok('Claim: the moment says what was won', (await moment.count()) === 1 && /\+5 Gems!/.test(await moment.innerText()) && /Bonus claimed/.test(await moment.innerText()))
  const fly = await page.evaluate(() => [...document.querySelectorAll('[data-testid="claim-moment"] .cheer-burst > span')].map((s) => getComputedStyle(s).animationName))
  ok('ten of the world\'s coins burst out of it', fly.length === 10 && fly.every((n) => n === 'rankup-sparkle'), fly.join(','))
  ok('with a chime', (await page.evaluate(() => window.__notes)) === n0 + 2)
  await shot(page, 'm-claim')
  await page.waitForTimeout(3000)
  ok('and it goes by itself', (await page.getByTestId('claim-moment').count()) === 0)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  ok('the weekly goal moment does not come back the same week (after a reload too)', (await page.getByTestId('weekly-goal-moment').count()) === 0)
  // Sounds off on the You screen.
  await go(page, '/kid/profile', 1200)
  const sw = page.getByTestId('kid-sounds').getByRole('switch')
  ok('the You screen has a Sounds switch, on', (await sw.getAttribute('aria-checked')) === 'true')
  await sw.click()
  await page.waitForTimeout(200)
  ok('switched off there', (await sw.getAttribute('aria-checked')) === 'false')
  await ctx.close()
}
{
  // Sounds off on the You screen, and reduce motion: the card is there,
  // nothing flies, nothing plays.
  const { ctx, page } = await open(375, 812, { chimes: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await demo(page)
  await go(page, '/parent/approvals', 1000)
  await page.getByRole('button', { name: 'Accept' }).first().click()
  await page.waitForTimeout(1200)
  await dismiss(page)
  await as(page, 'Ava')
  await go(page, '/kid/profile', 1200)
  await dismiss(page)
  await page.getByTestId('kid-sounds').getByRole('switch').click()
  await page.waitForTimeout(200)
  await go(page, '/kid', 1200)
  await page.getByTestId('weekly-goal-moment').getByRole('button', { name: 'Yay!' }).click({ timeout: 1500 }).catch(() => {})
  const n0 = await page.evaluate(() => window.__notes)
  await page.getByTestId('chore-bonus').getByRole('button', { name: 'Claim' }).click()
  await page.waitForTimeout(200)
  ok('Sounds switched off on the You screen: Claim plays nothing', (await page.evaluate(() => window.__notes)) === n0, String(n0))
  const still = await page.evaluate(() => [...document.querySelectorAll('[data-testid="claim-moment"] .cheer-burst > span')].map((s) => getComputedStyle(s).opacity))
  // Since 0.30.0 reduce motion draws no burst and no flight at all: words only (tests/fixes30ui.mjs).
  ok('reduce motion: the moment shows, nothing flies (no burst, no coins in flight)', (await page.getByTestId('claim-moment').count()) === 1
    && still.every((o) => Number(o) === 0) && (await page.getByTestId('coin-flight').count()) === 0, still.join(','))
  await ctx.close()
}

console.log('\n=== 4 and 7. A new family: sign-up, the trial banner, a one-phone family ===')
{
  const { ctx, page } = await open(375, 812)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(500)
  await page.locator('input[type=email]').fill(`rk29${Date.now()}@example.com`)
  await page.locator('input[type=password]').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForTimeout(1600)
  await page.locator('input').nth(0).fill('Sam')
  await page.locator('input').nth(2).fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1200)
  const parts = page.getByTestId('consent-part')
  ok('consent: five parts, each folded under its heading', (await parts.count()) === 5
    && (await page.locator('[data-testid="consent-part"] button[aria-expanded="false"]').count()) === 5
    && (await page.locator('[data-testid="consent-part"] li').count()) === 0)
  const sign = await box(page, 'input[placeholder*="Samira"]')
  ok('the signature is on the first screen at 375px', sign && sign.bottom <= 812, JSON.stringify(sign))
  await shot(page, 'm-consent')
  await parts.first().getByRole('button').click()
  ok('a heading opens its part', (await page.locator('[data-testid="consent-part"] li').count()) === 3)
  await page.getByTestId('consent-all').click()
  await page.waitForTimeout(200)
  const text = await page.locator('body').innerText()
  ok('"Open all" shows every line of the notice', (await page.locator('[data-testid="consent-part"] li').count()) === 12 && /We do not sell your data/.test(text) && /never takes, sends or keeps photographs/.test(text))
  await page.locator('input[type=checkbox]').check()
  await page.locator('input[placeholder*="Samira"]').fill('Test Parent')
  await page.getByRole('button', { name: /I agree/ }).click()
  await page.waitForTimeout(1500)
  ok('the world picker: six worlds and "See all 15 worlds"', (await page.getByTestId('world-picture').count()) === 6 && (await page.getByTestId('see-all-worlds').count()) === 1)
  ok('no big card repeating the world picked; the picked one is ticked', (await page.locator('.pick-tick').count()) === 1
    && !(await page.locator('h3').filter({ hasText: 'MatrixBlocks' }).count()))
  await shot(page, 'm-worlds', true)
  await page.getByTestId('see-all-worlds').click()
  await page.waitForTimeout(300)
  ok('"See all" shows all fifteen', (await page.getByTestId('world-picture').count()) === 15 && (await page.getByTestId('see-all-worlds').count()) === 0)
  await page.locator('input[placeholder="e.g. Ava"]').fill('Ava')
  await page.getByRole('button', { name: 'Start playing' }).click()
  await page.waitForTimeout(2500)
  // The trial banner's comparison.
  await page.getByRole('button', { name: 'What you get' }).click()
  await page.waitForTimeout(300)
  const cmp = page.getByTestId('plan-compare')
  const cmpText = await cmp.innerText().catch(() => '')
  ok('"What you get": the three plans side by side, in words', /Starter/.test(cmpText) && /Standard/.test(cmpText) && /Elite Pass/.test(cmpText) && /Children/.test(cmpText) && /Pause and limits/.test(cmpText))
  ok('no price in it', !/\$|\/mo|\d+\.\d\d/.test(cmpText), cmpText.match(/.{0,20}(\$|\/mo).{0,20}/)?.[0])
  ok('and a plain line: Pilot is optional and uses your own AI key', /Pilot, the AI helper for grown-ups, is optional on every plan\. It uses your own AI key/.test(cmpText))
  const banner = await box(page, '[data-testid="trial-banner"]')
  ok('all of it on one 375px screen', banner && banner.top >= 0 && banner.bottom <= 812, JSON.stringify(banner))
  await shot(page, 'm-compare')
  await page.getByRole('button', { name: 'What you get' }).click()
  // Getting started: two ways through the phone step.
  const link = await box(page, '[data-testid="link-phone"]')
  const share = await box(page, '[data-testid="shared-phone"]')
  ok('"Link a phone" and "We share one phone": two buttons side by side, the same size, big enough to tap',
    link && share && Math.abs(link.top - share.top) <= 1 && Math.abs(link.height - share.height) <= 1 && Math.abs(link.width - share.width) <= 2 && link.height >= 44, JSON.stringify({ link, share }))
  await page.locator('[data-testid="first-week"]').scrollIntoViewIfNeeded()
  await shot(page, 'm-getting-started')
  await ctx.close()
}
{
  // A one-phone family: the chore done on the parent's own phone and
  // accepted finishes the list, "We share one phone" never tapped.
  const { ctx, page } = await open(390, 844)
  await setUpFamily(page)
  await go(page, '/parent', 1000)
  ok('(the list is there, the phone step not done)', (await page.locator('[data-step="pair"][data-done="false"]').count()) === 1)
  await asKid(page)
  await go(page, '/kid/quests', 600)
  await page.locator('button.card').first().click()
  await page.waitForTimeout(500)
  await sendToParent(page)
  await asParent(page)
  await go(page, '/parent/approvals', 900)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  await page.waitForTimeout(1200)
  await dismiss(page)
  await go(page, '/parent', 1200)
  ok('one chore done on this phone and accepted: "Getting started" is finished and gone', (await page.getByTestId('first-week').count()) === 0)
  ok('"We share one phone" was never tapped', await page.evaluate(() => !JSON.parse(localStorage.getItem('rankup.state.v1')).settings.sharedPhone))
  await ctx.close()
}

await finish(errors, fails, browser)
