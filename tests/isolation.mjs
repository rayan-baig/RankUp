/**
 * RankUp shares nothing with the sites beside it on its parent domain.
 *
 * RankUp is a product of MTRX Horizyn and lives at rankup.<your domain>, a
 * subdomain of the company's one domain, with the company's console and its
 * other products as siblings. A subdomain rather than a path, so that RankUp
 * is an origin of its own: its own localStorage, IndexedDB and service worker,
 * which no sibling can read. Two things would quietly undo that, and both are
 * one line each: a cookie set with Domain=<your domain> (every sibling then
 * receives it), and a policy or CORS rule that trusts *.<your domain>. This
 * checks neither exists, and that the few places that do look at another
 * origin turn a sibling away:
 *
 *   - nothing sets a cookie, with Domain= or without, and nothing touches
 *     document.domain;
 *   - the Content-Security-Policy vite.config.js writes allows this site and
 *     the named third parties, never a wildcard or a bare scheme;
 *   - the host headers (public/_headers, vercel.json) send no CORS header, no
 *     cookie and no Service-Worker-Allowed, refuse framing, and keep the page
 *     in an agent cluster of its own;
 *   - the service worker registers with this site's own scope, answers only
 *     this site's requests, and a notification can only open this site;
 *   - the server functions send no CORS header, and a payment's way back
 *     (api/_shared/site.js) never leads to a sibling.
 *
 * tests/api.mjs asks the same of the functions as Cloudflare serves them.
 * Reads files and runs pure code; needs nothing running.
 *
 *   node tests/isolation.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

// The shape of the deployment: RankUp, the company's console and the bare
// parent domain. example.com stands in for the domain, which is not chosen yet.
const RANKUP = 'https://rankup.example.com'
const SIBLINGS = ['https://console.example.com', 'https://example.com', 'https://other-app.example.com']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(js|jsx|mjs|html|json|webmanifest)$/.test(name) || name === '_headers' || name === '_redirects') out.push(path)
  }
  return out
}
const shipped = [...['src', 'api', 'functions', 'public'].flatMap((d) => walk(d)), 'index.html', 'vite.config.js', 'vercel.json']
const read = (f) => readFileSync(f, 'utf8')

// ---------------------------------------------------------------------------
console.log('\n=== No cookie, and no reaching for the parent domain ===')
const cookies = shipped.filter((f) => /document\.cookie|cookieStore|set-cookie/i.test(read(f)))
ok('nothing sets or reads a cookie (so none can be given Domain=<your domain>)', cookies.length === 0, cookies.join(', '))
const domainAttr = shipped.filter((f) => /;\s*domain\s*=/i.test(read(f)))
ok('no Domain= attribute anywhere', domainAttr.length === 0, domainAttr.join(', '))
const relaxed = shipped.filter((f) => /document\.domain\s*=(?!=)/.test(read(f)))
ok('nothing sets document.domain to the parent domain', relaxed.length === 0, relaxed.join(', '))

// ---------------------------------------------------------------------------
console.log('\n=== The Content-Security-Policy trusts no other site of the company ===')
// The real plugin from vite.config.js, given a hosted Supabase as a live
// build would be.
process.env.VITE_SUPABASE_URL = 'https://abcdefghijkl.supabase.co'
const { default: configFor } = await import('../vite.config.js')
const config = configFor({ mode: 'production', command: 'build' })
const cspPlugin = config.plugins.flat().find((p) => p?.name === 'rankup-csp')
cspPlugin.configResolved({ root: process.cwd() })
const page = cspPlugin.transformIndexHtml('<head></head>')
const policyText = page.match(/content="([^"]+)"/)?.[1] || ''
const policy = Object.fromEntries(policyText.split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v] }))
ok('a policy was written', Object.keys(policy).length > 5, policyText)
const THIRD_PARTIES = new Set([
  'https://abcdefghijkl.supabase.co',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
])
const sources = Object.entries(policy).flatMap(([d, list]) => list.map((s) => [d, s]))
const wild = sources.filter(([, s]) => s.includes('*'))
ok('no wildcard in any directive (no *.<your domain>, no *)', wild.length === 0, wild.map((x) => x.join(' ')).join(', '))
const schemes = sources.filter(([d, s]) => /^[a-z][a-z0-9+.-]*:$/i.test(s) && !(d === 'img-src' && s === 'data:'))
ok('no bare scheme such as https:, which would allow every site', schemes.length === 0, schemes.map((x) => x.join(' ')).join(', '))
const hosts = sources.filter(([, s]) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s))
const unknown = hosts.filter(([, s]) => !THIRD_PARTIES.has(s))
ok("every address named is the database, the fonts or the one Three.js file; this site is only 'self'",
  unknown.length === 0, unknown.map((x) => x.join(' ')).join(', '))
for (const sibling of SIBLINGS) {
  const host = new URL(sibling).host
  ok(`${host} is in no directive`, !policyText.includes(host))
}

// ---------------------------------------------------------------------------
console.log('\n=== The host headers: no CORS, no cookie, no wider worker scope ===')
const headersFile = read('public/_headers')
const vercel = JSON.parse(read('vercel.json'))
const vercelPairs = (vercel.headers || []).flatMap((h) => h.headers.map((x) => [x.key, x.value]))
const headerLines = headersFile.split('\n').filter((l) => /^\s+[A-Za-z-]+:/.test(l)).map((l) => l.trim().split(/:\s*/, 2))
const allHeaders = [...headerLines, ...vercelPairs]
const forbidden = allHeaders.filter(([k]) => /^(access-control-|set-cookie$|service-worker-allowed$)/i.test(k))
ok('neither host sends Access-Control-*, Set-Cookie or Service-Worker-Allowed', forbidden.length === 0,
  forbidden.map(([k]) => k).join(', '))
