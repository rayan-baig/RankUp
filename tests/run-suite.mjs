/**
 * Runs one test suite: every file in it, one after another.
 *
 *   node tests/run-suite.mjs smoke                 the whole suite
 *   node tests/run-suite.mjs smoke --shard 2/3     a third of it (CI runs three at once)
 *   node tests/run-suite.mjs smoke arcade2 layout  only these files
 *   node tests/run-suite.mjs --list                every suite and its files
 *   node tests/run-suite.mjs smoke --shard 1/3 --dry  which files, without running them
 *
 * The suites used to be `node a.mjs && node b.mjs && ...` in package.json.
 * When one file failed, npm printed the whole forty-file command back, and
 * finding which file had failed meant scrolling up through twenty minutes of
 * output. Now every file runs even after one fails, and the last line says
 * which suite failed and which files:
 *
 *   SUITE FAILED: smoke (shard 2/3) — tests/arcade3.mjs, tests/layout.mjs
 *
 * On GitHub that line is also an error annotation, so it is on the run's
 * summary page without opening the log.
 *
 * Anything a test file started and left running is stopped when the file
 * ends. builtgames.mjs and plainsetup.mjs start servers of their own (a
 * preview server, a second dev server), detached so they can be killed as a
 * group; a file that crashed, or was cut off, before stopping its server left
 * it holding the port, and the next run of that file failed for that reason
 * alone. Every process a test starts carries a marker in its environment, and
 * whatever still carries it when the file ends is killed.
 */
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

/*
 * Each suite, in the order its files run. `env` is set for that file alone.
 * `weight` is about how many seconds the file took in CI, used only to split
 * a suite into shards of about the same length; a file with none counts as 30.
 */
const SUITES = {
  // Reads files; needs nothing running. Seconds.
  static: [
    { file: 'config.mjs' },
    { file: 'wiring.mjs' },
    { file: 'isolation.mjs' },
    { file: 'release.mjs' },
    { file: 'sharecard.mjs' },
  ],
  // The app in a real browser, against the dev server on :5173 and the mock
  // API on :54321 (supabase/test/up.sh starts both).
  smoke: [
    { file: 'mappers.mjs', weight: 1 },
    { file: 'badges.mjs', weight: 1 },
    { file: 'trialbanner.mjs', weight: 1 },
    { file: 'cursor.mjs', weight: 1 },
    { file: 'outbox.mjs', weight: 1 },
    { file: 'offline.mjs', env: { TZ: 'America/New_York' }, weight: 1 },
    { file: 'syncfixes.mjs', weight: 1 },
    { file: 'notices.mjs', weight: 1 },
    { file: 'screens.mjs', weight: 40 },
    { file: 'lookaround.mjs', weight: 27 },
    { file: 'motion.mjs', weight: 14 },
    { file: 'themes.mjs', weight: 27 },
    { file: 'integrity.mjs', weight: 30 },
    { file: 'flows.mjs', weight: 34 },
    { file: 'rewards.mjs', weight: 28 },
    { file: 'pairing.mjs', weight: 58 },
    { file: 'firstten.mjs', weight: 45 },
    { file: 'notifications.mjs', weight: 19 },
    { file: 'plans.mjs', weight: 25 },
    { file: 'arcade.mjs', weight: 86 },
    { file: 'arcade2.mjs', weight: 68 },
    { file: 'arcade3.mjs', weight: 132 },
    { file: 'arcade4.mjs', weight: 128 },
    { file: 'embedded.mjs', weight: 50 },
    { file: 'cardgames.mjs', weight: 85 },
    { file: 'crash.mjs', weight: 16 },
    { file: 'erase.mjs', weight: 19 },
    { file: 'oldphone.mjs', weight: 3 },
    { file: 'secretworlds.mjs', weight: 143 },
    { file: 'plainsetup.mjs', weight: 25 },
    { file: 'layout.mjs', weight: 150 },
  ],
  // Two or more browsers against the mock API and a real Postgres.
  sync: [
    { file: 'sync.mjs', weight: 119 },
    { file: 'devicewipe.mjs', weight: 46 },
    { file: 'coparents.mjs', weight: 32 },
    { file: 'guilds.mjs', weight: 69 },
    { file: 'consent.mjs', weight: 10 },
  ],
  // The rules, in Node, against the app's own code and a real Postgres.
  awards: [
    { file: 'guarantees.mjs' },
    { file: 'familyday.mjs' },
    { file: 'activity.mjs' },
    { file: 'familygoal.mjs' },
    { file: 'preview.mjs' },
    { file: 'reminders.mjs', env: { TZ: 'America/Los_Angeles' } },
    { file: 'awards.mjs' },
    { file: 'recurrence.mjs' },
    { file: 'trials.mjs' },
    { file: 'merge.mjs' },
    { file: 'demotokens.mjs' },
    { file: 'gameids.mjs' },
    { file: 'packs.mjs' },
    { file: 'forms.mjs' },
    { file: 'sweets.mjs' },
    { file: 'cards.mjs' },
    { file: 'money.mjs' },
    { file: 'rewardraces.mjs' },
    { file: 'charity.mjs' },
    { file: 'dragon.mjs' },
    { file: 'battles.mjs' },
    { file: 'schools.mjs' },
    { file: 'arcadecap.mjs' },
    { file: 'crashreport.mjs' },
  ],
  // The server functions under workerd on :8788 (supabase/test/up.sh --cf).
  api: [
    { file: 'api.mjs' },
    { file: 'push.mjs' },
  ],
  // A production build: no secrets in it, the policy, the framed games.
  built: [
    { file: 'bundle.mjs' },
    { file: 'builtgames.mjs' },
  ],
  // By hand, before and after a change to drawing or animation. Not in CI: the
  // numbers depend on the machine, so only a before-and-after on one machine
  // means anything.
  perf: [
    { file: 'perf.mjs' },
    { file: 'battleperf.mjs' },
  ],
}

