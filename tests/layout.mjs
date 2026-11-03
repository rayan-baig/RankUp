/**
 * Every screen, at two phone sizes, for a brand-new family and a busy one.
 *
 * screens.mjs proves no screen crashes. This proves no screen is broken to
 * look at on a real phone: nothing pushes the page sideways, nothing runs off
 * the right-hand edge, no two buttons sit on top of each other, no label is
 * cut off without the "…" that says there is more, and no server code
 * (snake_case, "http_502", "undefined", "NaN") is ever shown to a person.
 *
 * The phones: 390x844 (most current iPhones) and 360x740 (the common small
 * Android). The families: one that has just finished setup, with no chores
 * at all, and the look-around family, which has two children, a fortnight of
 * history and something on every screen.
 *
 *   node tests/layout.mjs            (SHOTS=1 also keeps a picture of each)
 */
import { chromium } from 'playwright'
import { BASE, SHOT_DIR, reporter, finish } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors = []

const PARENT_ROUTES = [
  '/parent', '/parent/approvals', '/parent/assign', '/parent/kids', '/parent/blueprint',
  '/parent/override', '/parent/guilds', '/parent/alliance', '/parent/school', '/parent/plan',
  '/parent/settings', '/parent/pair', '/parent/help', '/parent/history', '/parent/money',
]
const KID_ROUTES = [
  '/kid', '/kid/quests', '/kid/shop', '/kid/market', '/kid/arcade', '/kid/guild', '/kid/profile',
  '/kid/school', '/kid/dragon',
]
const OPEN_ROUTES = ['/switch', '/legal/privacy', '/legal/terms']

/** Everything wrong with the screen as drawn, as a list of short sentences. */
function audit() {
  const W = window.innerWidth
  const problems = []
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  const name = (el) => {
    const text = (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ')
    return `<${el.tagName.toLowerCase()}>${text ? ` "${text.slice(0, 40)}"` : ''}`
  }
  /** Inside something that clips or scrolls sideways on purpose, or decoration. */
  const contained = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX)) return true
      if (p.getAttribute('aria-hidden') === 'true') return true
    }
    return false
  }
  const fixedish = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const pos = getComputedStyle(p).position
      if (pos === 'fixed' || pos === 'sticky') return true
    }
    return false
  }

  // 1. The page itself scrolls sideways.
  const sw = document.documentElement.scrollWidth
  if (sw > W + 1) problems.push(`the page is ${sw - W}px wider than the screen`)

  // 2. Something runs off the edge.
  const all = [...document.body.querySelectorAll('*')]
  for (const el of all) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue
    if (!visible(el) || contained(el) || el.getAttribute('aria-hidden') === 'true') continue
    const r = el.getBoundingClientRect()
    if (r.right > W + 1 || r.left < -1) {
      // Only the outermost offender, not every child of it.
      const parent = el.parentElement?.getBoundingClientRect()
      if (parent && (parent.right > W + 1 || parent.left < -1) && !contained(el.parentElement)) continue
      problems.push(`${name(el)} runs off the ${r.right > W + 1 ? 'right' : 'left'} edge by ${Math.round(r.right > W + 1 ? r.right - W : -r.left)}px`)
    }
  }

  // 3. Two controls on top of each other.
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=tab]')]
    .filter((el) => visible(el) && !fixedish(el) && el.getAttribute('aria-hidden') !== 'true')
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i]; const b = controls[j]
      if (a.contains(b) || b.contains(a)) continue
      const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect()
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (x > 3 && y > 3) problems.push(`${name(a)} and ${name(b)} overlap`)
    }
  }

  // 3b. Words underneath a control, so part of either is hidden.
  const words = all.filter((el) => visible(el) && !fixedish(el) && !el.closest('svg')
    && el.getAttribute('aria-hidden') !== 'true' && !el.closest('[aria-hidden="true"]')
    && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1))
  for (const w of words) {
    const rw = w.getBoundingClientRect()
    for (const c of controls) {
      if (c.contains(w) || w.contains(c)) continue
      const rc = c.getBoundingClientRect()
      const x = Math.min(rw.right, rc.right) - Math.max(rw.left, rc.left)
      const y = Math.min(rw.bottom, rc.bottom) - Math.max(rw.top, rc.top)
      if (x > 3 && y > 3) problems.push(`${name(w)} sits under ${name(c)}`)
    }
  }

  // 4. Words cut off with nothing to say so.
  for (const el of all) {
    if (!visible(el) || el.closest('svg') || el.getAttribute('aria-hidden') === 'true') continue
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    if (!hasText) continue
    const cs = getComputedStyle(el)
    const clipsX = ['hidden', 'clip'].includes(cs.overflowX)
    const clipsY = ['hidden', 'clip'].includes(cs.overflowY)
    if (clipsX && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
      problems.push(`${name(el)} is cut off at the side`)
    }
    if (clipsY && el.scrollHeight > el.clientHeight + 2 && cs.webkitLineClamp === 'none' && !el.closest('[data-clamp]')) {
      problems.push(`${name(el)} is cut off at the bottom`)
    }
  }

  // 5. A code where words belong.
  const text = document.body.innerText
  const codes = text.match(/\b(?:[a-z]+_)+[a-z0-9]+\b|\bhttp_\d{3}\b|\bPGRST\d+|\bECONN\w+|\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/g) || []
  const allowed = new Set([])
  const shown = [...new Set(codes)].filter((c) => !allowed.has(c))
  if (shown.length) problems.push(`shows ${shown.slice(0, 4).map((c) => `"${c}"`).join(', ')} where words belong`)

  return [...new Set(problems)].slice(0, 8)
}

