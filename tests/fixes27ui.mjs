/**
 * The fixes from the strict review at 80% (0.27.0), in a real browser.
 * tests/fixes27.mjs holds the rules in plain Node.
 *
 *   - Pilot's opening screen: RankUp's suggestions under the five pills with
 *     no key added, a tap writes the question in the box; no "Image
 *     generation" or "Video generation" in its settings;
 *   - a computer: the front door in two columns with the demo beside the
 *     ways in, the parent dashboard in two columns from 1100px (one below),
 *     a child's column centred in a frame with the tab bar as wide as its
 *     cards; a phone is unchanged, with no sideways scroll;
 *   - the daily chore bonus is in view above the tab bar at 375px;
 *   - sign-up: no Pilot on step 2 (the world picker), back on step 1; a new
 *     family's trial banner is one line and its Elite tools one row; a
 *     Campfire Cozy child's coins are Berries.
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
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/rk27-${name}.png` }).catch(() => {})
const box = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, display: getComputedStyle(el).display }
}, sel)
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const demo = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByTestId('see-it-live').click()
  await page.waitForFunction(() => document.body.innerText.includes('Rivera'), null, { timeout: 10000 })
  await page.waitForTimeout(800)
}
const as = async (page, who) => { await page.getByTestId('demo-banner').getByRole('button', { name: new RegExp(who) }).click(); await page.waitForTimeout(900) }
const pilotShown = (page) => page.evaluate(() => {
  const root = document.querySelector('.pilot-root')
  return Boolean(root && root.isConnected && getComputedStyle(root).display !== 'none' && root.querySelector('.pilot-launcher'))
})
async function waitForPilot(page, ms = 10000) {
  for (let t = 0; t < ms; t += 250) { if (await pilotShown(page)) return true; await page.waitForTimeout(250) }
  return false
}

console.log('\n=== The front door on a computer: the demo beside the ways in ===')
{
  const { ctx, page } = await open(1440, 900)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const demoBox = await box(page, '.door-demo')
  const ways = await box(page, '.door-ways')
  const steps = await box(page, '.door-steps')
  ok('two columns: the ways in on the left, the demo on the right', demoBox && ways && demoBox.left >= ways.right + 24, JSON.stringify({ demoBox, ways }))
  ok('the door is wider than a phone (over 900px from edge to edge)', demoBox && ways && demoBox.right - ways.left > 900, JSON.stringify({ demoBox, ways }))
  ok('the demo\'s four steps are written out beside it', steps && steps.display !== 'none' && steps.left > demoBox.left + 150
    && (await page.locator('.door-steps li').count()) === 4)
  await shot(page, 'd-door')
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 812)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const demoBox = await box(page, '.door-demo')
  const ways = await box(page, '.door-ways')
  ok('on a phone: one column as before, the demo above the price and the buttons', demoBox && ways && demoBox.bottom <= ways.top + 1, JSON.stringify({ demoBox, ways }))
  ok('and no step list (the demo says each step itself)', (await box(page, '.door-steps'))?.display === 'none')
  ok('and nothing scrolls sideways', await noSideScroll(page))
  await ctx.close()
}

console.log('\n=== The parent dashboard: two columns from 1100px ===')
for (const [w, h, two] of [[1440, 900, true], [1100, 800, true], [1024, 768, false], [375, 812, false]]) {
  const { ctx, page } = await open(w, h)
  await demo(page)
  const m = await box(page, '.dash-main')
  const s = await box(page, '.dash-side')
  const activityInSide = await page.evaluate(() => [...document.querySelectorAll('.dash-side h2')].some((h) => /Recent activity/i.test(h.innerText)))
  const kidsInMain = await page.evaluate(() => [...document.querySelectorAll('.dash-main h2')].some((h) => /^Kids$/i.test(h.innerText.trim())) && Boolean(document.querySelector('.dash-main [data-testid="waiting-card"]')))
  if (two) {
    ok(`${w}px: Review and the kids on the left, beside the activity on the right`, m && s && s.left >= m.right + 16 && Math.abs(s.top - m.top) < 40, JSON.stringify({ m, s }))
  } else {
    ok(`${w}px: one column (the activity under the kids)`, m && s && s.top >= m.bottom - 1, JSON.stringify({ m, s }))
  }
  ok(`${w}px: the activity is in the side column, the kids and Review in the main one`, activityInSide && kidsInMain)
  ok(`${w}px: nothing scrolls sideways`, await noSideScroll(page))
  if (w === 1440) {
    const nav = await box(page, 'nav.tabbar')
    ok('the tab bar stays Parent Mode\'s width, centred under the columns', nav && Math.abs(nav.width - 608) <= 2 && Math.abs((nav.left + nav.right) / 2 - 720) <= 2, JSON.stringify(nav))
    await shot(page, 'd-dashboard')
  }
  if (w === 375) await shot(page, 'm-dashboard')
  await ctx.close()
}

console.log('\n=== A child\'s screens on a computer: centred, in a frame ===')
{
  const { ctx, page } = await open(1440, 900)
  await demo(page)
  await as(page, 'Ava')
  await go(page, '/kid', 1200)
  const frame = await page.evaluate(() => {
    const el = document.querySelector('.shell')
    const b = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { left: b.left, right: b.right, width: b.width, radius: parseFloat(cs.borderTopLeftRadius), border: parseFloat(cs.borderTopWidth), area: document.documentElement.dataset.area }
  })
  ok('the page says it is a child\'s screen (data-area="kid")', frame.area === 'kid')
  ok('a column, narrower than a parent\'s, centred', frame.width <= 560 && Math.abs((frame.left + frame.right) / 2 - 720) <= 2, JSON.stringify(frame))
  ok('in a frame: rounded corners and an edge', frame.radius >= 24 && frame.border >= 1, JSON.stringify(frame))
  const nav = await box(page, 'nav.tabbar')
  const card = await box(page, '.shell .card')
  ok('the tab bar is as wide as the cards in the frame', nav && card && Math.abs(nav.left - card.left) <= 1 && Math.abs(nav.right - card.right) <= 1, JSON.stringify({ nav, card }))
  await shot(page, 'd-ava')
  await go(page, '/kid/quests', 1200)
  ok('the same frame on Quests', (await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.shell')).borderTopLeftRadius))) >= 24)
  await as(page, 'Parent')
  await go(page, '/parent', 1200)
  ok('and none in Parent Mode', (await page.evaluate(() => [document.documentElement.dataset.area, parseFloat(getComputedStyle(document.querySelector('.shell')).borderTopLeftRadius)])).join() === 'parent,0')
  await ctx.close()
}
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await as(page, 'Ava')
  await go(page, '/kid', 1000)
  const phone = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.shell')); return [parseFloat(cs.borderTopLeftRadius), parseFloat(cs.borderTopWidth)] })
  ok('on a phone a child\'s screen has no frame (unchanged)', phone[0] === 0 && phone[1] === 0, JSON.stringify(phone))
  await ctx.close()
}

console.log('\n=== Pilot\'s opening screen: RankUp\'s suggestions, chat keys only ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  ok('the robot is there in Parent Mode', await waitForPilot(page))
  await page.locator('.pilot-root .pilot-launcher').click()
  await page.waitForSelector('.pilot-root .pilot-welcome', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  const pills = await page.locator('.pilot-root .pilot-pill').allInnerTexts()
  ok('the design\'s five pills are unchanged', pills.length === 5 && /Ask anything/.test(pills[0]) && /Customize/.test(pills[4]), JSON.stringify(pills))
  const starters = await page.locator('.pilot-root [data-testid="pilot-starters"] button').allInnerTexts()
  ok('with no key added, RankUp\'s suggestions are there too', JSON.stringify(starters.slice(0, 2)) === JSON.stringify(["What's waiting for me?", 'Add a chore for…']) && starters.length === 3, JSON.stringify(starters))
  const where = await page.evaluate(() => {
    const row = document.querySelector('.pilot-root [data-testid="pilot-starters"]')
    return { afterPills: row?.previousElementSibling?.classList.contains('pilot-pills'), inWelcome: Boolean(row?.closest('.pilot-welcome')) }
  })
  ok('right under the pills, inside the welcome (so it goes once a chat starts)', where.afterPills && where.inWelcome, JSON.stringify(where))
  const rowBox = await box(page, '.pilot-root [data-testid="pilot-starters"] button')
  ok('the first is on the screen without scrolling', rowBox && rowBox.bottom <= 812 && rowBox.top > 0, JSON.stringify(rowBox))
  await shot(page, 'm-pilot-open')
  await page.locator('.pilot-root [data-testid="pilot-starters"] button').first().click()
  await page.waitForTimeout(300)
  ok('a tap writes the question in the message box (no key: it waits there)', (await page.locator('.pilot-root .pilot-input').inputValue()) === "What's waiting for me to review?")
  await page.locator('.pilot-root .pilot-pill', { hasText: 'Customize' }).click()
  await page.waitForTimeout(700)
  const settings = await page.evaluate(() => {
    const view = document.querySelector('.pilot-root .pilot-settings-view')
    const visible = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'
    const summaries = [...view.querySelectorAll('summary')].filter(visible).map((s) => s.innerText)
    return { summaries, text: view.innerText, chatKeys: /Chat keys/.test(view.innerText) }
  })
  ok('Pilot\'s settings: chat keys are there', settings.chatKeys)
  ok('and no "Image generation" or "Video generation"', !/Image generation|Video generation|image key|video key/i.test(settings.text) && settings.summaries.length === 0, JSON.stringify(settings.summaries))
  await shot(page, 'm-pilot-settings')
  await ctx.close()
}

console.log('\n=== The daily chore bonus is in view at 375px ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await go(page, '/parent/approvals', 1000)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  await page.waitForTimeout(1200)
  await as(page, 'Ava')
  await go(page, '/kid', 1200)
  for (const name of [/Continue|Awesome|Nice|Close|Keep going/]) await page.getByRole('button', { name }).first().click({ timeout: 1500 }).catch(() => {})
  await page.waitForTimeout(600)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  const bonus = await box(page, '[data-testid="chore-bonus"]')
  const nav = await box(page, 'nav.tabbar')
  ok('the bonus is offered once Ava\'s chore is accepted', Boolean(bonus))
  ok('and the whole card is above the tab bar on the first screen, nothing under it', bonus && nav && bonus.bottom <= nav.top - 4 && bonus.top >= 0, JSON.stringify({ bonus, nav }))
  const order = await page.evaluate(() => {
    const next = document.querySelector('[data-testid="next-up"]').getBoundingClientRect()
    const b = document.querySelector('[data-testid="chore-bonus"]').getBoundingClientRect()
    return b.top - next.bottom
  })
  ok('right under "Do this next"', order >= 0 && order <= 20, String(order))
  await shot(page, 'm-ava-bonus')
  await ctx.close()
}

console.log('\n=== A new family: no Pilot on the world picker, a quiet dashboard, Berries ===')
{
  const { ctx, page } = await open(375, 812)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(400)
  if (await page.locator('input[type=email]').count()) {
    await page.locator('input[type=email]').fill(`fix27-${Date.now()}@example.com`)
    await page.locator('input[type=password]').fill('correct-horse-battery')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForTimeout(1600)
  }
  ok('step 1 (the family, a grown-up typing): Pilot is there', await waitForPilot(page))
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
  await page.waitForSelector('text=picks a world', { timeout: 8000 })
  await page.waitForTimeout(2500)
  ok('step 2 ("Your kid picks a world"): no Pilot, not even its robot', !(await pilotShown(page)))
  ok('and nothing of Pilot on the progress bar', !(await page.evaluate(() => {
    const bar = document.querySelector('[role="progressbar"]')?.getBoundingClientRect()
    const l = document.querySelector('.pilot-root .pilot-launcher')
    if (!bar || !l || !l.isConnected) return false
    const b = l.getBoundingClientRect()
    return b.width > 0 && b.left < bar.right && b.right > bar.left && b.top < bar.bottom + 40 && b.bottom > bar.top
  })))
  await shot(page, 'm-signup-world')
  await page.getByRole('button', { name: 'Back' }).click()
  await page.waitForTimeout(600)
  ok('back on step 1: Pilot returns for the grown-up', await waitForPilot(page))
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1500)
  if (await page.getByText('What RankUp collects about your child').count()) {
    await page.locator('input[type=checkbox]').check()
    await page.locator('input[placeholder*="Samira"]').fill('Sam Fix')
    await page.getByRole('button', { name: /I agree/ }).click()
    await page.waitForTimeout(1500)
  }
  await page.waitForTimeout(1000)
  ok('step 2 again: no Pilot', !(await pilotShown(page)))
  await page.locator('input[placeholder="e.g. Ava"]').fill('Mia')
  await page.getByText('Campfire Cozy').first().click()
  await page.getByRole('button', { name: 'Start playing' }).click()
  await page.waitForTimeout(2500)
  await go(page, '/parent', 1500)
  const trial = page.getByTestId('trial-banner')
  if (await trial.count()) {
    ok('a new family\'s trial banner is one line', (await trial.getAttribute('data-compact')) === '' && ((await box(page, '[data-testid="trial-banner"]'))?.bottom || 999) < 110, JSON.stringify(await box(page, '[data-testid="trial-banner"]')))
    ok('what the plan gives is folded under "What you get"', await page.getByRole('button', { name: 'What you get' }).isVisible() && (await page.getByText(/theirs to keep/).count()) === 0)
    await page.getByRole('button', { name: 'What you get' }).click()
    ok('and opens with a tap', await page.getByText(/theirs to keep/).isVisible())
  } else {
    ok('(no trial on this family, so no banner to check)', true)
  }
  const fold = page.getByTestId('elite-tools-fold')
  ok('the Elite tools are one closed row', (await fold.count()) === 1 && (await fold.getAttribute('data-open')) === null && (await page.getByRole('button', { name: 'Pause and limits', exact: true }).count()) === 0)
  await fold.getByRole('button', { name: /Elite tools/ }).click()
  await page.waitForTimeout(300)
  ok('which opens to the three tools', await page.getByRole('button', { name: 'Pause and limits', exact: true }).isVisible())
  await shot(page, 'm-new-dashboard')
  await page.getByRole('button', { name: /Hand to Mia/ }).click()
  await page.waitForTimeout(1500)
  const text = await page.evaluate(() => document.body.innerText)
  ok('a Campfire Cozy child\'s coins are Berries', /\bBerries\b/i.test(text) && !/Berberr/i.test(text), (text.match(/.{0,20}Berr.{0,20}/i) || [''])[0])
  await ctx.close()
}

await finish(errors, fails, browser)
