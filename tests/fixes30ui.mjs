/**
 * The fixes from the strict review at 84% (0.30.0), in a real browser.
 * tests/fixes30.mjs holds the rules in plain Node.
 *
 *   - a child (the demo, 375px): after the parent accepts, Pilot's robot steps
 *     back for the parent's level-up; the child's own Home shows the level-up
 *     the next time it opens, once; then the weekly goal's confetti and ring;
 *     Claim flies the coins into the coin tile, whose number ticks up after,
 *     with a chime; under reduce motion, words only (no flight, no confetti,
 *     the ring simply full); the child's tab bar close to solid; no Pilot;
 *   - the dashboard on a computer (1280px and 1440px): the two columns about
 *     the same length with one child and no checklist, two, and four;
 *     "This week" in the demo beside last week;
 *   - the trial banner at 375px: the comparison across the whole banner,
 *     "Any number", a Close button; in the last days a heads-up naming the
 *     child's boost; at 1440px the comparison's words 13.5px;
 *   - the front door: the phone shows Noah's Pegasus world, the bar filling
 *     and "Level up!", with no Block Craft picture;
 *   - "We share one phone": the step reads "Phone: shared with a grown-up".
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
async function open(width, height, { reduce = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: reduce ? 'reduce' : 'no-preference' })
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
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${SHOT_DIR}/rk8-${name}.png`, fullPage }).catch(() => {})
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
const as = async (page, who) => { await page.getByTestId('demo-banner').getByRole('button', { name: new RegExp(who) }).click(); await page.waitForTimeout(300) }
const cols = (page) => page.evaluate(() => ['.dash-main', '.dash-side'].map((s) => document.querySelector(s).getBoundingClientRect().height))
const coins = async (page) => Number((await page.getByTestId('coin-tile').innerText()).replace(/[^\d]/g, ''))
/** What the page shows of these, over the next `ms`: [[time, state], ...] as it changes. */
const watch = (page) => page.evaluate(() => {
  window.__seen = []
  const t0 = performance.now()
  const look = () => ['level-up', 'goal-confetti', 'weekly-goal-moment', 'coin-flight'].map((id) => (document.querySelector(`[data-testid="${id}"]`) ? 1 : 0)).join('')
  const note = () => { const s = look(); if (window.__seen[window.__seen.length - 1]?.[1] !== s) window.__seen.push([Math.round(performance.now() - t0), s]) }
  note()
  new MutationObserver(note).observe(document.body, { childList: true, subtree: true })
})
const seen = (page) => page.evaluate(() => window.__seen)
/*
 * The demo's history is a few days old, so early in a week (a Monday) Ava has
 * fewer of this week's chores than the goal: the goal is set to one more than
 * she has, so the chore accepted next reaches it on any day (0.33.0).
 */
const goalWithinReach = async (page) => {
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('rankup.state.v1'))
    const ava = st.kids.find((k) => k.name === 'Ava')
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const done = st.submissions.filter((x) => x.kidId === ava.id && x.status === 'approved' && x.decidedAt >= d.getTime()).length
    st.family = { ...st.family, weeklyChoreGoal: Math.min(50, done + 1) }
    localStorage.setItem('rankup.state.v1', JSON.stringify(st))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
}