const HERE = new URL('.', import.meta.url)
const args = process.argv.slice(2)

if (args.includes('--list')) {
  for (const [name, files] of Object.entries(SUITES)) console.log(`${name}: ${files.map((f) => f.file).join(' ')}`)
  process.exit(0)
}

// Every test file belongs to exactly one suite, so none is written and never run.
const helpers = new Set(['helpers.mjs', 'run-suite.mjs'])
const listed = new Set(Object.values(SUITES).flat().map((f) => f.file))
const orphans = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !helpers.has(f) && !listed.has(f))
if (orphans.length) {
  console.error(`SUITE FAILED: tests/${orphans.join(', tests/')} ${orphans.length === 1 ? 'is' : 'are'} in no suite — add to SUITES in tests/run-suite.mjs`)
  process.exit(1)
}

const suite = args[0]
if (!SUITES[suite]) {
  console.error(`Which suite? One of: ${Object.keys(SUITES).join(', ')}  (or --list)`)
  process.exit(2)
}

let files = SUITES[suite]
let label = suite
const shardArg = args.find((a) => a.startsWith('--shard'))
if (shardArg) {
  const spec = shardArg.includes('=') ? shardArg.split('=')[1] : args[args.indexOf(shardArg) + 1]
  const [index, count] = String(spec).split('/').map(Number)
  if (!(count >= 1 && index >= 1 && index <= count)) { console.error(`--shard wants i/n, got ${spec}`); process.exit(2) }
  // Longest first, each to the lightest shard so far; then back in suite order.
  const loads = Array.from({ length: count }, () => ({ total: 0, files: new Set() }))
  for (const f of [...files].sort((a, b) => (b.weight ?? 30) - (a.weight ?? 30))) {
    const lightest = loads.reduce((min, l) => (l.total < min.total ? l : min))
    lightest.total += f.weight ?? 30
    lightest.files.add(f.file)
  }
  files = files.filter((f) => loads[index - 1].files.has(f.file))
  label = `${suite} (shard ${index}/${count})`
}
const shardValue = shardArg && !shardArg.includes('=') ? args[args.indexOf(shardArg) + 1] : null
const only = args.slice(1).filter((a) => !a.startsWith('--') && a !== shardValue)
if (only.length) files = files.filter((f) => only.some((o) => f.file === o || f.file === `${o}.mjs`))

