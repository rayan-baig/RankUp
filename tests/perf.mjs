/**
 * Is the app still smooth on a phone that is not this machine?
 *
 * Written because a background change that looked better made the median frame
 * 50% slower, and nothing else in the suite would have noticed. A blurred layer
 * is paid for on every repaint, so animating inside one re-blurs the whole
 * screen sixty times a second — at six-times CPU throttling that took the
 * median frame from 33ms to 50ms, which on a real mid-range phone is the
 * difference between smooth and visibly stuttering.
 *
 * Six-times throttling is a rough stand-in for a mid-range Android against a
 * developer machine. The absolute numbers mean little; the COMPARISON means
 * everything, so run it before and after anything that touches the background,
 * a filter, or a full-screen animation.
 *
 *   node tests/perf.mjs            # the kid home screen, which has the most motion
 *   node tests/perf.mjs /kid/arcade
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const route = process.argv[2] || '/kid'
const THROTTLE = Number(process.env.CPU_THROTTLE || 6)

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

// A populated family, because an empty app has nothing to animate.
try {
  const dump = JSON.parse(readFileSync('/tmp/demo-state.json', 'utf8'))
  await ctx.addInitScript((d) => {
    for (const k in d) { try { localStorage.setItem(k, d[k]) } catch { /* private window */ } }
  }, dump)
} catch {
  console.log('  (no seeded family found — run seed-demo.mjs for a fuller measurement)')
}

const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)   // let the first paint and any entry animation settle

const stats = await page.evaluate(() => new Promise((resolve) => {
  const frames = []
  let last = performance.now()
  let n = 0
  function tick(now) {
    frames.push(now - last)
    last = now
    n += 1
    if (n < 180) { requestAnimationFrame(tick); return }
    const sorted = [...frames].sort((a, b) => a - b)
    resolve({
      median: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
      p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
      worst: +sorted[sorted.length - 1].toFixed(1),
      over32ms: frames.filter((f) => f > 32).length,
      frames: frames.length,
    })
  }
  requestAnimationFrame(tick)
}))

console.log(`\n  ${route}  (CPU throttled ${THROTTLE}×)`)
console.log(`  median frame   ${stats.median}ms`)
console.log(`  95th percentile ${stats.p95}ms`)
console.log(`  worst frame    ${stats.worst}ms`)
console.log(`  frames over 32ms  ${stats.over32ms} of ${stats.frames}`)
console.log('\n  Compare against the same run before your change. A median that')
console.log('  climbs is a regression however good the still frame looks.\n')

await browser.close()