async function walk(page, routes, label) {
  for (const route of routes) {
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate((r) => { window.location.hash = r }, route)
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(900)
    // Folded sections are part of the screen too: open every one.
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate(() => document.querySelectorAll('[aria-expanded="false"]').forEach((b) => b.click()))
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(300)
    // eslint-disable-next-line no-await-in-loop
    const found = await page.evaluate(audit)
    if (process.env.SHOTS) {
      const file = `${label}-${route.replace(/\//g, '_')}.png`.replace(/[^a-z0-9_.-]/gi, '')
      // eslint-disable-next-line no-await-in-loop
      await page.screenshot({ path: `${SHOT_DIR}/layout-${file}`, fullPage: true })
      // eslint-disable-next-line no-await-in-loop
      const words = await page.evaluate(() => document.body.innerText)
      ;(await import('node:fs')).writeFileSync(`${SHOT_DIR}/layout-${file}.txt`, words)
    }
    if (found.length) fail(`${label} ${route}`, found.join('; '))
    else pass(`${label} ${route}`)
  }
}

async function context(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return { ctx, page }
}

/** A family that has just finished setup: one child, nothing else. */
async function newFamily(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /I'm a parent/ }).click()
  await page.waitForTimeout(300)
  await page.locator('input[type=email]').fill(`layout${Date.now()}@example.com`)
  await page.locator('input[type=password]').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForTimeout(1600)
  await page.locator('input').nth(0).fill('Sam')
  await page.locator('input').nth(2).fill('1234')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1200)
  if (await page.getByText('What RankUp collects about your child').count()) {
    await page.locator('input[type=checkbox]').check()
    await page.locator('input[placeholder*="Samira"]').fill('Test Parent')
    await page.getByRole('button', { name: /I agree/ }).click()
    await page.waitForTimeout(1500)
  }
  await page.locator('input[placeholder="e.g. Ava"]').fill('Ava')
  await page.getByRole('button', { name: 'Start playing' }).click()
  await page.waitForTimeout(1500)
}

async function asParent(page, pin) {
  await page.evaluate(() => { window.location.hash = '/switch' })
  await page.waitForTimeout(300)
  if (pin) await page.getByLabel('Parent PIN').fill(pin)
  else await page.getByRole('button', { name: 'Open Parent Mode' }).click()
  await page.waitForTimeout(600)
}
async function asKid(page, name) {
  await page.evaluate(() => { window.location.hash = '/switch' })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: new RegExp(name) }).first().click()
  await page.waitForTimeout(600)
}

for (const [width, height] of [[390, 844], [360, 740]]) {
  console.log(`\n=== A brand-new family, ${width}x${height} ===`)
  {
    const { ctx, page } = await context(width, height)
    await newFamily(page)
    await asParent(page, '1234')
    await walk(page, PARENT_ROUTES, `new ${width} parent`)
    if (width === 390) {
      // A new family is on a free Elite trial; the plan screen says so rather
      // than "You are on Starter" beside a dashboard counting down Elite.
      await page.evaluate(() => { window.location.hash = '/parent/plan' })
      await page.waitForTimeout(600)
      const plan = await page.evaluate(() => document.body.innerText)
      ;/trying Elite Pass free for 1[34] more days/.test(plan) && !/You are on Starter\./.test(plan)
        ? pass('a new family\'s plan screen says it is on a free Elite trial')
        : fail('trial on the plan screen', plan.slice(0, 160))
    }
    await asKid(page, 'Ava')
    await walk(page, KID_ROUTES, `new ${width} kid`)
    if (width === 390) {
      await page.evaluate(() => { window.location.hash = '/kid' })
      await page.waitForTimeout(600)
      const home = await page.evaluate(() => document.body.innerText)
      ;/No quests yet/.test(home) && !/Spend a token/.test(home) && !/0\/1\s*WEEKLY GOAL/i.test(home)
        ? pass('a new child with no quests and no tokens is not sent to spend a token')
        : fail('new child\'s next step', home.slice(0, 300))
    }
    await walk(page, OPEN_ROUTES, `new ${width}`)
    await ctx.close()
  }

  console.log(`\n=== A busy family, ${width}x${height} ===`)
  {
    const { ctx, page } = await context(width, height)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /Have a look around/ }).click()
    await page.waitForTimeout(1200)
    await walk(page, PARENT_ROUTES, `busy ${width} parent`)
    if (width === 390) {
      // The demo's own setting-up is no longer in its feed, so change the
      // plan here (payments are off in the demo) and back, the way a parent
      // would, and read the line that leaves.
      for (const plan of ['Standard', 'Elite Pass']) {
        await page.evaluate(() => { window.location.hash = '/parent/plan' })
        await page.waitForTimeout(600)
        await page.getByRole('button', { name: new RegExp(`Switch to ${plan}`) }).first().click()
        await page.waitForTimeout(300)
        await page.getByRole('button', { name: 'Switch', exact: true }).click()
        await page.waitForTimeout(400)
      }
      await page.evaluate(() => { window.location.hash = '/parent' })
      await page.waitForTimeout(600)
      const feed = await page.evaluate(() => document.body.innerText)
      ;/Plan changed to Elite Pass/.test(feed) && !/Plan changed to (starter|standard|elite)\b/.test(feed)
        ? pass('the activity feed names a plan as the plan screen does, not by its id')
        : fail('plan named in the feed', feed.match(/Plan changed to .*/)?.[0] || 'no plan line')
    }
    await asKid(page, 'Ava')
    await walk(page, [...KID_ROUTES, '/kid/story/raid'], `busy ${width} kid`)
    await walk(page, OPEN_ROUTES, `busy ${width}`)
    await ctx.close()
  }
}

finish(errors, fails, browser)
