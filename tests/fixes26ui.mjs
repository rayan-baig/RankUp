/**
 * The fixes from the strict review at 77% (0.26.0), in a real browser.
 * tests/fixes26.mjs holds the rules in plain Node.
 *
 *   - the front door has no Pilot, and no Pilot file is fetched there;
 *   - in Parent Mode on a phone the robot sits in the tab bar's own slot: on
 *     no tab, on no "waiting for you" card, plan button or Settings row;
 *   - on a desktop the tab bar is as wide as the column, and the robot sits
 *     in the space beside it, on nothing;
 *   - the daily chore bonus appears on Ava's Home only once her chore has
 *     been accepted;
 *   - the weekly goal reads done/goal, and follows the goal set in Settings;
 *   - Noah's world is Pegasus, and no child's Home names a paid plan;
 *   - the story chapter's buttons have room above the list's heading.
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
  const pilotFiles = []
  page.on('request', (r) => { if (/\/pilot[/-]|pilotRankUp/.test(new URL(r.url()).pathname)) pilotFiles.push(r.url()) })
  return { ctx, page, pilotFiles }
}
const go = async (page, route, wait = 1200) => { await page.evaluate((r) => { location.hash = r }, route); await page.waitForTimeout(wait) }
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/rk26-${name}.png` }).catch(() => {})
async function robot(page, ms = 9000) {
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
/** What the robot sits on: primary things, tabs, and the screen's cards. */
const coveredBy = (page, box) => page.evaluate((r) => {
  const hit = (b) => r.left < b.right - 1 && r.right > b.left + 1 && r.top < b.bottom - 1 && r.bottom > b.top + 1
  const out = []
  for (const el of document.querySelectorAll('[data-pilot-primary], nav.tabbar button, .shell .card, .shell .card-flat, .shell button')) {
    const b = el.getBoundingClientRect()
    if (!b.width || !hit(b)) continue
    // Behind the tab bar does not count: the bar hides it.
    const bar = document.querySelector('nav.tabbar')?.getBoundingClientRect()
    if (bar && !el.closest('nav') && b.top >= bar.top) continue
    if (bar && !el.closest('nav') && Math.min(b.bottom, bar.top) <= r.top) continue
    out.push((el.innerText || el.className || el.tagName).replace(/\s+/g, ' ').slice(0, 40))
  }
  return out
}, box)
const demo = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByTestId('see-it-live').click()
  await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
  await page.waitForTimeout(800)
}
const as = async (page, who) => { await page.getByTestId('demo-banner').getByRole('button', { name: new RegExp(who) }).click(); await page.waitForTimeout(900) }

console.log('\n=== The front door: no Pilot ===')
{
  const { ctx, page, pilotFiles } = await open(375, 812)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  ok('no robot on the front door', !(await page.evaluate(() => document.querySelector('.pilot-root'))))
  ok('and no Pilot file fetched', pilotFiles.length === 0, pilotFiles.join(', '))
  await ctx.close()
}

console.log('\n=== Parent Mode on a phone: the robot in the bar\'s slot, on nothing ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  for (const [route, label, open] of [['/parent', 'the dashboard ("1 chore waiting" card)'], ['/parent/plan', 'Plans ("Move to Starter · free")'],
    ['/parent/settings', 'Settings (the Notifications row)'], ['/parent/approvals', 'Review (Accept, Send back)']]) {
    await go(page, route, 1400)
    if (open) await open(page)
    const box = await robot(page)
    const under = box ? await coveredBy(page, box) : ['(no robot)']
    ok(`${label}: on no tab, card or button`, box && under.length === 0, JSON.stringify({ box, under }))
    // Scrolled to the bottom too: the screen goes behind the bar, never under the robot.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    const low = await robot(page)
    const lowUnder = low ? await coveredBy(page, low) : ['(no robot)']
    ok(`${label}, scrolled to the end: still on nothing`, low && lowUnder.length === 0, JSON.stringify({ low, lowUnder }))
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot(page, `m${route.replace(/\//g, '-')}`)
  }
  await ctx.close()
}