console.log('\n=== 1. A child\'s celebrations (the demo, 375px) ===')
{
  const { ctx, page } = await open(375, 812)
  await demo(page)
  await goalWithinReach(page)
  await go(page, '/parent/approvals', 1200)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  await page.waitForTimeout(800)
  ok('the parent sees the level-up', (await page.getByTestId('level-up').count()) === 1)
  const robot = await page.evaluate(() => {
    const r = document.querySelector('.pilot-root')
    return r ? { yield: r.classList.contains('pilot-yield'), visibility: getComputedStyle(r).visibility } : null
  })
  ok('and Pilot\'s robot steps back while it shows', !robot || (robot.yield && robot.visibility === 'hidden'), JSON.stringify(robot))
  await shot(page, 'm-parent-levelup')
  // 0.32.0: it stays about five and a half seconds (LEVEL_UP_MS), or until tapped.
  await page.waitForTimeout(5200)
  ok('(it goes by itself)', (await page.getByTestId('level-up').count()) === 0)

  await watch(page)
  await as(page, 'Ava')
  await page.waitForTimeout(600)
  const words = await page.getByTestId('level-up').innerText().catch(() => '')
  ok('Ava\'s own Home shows her the level-up, speaking to her', /Your (chores were|chore was) accepted\. You went from level \d+ to \d+!/.test(words), words.replace(/\s+/g, ' '))
  ok('Pilot is not on a child\'s screen', (await page.locator('.pilot-root').count()) === 0 || await page.evaluate(() => getComputedStyle(document.querySelector('.pilot-root')).display === 'none'))
  await shot(page, 'm-kid-levelup')
  await page.waitForTimeout(7400)
  const timeline = await seen(page)
  const overlayGone = timeline.find(([, s]) => s[0] === '0' && timeline.some(([, t]) => t[0] === '1'))
  const confettiAt = timeline.find(([, s]) => s[1] === '1')
  ok('then the weekly goal: its card, and confetti once the level-up has gone', confettiAt && overlayGone && confettiAt[0] >= overlayGone[0] - 50, JSON.stringify(timeline))
  ok('the confetti goes by itself', (await page.getByTestId('goal-confetti').count()) === 0)
  ok('a ring round the trophy, filling', await page.evaluate(() => {
    const ring = document.querySelector('[data-testid="goal-ring"] .goal-ring-fill')
    return Boolean(ring && getComputedStyle(ring).animationName === 'rankup-ring-fill')
  }))
  ok('chimes played (the level, the goal)', (await page.evaluate(() => window.__notes)) >= 9, String(await page.evaluate(() => window.__notes)))

  await go(page, '/kid/quests', 600)
  await go(page, '/kid', 900)
  ok('back on Home: the level-up is not shown again', (await page.getByTestId('level-up').count()) === 0)

  const tile = await box(page, '[data-testid="coin-tile"]')
  const claimBox = await box(page, '[data-testid="claim-bonus"]')
  ok('the coin tile is just under the bonus', tile && claimBox && tile.top > claimBox.bottom && tile.top - claimBox.bottom < 120, JSON.stringify({ tile, claimBox }))
  const before = await coins(page)
  const notes = await page.evaluate(() => window.__notes)
  await page.getByTestId('claim-bonus').click()
  await page.waitForTimeout(150)
  const flight = await page.evaluate(() => {
    const f = document.querySelector('[data-testid="coin-flight"]')
    if (!f) return null
    const spans = [...f.children].map((s) => parseFloat(getComputedStyle(s).fontSize))
    return { n: spans.length, sizes: spans, tx: f.style.getPropertyValue('--tx'), ty: f.style.getPropertyValue('--ty') }
  })
  ok('Claim: six coins, 28–32px, fly toward the coin tile', flight && flight.n === 6 && flight.sizes.every((s) => s >= 28 && s <= 32) && flight.tx && flight.ty, JSON.stringify(flight))
  ok('while they fly, the tile still shows the old number', (await coins(page)) === before, `${await coins(page)} vs ${before}`)
  ok('the moment says so in words', /\+5 .+!/.test(await page.getByTestId('claim-moment').innerText().catch(() => '')))
  await shot(page, 'm-claim-flight')
  await page.waitForTimeout(2300)
  ok('they land (about 1.4s) and the number ticks up by 5', (await page.getByTestId('coin-flight').count()) === 0 && (await coins(page)) === before + 5, `${await coins(page)} vs ${before}`)
  ok('with the coin chime', (await page.evaluate(() => window.__notes)) - notes === 2)
  const landed = await box(page, '[data-testid="coin-tile"]')
  ok('where they land, the tile is in view above the tab bar', landed && landed.top >= 0 && landed.bottom <= 812 - 90, JSON.stringify(landed))
  const bar = await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabbar')).backgroundColor)
  const alpha = (bar.match(/[\d.]+/g) || []).map(Number)
  ok('the child\'s tab bar is close to solid (words do not show through)', alpha.length === 3 || (alpha[3] ?? 1) >= 0.9, bar)
  await ctx.close()
}
{
  // Reduce motion: the same moments, in words only.
  const { ctx, page } = await open(375, 812, { reduce: true })
  await demo(page)
  await goalWithinReach(page)
  await go(page, '/parent/approvals', 1200)
  await page.getByRole('button', { name: /^Accept/ }).first().click()
  await page.waitForTimeout(3600)
  await watch(page)
  await as(page, 'Ava')
  await page.waitForTimeout(3600)
  await page.getByTestId('claim-bonus').click()
  await page.waitForTimeout(200)
  const timeline = await seen(page)
  ok('reduce motion: no confetti and no flying coins, ever', !timeline.some(([, s]) => s[1] === '1' || s[3] === '1'), JSON.stringify(timeline))
  ok('reduce motion: the goal\'s card is there, its ring simply full', (await page.getByTestId('weekly-goal-moment').count()) === 1 && (await page.locator('[data-testid="goal-ring"][data-still]').count()) === 1)
  ok('reduce motion: the bonus is said in words', (await page.getByTestId('claim-moment').count()) === 1 && (await page.locator('.cheer-burst').count()) === 0)
  await ctx.close()
}