/** Processes whose environment carries this run's marker: started by the test. */
function marked(marker) {
  const found = []
  try {
    for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
      try {
        if (readFileSync(`/proc/${pid}/environ`, 'latin1').includes(`RANKUP_TEST_RUN=${marker}\0`)) found.push(Number(pid))
      } catch { /* gone, or not ours */ }
    }
  } catch {
    // No /proc (a Mac): ps can show each process's environment instead.
    try {
      const out = execFileSync('ps', ['eww', '-ax', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      for (const line of out.split('\n')) {
        if (line.includes(`RANKUP_TEST_RUN=${marker}`)) found.push(Number(line.trim().split(/\s+/)[0]))
      }
    } catch { /* nothing more to try */ }
  }
  return found.filter((pid) => pid !== process.pid)
}

function stopLeftovers(marker, file) {
  const pids = marked(marker)
  if (!pids.length) return 0
  for (const pid of pids) { try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ } }
  console.log(`  (stopped ${pids.length} process${pids.length === 1 ? '' : 'es'} ${file} left running)`)
  return pids.length
}

// --dry: say what would run, and run nothing.
if (args.includes('--dry')) {
  const secs = files.reduce((n, f) => n + (f.weight ?? 30), 0)
  console.log(`${label}: ${files.map((f) => f.file).join(' ')}  (about ${Math.round(secs / 60)} min in CI)`)
  process.exit(0)
}

let current = null
const stopAll = (signal) => {
  if (current) {
    try { process.kill(-current.child.pid, 'SIGKILL') } catch { /* gone */ }
    stopLeftovers(current.marker, current.file)
  }
  console.error(`\nSUITE STOPPED: ${label} — ${signal} while running tests/${current?.file || '?'}`)
  process.exit(130)
}
process.on('SIGINT', () => stopAll('SIGINT'))
process.on('SIGTERM', () => stopAll('SIGTERM'))

const mmss = (ms) => `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`
const results = []
const started = Date.now()
console.log(`\n### ${label}: ${files.length} file${files.length === 1 ? '' : 's'}`)

for (const { file, env } of files) {
  const marker = randomBytes(6).toString('hex')
  const t0 = Date.now()
  console.log(`\n### tests/${file}`)
  const child = spawn(process.execPath, [new URL(file, HERE).pathname], {
    stdio: 'inherit',
    env: { ...process.env, ...(env || {}), RANKUP_TEST_RUN: marker },
    // Its own process group, so the whole of it can be stopped at once.
    detached: true,
  })
  current = { child, marker, file }
  // eslint-disable-next-line no-await-in-loop
  const code = await new Promise((resolve) => {
    child.on('exit', (c, signal) => resolve(c ?? (signal ? 128 : 1)))
    child.on('error', () => resolve(1))
  })
  current = null
  try { process.kill(-child.pid, 'SIGKILL') } catch { /* the group has gone */ }
  stopLeftovers(marker, `tests/${file}`)
  const ms = Date.now() - t0
  results.push({ file, code, ms })
  console.log(`### tests/${file}: ${code === 0 ? 'passed' : `FAILED (exit ${code})`} in ${mmss(ms)}`)
}

const failed = results.filter((r) => r.code !== 0)
console.log(`\n### ${label}: ${results.length - failed.length} of ${results.length} files passed in ${mmss(Date.now() - started)}`)
for (const r of [...results].sort((a, b) => b.ms - a.ms).slice(0, 5)) console.log(`    ${mmss(r.ms)}  tests/${r.file}`)
if (failed.length) {
  const which = failed.map((r) => `tests/${r.file}`).join(', ')
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${label} suite failed::${which}`)
  console.log(`\nSUITE FAILED: ${label} — ${which}`)
  process.exit(1)
}
console.log(`\nSUITE PASSED: ${label}`)
