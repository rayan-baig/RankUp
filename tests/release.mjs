/**
 * The version: one number, written once, with a changelog entry.
 *
 * package.json holds the version. vite.config.js builds it into the app
 * (Settings → Help & about shows it) and api/health.js reads it for
 * /api/health. Nobody types it anywhere else, so the three cannot disagree;
 * this checks that is still how it is wired, and that CHANGELOG.md says what
 * the version is before anyone ships it.
 *
 *   node tests/release.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const version = pkg.version
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

console.log('\n=== package.json has a real version ===')
ok(`it is a plain x.y.z (${version})`, SEMVER.test(version), version)
ok('and not the 0.0.0 a new project starts with', version !== '0.0.0')
ok('package-lock.json says the same', lock.version === version && lock.packages?.['']?.version === version,
  `${lock.version} / ${lock.packages?.['']?.version}`)

console.log('\n=== CHANGELOG.md has an entry for it, newest first ===')
const changelog = readFileSync('CHANGELOG.md', 'utf8')
const entries = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})\s*$/gm)]
  .map((m) => ({ version: m[1], date: m[2], at: m.index }))
ok(`the entries were read (${entries.length})`, entries.length > 0)
ok(`there is an entry for ${version}`, entries.some((e) => e.version === version),
  `add "## ${version} — <date>" to CHANGELOG.md`)
ok('and it is the first one', entries[0]?.version === version, `first is ${entries[0]?.version}`)
const n = (v) => v.split('.').map(Number).reduce((a, x) => a * 1000 + x, 0)
ok('every entry is older than the one above it',
  entries.every((e, i) => i === 0 || (n(e.version) < n(entries[i - 1].version) && e.date <= entries[i - 1].date)),
  entries.map((e) => `${e.version} ${e.date}`).join(', '))
ok('no version is listed twice', new Set(entries.map((e) => e.version)).size === entries.length)
const top = entries[0] ? changelog.slice(entries[0].at, entries[1]?.at ?? undefined) : ''
ok('the newest entry says something', (top.match(/^- /gm) || []).length >= 1, top.slice(0, 80))

console.log('\n=== The version is built in, never typed ===')
const vite = readFileSync('vite.config.js', 'utf8')
ok('vite.config.js reads it from package.json',
  /readFileSync\(new URL\('\.\/package\.json', import\.meta\.url\), 'utf8'\)\)\.version/.test(vite))
ok('and defines __APP_VERSION__ from it', /define: \{ __APP_VERSION__: JSON\.stringify\(APP_VERSION\) \}/.test(vite))
const versionModule = readFileSync('src/lib/version.js', 'utf8')
ok('the app reads it through src/lib/version.js', /__APP_VERSION__/.test(versionModule))
const health = readFileSync('api/health.js', 'utf8')
ok('/api/health reads it from package.json', /import pkg from '\.\.\/package\.json' with \{ type: 'json' \}/.test(health)
  && /version: VERSION/.test(health))
const settings = readFileSync('src/screens/parent/ParentSettings.jsx', 'utf8')
ok('Settings shows it', /APP_VERSION/.test(settings) && /from '\.\.\/\.\.\/lib\/version\.js'/.test(settings))

// The version written out by hand anywhere a person or the app reads it
// would be the next thing to drift. Docs that show an example answer from
// /api/health are allowed to quote it.
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(js|jsx|mjs|html)$/.test(name)) out.push(path)
  }
  return out
}
const literal = new RegExp(`['"\`]v?${version.replace(/\./g, '\\.')}['"\`]`)
const typed = [...walk('src'), ...walk('api'), ...walk('functions'), 'index.html'].filter((f) => literal.test(readFileSync(f, 'utf8')))
ok('no file in the app or the functions has the version typed in', typed.length === 0, typed.join(', '))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
