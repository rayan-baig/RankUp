/**
 * Records the app as vertical 9:16 clips you can post straight to TikTok,
 * Reels, Shorts, Facebook or Snapchat.
 *
 * It drives the same two-device flow as preview.mjs — a parent's phone and a
 * kid's — while Playwright records both screens. Along the way it drops a
 * timestamp at every scene boundary, and afterwards ffmpeg slices the raw
 * recordings at those timestamps, drops each phone screen onto a 1080x1920
 * canvas and burns in a caption.
 *
 * Needs the same local backend as preview.mjs:
 *
 *   supabase/test/run.sh                   # apply the schema
 *   node supabase/test/mock-server.mjs     # the API, backed by Postgres
 *   npm run dev                            # with .env.local pointing at it
 *
 *   node reels.mjs                         # writes to marketing/clips/
 */
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
const OUT = process.env.REEL_DIR || 'marketing/clips'
const RAW = path.join(OUT, 'raw')
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
const BASE = process.env.BASE_URL || 'http://localhost:5173'

await rm(RAW, { recursive: true, force: true })
await mkdir(RAW, { recursive: true })

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  permissions: ['camera', 'notifications'],
  recordVideo: { dir: RAW, size: { width: 390, height: 844 } },
})

// A page's recording starts the moment the page exists, so every mark is
// measured from that instant — that is what makes the ffmpeg slices land.
const t0 = new Map()
const marks = []
const newPage = async (tag) => {
  const p = await ctx.newPage()
  t0.set(tag, Date.now())
  p.__tag = tag
  return p
}
const mark = (page, name) => {
  marks.push({ tag: page.__tag, name, at: (Date.now() - t0.get(page.__tag)) / 1000 })
  console.log(`  mark ${page.__tag}/${name} @ ${marks.at(-1).at.toFixed(2)}s`)
}
/** Scrolls like a thumb rather than teleporting, because a jump-cut looks broken on video. */
const glide = async (page, to, ms = 700) => {
  await page.evaluate(([y, d]) => new Promise((res) => {
    const from = window.scrollY; const start = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - start) / d)
      window.scrollTo(0, from + (y - from) * (1 - (1 - k) ** 3))
      k < 1 ? requestAnimationFrame(step) : res()
    }
    requestAnimationFrame(step)
  }), [to, ms])
  await page.waitForTimeout(200)
}

const parent = await newPage('parent')
const kid = await newPage('kid')
const errs = []
for (const p of [parent, kid]) p.on('pageerror', (e) => errs.push(`${p.__tag}: ${e.message}`))

