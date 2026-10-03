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
/**
 * Build the shareable preview of RankUp.
 *
 * The output is a folder — index.html beside its assets — that can be served
 * anywhere and shows the whole product to somebody who has not signed up.
 *
 *   node build-preview.mjs            # opens on the real front door
 *   node build-preview.mjs --seeded   # opens straight into a family
 *
 * The default changed once the app grew its own look-around family. It used
 * to have to be seeded from outside, because an app that opened on a setup
 * form showed a stranger nothing. Now the front door offers the family
 * itself, so the honest preview is simply the app: the visitor sees the first
 * screen a real person sees, taps the same button, and lands in the same
 * place. --seeded keeps the old behaviour for a screenshot that needs to skip
 * the door.
 *
 * Two things here were arrived at the hard way and are worth keeping:
 *
 * It builds with the backend switched OFF. The preview runs with no database
 * behind it, so the app's no-backend mode IS the preview. Left on, every
 * screen would sit spinning.
 *
 * And when it IS seeded, the seed is written by an inline script placed
 * BEFORE the module script. The app debounces its own save by 250ms, so a
 * seed written after the bundle boots is overwritten by the empty state the
 * app just made — and it opens on setup, the one screen the seed exists to
 * skip.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const SEEDED = process.argv.includes('--seeded')

const OUT_DIR = 'preview'
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

// --- 2. a family to look at, but only when one is asked for ----------------
const waitFor = async (url, tries = 60) => {
  for (let i = 0; i < tries; i += 1) {
    try { await fetch(url); return true } catch { await new Promise((r) => setTimeout(r, 500)) }
  }
  return false
}

let pageSize = 0
let server = null
try {
  if (SEEDED) {
    /*
     * Only a seeded build needs a running copy to drive. The ordinary one is
     * just the app, and starting a server in order not to use it is a slow
     * way of doing nothing.
     */
    console.log(`· serving ${DIST} on :${PORT} to seed it`)
    server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'],
      { stdio: 'ignore', detached: true })
    if (!(await waitFor(`http://localhost:${PORT}/`))) {
      console.error('the preview server never came up'); process.exit(1)
    }
    console.log('· driving the real screens to build a family')
    run('node', ['seed-demo.mjs'])
  }

  // --- 3. assemble it ---------------------------------------------------------
  // The built app, plus the seed, published as it is served: one index.html
  // beside its assets. Inlining the 460 kB bundle into the page worked, but it
  // also meant the icons and the manifest had to be thrown away, so the tab had
  // no icon and it could not be added to a home screen.
  rmSync(OUT_DIR, { recursive: true, force: true })
  cpSync(DIST, OUT_DIR, { recursive: true })

  const index = readFileSync(`${DIST}/index.html`, 'utf8')

  // Served from the artifact's own folder, so every path is relative to it.
  const rooted = index.replace(/(src|href)="\//g, (_, attr) => `${attr}="`)

  const MODULE_TAG = /\s*<script type="module"[^>]*><\/script>/
  const tag = rooted.match(MODULE_TAG)
  if (!tag) { console.error('no module script in the built index.html'); process.exit(1) }

  const seed = SEEDED ? JSON.parse(readFileSync('/tmp/demo-state.json', 'utf8')) : null
  const seedScript = !SEEDED ? '' : `
    <script>
      /*
       * The family, written before the app boots.
       *
       * The app saves its own state on a 250ms debounce, so a seed written
       * after the bundle starts is overwritten by the empty state the app has
       * just made — and the demo opens on the setup screen, the one screen it
       * exists to skip. A plain script before the module tag runs first.
       *
       * It only ever seeds an untouched browser. Once someone has used this,
       * their own family is the one that matters.
       */
      (function () {
        try {
          if (localStorage.getItem('rankup.state.v1')) return;
          var seed = ${JSON.stringify(seed).replace(/</g, '\\u003c')};
          for (var k in seed) localStorage.setItem(k, seed[k]);
        } catch (e) { /* storage off in a private window: the app runs, empty */ }
      })();
    </script>`

  /*
   * A FUNCTION, never a string.
   *
   * A replacement string treats $&, $` and $' as references to the match, and
   * 76 kB of seeded state contains those sequences by chance — which silently
   * splices fragments of the page into the middle of the JSON.
   */
  const html = seedScript
    ? rooted.replace(MODULE_TAG, () => `${seedScript}\n${tag[0].trim()}`)
    : rooted

  writeFileSync(`${OUT_DIR}/index.html`, html)
  pageSize = Buffer.byteLength(html)
} finally {
  if (server) { try { process.kill(-server.pid) } catch { /* already gone */ } }
}

const files = []
const walk = (dir, prefix = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) walk(`${dir}/${entry.name}`, rel)
    else if (rel !== 'index.html') files.push(rel)
  }
}
walk(OUT_DIR)
console.log(`\n  ${OUT_DIR}/index.html — ${Math.round(pageSize / 1024)} kB${SEEDED ? ' (seeded)' : ' (opens on the front door)'}`)
console.log(`  ${files.length} files beside it: ${files.join(' ')}`)