ok("Cloudflare's default Access-Control-Allow-Origin: * is taken off every file",
  /^\/\*\n(?:\s+.*\n)*?\s+! Access-Control-Allow-Origin$/m.test(headersFile))
const hostCsp = allHeaders.filter(([k]) => /content-security-policy/i.test(k))
ok('no second policy in the host headers to loosen the page\'s own', hostCsp.length === 0)
const vercelAll = Object.fromEntries((vercel.headers.find((h) => h.source === '/(.*)')?.headers || []).map((h) => [h.key, h.value]))
for (const [name, value, why] of [
  ['X-Frame-Options', 'DENY', 'no sibling can frame it'],
  ['Origin-Agent-Cluster', '?1', 'no sibling can share its agent cluster'],
]) {
  ok(`${name}: ${value} on Cloudflare and on Vercel: ${why}`,
    new RegExp(`^\\s+${name}: ${value.replace(/[?]/g, '\\?')}$`, 'm').test(headersFile) && vercelAll[name] === value)
}

// ---------------------------------------------------------------------------
console.log('\n=== The service worker belongs to this site alone ===')
const registers = shipped.flatMap((f) => [...read(f).matchAll(/serviceWorker\.register\(([^)]*\)?)\s*(,[^)]*)?\)/g)].map((m) => ({ f, args: m[0] })))
ok(`the worker is registered (${registers.length} places)`, registers.length > 0)
const widened = registers.filter((r) => /scope/.test(r.args))
ok('always at sw.js on this site, with the default scope (never a wider one)',
  widened.length === 0 && registers.every((r) => /new URL\('sw\.js', document\.baseURI\)/.test(r.args)),
  registers.map((r) => `${r.f}: ${r.args}`).join('; '))