const stamp = Date.now()
console.log('setting up the family...')
await parent.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await parent.waitForTimeout(700)
await parent.getByRole('button', { name: /I'm a parent/ }).click()
await parent.waitForTimeout(500)
await parent.locator('input[type=email]').fill(`reel${stamp}@example.com`)
await parent.locator('input[type=password]').fill('correct-horse-battery')
await parent.getByRole('button', { name: 'Create account' }).click()
await parent.waitForTimeout(1600)
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.waitForTimeout(400)
await parent.locator('input').nth(0).fill('Sam')
await parent.locator('input').nth(1).fill('The Riveras')
await parent.locator('input').nth(2).fill('1234')
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.waitForTimeout(1600)
await parent.evaluate(() => window.scrollTo(0, 99999))
await parent.locator('input[type=checkbox]').check()
await parent.locator('input[placeholder*="Samira"]').fill('Sam Rivera')
await parent.getByRole('button', { name: /I agree/ }).click()
await parent.waitForTimeout(1800)
await parent.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await parent.getByRole('button', { name: 'Continue' }).click()
await parent.waitForTimeout(600)
await parent.getByRole('button', { name: /Sugar Rush/ }).first().click()
await parent.waitForTimeout(500)
await parent.getByRole('button', { name: 'Start playing' }).click()
await parent.waitForTimeout(2500)

console.log('assigning quests...')
await parent.evaluate(() => { window.location.hash = '/parent/assign' })
await parent.waitForTimeout(900)
await parent.getByRole('tab', { name: 'Quest packs' }).click()
await parent.waitForTimeout(400)
mark(parent, 'assign.in')
await glide(parent, 420)
await parent.waitForTimeout(900)
await parent.getByRole('button', { name: /Add all 7 to Ava/ }).click()
await parent.waitForTimeout(2500)
mark(parent, 'assign.out')

console.log('pairing the kid device...')
await kid.goto(`${BASE}/?device=kid`, { waitUntil: 'networkidle' })
await kid.waitForTimeout(700)
await kid.getByRole('button', { name: /I'm a kid/ }).click()
await kid.waitForTimeout(500)
await kid.locator('input[placeholder="e.g. Ava"]').fill('Ava')
await kid.getByRole('button', { name: 'Continue' }).click()
await kid.waitForTimeout(500)
await kid.getByRole('button', { name: /Sugar Rush/ }).first().click()
await kid.waitForTimeout(400)
await kid.getByRole('button', { name: 'Get my code' }).click()
await kid.waitForTimeout(2200)
const code = await kid.evaluate(() => JSON.parse(localStorage.getItem('rankup.state.v1.kid'))?.pendingPairing?.code)
if (!code) { console.error('no pairing code — is the mock server up?'); await b.close(); process.exit(1) }
await parent.evaluate(() => { window.location.hash = '/parent/pair' })
await parent.waitForTimeout(900)
await parent.locator('input[inputmode=numeric]').fill(code)
await parent.waitForTimeout(2500)
await kid.waitForTimeout(4500)

console.log('CLIP: the kid does a chore...')
await kid.bringToFront()
await kid.evaluate(() => { window.location.hash = '/kid/quests' })
await kid.waitForTimeout(1400)
mark(kid, 'proof.in')
await glide(kid, 300)
await kid.waitForTimeout(600)
await glide(kid, 0)
await kid.locator('button.card').first().click()
await kid.waitForTimeout(1400)
await kid.getByRole('button', { name: /Take photo proof/ }).click()
await kid.waitForTimeout(2600)
await kid.getByRole('button', { name: 'Take photo' }).click()
await kid.waitForTimeout(1200)
await kid.getByRole('button', { name: 'Use this photo' }).click()
await kid.waitForTimeout(4000)
mark(kid, 'proof.check')
await kid.waitForTimeout(1200)
await kid.getByRole('button', { name: 'Send to parent' }).click()
await kid.waitForTimeout(2500)
mark(kid, 'proof.out')

console.log('CLIP: the parent reviews...')
await parent.bringToFront()
await parent.evaluate(() => { window.location.hash = '/parent/approvals' })
await parent.waitForTimeout(1000)
await parent.evaluate(() => window.dispatchEvent(new Event('focus')))
await parent.waitForTimeout(6000)
mark(parent, 'review.in')
await parent.waitForTimeout(1800)
await glide(parent, 260)
await parent.waitForTimeout(1200)
const canApprove = await parent.getByRole('button', { name: 'Approve' }).count()
if (canApprove) {
  await parent.getByRole('button', { name: 'Approve' }).first().click()
  await parent.waitForTimeout(2600)
}
mark(parent, 'review.out')

console.log('CLIP: the payout...')
await kid.bringToFront()
await kid.evaluate(() => { window.location.hash = '/kid' })
await kid.waitForTimeout(7000)
mark(kid, 'payout.in')
await glide(kid, 320)
await kid.waitForTimeout(1400)
await glide(kid, 0, 500)
await kid.waitForTimeout(1200)
mark(kid, 'payout.out')

console.log('CLIP: the arcade...')
await kid.evaluate(() => { window.location.hash = '/kid/arcade' })
await kid.waitForTimeout(1600)
mark(kid, 'arcade.in')
await kid.waitForTimeout(1600)
const playable = kid.getByRole('button', { name: /Play/ })
if (await playable.count()) {
  await playable.first().click()
  await kid.waitForTimeout(1500)
  // Tap around the board so the clip shows a game actually being played.
  for (let i = 0; i < 10; i += 1) {
    const cells = kid.locator('button:visible')
    const n = await cells.count()
    if (!n) break
    await cells.nth(Math.min(n - 1, 2 + (i % 8))).click({ timeout: 1500 }).catch(() => {})
    await kid.waitForTimeout(420)
  }
  await kid.waitForTimeout(2000)
}
mark(kid, 'arcade.out')

console.log('\nJS errors:', errs.length)
errs.slice(0, 5).forEach((e) => console.log('  ', e))

const videos = new Map()
for (const p of [parent, kid]) videos.set(p.__tag, p.video())
await ctx.close()
const paths = new Map()
for (const [tag, v] of videos) paths.set(tag, await v.path())
await b.close()
await writeFile(path.join(RAW, 'marks.json'), JSON.stringify(marks, null, 2))
await writeFile(path.join(RAW, 'sources.json'), JSON.stringify(Object.fromEntries(paths), null, 2))
console.log('\nraw recordings:', [...paths.values()].map((p) => path.basename(p)).join(', '))

// The render is a separate step so you can re-cut captions and framing without
// sitting through the whole two-device run again: node marketing/render.mjs
await run('node', ['marketing/render.mjs'], { cwd: process.cwd() }).then(
  (r) => process.stdout.write(r.stdout),
  (e) => { process.stdout.write(e.stdout || ''); console.error(e.stderr || e.message); process.exitCode = 1 },
)