console.log('\n=== A desktop: a bar as wide as the column, the robot beside it ===')
{
  const { ctx, page } = await open(1440, 900)
  await demo(page)
  // Review, a one-column parent screen: the dashboard is two columns on a
  // computer since 0.27.0 (tests/fixes27ui.mjs), with the bar centred under them.
  await go(page, '/parent/approvals', 1400)
  const m = await page.evaluate(() => {
    const nav = document.querySelector('nav.tabbar').getBoundingClientRect()
    const card = document.querySelector('.shell .card').getBoundingClientRect()
    return { nav: [nav.left, nav.right], card: [card.left, card.right] }
  })
  ok('the tab bar is exactly as wide as the cards', Math.abs(m.nav[0] - m.card[0]) <= 1 && Math.abs(m.nav[1] - m.card[1]) <= 1, JSON.stringify(m))
  ok('Parent Mode\'s column is a little wider on a desktop (40rem)', m.card[1] - m.card[0] > 560, JSON.stringify(m))
  const box = await robot(page)
  ok('the robot sits beside the column, not on it', box && box.left > m.card[1] && (await coveredBy(page, box)).length === 0, JSON.stringify(box))
  await shot(page, 'd-parent')
  await as(page, 'Noah')
  await go(page, '/kid', 1000)
  const kidNav = await page.evaluate(() => {
    const nav = document.querySelector('nav.tabbar').getBoundingClientRect()
    const card = document.querySelector('.shell .card').getBoundingClientRect()
    return { nav: [nav.left, nav.right], card: [card.left, card.right] }
  })
  ok('a child\'s tab bar is as wide as the child\'s cards too', Math.abs(kidNav.nav[0] - kidNav.card[0]) <= 1 && Math.abs(kidNav.nav[1] - kidNav.card[1]) <= 1, JSON.stringify(kidNav))
  await as(page, 'Ava')
  await go(page, '/kid/story/raid', 1500)
  const gap = await page.evaluate(() => {
    const actions = document.querySelector('[data-testid="story-actions"]')
    const heading = [...document.querySelectorAll('h2')].find((h) => /story so far/i.test(h.innerText))
    return actions && heading ? heading.getBoundingClientRect().top - actions.getBoundingClientRect().bottom : null
  })
  ok('the story chapter: room between "Watch again"/"Back home" and the heading below', gap !== null && gap >= 24, String(gap))
  await shot(page, 'd-chapter')
  await ctx.close()
}

console.log('\n=== The daily bonus waits for an acceptance; the weekly goal is real ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await as(page, 'Ava')
  await go(page, '/kid', 1000)
  ok('Ava has sent a chore, not accepted yet: no daily bonus offered', await page.getByTestId('chore-bonus').count() === 0)
  const goal0 = await page.getByTestId('weekly-goal').innerText()
  ok('the weekly goal reads done/goal (5 a week until a parent sets one)', /\b\d+\/5\b/.test(goal0), goal0)
  const text = await page.evaluate(() => document.body.innerText)
  ok('no paid plan named on a child\'s Home (the boost is, the plan is not)', !/Elite|Standard|Starter|Pass\b/.test(text) && /1\.5× boost/.test(text), (text.match(/.{20}(Elite|Pass).{20}/) || [''])[0])
  await shot(page, 'ava-before')
  await as(page, 'Parent')
  await go(page, '/parent/approvals', 1000)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  await page.waitForTimeout(1200)
  await go(page, '/parent/settings', 900)
  await page.getByRole('button', { name: /Weekly goal/ }).click()
  await page.getByTestId('settings-weekly-goal').selectOption('3')
  await page.waitForTimeout(300)
  await as(page, 'Ava')
  await go(page, '/kid', 1200)
  // A level-up moment may be showing first.
  for (const name of [/Continue|Awesome|Nice|Close|Keep going/]) await page.getByRole('button', { name }).first().click({ timeout: 1500 }).catch(() => {})
  await page.waitForTimeout(600)
  ok('accepted: now the daily bonus is offered', await page.getByTestId('chore-bonus').count() === 1)
  const goal1 = await page.getByTestId('weekly-goal').innerText()
  ok('and the weekly goal follows the parent\'s 3', /\b\d+\/3\b/.test(goal1), goal1)
  await shot(page, 'ava-after')
  await as(page, 'Noah')
  await go(page, '/kid', 1000)
  ok('Noah\'s world is Pegasus', /Pegasus/.test(await page.evaluate(() => document.body.innerText)))
  await ctx.close()
}

await finish(errors, fails, browser)