// Run the worker itself, with just enough of a ServiceWorkerGlobalScope.
const handlers = {}
const opened = []
const sandbox = {
  URL,
  console,
  caches: { open: async () => ({ match: async () => 'kept', put: async () => {} }) },
  self: {
    location: new URL(`${RANKUP}/sw.js`),
    registration: { scope: `${RANKUP}/`, showNotification: async () => {} },
    addEventListener: (type, fn) => { handlers[type] = fn },
    skipWaiting: () => {},
    clients: { matchAll: async () => [], openWindow: async (url) => { opened.push(url) } },
  },
}
// As built: the build fills BUILD in, and with it null the worker answers nothing.
const worker = read('public/sw.js').replace(/^const BUILD = null\b.*$/m, "const BUILD = { shell: [], files: ['assets/app.js'] }")
ok('the worker reads as the build will fill it in', worker.includes("files: ['assets/app.js']"))
vm.runInNewContext(worker, sandbox, { filename: 'public/sw.js' })
const answered = []
for (const href of [...SIBLINGS.map((s) => `${s}/assets/app.js`), `${RANKUP}/assets/app.js`]) {
  let responded = false
  handlers.fetch({ request: { url: href, method: 'GET', mode: 'no-cors', destination: 'script' }, respondWith: () => { responded = true } })
  answered.push([href, responded])
}
ok("it answers none of a sibling's requests", answered.filter(([h, r]) => r && !h.startsWith(RANKUP)).length === 0,
  JSON.stringify(answered))
ok('while still answering its own', answered.find(([h]) => h.startsWith(RANKUP))[1] === true)

const click = async (url) => {
  opened.length = 0
  const waits = []
  handlers.notificationclick({ notification: { close: () => {}, data: { url } }, waitUntil: (p) => waits.push(p) })
  await Promise.all(waits)
  return opened[0]
}
ok('a notification opens the screen it is about', await click('/#/kid/quests') === `${RANKUP}/#/kid/quests`)
for (const sibling of SIBLINGS) {
  const went = await click(`${sibling}/#/kid`)
  ok(`but one naming ${new URL(sibling).host} opens RankUp's own front page`, went === `${RANKUP}/`, went)
}
ok('as does one naming another scheme', await click('javascript:alert(1)') === `${RANKUP}/`)

// ---------------------------------------------------------------------------
console.log('\n=== The server functions trust no sibling ===')
const serverFiles = [...walk('api'), ...walk('functions')]
const cors = serverFiles.filter((f) => /access-control-allow/i.test(read(f)))
ok('no function sends a CORS header, so a browser on a sibling cannot read any answer', cors.length === 0, cors.join(', '))
const ownOrigin = serverFiles.filter((f) => /safeOrigin|headers\.origin\b|headers\['origin'\]/.test(read(f)) && !f.endsWith('_shared/site.js'))
ok('every way back from Stripe goes through api/_shared/site.js', ownOrigin.length === 0, ownOrigin.join(', '))
for (const f of ['api/create-checkout.js', 'api/school-checkout.js', 'api/billing-portal.js']) {
  ok(`${f} uses it`, /returnOrigin\(req\)/.test(read(f)))
}

const { returnOrigin } = await import('../api/_shared/site.js')
const ask = (origin, host, site = '') => {
  if (site) process.env.PUBLIC_SITE_URL = site
  else delete process.env.PUBLIC_SITE_URL
  try { return returnOrigin({ headers: { ...(origin ? { origin } : {}), ...(host ? { host } : {}) } }) }
  finally { delete process.env.PUBLIC_SITE_URL }
}
const rankupHost = new URL(RANKUP).host
ok('with PUBLIC_SITE_URL set, that is the way back', ask(RANKUP, rankupHost, `${RANKUP}/`) === RANKUP)
for (const sibling of SIBLINGS) {
  const host = new URL(sibling).host
  ok(`whatever ${host} says in Origin`, ask(sibling, rankupHost, RANKUP) === RANKUP)
  ok(`and without it, ${host} is refused`, ask(sibling, rankupHost) === '')
  ok(`even sent with x-forwarded-host: ${host}`, returnOrigin({ headers: { origin: sibling, host: rankupHost, 'x-forwarded-host': host } }) === '')
}
ok('without it, the site\'s own Origin on its own host is accepted', ask(RANKUP, rankupHost) === RANKUP)
ok('but not over plain http', ask(`http://${rankupHost}`, rankupHost) === '')
ok('nor with no Host to compare it with', ask(RANKUP, '') === '')
ok('nor with no Origin at all', ask('', rankupHost) === '')
ok('a local test server still works', ask('http://localhost:8788', 'localhost:8788') === 'http://localhost:8788')
ok('but not one on another port', ask('http://localhost:5173', 'localhost:8788') === '')

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
