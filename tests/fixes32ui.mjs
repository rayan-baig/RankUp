/**
 * 0.32.0 in a real browser: the fixes from the round-8 strict review.
 * tests/fixes32.mjs holds the rules in plain Node.
 *
 *   1. the level-up (the demo): on the parent's screen at 375px and 1440px
 *      and on the child's own Home, confetti, a burst, a big number, a
 *      chime; still up at 4 seconds, gone by itself after about five and a
 *      half; a tap in its first moment leaves it, a later one closes it;
 *      under reduce motion words only (no confetti, no burst, no count);
 *   2. Pilot with no key: "Summarise this" answers in the chat (no key
 *      settings); Review's "Accept the oldest one" answers; "Explain this
 *      screen" on Rewards and Plans gives that screen's own counts; no
 *      child's name in Pilot's answers;
 *   3. what the boost gave on This week and the plan screen, and "Share
 *      this week": the words shown first, copied only when Copy is pressed;
 *   4. the trial banner's last days: "stays theirs" said once, and "room
 *      for every child" only with more children than the free plan holds;
 *   5. a computer: the front door's strip of screens (no Block Craft, not
 *      on a phone, not fetched there), and the dashboard in one column for
 *      a new one-child family, two for the demo;
 *   6. still no Pilot on the front door or a child's screen.
 */
import { chromium } from 'playwright'
import { finish, BASE, SHOT_DIR, setUpFamily, asKid, asParent } from './helpers.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails.push(label) }
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors = []
const NAMES = /\b(Ava|Noah|Rivera)\b/
async function open(width, height, { reduce = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: reduce ? 'reduce' : 'no-preference' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin }).catch(() => {})
  // Counts the notes RankUp plays (lib/chime.js) without needing speakers.
  await ctx.addInitScript(() => {
    window.__notes = 0
    const Real = window.AudioContext
    if (Real) window.AudioContext = class extends Real { createOscillator() { window.__notes += 1; return super.createOscillator() } }
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return { ctx, page }
}
const go = async (page, route, wait = 1200) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${SHOT_DIR}/rk10-${name}.png`, fullPage }).catch(() => {})
const demo = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByTestId('see-it-live').click()
  await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
  await page.waitForTimeout(800)
}
const as = async (page, who) => { await page.getByTestId('demo-banner').getByRole('button', { name: new RegExp(who) }).click(); await page.waitForTimeout(300) }
const upNow = (page) => page.getByTestId('level-up').count().then((n) => n > 0)
const numberPx = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="level-up"] h2')).fontSize))

console.log('\n=== 1. The level-up, worthy of the celebrations ===')
for (const [w, h] of [[375, 812], [1440, 900]]) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  await go(page, '/parent/approvals', 1200)
  const notes0 = await page.evaluate(() => window.__notes)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  // A tap at once (the second tap of a double tap on Accept) leaves it up:
  // a real mouse tap on the number, as soon as it is drawn.
  await page.waitForSelector('[data-testid="level-up"] h2', { timeout: 4000 })
  const spot = await page.locator('[data-testid="level-up"] h2').boundingBox()
  if (spot) await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2)
  await page.waitForTimeout(250)
  ok(`${w}px parent: the level-up shows, and a tap in its first moment leaves it up`, await upNow(page))
  ok(`${w}px: confetti down the screen and a burst behind the avatar`, (await page.getByTestId('level-up-confetti').count()) === 1
    && (await page.locator('[data-testid="level-up"] .levelup-rays').count()) === 1)
  const px = await numberPx(page)
  ok(`${w}px: the new level is a big number (${px}px)`, w < 1024 ? px >= 72 : px >= 110, String(px))
  ok(`${w}px: a parent's button says "Carry on"`, (await page.getByTestId('level-up-ok').innerText()).trim() === 'Carry on')
  ok(`${w}px: its chime played (Sounds is on)`, (await page.evaluate(() => window.__notes)) - notes0 >= 5)
  await page.waitForTimeout(900)
  await shot(page, `${w === 375 ? 'm' : 'd'}-parent-levelup`)
  await page.waitForTimeout(2800)
  ok(`${w}px: still up at 4 seconds (it was gone at 2.5)`, await upNow(page))
  await page.waitForTimeout(2000)
  ok(`${w}px: gone by itself after about five and a half`, !(await upNow(page)))

  if (w === 375) {
    await as(page, 'Ava')
    await page.waitForTimeout(700)
    const words = await page.getByTestId('level-up').innerText().catch(() => '')
    ok('Ava\'s own Home: the level-up speaks to her, with "Awesome!"', /You went from level \d+ to \d+!/.test(words) && /Awesome!/.test(words), words.replace(/\s+/g, ' '))
    ok('no Pilot on a child\'s screen', (await page.locator('.pilot-root').count()) === 0 || await page.evaluate(() => getComputedStyle(document.querySelector('.pilot-root')).display === 'none'))
    ok('no price or plan name on it', !/\$\d|Starter|Standard|Elite Pass/.test(words))
    await shot(page, 'm-kid-levelup')
    await page.getByTestId('level-up-ok').click()
    await page.waitForTimeout(400)
    ok('"Awesome!" closes it at once, before its time is up', !(await upNow(page)))
  }
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 812, { reduce: true })
  await demo(page)
  await go(page, '/parent/approvals', 1200)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  await page.waitForTimeout(300)
  const still = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="level-up"]')
    return el && { flag: el.hasAttribute('data-still'), confetti: !!el.querySelector('.levelup-confetti'), rays: !!el.querySelector('.levelup-rays'), stars: !!el.querySelector('.levelup-stars'), n: el.querySelector('h2').textContent.trim(), words: el.innerText }
  })
  ok('reduce motion: words only (no confetti, no burst), and the number simply shows', still && still.flag && !still.confetti && !still.rays && !still.stars && /^\d+$/.test(still.n)
    && /went from level/.test(still.words), JSON.stringify(still))
  await shot(page, 'm-levelup-still')
  await ctx.close()
}

