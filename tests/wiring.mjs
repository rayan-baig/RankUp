/**
 * The lists that have to agree with each other, agree.
 *
 * Several things in this repository are written down twice, in places that
 * nothing connects: the server functions in api/ and the route table that
 * serves them on Cloudflare; the scheduled jobs in vercel.json, in
 * /api/health and in the jobs themselves; the order of the SQL files in
 * run.sh, in docs/LAUNCH.md and in docs/BACKEND.md. Each pair has drifted at
 * least once. A function missing from the route table is a 404 on Cloudflare
 * and fine on Vercel; a job missing from the health check can stop for a month
 * with nothing turning red. No server or database is needed: this reads files.
 *
 *   node tests/wiring.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const sorted = (xs) => [...xs].sort()
const diff = (a, b) => {
  const only = (x, y) => x.filter((v) => !y.includes(v))
  return `only in the first: ${only(a, b).join(', ') || '-'}; only in the second: ${only(b, a).join(', ') || '-'}`
}

// ---------------------------------------------------------------------------
console.log('\n=== The Cloudflare route table serves exactly the functions in api/ ===')
const apiFiles = sorted(readdirSync('api').filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')))
const routeSource = readFileSync('functions/api/[[route]].js', 'utf8')
const routeBlock = routeSource.match(/const ROUTES = \{([\s\S]*?)\n\}/)?.[1] || ''
const routes = [...routeBlock.matchAll(/^\s*'?([a-z-]+)'?\s*:\s*\(\)\s*=>\s*import\('\.\.\/\.\.\/api\/([a-z-]+)\.js'\)/gm)]
  .map((m) => ({ name: m[1], file: m[2] }))
ok(`the route table was read (${routes.length} routes)`, routes.length > 0)
ok('every function in api/ has a route, and every route has a function',
  same(sorted(routes.map((r) => r.name)), apiFiles), diff(sorted(routes.map((r) => r.name)), apiFiles))
const crossed = routes.filter((r) => r.name !== r.file)
ok('each route loads its own file, not another one', crossed.length === 0,
  crossed.map((r) => `${r.name} -> ${r.file}.js`).join(', '))
ok('no route is listed twice', new Set(routes.map((r) => r.name)).size === routes.length)
const routeLines = (routeBlock.match(/import\(/g) || []).length
ok('and nothing in the table is written in a shape this test cannot read', routeLines === routes.length,
  `${routeLines} imports, ${routes.length} read`)

// ---------------------------------------------------------------------------
console.log('\n=== Every function in api/ is called by tests/api.mjs ===')
// tests/api.mjs also checks, as it runs, that each of these answered at least
// one request with something other than a 404. This is the quick half.
const apiTest = readFileSync('tests/api.mjs', 'utf8')
const unnamed = apiFiles.filter((name) => !new RegExp(`/api/${name}\\b|'${name}'`).test(apiTest))
ok('each one is named there', unnamed.length === 0, `not in tests/api.mjs: ${unnamed.join(', ')}`)

// ---------------------------------------------------------------------------
console.log('\n=== The scheduled jobs: vercel.json, /api/health and the jobs agree ===')
const crons = sorted(JSON.parse(readFileSync('vercel.json', 'utf8')).crons.map((c) => c.path.replace('/api/', '')))
const healthSql = readFileSync('supabase/health.sql', 'utf8')
const watched = sorted([...healthSql.matchAll(/\('([a-z-]+)',\s*interval '/g)].map((m) => m[1]))
const recording = sorted(apiFiles.filter((name) =>
  /recordRun\(/.test(readFileSync(`api/${name}.js`, 'utf8')) && name !== 'health'))
ok(`vercel.json schedules ${crons.length} jobs`, crons.length > 0)
ok('every scheduled job is watched by /api/health', same(crons, watched), diff(crons, watched))
ok('every job that records its runs is scheduled', same(crons, recording), diff(crons, recording))
const missingFile = crons.filter((c) => !apiFiles.includes(c))
ok('every scheduled path is a real function', missingFile.length === 0, missingFile.join(', '))
const recorded = recording.map((name) => {
  const m = readFileSync(`api/${name}.js`, 'utf8').match(/recordRun\(serviceRpc, '([a-z-]+)'/)
  return [name, m?.[1]]
}).filter(([name, as]) => name !== as)
ok('and each records itself under its own name, the one health looks for', recorded.length === 0,
  recorded.map(([n, as]) => `${n} records as ${as}`).join(', '))
const launch = readFileSync('docs/LAUNCH.md', 'utf8')
const undocumented = crons.filter((c) => !launch.includes(`/api/${c}`))
ok('docs/LAUNCH.md tells the owner to schedule each one', undocumented.length === 0, undocumented.join(', '))

// ---------------------------------------------------------------------------
console.log('\n=== The SQL files: one order, everywhere it is written ===')
const runSh = readFileSync('supabase/test/run.sh', 'utf8')
const passes = runSh.split('\n').filter((l) => l.startsWith('for f in "$HERE/../'))
  .map((l) => [...l.matchAll(/\$HERE\/\.\.\/([a-z-]+\.sql)/g)].map((m) => m[1]))
ok('run.sh applies the files twice', passes.length === 2)
const [first, second] = passes
ok('in the same order both times', same(first, second), diff(first, second))
const onDisk = sorted(readdirSync('supabase').filter((f) => f.endsWith('.sql')))
ok('and every file in supabase/ is in it', same(sorted(first), onDisk), diff(sorted(first), onDisk))
const launchOrder = [...launch.matchAll(/^- \[ \] `supabase\/([a-z-]+\.sql)`/gm)].map((m) => m[1])
ok('docs/LAUNCH.md lists the same files in the same order', same(launchOrder, first), diff(launchOrder, first))
const backend = readFileSync('docs/BACKEND.md', 'utf8')
const backendBlock = backend.match(/```[^\n]*\n((?:[a-z-]+\.sql\s*)+)```/)?.[1] || ''
const backendOrder = backendBlock.split(/\s+/).filter(Boolean)
ok('docs/BACKEND.md lists the same files in the same order', same(backendOrder, first), diff(backendOrder, first))

// ---------------------------------------------------------------------------
console.log('\n=== The local functions server is given only settings the code reads ===')
const example = readFileSync('.env.example', 'utf8')
const documented = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z_0-9]*)=/gm)].map((m) => m[1]))
const serve = readFileSync('supabase/test/serve-functions.sh', 'utf8')
const bindings = [...serve.matchAll(/--binding ([A-Z_0-9]+)=/g)].map((m) => m[1])
const strange = bindings.filter((b) => !documented.has(b))
ok(`all ${bindings.length} of its settings are in .env.example`, bindings.length > 0 && strange.length === 0, strange.join(', '))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
