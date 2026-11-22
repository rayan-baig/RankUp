/**
 * 0.33.0 in a real browser: the fixes from the round-9 strict review, and
 * Pilot core 1.4.2. tests/fixes33.mjs holds the rules in plain Node.
 *
 *   1. a computer (1440 and 1100): Pilot's chat docked down the right edge,
 *      the screen moved over (nothing under the chat), the dashboard in one
 *      column at 1100 while it is open and two again once closed; scrolled,
 *      the chat's top edge fades;
 *   2. a phone, no key: Review's "Which chore is oldest?" with "Open it",
 *      "Summarise this" leading with the numbers and a next step, a typed
 *      question that fits answered at once (nothing sent), one that doesn't
 *      waiting for a key; Plans in the demo says nothing is charged;
 *   3. the level-up: the card above the confetti, and the child's own Home
 *      saying "Your chore was accepted" for one;
 *   4. a new family in the trial's last days: the boost so far in the
 *      heads-up and on the Elite card, the banner without its pitch line,
 *      never on the child's screens;
 *   5. the door's strip agrees with its demo phone; Share says "this device";
 *   6. still no Pilot on the front door or a child's screen.
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
async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  // Nothing may leave for an AI company: Pilot has no key here.
  page.on('request', (r) => { if (/anthropic|openai|googleapis|generativelanguage/.test(r.url())) errors.push(`sent: ${r.url()}`) })
  return { ctx, page }
}
const go = async (page, route, wait = 1200) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${SHOT_DIR}/rk11-${name}.png`, fullPage }).catch(() => {})
const demo = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByTestId('see-it-live').click()
  await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
  await page.waitForTimeout(2500)
}
const as = async (page, who) => { await page.getByTestId('demo-banner').getByRole('button', { name: new RegExp(who) }).click(); await page.waitForTimeout(400) }
const openPilot = async (page) => {
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForSelector('.pilot-root.pilot-open .pilot-panel', { timeout: 8000 })
  await page.waitForTimeout(600)
}
const lastAnswer = (page) => page.locator('.pilot-root li.pilot-from-pilot').last().innerText().catch(() => '')
const box = (page, sel) => page.locator(sel).first().boundingBox()

console.log('\n=== 1. Pilot docked at the right on a computer ===')
for (const [w, h] of [[1440, 900], [1100, 800]]) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  await go(page, '/parent/plan', 1500)
  const cardsBefore = await box(page, '[data-testid="plan-cards"]')
  await openPilot(page)
  const panel = await box(page, '.pilot-root .pilot-panel')
  const cards = await box(page, '[data-testid="plan-cards"]')
  ok(`${w}px: the chat is down the right edge, the whole height`, panel && panel.x + panel.width >= w - 20 && panel.y <= 20 && panel.height >= h - 40, JSON.stringify(panel))
  ok(`${w}px: the plans moved over: nothing under the chat`, cards && panel && cards.x + cards.width <= panel.x, JSON.stringify({ cards, panel }))
  ok(`${w}px: the page is marked while it is open`, (await page.evaluate(() => document.documentElement.dataset.pilotOpen)) === 'on')
  if (w === 1100) ok('1100px: the plans one to a row while it is open', cards && cardsBefore && cards.width < cardsBefore.width && (await page.locator('[data-testid="plan-cards"] > *').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size)) === 1)
  ok(`${w}px: the robot stays in the sidebar's slot`, await page.evaluate(() => document.querySelector('.pilot-root').classList.contains('pilot-at-bl')))
  await shot(page, `d${w}-pilot-docked`)
  // Scrolled, the chat's top edge fades (core 1.4.2): nothing half cut under the header.
  await page.locator('.pilot-root .pilot-pill:visible', { hasText: 'Explain this screen' }).first().click()
  await page.waitForTimeout(800)
  await page.locator('.pilot-root .pilot-chip:visible', { hasText: 'Summarise this' }).first().click()
  await page.waitForTimeout(800)
  await page.locator('.pilot-root .pilot-scroll').evaluate((el) => { el.scrollTop = 140; el.dispatchEvent(new Event('scroll')) })
  await page.waitForTimeout(300)
  ok(`${w}px: scrolled, the chat's top edge fades under the header`, await page.locator('.pilot-root .pilot-scroll').evaluate((el) => el.classList.contains('pilot-scrolled')
    && /gradient/.test(getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage || '')))
  await go(page, '/parent', 1500)
  const colsOpen = await page.locator('.dash-cols').getAttribute('data-cols')
  const main = await box(page, '.dash-cols')
  const panel2 = await box(page, '.pilot-root .pilot-panel')
  ok(`${w}px: the dashboard is clear of the chat too`, main && panel2 && main.x + main.width <= panel2.x, JSON.stringify({ main, panel2 }))
  ok(`${w}px: the dashboard ${w >= 1400 ? 'keeps two columns' : 'drops to one column'} while it is open`, colsOpen === (w >= 1400 ? '2' : '1'), colsOpen)
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForTimeout(900)
  ok(`${w}px: closed, the page has its room back and two columns`, (await page.evaluate(() => document.documentElement.dataset.pilotOpen || '')) === ''
    && (await page.locator('.dash-cols').getAttribute('data-cols')) === '2' && (await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingRight))) < 40)
  await ctx.close()
}

console.log('\n=== 2. Pilot on a phone, with no key ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await go(page, '/parent/approvals', 1200)
  await openPilot(page)
  await page.locator('.pilot-root .pilot-pill:visible', { hasText: "What's waiting" }).first().click()
  await page.waitForTimeout(900)
  const chipLabels = await page.locator('.pilot-root .pilot-chips .pilot-chip').allInnerTexts()
  ok('Review\'s suggestions: "Which chore is oldest?" and "Summarise this", nothing that needs a key', chipLabels.includes('Which chore is oldest?') && chipLabels.includes('Summarise this')
    && !chipLabels.includes('Accept the oldest one'), chipLabels.join(' | '))
  await page.locator('.pilot-root .pilot-chip:visible', { hasText: 'Which chore is oldest?' }).first().click()
  await page.waitForTimeout(900)
  const oldest = await lastAnswer(page)
  ok('"Which chore is oldest?": the chore, and an "Open it" link', /The oldest chore waiting is/.test(oldest) && (await page.locator('.pilot-root a', { hasText: 'Open it' }).count()) >= 1, oldest)
  await page.locator('.pilot-root .pilot-chip:visible', { hasText: 'Summarise this' }).first().click()
  await page.waitForTimeout(900)
  const sum = await lastAnswer(page)
  ok('"Summarise this": the numbers first, then one next step', /^Review, in short:\s+1 chore waiting for review/.test(sum) && /Next: Accept/.test(sum), sum)
  ok('and no key settings opened', !(await page.locator('.pilot-root .pilot-settings-view:not([hidden])').count()))
  await shot(page, 'm-pilot-summary-review')
  await page.locator('.pilot-root textarea').fill('Is anything waiting for review?')
  await page.locator('.pilot-root textarea').press('Enter')
  await page.waitForTimeout(900)
  const typed = await lastAnswer(page)
  ok('a typed question that fits is answered at once: "Here\'s what I can tell you without an AI key"', /without an AI key/.test(typed) && /waiting for you to review/.test(typed), typed)
  await shot(page, 'm-pilot-typed-match')
  await page.locator('.pilot-root textarea').fill('Write me a poem about dragons')
  await page.locator('.pilot-root textarea').press('Enter')
  await page.waitForTimeout(900)
  ok('one that doesn\'t fit waits in the box for a key, as before', (await page.locator('.pilot-root textarea').inputValue()) === 'Write me a poem about dragons'
    || (await page.locator('.pilot-root .pilot-settings-view:not([hidden])').count()) > 0)
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await go(page, '/parent/plan', 1200)
  await openPilot(page)
  await page.locator('.pilot-root .pilot-pill:visible', { hasText: 'Explain this screen' }).first().click()
  await page.waitForTimeout(900)
  const planText = await lastAnswer(page)
  ok('Plans in the demo: "you\'re on Elite Pass in the demo (nothing is charged)", never "you pay for"', /you're on Elite Pass in the demo \(nothing is charged\)/.test(planText) && !/you pay for/.test(planText), planText)
  await ctx.close()
}

console.log('\n=== 3. The level-up ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await go(page, '/parent/approvals', 1200)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  await page.waitForSelector('[data-testid="level-up"] h2', { timeout: 4000 })
  await page.waitForTimeout(1200)
  const z = await page.evaluate(() => ({ card: getComputedStyle(document.querySelector('.levelup-card')).zIndex, confetti: getComputedStyle(document.querySelector('.levelup-confetti')).zIndex }))
  ok('the card above the confetti (the pieces fall behind the words and the button)', Number(z.card) > Number(z.confetti), JSON.stringify(z))
  await shot(page, 'm-levelup-behind')
  await page.waitForTimeout(5000)
  await as(page, 'Ava')
  await page.waitForSelector('[data-testid="level-up"]', { timeout: 5000 }).catch(() => {})
  const words = await page.getByTestId('level-up').innerText().catch(() => '')
  ok('Ava\'s own Home: "Your chore was accepted" (one chore)', /Your chore was accepted\. You went from level \d+ to \d+!/.test(words), words.replace(/\s+/g, ' '))
  await ctx.close()
}

console.log('\n=== 4. The trial\'s last days: the boost so far ===')
{
  const { ctx, page } = await open(375, 812)
  await setUpFamily(page)
  await asKid(page)
  await go(page, '/kid/quests', 600)
  await page.locator('button.card').first().click()
  await page.waitForTimeout(500)
  await sendToParent(page)
  await asParent(page)
  await go(page, '/parent/approvals', 1000)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  await page.waitForTimeout(6800)
  const { default: pg } = await import('pg')
  const client = new pg.Client({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test' })
  await client.connect()
  await client.query("update families set trial_ends_at = now() + interval '2 days 2 hours' where id = (select id from families order by created_at desc limit 1)")
  await client.end()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await go(page, '/parent', 1500)
  const banner = await page.getByTestId('trial-banner').innerText().catch(() => '')
  ok('the heads-up gives the boost so far: "The boost so far: Ava +N XP."', /The boost so far: Ava \+\d+ XP\./.test(banner), banner.replace(/\s+/g, ' '))
  ok('the pitch line is left out while the heads-up shows', !/gives you/.test(banner) && /Compare plans/.test(banner), banner.replace(/\s+/g, ' '))
  ok('no price in the banner', !/\$\d|\/mo/.test(banner))
  await shot(page, 'm-trial-last-days')
  await go(page, '/parent/plan', 1200)
  const elite = await page.getByTestId('plan-trial-boost').innerText().catch(() => '')
  ok('the Elite card: "Your trial\'s 1.5× boost so far: Ava +N XP"', /Your trial's 1\.5× boost so far: Ava \+\d+ XP/.test(elite), elite)
  await page.getByTestId('plan-trial-boost').scrollIntoViewIfNeeded().catch(() => {})
  await shot(page, 'm-plan-trial-boost')
  await asKid(page)
  for (const r of ['/kid', '/kid/quests', '/kid/shop', '/kid/profile']) {
    await go(page, r, 800)
    const t = await page.locator('body').innerText()
    // ("Standard drops" is a reward pop-up style on the child's profile, not a plan.)
    const bad = t.match(/boost so far|\$\d|\/mo\b|Elite Pass|\bStarter\b|\bStandard\b(?! drops)/)
    ok(`${r}: no boost so far, no price, no plan name, no Pilot`, !bad && (await page.locator('.pilot-root:visible').count()) === 0, bad ? JSON.stringify([bad[0], t.slice(Math.max(0, bad.index - 80), bad.index + 40)]) : 'pilot visible')
  }
  await ctx.close()
}

console.log('\n=== 5. The door\'s strip, Share ===')
{
  const { ctx, page } = await open(1440, 900)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="door-strip"]', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(800)
  const strip = await page.getByTestId('door-strip').evaluate((el) => el.textContent).catch(() => '')
  const phone = await page.locator('.loop-level').first().innerText().catch(() => '')
  ok('the strip shows Noah at level 3 with ✨ 47, as the demo phone above rests', /Level 3 · Pegasus Horizon · ✨ 47/.test(strip) && /Noah has ✨ 47/.test(strip) && !/Level 4|✨ 62/.test(strip), strip.slice(0, 200))
  ok('(the demo phone shows level 3 too)', /Level 3/.test(phone), phone)
  ok('no Pilot on the front door', (await page.locator('.pilot-root').count()) === 0)
  await shot(page, 'd-door')
  await page.getByTestId('see-it-live').click()
  await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
  await page.waitForTimeout(1200)
  await page.getByTestId('week-share-open').click()
  await page.waitForTimeout(300)
  ok('Share: "Nothing leaves this device until you press Share or Copy."', /Nothing leaves this device until you press Share or Copy\./.test(await page.getByTestId('week-share').innerText()))
  await ctx.close()
}

finish(errors, fails, browser)
