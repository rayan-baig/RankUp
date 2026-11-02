/**
 * The arcade's four standalone games, in the BUILT app.
 *
 * Every other browser suite drives the dev server, and the dev server has no
 * Content-Security-Policy. That is how all four games shipped broken: they
 * run in srcdoc frames, which live under the built page's policy, and that
 * policy allowed no inline script — so in production the browser refused
 * every game and the bridge that reports its score, and a child got a black
 * rectangle, while every test passed. Only a production build can show
 * that, so that is what this runs:
 *
 *   - builds the app into a scratch folder (with whatever .env the real
 *     build would use) and serves it with `vite preview`;
 *   - opens each game in the look-around family, which needs no backend,
 *     and checks the game said 'rankup:ready', drew a screen, that no
 *     Content-Security-Policy violation happened anywhere on the page or in
 *     the game, and that the frame is still sandboxed with no origin of its
 *     own, so no way into the app's storage;
 *   - ends a round in each and checks the score crossed back to the app;
 *   - then stops the server and opens a game again, so the service worker
 *     really does keep them for offline.
 *
 *   npm run test:built
 *   BUILT_DIR=dist npm run test:built     # serve an existing build instead
 *
 * Tennis Tour imports Three.js from a CDN. Where the CDN cannot be reached
 * the import fails as a network error and the game draws its flat court;
 * that is fine. Being refused by the policy is not, and is what is checked.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PORT = Number(process.env.BUILT_PORT || 4179)
const BASE = `http://localhost:${PORT}`
process.env.BASE_URL = BASE
const { launch, reporter, finish, SHOT_DIR } = await import('./helpers.mjs')
const { fails, pass, fail } = reporter()

// --- the build ---------------------------------------------------------------
let dir = process.env.BUILT_DIR ? resolve(process.env.BUILT_DIR) : null
const scratch = dir ? null : mkdtempSync(join(tmpdir(), 'rankup-built-'))
if (!dir) {
  dir = scratch
  console.log(`· building into ${dir}`)
  const built = spawnSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'], { stdio: 'inherit' })
  if (built.status !== 0) { console.error('the build failed'); process.exit(1) }
}
if (!existsSync(join(dir, 'index.html'))) { console.error(`no index.html in ${dir}`); process.exit(1) }

// --- the host ----------------------------------------------------------------
let server = null
const serve = async () => {
  server = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let log = ''
  server.stdout.on('data', (d) => { log += d })
  server.stderr.on('data', (d) => { log += d })
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(BASE)).ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.error('the preview server never came up:\n', log.slice(-2000))
  stop()
  process.exit(1)
}
const stop = () => {
  if (!server) return
  try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ }
  server = null
}
const cleanUp = () => { stop(); if (scratch) rmSync(scratch, { recursive: true, force: true }) }
process.on('exit', cleanUp)

console.log(`· serving it on ${BASE}`)
await serve()

// --- the browser -------------------------------------------------------------
const { browser, page, errors } = await launch()
const context = page.context()

// Every policy violation in every frame, and every message a frame posts to
// the app — recorded by the browser, not by the page under test, so a
// refused script cannot hide its own refusal.
const violations = []
page.on('console', (m) => {
  if (/Content Security Policy|CSP-VIOLATION/i.test(m.text())) violations.push(m.text().slice(0, 240))
})
await context.exposeBinding('__rankupSaw', ({ frame }, kind, detail) => {
  if (kind === 'violation') violations.push(`${frame.url().slice(0, 80)}: ${detail}`)
})
await context.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__rankupSaw?.('violation', `${e.violatedDirective} refused ${e.blockedURI || 'inline'} (${e.sourceFile || ''}:${e.lineNumber || ''})`)
  })
  if (window !== window.top) return
  window.__frameMessages = []
  window.addEventListener('message', (e) => {
    const from = [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === e.source)
    if (from && e.data && typeof e.data.kind === 'string') window.__frameMessages.push({ kind: e.data.kind, title: from.title })
  })
})

const text = () => page.evaluate(() => document.body.innerText)
const ended = () => page.evaluate(() => /\d+ points/.test(document.body.innerText))
const saw = (kind, title) => page.evaluate(([k, t]) => window.__frameMessages.some((m) => m.kind === k && m.title === t), [kind, title])

// A reload, because a game in progress is not left by changing the address.
const openArcade = async () => {
  await page.evaluate(() => { window.location.hash = '/kid/arcade' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}
const openTile = (name) => page.getByRole('button', { name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click()

const waitFor = async (check, ms = 10000) => {
  for (let waited = 0; waited < ms; waited += 250) {
    if (await check()) return true
    await page.waitForTimeout(250)
  }
  return false
}

const GAMES = [
  {
    label: 'Sweet Swap', title: 'Sweet Swap', open: () => openTile('Sweet Swap'),
    end: () => {
      document.getElementById('score').textContent = '4,200'
      document.getElementById('modalTitle').textContent = 'OUT OF MOVES!'
      document.getElementById('message').classList.add('show')
    },
  },
  {
    label: 'Trackstar', title: 'Trackstar', open: () => openTile('Trackstar'),
    end: () => {
      document.getElementById('score').textContent = '320'
      document.getElementById('panel').innerHTML = '<h1>RUN OVER</h1>'
      document.getElementById('overlay').classList.remove('hidden')
    },
  },
  {
    label: 'Tennis Tour', title: 'Tennis Tour', open: () => openTile('Tennis Tour'),
    end: () => {
      document.getElementById('hudScore').textContent = '2–0 SETS  |  6–3 GAMES'
      document.getElementById('matchState').innerHTML = '<b>MATCH WON!</b>'
    },
  },
  {
    label: 'Football (SportsMania)', title: 'Football match',
    open: async () => {
      await openTile('SportsMania')
      await page.waitForTimeout(600)
      // "American Football" matches too, so anchor the name.
      await page.getByRole('button', { name: /^Football A full ninety/ }).click()
    },
    end: () => {
      window.blueScore = 3
      window.redScore = 1
      document.getElementById('end').classList.remove('hidden')
    },
  },
]

/** The game's frame: its element and its document. */
const gameFrame = async (title) => {
  const handle = await page.locator(`iframe[title="${title}"]`).elementHandle({ timeout: 8000 }).catch(() => null)
  return handle ? { handle, frame: await handle.contentFrame() } : null
}

