/**
 * What the built app hands every phone: no server secret, and a
 * Content-Security-Policy that allows nothing it does not need.
 *
 * Builds the app into a scratch folder with every server-only setting in
 * .env.example given a recognisable fake value — the service role key as a
 * real-looking token whose role is service_role — and then reads every file
 * in the build:
 *
 *   - none of those values is anywhere in it;
 *   - no token in it carries the service role;
 *   - no server-only setting is read by the app's code (a name may appear in
 *     a sentence telling the operator where to set it, and that is listed);
 *   - the policy is exactly the list below: the game scripts by hash, the one
 *     Three.js file Tennis Tour imports, the fonts, the database it talks to.
 *     Anything added to it fails here until it is added to this list too.
 *
 *   npm run test:built       (this, then the games under the policy)
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

// --- every server-only setting, with a value nobody could mistake ----------
const example = readFileSync('.env.example', 'utf8')
const names = [...new Set([...example.matchAll(/^#?\s*([A-Z][A-Z_0-9]*)=/gm)].map((m) => m[1]))]
const serverOnly = names.filter((n) => !n.startsWith('VITE_'))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const serviceToken = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role: 'service_role', ref: 'bundletest' })}.c2VudGluZWwtc2lnbmF0dXJl`
const sentinels = Object.fromEntries(serverOnly.map((n) => [n, `sentinel-${n.toLowerCase()}-4f1c9a`]))
sentinels.SUPABASE_SERVICE_ROLE_KEY = serviceToken

const dir = mkdtempSync(join(tmpdir(), 'rankup-bundle-'))
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
console.log(`· building into ${dir} with every server-only setting filled in`)
const built = spawnSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'], {
  stdio: 'inherit',
  env: { ...process.env, ...sentinels },
})
if (built.status !== 0) { console.error('the build failed'); process.exit(1) }

const files = []
const walk = (d) => {
  for (const name of readdirSync(d)) {
    const path = join(d, name)
    if (statSync(path).isDirectory()) walk(path)
    else files.push(path)
  }
}
walk(dir)
const texts = files
  .filter((f) => /\.(js|mjs|css|html|json|webmanifest|txt|svg|map)$/.test(f) || /_headers|_redirects/.test(f))
  .map((f) => ({ f: f.slice(dir.length + 1), text: readFileSync(f, 'utf8') }))
const everything = texts.map((t) => t.text).join('\n')

console.log(`\n=== No server secret is in the ${files.length} files a phone downloads ===`)
const leaked = Object.entries(sentinels).filter(([, v]) => everything.includes(v)).map(([n]) => n)
ok(`none of the ${serverOnly.length} server-only settings' values is in the build`, leaked.length === 0,
  `found the value of: ${leaked.join(', ')}`)
ok('the service role key in particular', !everything.includes(serviceToken.split('.')[1]))

const tokens = [...everything.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g)]
const powerful = tokens.filter((m) => {
  try { return /service_role/.test(Buffer.from(m[1], 'base64url').toString('utf8')) } catch { return false }
})
ok('no token in the build carries the service role', powerful.length === 0,
  `${powerful.length} found`)

/*
 * Names. A sentence that tells the operator which setting to fill in is
 * fine (the operator's own page says "OPERATOR_SECRET is not set on the
 * server"); code that reads one is not, because it means server code has been
 * pulled into the browser's bundle.
 */
const MENTIONED_IN_WORDS = new Set(['OPERATOR_SECRET', 'STRIPE_WEBHOOK_SECRET'])
const named = serverOnly.filter((n) => new RegExp(`\\b${n}\\b`).test(everything))
const unexpected = named.filter((n) => !MENTIONED_IN_WORDS.has(n))
ok('no other server-only setting is so much as named in it', unexpected.length === 0, unexpected.join(', '))
const read = serverOnly.filter((n) => new RegExp(`(env|process\\.env)\\??\\.\\s*${n}\\b|\\[["'\`]${n}["'\`]\\]`).test(everything))
ok("and none is read by the app's code", read.length === 0, read.join(', '))
ok('nothing reads the server\'s environment at all', !/process\.env\.[A-Z]/.test(everything))

console.log('\n=== The Content-Security-Policy allows nothing it does not need ===')
const html = readFileSync(join(dir, 'index.html'), 'utf8')
const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g)]
ok('the built page carries exactly one policy', metas.length === 1, `${metas.length} found`)
const policy = Object.fromEntries((metas[0]?.[1] || '').split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v] }))

