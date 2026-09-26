/**
 * Build the shareable single-file demo of RankUp.
 *
 * The output is one .html file containing the whole app, with a believable
 * family already in it — the thing you send someone who asks "what is it,
 * then?" and who is not going to sign up to find out.
 *
 *   node build-preview.mjs          # writes preview/rankup-demo.html
 *
 * Three things here are deliberate and were each arrived at the hard way:
 *
 * 1. It builds with the backend switched OFF. The demo has to run from a file
 *    on a stranger's machine with no database behind it, so the app's
 *    no-backend mode IS the demo. Left on, every screen would sit spinning.
 *
 * 2. The seed is written by an inline <script> placed BEFORE the module
 *    script. The app debounces its own save by 250ms, so a seed written after
 *    the bundle boots is overwritten by the empty state the app just made, and
 *    the demo opens on the onboarding screen — which is exactly the thing the
 *    demo exists to skip past.
 *
 * 3. The state is produced by driving the real screens (seed-demo.mjs), not by
 *    hand. Hand-written state means guessing at shapes the reducer owns, and
 *    one wrong field puts the whole demo inside a crash boundary.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const OUT_DIR = 'preview'
const OUT = `${OUT_DIR}/rankup-demo.html`
const PORT = 5174
const DIST = 'dist-demo'

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) { console.error(`\n${cmd} ${args.join(' ')} failed`); process.exit(1) }
}

// --- 1. build, with nothing behind it ---------------------------------------
console.log('· building the app in its no-backend mode')
run('npx', ['vite', 'build', '--outDir', DIST], {
  env: {
    ...process.env,
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
    VITE_GUILDS_ENABLED: '',
    // The demo is a demo. Nothing in it should try to take a card.
    VITE_STRIPE_PUBLISHABLE_KEY: '',
  },
})

// --- 2. drive it, and keep what it saved ------------------------------------
console.log(`· serving ${DIST} on :${PORT} to seed it`)
const server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', detached: true })

const waitFor = async (url, tries = 60) => {
  for (let i = 0; i < tries; i += 1) {
    try { await fetch(url); return true } catch { await new Promise((r) => setTimeout(r, 500)) }
  }
  return false
}

let html
try {
  if (!(await waitFor(`http://localhost:${PORT}/`))) {
    console.error('the preview server never came up'); process.exit(1)
  }
  console.log('· driving the real screens to build a family')
  run('node', ['seed-demo.mjs'])

  // --- 3. fold it all into one file -----------------------------------------
  const index = readFileSync(`${DIST}/index.html`, 'utf8')
  const js = index.match(/src="([^"]*\.js)"/)?.[1]
  const css = index.match(/href="([^"]*\.css)"/)?.[1]
  if (!js) { console.error('no bundle in the built index.html'); process.exit(1) }

  const bundle = readFileSync(`${DIST}${js}`, 'utf8')
  const styles = css ? readFileSync(`${DIST}${css}`, 'utf8') : ''
  const seed = JSON.parse(readFileSync('/tmp/demo-state.json', 'utf8'))

  /*
   * Every replacement below passes a FUNCTION, never a string.
   *
   * A replacement string treats $&, $` and $' as references to the match, and
   * a 468 kB minified bundle contains those sequences by chance — which
   * silently spliced fragments of the page into the middle of the JavaScript
   * and produced "missing ) after argument list" on a file that looked
   * perfectly fine in an editor.
   */
  const inline = (str) => () => str

  html = index
    // The icons, manifest and service worker are served from paths that will
    // not exist next to a file someone has downloaded. Drop them rather than
    // ship 404s.
    .replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, '')
    .replace(/\s*<link[^>]*href="[^"]*\.css"[^>]*>/,
      inline(`<style>${styles}</style>`))
    .replace(/\s*<script type="module"[^>]*><\/script>/,
      inline(`
    <script>
      /* The family, written before the app boots. See build-preview.mjs. */
      try {
        var seed = ${JSON.stringify(seed).replace(/</g, '\\u003c')};
        for (var k in seed) localStorage.setItem(k, seed[k]);
      } catch (e) { /* storage off in a private window: they get the app, empty */ }
    </script>
    <script type="module">${bundle.replace(/<\/script/gi, '<\\/script')}</script>`))

  // The service worker has nothing to serve from a file:// page and only ever
  // registers a failure in the console.
  html = html.replace(/<script>[^<]*serviceWorker[^<]*<\/script>/g, '')
} finally {
  try { process.kill(-server.pid) } catch { /* already gone */ }
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR)
writeFileSync(OUT, html)

const kb = Math.round(Buffer.byteLength(html) / 1024)
console.log(`\n  ${OUT} — ${kb} kB`)
if (kb > 15000) console.log('  WARNING: over the 16 MB an artifact will take')