console.log('\n=== 2 and 4. The dashboard on a computer, and "This week" ===')
{
  const { ctx, page } = await open(1440, 900)
  await demo(page)
  for (const w of [1280, 1440]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(500)
    const c = await cols(page)
    ok(`demo (two children) at ${w}px: the columns about the same length`, Math.min(...c) / Math.max(...c) >= 0.75, c.map(Math.round).join(' / '))
  }
  const week = await page.getByTestId('this-week').innerText().catch(() => '')
  ok('"This week" in the demo: chores done, XP earned, days in a row, against last week', /Chores done/i.test(week) && /XP earned/i.test(week) && /Days in a row/i.test(week) && /on last week|Same as last week/.test(week), week.replace(/\s+/g, ' '))
  await shot(page, 'd-demo-dashboard')
  await ctx.close()
}
{
  const { ctx, page } = await open(1440, 900)
  await setUpFamily(page)
  await go(page, '/parent', 1000)
  await page.getByRole('button', { name: 'Hide this list' }).click()
  await page.waitForTimeout(400)
  const measure = async (label) => {
    for (const w of [1280, 1440]) {
      await page.setViewportSize({ width: w, height: 900 })
      await page.waitForTimeout(500)
      const c = await cols(page)
      // 0.32.0: when two columns cannot be balanced the dashboard is one column (tests/fixes32ui.mjs).
      const one = await page.evaluate(() => document.querySelector('.dash-cols')?.dataset.cols === '1')
      ok(`${label} at ${w}px: the columns about the same length, or one column (no big empty space)`, one || Math.min(...c) / Math.max(...c) >= 0.75, `${one ? 'one column' : 'two'}: ${c.map(Math.round).join(' / ')}`)
    }
  }
  await measure('one child, no checklist')
  await shot(page, 'd-one-child')
  for (const [i, name] of ['Bo', 'Cy', 'Di'].entries()) {
    await go(page, '/parent/kids', 800)
    await page.getByRole('button', { name: '+ Add' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('dialog').locator('input').first().fill(name)
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(500)
    await go(page, '/parent', 800)
    if (i === 0) await measure('two children')
  }
  await measure('four children')
  await shot(page, 'd-four-children', true)
  await ctx.close()
}

console.log('\n=== 3 and 7. The trial banner ===')
{
  const { ctx, page } = await open(375, 812)
  await setUpFamily(page)
  await go(page, '/parent', 1000)
  await page.getByTestId('shared-phone').click()
  await page.waitForTimeout(400)
  const step = page.locator('[data-step="pair"]')
  const stepText = await step.innerText()
  ok('"We share one phone": the step reads "Phone: shared with a grown-up", ticked, not crossed out',
    /Phone: shared with a grown-up/.test(stepText) && !/Link Ava/.test(stepText) && (await step.getAttribute('data-done')) === 'true'
    && await step.locator('span.font-semibold').first().evaluate((el) => !getComputedStyle(el).textDecorationLine.includes('line-through')), stepText)
  await page.getByRole('button', { name: 'What you get' }).click()
  await page.waitForTimeout(300)
  const banner = await box(page, '[data-testid="trial-banner"]')
  const cmp = await box(page, '[data-testid="plan-compare"]')
  ok('the comparison spans the banner (less only its padding)', banner && cmp && cmp.width >= banner.width - 30, JSON.stringify({ banner, cmp }))
  const text = await page.getByTestId('plan-compare').innerText()
  ok('"Any number" of children, not "Unlimited"', /Any number/.test(text) && !/Unlimited/.test(text.split('On every plan')[0]))
  await shot(page, 'm-compare')
  await page.getByTestId('plan-compare-close').click()
  await page.waitForTimeout(300)
  ok('its own Close button closes it', (await page.getByTestId('plan-compare').count()) === 0)
  await go(page, '/parent/kids', 600)
  await go(page, '/parent', 800)
  ok('and it is closed when the dashboard opens again', (await page.getByTestId('plan-compare').count()) === 0)

  // The last days of the trial: the full banner and its heads-up.
  const { default: pg } = await import('pg')
  const client = new pg.Client({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || 'postgres', database: process.env.PGDATABASE || 'rankup_test' })
  await client.connect()
  await client.query("update families set trial_ends_at = now() + interval '2 days 2 hours' where id = (select id from families order by created_at desc limit 1)")
  await client.end()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await go(page, '/parent', 1500)
  const heads = await page.getByTestId('trial-heads-up').innerText().catch(() => '')
  ok('in the last days, a gentle heads-up naming Ava\'s boost and the Elite tools', /^Heads-up: the trial ends in 3 days\. On Starter, Ava's 1\.5× boost and the Elite tools stop\.( The boost so far: Ava \+\d+ XP\.)? Everything your children have earned stays theirs\.$/.test(heads), heads)
  ok('no price in it', !/\$|\/mo/.test(heads))
  const link = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="trial-banner"] .tap-inline')
    const cs = getComputedStyle(b)
    return { line: parseFloat(getComputedStyle(b.parentElement).lineHeight), takes: b.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom), tap: b.getBoundingClientRect().height }
  })
  ok('"Compare plans" sits in its line without stretching it, and is still 40px to tap', link.takes <= link.line + 1 && link.tap >= 40, JSON.stringify(link))
  await page.getByRole('button', { name: 'Compare plans' }).click()
  await page.waitForTimeout(300)
  await shot(page, 'm-trial-headsup', true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(500)
  ok('on a computer the comparison\'s words are 13.5px', (await page.evaluate(() => getComputedStyle(document.querySelector('.plan-compare table')).fontSize)) === '13.5px')
  await shot(page, 'd-trial-compare')
  // The child's side has none of it.
  await asKid(page)
  await page.waitForTimeout(600)
  const kidText = await page.evaluate(() => document.body.innerText)
  ok('a child\'s Home: no heads-up, no plan, no price', !/Heads-up|Starter|Elite Pass|\$\d/.test(kidText))
  await asParent(page)
  await ctx.close()
}

