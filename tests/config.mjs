/**
 * Every setting the code reads has to be in .env.example.
 *
 * This is not tidiness. On the day someone deploys this, .env.example IS the
 * instructions — they copy it into their host's settings panel and fill it in.
 * A variable the code reads but the file never mentions is a feature that
 * silently does not work, found weeks later by a parent rather than by the
 * person who shipped it. PUBLIC_SITE_URL was exactly that: without it Stripe
 * checkout does not start, and nothing anywhere said it existed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(path)
  }
  return out
}

const sources = ['src', 'api', 'functions'].flatMap((d) => walk(d))
const used = new Set()
for (const file of sources) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/process\.env\.([A-Z][A-Z_0-9]*)/g)) used.add(m[1])
  for (const m of text.matchAll(/import\.meta\.env\?\.([A-Z][A-Z_0-9]*)/g)) used.add(m[1])
  for (const m of text.matchAll(/read\('(VITE_[A-Z_0-9]*)'\)/g)) used.add(m[1])
}

// Vite's own, and the two the test harness sets. Not ours to document.
const BUILT_IN = new Set(['DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL', 'NODE_ENV'])

const example = readFileSync('.env.example', 'utf8')
const documented = new Set(
  [...example.matchAll(/^#?\s*([A-Z][A-Z_0-9]*)=/gm)].map((m) => m[1]),
)

console.log('\n=== Every setting the code reads is in .env.example ===')
const missing = [...used].filter((v) => !BUILT_IN.has(v) && !documented.has(v)).sort()
ok(`all ${used.size - BUILT_IN.size} of them are documented`, missing.length === 0,
  `not in .env.example: ${missing.join(', ')}`)

console.log('\n=== And nothing is documented that the code never reads ===')
// A stale entry is its own kind of lie: somebody sets it, and nothing happens.
const stale = [...documented].filter((v) => !used.has(v)).sort()
ok('no settings listed that do nothing', stale.length === 0, `unused: ${stale.join(', ')}`)

console.log('\n=== No secret is named so it would be shipped to every phone ===')
const publicNames = [...documented].filter((v) => v.startsWith('VITE_'))
const SECRET_WORDS = /SERVICE_ROLE|SECRET|PRIVATE|ANTHROPIC_API_KEY/
const leaked = publicNames.filter((v) => SECRET_WORDS.test(v))
ok('nothing secret-shaped carries a VITE_ name', leaked.length === 0, leaked.join(', '))

console.log('\n=== Guilds stay off unless the setting is exactly "true" ===')
// Guilds are the one feature that puts a child in touch with children in
// other families. Nearly-right settings must leave them off, not on.
const { guildsSwitchedOn, guildsEnabled } = await import('../src/lib/guilds.js')
ok('VITE_GUILDS_ENABLED=true switches them on', guildsSwitchedOn('true') === true)
const nearly = [undefined, null, '', 'TRUE', 'True', ' true', 'true ', '1', 'yes', 'on', 'false', true, 1]
const wronglyOn = nearly.filter((v) => guildsSwitchedOn(v))
ok('anything else leaves them off (TRUE, 1, yes, " true", a boolean...)', wronglyOn.length === 0,
  `switched on by: ${wronglyOn.map((v) => JSON.stringify(v)).join(', ')}`)
ok('and with the setting absent, as at launch, they are off', guildsEnabled() === false)
const guildSource = readFileSync('src/lib/guilds.js', 'utf8')
ok('the app reads the switch through that one test',
  /const GUILDS_ENABLED = guildsSwitchedOn\(import\.meta\.env\?\.VITE_GUILDS_ENABLED\)/.test(guildSource))
const appSource = readFileSync('src/App.jsx', 'utf8')
ok('and every guild screen in the app is behind it',
  (appSource.match(/<(KidGuild|ParentGuilds) \/>/g) || []).length === 2
  && /guildsEnabled\(\) && guildsAllowedByPlan\(state\) \? <KidGuild \/>/.test(appSource)
  && /guildsEnabled\(\) \? <ParentGuilds \/>/.test(appSource))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