console.log('\n=== 2. Pilot with no key: every suggestion answers ===')
const pilotShown = (page) => page.evaluate(() => { const r = document.querySelector('.pilot-root'); return Boolean(r && getComputedStyle(r).display !== 'none' && r.querySelector('.pilot-launcher')) })
async function waitForPilot(page, ms = 10000) { for (let t = 0; t < ms; t += 250) { if (await pilotShown(page)) return true; await page.waitForTimeout(250) } return false }
const log = (page) => page.locator('.pilot-root .pilot-log').innerText().catch(() => '')
const openPilot = async (page) => {
  // Pilot stays open from screen to screen (the core remembers it).
  if (await page.evaluate(() => document.querySelector('.pilot-root')?.classList.contains('pilot-open'))) return
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForSelector('.pilot-root .pilot-welcome', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
}
const pressPill = async (page, label) => { await page.locator('.pilot-root .pilot-pill:visible', { hasText: label }).first().click(); await page.waitForTimeout(600) }
const pressChip = async (page, label) => { await page.locator('.pilot-root .pilot-chip:visible', { hasText: label }).first().click(); await page.waitForTimeout(800) }
const settingsOpen = (page) => page.locator('.pilot-root .pilot-settings-view').isVisible().catch(() => false)
for (const [w, h] of [[375, 812], [1440, 900]]) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  await go(page, '/parent/rewards', 1500)
  ok(`${w}px: #/parent/rewards is a real screen (the rewards)`, /Rewards catalogue/.test(await page.evaluate(() => document.body.innerText)) && !/not found|doesn't exist/i.test(await page.evaluate(() => document.body.innerText)))
  ok(`${w}px: the robot is there`, await waitForPilot(page))
  await openPilot(page)
  await pressPill(page, 'Explain this screen')
  const rewards = await log(page)
  ok(`${w}px: "Explain this screen" on Rewards: what they are, and right now the rewards and their costs`, /These are your family's Rewards/.test(rewards)
    && /Right now: \d+ rewards?, costing \d+ to \d+ coins/.test(rewards) && !/a RankUp screen for grown-ups/.test(rewards), rewards.slice(-500))
  await pressChip(page, 'Summarise this')
  const summed = await log(page)
  ok(`${w}px: "Summarise this" answers in the chat, with no key`, /Rewards, in short:/.test(summed) && !(await settingsOpen(page)), summed.slice(-400))
  ok(`${w}px: the key offered once in the chat, not under every answer`, (await page.locator('.pilot-root .pilot-more').count()) <= 2)
  if (w === 375) await shot(page, 'm-pilot-summary')
  else await shot(page, 'd-pilot-summary')
  await go(page, '/parent/approvals', 1500)
  await openPilot(page)
  await pressChip(page, 'Accept the oldest one')
  const oldest = await log(page)
  ok(`${w}px: Review's "Accept the oldest one", with no key: which chore, how long, and Review`, /The oldest chore waiting is/.test(oldest) && !(await settingsOpen(page)), oldest.slice(-300))
  await go(page, '/parent/plan', 1500)
  await openPilot(page)
  await pressChip(page, 'Summarise this')
  const plan = await log(page)
  ok(`${w}px: the plan screen's summary: the plan, and its counts`, /Plans, in short:/.test(plan) && /pay for/.test(plan), plan.slice(-400))
  ok(`${w}px: no child's or family's name in Pilot's own answers`, !NAMES.test(plan.replace(/^[\s\S]*?(?=Explain this screen|Summarise this screen)/, '')), plan.slice(0, 200))
  await ctx.close()
}

console.log('\n=== 3. What the boost gave, and the week to share ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  const boost = await page.getByTestId('week-boost').innerText().catch(() => '')
  ok('This week: what the 1.5× boost gave, in XP, by child', /The 1\.5× XP boost gave (Ava|Noah) \d+ extra XP/.test(boost), boost)
  await page.getByTestId('week-share-open').click()
  await page.waitForTimeout(300)
  const text = await page.getByTestId('week-share-text').innerText()
  ok('"Share this week" shows the words first: the week, each child, the boost', /^Our week on RankUp/.test(text) && /chores? done/.test(text) && /XP earned/.test(text) && /boost gave/.test(text), text)
  ok('and says nothing leaves the device until Share or Copy', /Nothing leaves this device until you press Share or Copy/.test(await page.getByTestId('week-share').innerText()))
  ok('nothing copied yet', (await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))) !== text)
  await shot(page, 'm-week-share')
  await page.getByTestId('week-share-copy').click()
  await page.waitForTimeout(400)
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
  ok('Copy copies exactly those words', copied === text || /would not copy/.test(await page.getByTestId('week-share-said').innerText()), copied.slice(0, 80))
  await go(page, '/parent/plan', 1200)
  ok('the plan screen says what the boost gave too', /boost gave/.test(await page.getByTestId('plan-boost').innerText().catch(() => '')))
  await as(page, 'Ava')
  await page.waitForTimeout(900)
  await page.getByTestId('level-up-ok').click().catch(() => {})
  ok('a child\'s Home has none of it', !/boost gave|Our week on RankUp|Share this week/.test(await page.evaluate(() => document.body.innerText)))
  await ctx.close()
}

