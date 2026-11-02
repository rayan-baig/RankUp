/**
 * The battle scenes on a slow phone.
 *
 * Each Block Craft chapter is a little game loop drawn on a canvas sixty times
 * a second, at the phone's real pixels. On a developer machine anything is
 * smooth; on a mid-range phone a scene that does too much per frame drops to a
 * slide show. This runs every scene, as the story and dragon screens run it,
 * with the CPU slowed four times (Chrome's own throttling, as on a mid-range
 * Android), and measures how long each frame took.
 *
 * What it holds a scene to: at most one frame in ten slower than 50ms (below
 * twenty frames a second), and a median under 34ms. Change a scene's drawing,
 * run this before and after.
 *
 *   node tests/battleperf.mjs          (PERF_ONLY=1 prints the numbers, no verdict)
 */
import { chromium } from 'playwright'
import { BASE, reporter, finish } from './helpers.mjs'

const THROTTLE = Number(process.env.CPU_THROTTLE || 4)
const SECONDS = Number(process.env.PERF_SECONDS || 6)
const { fails, pass, fail } = reporter()
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const errors = []
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.goto(BASE, { waitUntil: 'networkidle' })
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')

/** Run one chapter in the page for SECONDS and return every frame's length. */
async function measure(chapter) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  const busy = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value])).TaskDuration
  const busyBefore = await busy()
  const frames = await page.evaluate(async ({ chapter, seconds }) => {
    const { createBattle } = await import('/src/lib/battleEngine.js')
    document.body.innerHTML = ''
    const canvas = document.createElement('canvas')
    canvas.style.width = '358px'
    document.body.appendChild(canvas)
    // As BattleScene.jsx sizes it: the screen's real pixels, 16:9.
    canvas.width = Math.round(358 * Math.min(window.devicePixelRatio || 1, 2.5))
    canvas.height = Math.round((canvas.width * 9) / 16)
    const HOUR = 3600 * 1000
    const fight = chapter === 'dragon'
      ? {
          from: { dragon: 1000, hero: 100 },
          defeated: false,
          events: [
            { at: 1, kind: 'hit', dmg: 150, dragon: 850, hero: 100, title: 'A chore' },
            { at: 2, kind: 'sentBack', dmg: 15, dragon: 850, hero: 85, title: 'A chore' },
            { at: 3, kind: 'special', special: 'breath', name: 'Void Breath', dmg: 20, dragon: 850, hero: 65 },
            { at: 4, kind: 'hit', dmg: 300, dragon: 550, hero: 65, title: 'A chore' },
            { at: 5, kind: 'idle', dmg: 25, dragon: 550, hero: 40 },
            { at: 6 * HOUR, kind: 'hit', dmg: 80, dragon: 470, hero: 40, title: 'A chore' },
          ],
        }
      : undefined
    const times = []
    let last = 0
    const battle = createBattle(canvas, { chapter, fight })
    await new Promise((done) => {
      const t0 = performance.now()
      const tick = (now) => {
        if (last) times.push(now - last)
        last = now
        if (now - t0 < seconds * 1000) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    battle.destroy()
    return times
  }, { chapter, seconds: SECONDS })
  const work = ((await busy()) - busyBefore) * 1000
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  frames.sort((a, b) => a - b)
  const at = (q) => frames[Math.min(frames.length - 1, Math.floor(frames.length * q))]
  return {
    frames: frames.length,
    // Main-thread work per frame drawn, which is what a slower phone pays.
    work: work / Math.max(1, frames.length),
    median: at(0.5),
    p90: at(0.9),
    slow: frames.filter((f) => f > 50).length / frames.length,
  }
}

console.log(`\n=== Every battle scene at ${THROTTLE}x CPU throttling, ${SECONDS}s each ===`)
for (const chapter of ['raid', 'portal', 'rise', 'end', 'dragon', 'home']) {
  // eslint-disable-next-line no-await-in-loop
  const m = await measure(chapter)
  const line = `${chapter}: ${m.frames} frames, ${m.work.toFixed(1)}ms of work each, median ${m.median.toFixed(1)}ms, 90th ${m.p90.toFixed(1)}ms, ${(m.slow * 100).toFixed(0)}% over 50ms`
  if (process.env.PERF_ONLY) { console.log('  ', line); continue }
  m.median < 34 && m.slow <= 0.1 ? pass(line) : fail(line, 'too slow on a slower phone')
}

finish(errors, fails, browser)
