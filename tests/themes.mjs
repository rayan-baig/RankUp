/**
 * Every theme, at every evolution, actually rendered.
 *
 * Fifteen kid themes and ten parent ones, most of which nobody ever opens
 * during development because the default looks fine. They rot quietly: a
 * colour key gets renamed, an evolution overrides the background but not the
 * ink, and one child in a hundred ends up with grey text on a grey card and no
 * way to describe the problem.
 *
 * So this checks two things no reading of the data can.
 *
 * CONTRAST, computed from the colours each theme actually produces — including
 * at every evolution level, because an evolution is allowed to override
 * colours and that is exactly where a readable theme turns unreadable.
 *
 * And the REAL SCREENS under a handful of them, driven in a browser, because a
 * theme can pass every contrast check and still render a crash boundary if it
 * is missing a key some component reads.
 */
import { launch, reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'
import { KID_THEMES, resolveKidTheme } from '../src/data/kidThemes.js'
import { PARENT_THEMES } from '../src/data/parentThemes.js'

const { fails, pass, fail } = reporter()

/* ---------- contrast, the arithmetic ---------- */

// sRGB relative luminance, per WCAG. Not an approximation of it — the real
// formula, because "looks fine on my monitor" is how this goes wrong.
function luminance(hex) {
  const h = String(hex).replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/*
 * The thresholds, and why they are what they are.
 *
 * 4.5 is the WCAG AA floor for body text and is not negotiable — it is the
 * text a child reads to find out what a chore is. 3.0 is the AA floor for
 * large text and for the accent, which in this app is only ever used on
 * headings, numbers and chips, never on a paragraph.
 */
const BODY = 4.5
const LARGE = 3.0

console.log('\n=== Kid themes, at every evolution ===')
let worst = { ratio: Infinity, where: '' }

for (const theme of KID_THEMES) {
  // Level 1, then one level past each evolution threshold, which is where an
  // override has just taken effect.
  const levels = [1]
  for (const e of theme.evolutions || []) levels.push(e.level)
  let bad = []

  for (const level of levels) {
    const t = resolveKidTheme(theme.id, level)
    const c = t.colors
    const checks = [
      ['ink on bg', c.ink, c.bg, BODY],
      ['ink on surface', c.ink, c.surface, BODY],
      ['muted ink on surface', c.inkMuted, c.surface, BODY],
      ['accent on surface', c.accent, c.surface, LARGE],
      ['accent2 on surface', c.accent2, c.surface, LARGE],
    ]
    for (const [what, fg, bg, floor] of checks) {
      if (!fg || !bg) { bad.push(`${what} missing a colour at level ${level}`); continue }
      const ratio = contrast(fg, bg)
      if (ratio < worst.ratio) worst = { ratio, where: `${theme.id} ${what} @${level}` }
      if (ratio < floor) bad.push(`${what} ${ratio.toFixed(2)} < ${floor} at level ${level}`)
    }
  }

  bad.length === 0
    ? pass(`${theme.name} is readable at all ${levels.length} form${levels.length > 1 ? 's' : ''}`)
    : fail(`${theme.name} contrast`, bad.join('; '))
}

console.log(`\n  tightest ratio anywhere: ${worst.ratio.toFixed(2)} (${worst.where})`)

console.log('\n=== Every theme is complete ===')
for (const theme of KID_THEMES) {
  const missing = []
  for (const key of ['bg', 'surface', 'surface2', 'line', 'ink', 'inkMuted', 'accent', 'accent2']) {
    if (!theme.colors?.[key]) missing.push(`colors.${key}`)
  }
  // A currency with no name is a shop with a blank price on everything.
  if (!theme.currency?.name) missing.push('currency.name')
  if (!theme.currency?.icon) missing.push('currency.icon')
  if (!theme.name) missing.push('name')

  missing.length === 0
    ? pass(`${theme.id} has everything a screen reads`)
    : fail(`${theme.id} complete`, missing.join(', '))
}

console.log('\n=== Evolutions keep what they do not override ===')
// The trap: an evolution spreads over the theme, so anything it forgets is
// inherited — but anything it renames is simply lost.
for (const theme of KID_THEMES.filter((t) => t.evolutions?.length)) {
  const broken = []
  for (const e of theme.evolutions) {
    const t = resolveKidTheme(theme.id, e.level)
    if (t.name !== theme.name) broken.push(`${e.level} renamed the theme`)
    if (t.currency?.name !== theme.currency.name) broken.push(`${e.level} changed the currency`)
    for (const key of ['bg', 'surface', 'ink', 'accent']) {
      if (!t.colors?.[key]) broken.push(`${e.level} lost colors.${key}`)
    }
    if (!e.label) broken.push(`${e.level} has no label to show the child`)
  }
  broken.length === 0
    ? pass(`${theme.name}'s ${theme.evolutions.length} evolutions keep the theme intact`)
    : fail(`${theme.id} evolutions`, broken.join('; '))
}

console.log('\n=== Parent themes ===')
for (const theme of PARENT_THEMES) {
  const c = theme.colors
  const bad = []
  for (const [what, fg, bg, floor] of [
    ['ink on bg', c.ink, c.bg, BODY],
    ['ink on surface', c.ink, c.surface, BODY],
    ['muted ink on surface', c.inkMuted ?? c.muted, c.surface, BODY],
    ['accent on surface', c.accent, c.surface, LARGE],
  ]) {
    if (!fg || !bg) { bad.push(`${what} missing a colour`); continue }
    const ratio = contrast(fg, bg)
    if (ratio < floor) bad.push(`${what} ${ratio.toFixed(2)} < ${floor}`)
  }
  bad.length === 0 ? pass(`${theme.name} is readable`) : fail(`${theme.name} contrast`, bad.join('; '))
}

/* ---------- and the real screens ---------- */

console.log('\n=== Rendered, in a browser ===')
const { browser, page, errors } = await launch()

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.getByRole('button', { name: /Have a look around/ }).click()
await page.waitForTimeout(1600)

// Every kid theme, on the screen with the most of a theme on it. Set directly
// rather than clicked through the picker: this is testing the themes, not the
// picker, and fifteen trips through a modal is four minutes of nothing.
for (const theme of KID_THEMES) {
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
    s.kids = s.kids.map((k, i) => (i === 0 ? { ...k, themeId: id } : k))
    s.session = { ...s.session, role: 'kid', kidId: s.kids[0].id }
    localStorage.setItem('rankup.state.v1', JSON.stringify(s))
  }, theme.id)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { window.location.hash = '/kid' })
  await page.waitForTimeout(750)

  const text = await page.evaluate(() => document.body.innerText)
  const crashed = /went wrong/i.test(text)
  // The currency name is theme-specific and appears on the home screen, so it
  // is the cheapest proof that this theme's data actually reached the page
  // rather than the default's.
  const applied = text.toLowerCase().includes(theme.currency.name.toLowerCase())

  if (crashed) fail(`${theme.name} renders`, text.slice(0, 100))
  else if (!applied) fail(`${theme.name} applied`, `no "${theme.currency.name}" on screen`)
  else pass(`${theme.name} renders, with its own currency`)
}

await page.screenshot({ path: `${SHOT_DIR}/theme-last.png` })

// And the parent side, where the theme is a different set of colours entirely.
for (const theme of PARENT_THEMES) {
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
    s.family = { ...s.family, parentThemeId: id }
    s.session = { ...s.session, role: 'parent', parentUnlocked: true }
    localStorage.setItem('rankup.state.v1', JSON.stringify(s))
  }, theme.id)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { window.location.hash = '/parent' })
  await page.waitForTimeout(650)

  const text = await page.evaluate(() => document.body.innerText)
  const crashed = /went wrong/i.test(text)
  crashed
    ? fail(`parent ${theme.name} renders`, text.slice(0, 100))
    : pass(`parent ${theme.name} renders`)
}

finish(errors, fails, browser)