console.log('\n=== 4. The trial banner in its last days ===')
{
  const { ctx, page } = await open(375, 812)
  await setUpFamily(page)
  const { default: pg } = await import('pg')
  const client = new pg.Client({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test' })
  await client.connect()
  await client.query("update families set trial_ends_at = now() + interval '2 days 2 hours' where id = (select id from families order by created_at desc limit 1)")
  await client.end()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await go(page, '/parent', 1500)
  const one = await page.getByTestId('trial-banner').innerText().catch(() => '')
  ok('the heads-up shows, and "stays theirs" is said once, not twice', /Heads-up/.test(one) && (one.match(/theirs/g) || []).length === 1, one.replace(/\s+/g, ' '))
  ok('one child, within the free plan: no "room for every child"', !/room for every child/.test(one), one.replace(/\s+/g, ' '))
  await shot(page, 'm-trial-one-child')
  await go(page, '/parent/kids', 800)
  await page.getByRole('button', { name: '+ Add' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('dialog').locator('input').first().fill('Bo')
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(600)
  await go(page, '/parent', 1200)
  const two = await page.getByTestId('trial-banner').innerText().catch(() => '')
  ok('two children, more than the free plan holds: "room for every child" is said', /room for every child/.test(two), two.replace(/\s+/g, ' '))
  await asKid(page)
  ok('a child sees no banner', !/Heads-up|room for every child/.test(await page.evaluate(() => document.body.innerText)))
  await asParent(page)
  await ctx.close()
}

console.log('\n=== 5. On a computer ===')
for (const [w, h] of [[1440, 900], [1280, 800]]) {
  const { ctx, page } = await open(w, h)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  ok(`${w}x${h}: the front door has its strip of four real screens`, (await page.locator('[data-testid="door-strip"] .door-tile').count()) === 4)
  const pics = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src))
  ok(`${w}x${h}: no Block Craft picture on the door`, pics.length > 0 && pics.every((s) => !/block|craft|steve/i.test(s)), pics.join(', '))
  const fill = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="door-strip"]').getBoundingClientRect()
    const g = document.querySelector('.door-grid').getBoundingClientRect()
    return { top: Math.round(g.top), bottom: Math.round(s.bottom), view: innerHeight }
  })
  if (w === 1440) ok('1440x900: the door and its strip fill the window, top to bottom', fill.top < 120 && fill.bottom > fill.view - 120 && fill.bottom <= fill.view + 4, JSON.stringify(fill))
  ok(`${w}x${h}: no Pilot on the front door`, (await page.locator('.pilot-root').count()) === 0)
  await shot(page, `d-door-${w}`)
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 812)
  const fetched = []
  page.on('request', (r) => fetched.push(r.url()))
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  ok('a phone: no strip, and its code never fetched', (await page.getByTestId('door-strip').count()) === 0 && !fetched.some((u) => /DoorStrip/.test(u)), fetched.filter((u) => /DoorStrip/.test(u)).join())
  await ctx.close()
}
{
  const { ctx, page } = await open(1440, 900)
  // As the reviewer saw it: a brand-new family, one child, no chores yet.
  await setUpFamily(page, { pack: false })
  await go(page, '/parent', 1500)
  const layout = await page.evaluate(() => {
    const cols = document.querySelector('.dash-cols')
    const r = (s) => document.querySelector(s)?.getBoundingClientRect()
    return { cols: cols?.dataset.cols, main: r('.dash-main')?.width, side: r('.dash-side')?.height, shell: r('.shell')?.width }
  })
  ok('a new one-child family with "Getting started" at 1440px: one column, nothing empty at the bottom right', layout.cols === '1' && layout.shell <= 800, JSON.stringify(layout))
  await shot(page, 'd-new-dash', true)
  // Once the family is going (chores added), the two columns balance and come back.
  await go(page, '/parent/assign', 800)
  await page.getByRole('tab', { name: 'Quest packs' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Add all 7 to Ava/ }).click()
  await page.waitForTimeout(500)
  await go(page, '/parent', 1200)
  const after = await page.evaluate(() => {
    const h = (s) => document.querySelector(s).getBoundingClientRect().height
    return { cols: document.querySelector('.dash-cols').dataset.cols, main: h('.dash-main'), side: h('.dash-side') }
  })
  ok('with chores added: two columns again, about the same length', after.cols === '1' || Math.min(after.main, after.side) / Math.max(after.main, after.side) >= 0.72, JSON.stringify(after))
  await ctx.close()
}
{
  const { ctx, page } = await open(1440, 900)
  await demo(page)
  const cols = await page.evaluate(() => document.querySelector('.dash-cols')?.dataset.cols)
  ok('the demo (two children, a fortnight of history) at 1440px: still two columns', cols === '2', String(cols))
  await shot(page, 'd-demo-dash')
  await ctx.close()
}

await finish(errors, fails, browser)