let supabase = ''
try { supabase = new URL(process.env.VITE_SUPABASE_URL || readEnvLocal('VITE_SUPABASE_URL')).origin } catch { supabase = '' }
function readEnvLocal(key) {
  for (const f of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    try {
      const m = readFileSync(f, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))
      if (m) return m[1].trim()
    } catch { /* not there */ }
  }
  return ''
}

const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'
const expected = {
  'default-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:'],
  'connect-src': ["'self'", ...(supabase ? [supabase] : [])],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
}
const directives = Object.keys(policy)
const extra = directives.filter((d) => d !== 'script-src' && !(d in expected))
ok('no directive beyond the ones listed here', extra.length === 0, extra.join(', '))
for (const [d, want] of Object.entries(expected)) {
  ok(`${d} is ${want.join(' ')}`, JSON.stringify(policy[d] || []) === JSON.stringify(want), (policy[d] || []).join(' '))
}
const scripts = policy['script-src'] || []
const notHash = scripts.filter((s) => s !== "'self'" && s !== THREE && !/^'sha256-[A-Za-z0-9+/=]{44}'$/.test(s))
ok('scripts: this site, the games by the hash of their exact text, and the one Three.js file',
  scripts[0] === "'self'" && notHash.length === 0 && scripts.filter((s) => s === THREE).length === 1, notHash.join(' '))
ok('never inline script, eval, or a whole host',
  !scripts.some((s) => /unsafe|^https?:\/\/[^/]+\/?$|\*|^https?:$|^data:|^blob:/.test(s)), scripts.join(' '))

console.log('\n=== The host adds what a page cannot set for itself ===')
const headers = readFileSync(join(dir, '_headers'), 'utf8')
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const vercelHeaders = Object.fromEntries((vercel.headers.find((h) => h.source === '/(.*)')?.headers || []).map((h) => [h.key, h.value]))
for (const [name, value] of [
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'],
]) {
  ok(`${name}: ${value}, on Cloudflare and on Vercel`,
    headers.includes(`${name}: ${value}`) && vercelHeaders[name] === value,
    `_headers: ${(headers.match(new RegExp(`${name}: .*`)) || [''])[0]} vercel: ${vercelHeaders[name]}`)
}

/*
 * PUBLIC_SITE_URL is the site's address, so the build uses it for the link
 * preview's picture and the sitemap. Here it holds a sentinel that is no
 * address at all, which is the case to check: with no real address, no
 * picture tag, no half-made relative one, and no sitemap.
 * tests/sharecard.mjs checks the same code with a real address.
 */
console.log('\n=== With no real site address, no half-made link preview ===')
const page = texts.find((t) => t.f === 'index.html')?.text || ''
ok('no og:image or twitter:image tag', !/og:image|twitter:image/.test(page))
ok('no marker left in the page', !page.includes('{{SITE}}'))
ok('robots.txt is there, keeping crawlers off /api/', /^Disallow: \/api\/$/m.test(texts.find((t) => t.f === 'robots.txt')?.text || ''))
ok('and no sitemap, which would need the address', !files.some((f) => f.endsWith('sitemap.xml')))

/*
 * The oldest phones the build is for (BROWSER_TARGET in vite.config.js,
 * iPhone Safari 15) lack these functions, and the build does not add them:
 * one call is a blank screen there. tests/oldbrowsers.mjs reads the source;
 * this reads what the build made of it, React and every other package
 * included.
 */
console.log('\n=== Nothing in the build calls what iPhone Safari 15 lacks ===')
const shipped = texts.filter((t) => /\.(js|mjs)$/.test(t.f) || t.f === 'index.html')
for (const [name, re] of [
  ['Array.prototype.at', /[\w)\]]\.at\((?:-?\d|[\w$])/],
  ['structuredClone', /\bstructuredClone\(/],
  ['Object.hasOwn', /\bObject\.hasOwn\(/],
  ['findLast', /\.findLast(Index)?\(/],
  ['toSorted / toReversed', /\.(toSorted|toReversed|toSpliced)\(/],
  ['Object.groupBy', /\b(Object|Map)\.groupBy\(/],
  ['AbortSignal.timeout', /\bAbortSignal\.(timeout|any)\(/],
]) {
  const hits = shipped.filter((t) => re.test(t.text)).map((t) => t.f)
  ok(`no ${name}`, hits.length === 0, hits.join(', '))
}
const randomUuid = shipped.filter((t) => /randomUUID\(\)/.test(t.text) && !/crypto\.randomUUID\)return crypto\.randomUUID\(\)|&&crypto\.randomUUID\)return crypto\.randomUUID\(\)/.test(t.text))
ok('crypto.randomUUID only behind a check', randomUuid.length === 0, randomUuid.map((t) => t.f).join(', '))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
