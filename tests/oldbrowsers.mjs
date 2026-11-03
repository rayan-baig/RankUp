/**
 * The oldest phones RankUp is built for: iPhone Safari 15 and Chrome, Edge
 * and Firefox from about four years back (BROWSER_TARGET in vite.config.js).
 *
 * The build rewrites newer syntax (?. ?? and the rest) for them. It does not
 * add functions they lack, so a single `days.at(-1)` blanked the chore
 * history on an iPhone running iOS 15.0 to 15.3. This reads the source a
 * phone runs and fails on any function those browsers do not have, unless
 * the file is one that checks for it first; and checks that the stylesheet's
 * shared pieces keep a plain colour for browsers without color-mix().
 * tests/bundle.mjs reads the built files for the same functions.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BROWSER_TARGET } from '../vite.config.js'

const fails = []
const ok = (n, cond, d = '') => {
  if (cond) console.log('  PASS', n)
  else { fails.push(n); console.log('  FAIL', n, '—', d) }
}

console.log('\n=== The build is made for them ===')
const version = (name) => Number((BROWSER_TARGET.find((t) => t.startsWith(name)) || '').slice(name.length)) || null
ok('iPhone Safari 15', version('ios') === 15 && version('safari') === 15, BROWSER_TARGET.join(', '))
ok('Chrome and Edge from about four years back, no newer', version('chrome') && version('chrome') <= 108 && version('edge') && version('edge') <= 108,
  BROWSER_TARGET.join(', '))
ok('Firefox likewise', version('firefox') && version('firefox') <= 108, BROWSER_TARGET.join(', '))
ok('and no newer language than ES2020', BROWSER_TARGET.includes('es2020'), BROWSER_TARGET.join(', '))
const config = readFileSync('vite.config.js', 'utf8')
ok('the build uses that list', /build:\s*{\s*target:\s*BROWSER_TARGET/.test(config))

/*
 * Functions iPhone Safari 15.0 (or Chrome 96) does not have. Each is a
 * crash on that phone the moment the line runs.
 */
export const MISSING = [
  ['Array.prototype.at', /[\w)\]]\.at\(/],
  ['structuredClone', /\bstructuredClone\s*\(/],
  ['Object.hasOwn', /\bObject\.hasOwn\s*\(/],
  ['findLast', /\.findLast(Index)?\s*\(/],
  ['toSorted / toReversed / toSpliced', /\.(toSorted|toReversed|toSpliced)\s*\(/],
  ['Object.groupBy / Map.groupBy', /\b(Object|Map)\.groupBy\s*\(/],
  ['Promise.withResolvers', /\bPromise\.withResolvers\s*\(/],
  ['AbortSignal.timeout / any', /\bAbortSignal\.(timeout|any)\s*\(/],
  ['Array.fromAsync', /\bArray\.fromAsync\s*\(/],
  ['String isWellFormed', /\.(isWellFormed|toWellFormed)\s*\(/],
]
/* Functions they lack that the app may use only behind a check. */
const GUARDED = [
  ['crypto.randomUUID', /randomUUID/, ['src/lib/id.js']],
  ['requestIdleCallback', /requestIdleCallback/, ['src/lib/offline.js']],
  ['BroadcastChannel', /new BroadcastChannel/, ['src/lib/sync/localAdapter.js']],
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(js|jsx|html)$/.test(name)) out.push(path)
  }
  return out
}
// What runs on the phone: the app, the four framed games, the service worker.
const files = [...walk('src'), 'public/sw.js']
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')

console.log(`\n=== None of the ${files.length} files a phone runs calls what they lack ===`)
for (const [name, re] of MISSING) {
  const hits = files.filter((f) => re.test(code(readFileSync(f, 'utf8'))))
  ok(`no ${name}`, hits.length === 0, hits.join(', '))
}
for (const [name, re, allowed] of GUARDED) {
  const hits = files.filter((f) => re.test(code(readFileSync(f, 'utf8'))))
  const stray = hits.filter((f) => !allowed.includes(f))
  ok(`${name} only where it is checked for first`, stray.length === 0, stray.join(', '))
  for (const f of allowed) {
    const text = readFileSync(f, 'utf8')
    const checked = name === 'BroadcastChannel' ? /try\s*{[^}]*new BroadcastChannel/.test(text)
      : name === 'requestIdleCallback' ? /window\.requestIdleCallback\s*\n?\s*\?/.test(text)
        : /crypto\.randomUUID\)\s*return crypto\.randomUUID\(\)/.test(text)
    ok(`and ${f} does check`, checked)
  }
}

console.log('\n=== Without color-mix(), the shared pieces keep a colour ===')
const css = readFileSync('src/styles/index.css', 'utf8')
for (const selector of ['.card', '.card-flat', '.btn-primary', '.btn-ghost', '.btn-soft', '.chip', '.field']) {
  const m = new RegExp(`\\n\\s*${selector.replace('.', '\\.')}\\s*{([\\s\\S]*?)\\n\\s*}`).exec(css)
  if (!m) { ok(`${selector} is there`, false); continue }
  const decls = m[1].split(/;\s*(?=[a-z-]+\s*:)/).map((d) => d.trim()).filter((d) => /^[a-z-]+\s*:/.test(d))
  const missing = []
  decls.forEach((d, i) => {
    const prop = d.split(':')[0].trim()
    if (!['background', 'border'].includes(prop) || !/color-mix/.test(d)) return
    const before = decls.slice(0, i).some((e) => e.split(':')[0].trim() === prop && !/color-mix/.test(e))
    if (!before) missing.push(prop)
  })
  ok(`${selector}: a plain background and border before each color-mix()`, missing.length === 0, missing.join(', '))
}

console.log('\n=== The framed games ===')
for (const f of readdirSync('src/components/games/external').filter((n) => n.endsWith('.html'))) {
  const text = readFileSync(join('src/components/games/external', f), 'utf8')
  const bare = [...text.matchAll(/([;{])\s*height:\s*100dvh/g)].filter((m) => !/height:100%;$/.test(text.slice(Math.max(0, m.index - 12), m.index + 1)))
  ok(`${f}: a height for phones without dvh`, bare.length === 0, `${bare.length} without`)
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join('; ')}` : '\nALL CHECKS PASSED')
process.exit(fails.length ? 1 : 0)