console.log('\n=== 5. The front door\'s phone: a child\'s world ===')
for (const [w, h] of [[375, 812], [1440, 900]]) {
  const { ctx, page } = await open(w, h)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  const art = await page.evaluate(() => [...document.querySelectorAll('[data-testid="loop-preview"] img')].map((i) => i.getAttribute('src')))
  ok(`${w}px: Noah's world picture is Pegasus Horizon's, never Block Craft`, art.length === 1 && /drawn\/avatar-pegasus\.svg$/.test(art[0]) && !art.some((a) => /blockcraft/i.test(a)), art.join(', '))
  ok(`${w}px: with his level and world`, /Noah/.test(await page.getByTestId('loop-preview').innerText()) && /Pegasus Horizon/.test(await page.getByTestId('loop-preview').innerText()))
  await page.waitForSelector('[data-testid="loop-preview"][data-beat="3"]', { timeout: 10000 })
  await page.waitForTimeout(1200)
  const last = await page.getByTestId('loop-preview').innerText()
  const fill = await page.evaluate(() => { const b = document.querySelector('.loop-bar > span'); return b.getBoundingClientRect().width / b.parentElement.getBoundingClientRect().width })
  ok(`${w}px: the last beat: the bar full and "Level up!"`, /Level up!/.test(last) && fill > 0.97, `${fill}`)
  await shot(page, `${w === 375 ? 'm' : 'd'}-door-levelup`)
  await ctx.close()
}

await finish(errors, fails, browser)
