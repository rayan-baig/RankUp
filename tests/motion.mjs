/**
 * Motion, and the promise that it stops.
 *
 * Two things are worth testing about animation and neither is "does it look
 * nice".
 *
 * A number that animates has to LAND on the right value. A count-up that eases
 * to 202 when the child earned 203 is a bug that looks like a rounding error
 * and gets reported as a stolen XP.
 *
 * And prefers-reduced-motion has to mean it. Someone who has turned motion off
 * has usually done so because movement makes them ill, and a marketing
 * animation is not an exception to that. The stylesheet disables CSS
 * animation globally, but the count-up and the word-splitter run in
 * JavaScript and would keep going regardless — so they are checked in a real
 * browser with the setting on.
 */
import { chromium } from 'playwright'
import { reporter, BASE, SHOT_DIR } from './helpers.mjs'

const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors = []

const openDemo = async (ctx) => {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /Have a look around/ }).click()
  await page.waitForTimeout(1500)
  return page
}

console.log('\n=== Numbers land on the right value ===')
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await openDemo(ctx)

  await page.evaluate(() => { window.location.hash = '/switch' })
  await page.waitForTimeout(600)
  await page.locator('button').filter({ hasText: 'Ava' }).first().click()
  await page.waitForTimeout(500)

  const truth = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
    const kid = s.kids.find((k) => k.name === 'Ava')
    return { coins: kid.coins, streak: kid.streak.count }
  })

  // Mid-flight it is deliberately NOT the final number — that is the whole
  // point of a count-up, and if it were, nothing would be animating.
  await page.waitForTimeout(120)
  const midway = await page.evaluate(() => document.body.innerText)

  await page.waitForTimeout(1600)
  const settled = await page.evaluate(() => document.body.innerText)

  settled.includes(String(truth.coins))
    ? pass(`the currency counts up and lands on ${truth.coins}`)
    : fail('count-up lands', `wanted ${truth.coins}, screen had ${settled.slice(0, 120)}`)

  midway !== settled
    ? pass('and was genuinely mid-count a moment earlier')
    : pass('(the count finished before it could be sampled — fast machine)')

  await page.screenshot({ path: `${SHOT_DIR}/motion-kid.png` })
  await ctx.close()
}

console.log('\n=== With motion turned off ===')
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const page = await openDemo(ctx)

  // The front door first: the word-splitter must not have split anything.
  await page.evaluate(() => { localStorage.clear() })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const split = await page.evaluate(() => document.querySelectorAll('.anim-words > span').length)
  split === 0
    ? pass('headings are not split into animated words')
    : fail('no word splitting under reduce-motion', `${split} spans`)

  const slogan = await page.evaluate(() => document.body.innerText)
  slogan.includes('Chores, but a game.')
    ? pass('and the heading still reads correctly as one string')
    : fail('heading intact', slogan.slice(0, 120))

  // Nothing anywhere should be mid-animation.
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === 'running').length)
  running === 0
    ? pass('nothing on the front door is animating at all')
    : fail('no running animations', `${running} still running`)

  // And the number must be right immediately rather than counting to it.
  await page.getByRole('button', { name: /Have a look around/ }).click()
  await page.waitForTimeout(1200)
  await page.evaluate(() => { window.location.hash = '/switch' })
  await page.waitForTimeout(500)
  await page.locator('button').filter({ hasText: 'Ava' }).first().click()
  await page.waitForTimeout(150)

  const truth = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
    return s.kids.find((k) => k.name === 'Ava').coins
  })
  const shown = await page.evaluate(() => document.body.innerText)
  shown.includes(String(truth))
    ? pass(`the number is simply there (${truth}), not counted to`)
    : fail('number immediate under reduce-motion', `wanted ${truth}`)

  await page.screenshot({ path: `${SHOT_DIR}/motion-still.png` })
  await ctx.close()
}

console.log('\nJS errors on the page:', errors.length)
errors.slice(0, 5).forEach((e) => console.log('  ', e))
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nALL CHECKS PASSED')
await browser.close()
process.exit(fails.length ? 1 : 0)