const ready = async (game) => {
  const ok = await waitFor(() => saw('rankup:ready', game.title))
  ok ? pass("it said 'rankup:ready'") : fail(`${game.label} ready`, 'no rankup:ready from its frame')
  return ok
}

console.log('\n=== The built page ===')
await page.goto(BASE, { waitUntil: 'networkidle' })
const policy = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '')
;/script-src 'self'/.test(policy)
  ? pass('it carries the production policy, so this is the real thing')
  : fail('production policy present', policy || 'no policy on the page')
await page.getByRole('button', { name: /Have a look around/ }).click()
await page.waitForTimeout(1500)

const play = async (game) => {
  await openArcade()
  await game.open()
  const found = await gameFrame(game.title)
  if (!found) { fail(`${game.label} embeds`, 'no frame on the screen'); return }
  const { handle, frame } = found

  const sandbox = await handle.getAttribute('sandbox')
  sandbox === 'allow-scripts'
    ? pass('its frame is sandboxed to scripts only')
    : fail(`${game.label} sandbox`, String(sandbox))

  if (!(await ready(game))) return
  await page.waitForTimeout(1500)

  const inside = await frame.evaluate(() => {
    let storage = 'blocked'
    try { void window.localStorage.length; storage = 'reachable' } catch { /* the point */ }
    return {
      origin: self.origin,
      storage,
      nodes: document.body ? document.body.querySelectorAll('*').length : 0,
    }
  }).catch((e) => ({ error: String(e).slice(0, 120) }))
  if (inside.error) { fail(`${game.label} frame answers`, inside.error); return }
  inside.origin === 'null' && inside.storage === 'blocked'
    ? pass("it has no origin and cannot reach the app's storage")
    : fail(`${game.label} isolated`, JSON.stringify(inside))
  inside.nodes > 10
    ? pass(`it drew a screen (${inside.nodes} elements)`)
    : fail(`${game.label} renders`, `only ${inside.nodes} elements`)

  await frame.evaluate(game.end).catch((e) => fail(`${game.label} end hook`, String(e).slice(0, 120)))
  ;(await waitFor(ended, 5000))
    ? pass(`its score crossed back to the app (${(await text()).match(/(\d+) points/)?.[1]} points)`)
    : fail(`${game.label} score`, (await text()).slice(0, 160))
}

for (const game of GAMES) {
  console.log(`\n=== ${game.label} ===`)
  const before = violations.length
  await play(game).catch((e) => fail(`${game.label} opens`, String(e).slice(0, 160)))
  const mine = violations.slice(before)
  mine.length === 0
    ? pass('and nothing was refused by a Content-Security-Policy')
    : fail(`${game.label} CSP`, mine.slice(0, 3).join(' | '))
}

console.log('\n=== Offline ===')
// The worker is told to keep the whole app once the first screen is quiet;
// opening the arcade's games online has kept their pieces already.
;(await waitFor(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), 15000))
  ? pass('the service worker is looking after the page')
  : fail('service worker in charge', 'no controller')

stop()
await page.waitForTimeout(500)
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(1500)
const offline = GAMES[0]
await page.evaluate(() => { window.__frameMessages = [] })
await openArcade()
await offline.open().catch(() => {})
;(await waitFor(() => saw('rankup:ready', offline.title)))
  ? pass(`with the server gone, ${offline.label} still opens and says 'rankup:ready'`)
  : fail('a game opens offline', (await text()).slice(0, 160))
await page.screenshot({ path: `${SHOT_DIR}/built-offline-game.png` }).catch(() => {})

console.log(`\nPolicy violations seen in all: ${violations.length}`)
violations.slice(0, 6).forEach((v) => console.log('  ', v))
cleanUp()
finish(errors, fails, browser)
