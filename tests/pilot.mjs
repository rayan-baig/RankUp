/**
 * Pilot, the AI helper in Parent Mode: what can be checked by reading files.
 *
 *   - the shared core's own tests (tests/js/pilot.test.js, copied from the
 *     MTRX Horizyn site) pass: providers mocked, keys kept and removed,
 *     confirm before any change, no tools on a child's view, safe rendering;
 *   - the core in public/pilot/ is one version, every file saying the same;
 *   - the security policy adds exactly Pilot's provider hosts to connect-src
 *     (the MTRX site's list), blob: to media-src and nothing else, and the
 *     microphone is allowed for this site only, on both hosts;
 *   - Pilot is never in the first load: no tag in index.html, nothing of
 *     src/pilot/ imported by the app's code, only the small gate, and the
 *     service worker never fetches Pilot ahead of time (so a child's phone
 *     never holds it);
 *   - no AI model's name anywhere in Pilot's files, no style= attribute;
 *   - the parent screens mark children's names private, and the privacy
 *     policy describes Pilot.
 *
 * Needs nothing running.   node tests/pilot.mjs
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => readFileSync(f, 'utf8')

console.log('\n=== The shared core\'s own tests ===')
const run = spawnSync(process.execPath, ['--test', 'tests/js/pilot.test.js'], { encoding: 'utf8' })
const passed = Number((run.stdout.match(/^# pass (\d+)/m) || [])[1] || 0)
ok(`node --test tests/js/pilot.test.js (${passed} tests)`, run.status === 0 && passed >= 36, run.stdout.split('\n').filter((l) => /^not ok|# fail/.test(l)).join(' | '))

console.log('\n=== One core, one version ===')
const CORE = ['pilot.js', 'pilot-store.js', 'pilot-mascot.js', 'pilot-engine.js', 'pilot-providers.js', 'pilot-media.js',
  'pilot-render.js', 'pilot-panel.js', 'pilot-motion.js', 'pilot-actor.js', 'pilot.css', 'pilot-panel.css', 'pilot-actor.css']
const PICTURES = ['pilot-robot-128.webp', 'pilot-robot-256.webp', 'pilot-rest-body.webp', 'pilot-rest-head.webp', 'pilot-rest-eyes.webp']
const missing = [...CORE, ...PICTURES].filter((f) => !existsSync(`public/pilot/${f}`))
ok('every core file, the robot and its three layers are in public/pilot/', missing.length === 0, missing.join(', '))
const { POSES } = await import('../src/pilot/pilotRankUp.js')
const poseFiles = readdirSync('public/pilot/poses').map((f) => f.replace(/\.webp$/, '')).sort()
ok(`the pose pictures the loader names are the ones in public/pilot/poses/ (${poseFiles.length})`, JSON.stringify(poseFiles) === JSON.stringify([...POSES].sort()), poseFiles.join(' '))
const versions = CORE.filter((f) => existsSync(`public/pilot/${f}`))
  .map((f) => [f, (read(`public/pilot/${f}`).match(/^(?:\/\/|\/\*) Pilot core (\d+\.\d+\.\d+) · ([\w.-]+)/) || [])])
const wrong = versions.filter(([f, m]) => !m[1] || m[2] !== f)
ok('each starts with "Pilot core <version> · <its own name>"', wrong.length === 0, wrong.map(([f]) => f).join(', '))
const seen = [...new Set(versions.map(([, m]) => m[1]).filter(Boolean))]
ok(`and every one is the same version (${seen.join(', ')})`, seen.length === 1)
const constants = ['pilot.js', 'pilot-store.js', 'pilot-engine.js', 'pilot-providers.js', 'pilot-render.js', 'pilot-panel.js', 'pilot-motion.js', 'pilot-actor.js']
  .map((f) => (read(`public/pilot/${f}`).match(/const VERSION = "([\d.]+)"/) || [])[1])
ok('the VERSION inside each script agrees', constants.every((v) => v === seen[0]), constants.join(' '))
const extra = readdirSync('public/pilot').filter((f) => f !== 'poses' && !/^pilot[\w.-]*\.(js|css|webp)$/.test(f))
ok('nothing else is in the core folder', extra.length === 0, extra.join(', '))

console.log('\n=== The security policy: only Pilot\'s providers added ===')
const { PILOT_PROVIDER_HOSTS, PILOT_COMPATIBLE_HOSTS, PILOT_LOCAL_HOSTS, pilotConnectSources } = await import('../src/lib/pilotHosts.js')
// The MTRX Horizyn site's list, written out a second time on purpose: a host
// added to one and not the other fails here.
const MTRX = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com',
  'openrouter.ai', 'api.groq.com', 'api.mistral.ai', 'api.deepseek.com', 'api.together.xyz', 'api.fireworks.ai', 'api.x.ai']
ok('the providers are the MTRX site\'s list', JSON.stringify([...PILOT_PROVIDER_HOSTS, ...PILOT_COMPATIBLE_HOSTS]) === JSON.stringify(MTRX))
ok('and the parent\'s own computer for a local model', JSON.stringify(PILOT_LOCAL_HOSTS) === '["localhost","127.0.0.1"]')
process.env.VITE_SUPABASE_URL = 'https://abcdefghijkl.supabase.co'
const { default: configFor } = await import('../vite.config.js')
const plugin = configFor({ mode: 'production', command: 'build' }).plugins.flat().find((p) => p?.name === 'rankup-csp')
plugin.configResolved({ root: process.cwd() })
const policyText = plugin.transformIndexHtml('<head></head>').match(/content="([^"]+)"/)?.[1] || ''
const policy = Object.fromEntries(policyText.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v] }))
const wantConnect = ["'self'", 'https://abcdefghijkl.supabase.co', ...MTRX.map((h) => `https://${h}`), 'http://localhost:*', 'http://127.0.0.1:*']
ok('connect-src is this site, the database and exactly those hosts', JSON.stringify(policy['connect-src']) === JSON.stringify(wantConnect), (policy['connect-src'] || []).join(' '))
ok('and that is pilotConnectSources()', JSON.stringify(policy['connect-src'].slice(2)) === JSON.stringify(pilotConnectSources()))
ok("media-src is 'self' blob: (a video Pilot made, played from memory)", JSON.stringify(policy['media-src']) === JSON.stringify(["'self'", 'blob:']))
ok('no provider host in any other directive', Object.entries(policy).filter(([d]) => d !== 'connect-src')
  .every(([, v]) => !v.some((s) => MTRX.some((h) => s.includes(h)))))
ok("scripts are still this site only: no provider, no 'unsafe-inline'", !policy['script-src'].some((s) => /unsafe|anthropic|openai|googleapis/.test(s)))
const headers = read('public/_headers')
const vercel = JSON.parse(read('vercel.json'))
const vPerm = (vercel.headers.find((h) => h.source === '/(.*)')?.headers || []).find((h) => h.key === 'Permissions-Policy')?.value
const PERM = 'camera=(), microphone=(self), geolocation=(), interest-cohort=()'
ok('Permissions-Policy allows the microphone for this site only, on Cloudflare', headers.includes(`Permissions-Policy: ${PERM}`))
ok('and on Vercel', vPerm === PERM, vPerm)
const headerLines = headers.split('\n').filter((l) => /^\s+[A-Za-z-]+:/.test(l)).map((l) => l.trim().split(':')[0])
ok('no policy added to the host headers (the page carries the only one)',
  !headerLines.some((k) => /content-security-policy/i.test(k)) && !/content-security-policy/i.test(JSON.stringify(vercel.headers)))

console.log('\n=== Never in the first load ===')
ok('index.html has no Pilot tag', !/pilot/i.test(read('index.html')))
const gate = read('src/lib/pilotGate.js')
ok('the gate imports nothing at all, and fetches src/pilot/ only by a dynamic import',
  !/^import /m.test(gate) && /import\('\.\.\/pilot\/pilotRankUp\.js'\)/.test(gate))
ok('the gate waits for the page to finish loading', /readyState === 'complete'/.test(gate) && /addEventListener\('load'/.test(gate))
const appCode = []
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = `${d}/${e.name}`
  if (e.isDirectory()) { if (p !== 'src/pilot') walk(p) } else if (/\.(jsx?|mjs)$/.test(e.name)) appCode.push(p)
})
walk('src')
const statics = appCode.filter((f) => /from ['"][./]*\/?pilot\/|from ['"]\.\/pilot\//.test(read(f)))
ok('no file outside src/pilot/ imports it', statics.length === 0, statics.join(', '))
ok('the gate is small (under 5 KB of source, comments included)', gate.length < 5 * 1024, `${gate.length} bytes`)
const sw = read('public/sw.js')
const body = sw.match(/function worthKeepingAhead\(path\) \{([\s\S]*?)\n\}/)?.[1]
const worth = body ? new Function('path', body) : () => true
ok('the service worker never fetches Pilot ahead of time', !worth('assets/pilotRankUp-abc123.js') && worth('assets/ParentHelp-abc.js'))
const loader = read('src/pilot/pilotRankUp.js')
ok('the core is loaded from this site with the app\'s version on each address', /\?v=\$\{encodeURIComponent\(APP_VERSION\)\}/.test(loader))

console.log('\n=== Nothing Pilot may not have ===')
const pilotFiles = [...readdirSync('public/pilot').filter((f) => /\.(js|css)$/.test(f)).map((f) => `public/pilot/${f}`),
  'public/pilot-rankup.js', 'public/pilot-rankup-pack.js', ...readdirSync('src/pilot').map((f) => `src/pilot/${f}`),
  'src/lib/pilotGate.js', 'src/lib/pilotHosts.js', 'src/components/PilotGate.jsx', 'docs/PILOT.md']
const MODEL = /\b(gpt-?[0-9][\w.-]*|claude-[0-9a-z][\w.-]*|gemini-[0-9][\w.-]*|llama-?[0-9][\w.-]*|mixtral[\w.-]*|mistral-(large|medium|small|tiny)[\w.-]*|grok-[0-9][\w.-]*|deepseek-(chat|coder|reasoner|r1|v[0-9])[\w.-]*|o[1-4]-(mini|preview|pro)|dall-e[\w.-]*|imagen-[0-9][\w.-]*|veo-[0-9][\w.-]*|sora-[0-9][\w.-]*)\b/i
const named = pilotFiles.filter((f) => existsSync(f) && MODEL.test(read(f))).map((f) => `${f}: ${read(f).match(MODEL)[0]}`)
ok('no AI model is named in any of Pilot\'s files', named.length === 0, named.join(', '))
// The moving robot sets element.style.transform (the CSSOM, which the policy
// allows without 'unsafe-inline'); no file writes a style= attribute, and
// RankUp's own Pilot files touch no style at all.
const styled = pilotFiles.filter((f) => existsSync(f) && /\.(js|jsx)$/.test(f)
  && (/style=|setAttribute\(["']style|cssText/.test(read(f)) || (!f.startsWith('public/pilot/') && /\.style\./.test(read(f)))))
ok('no style attribute set anywhere in Pilot', styled.length === 0, styled.join(', '))
const secretish = pilotFiles.filter((f) => existsSync(f) && /\b(sk-[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|sk-ant-[A-Za-z0-9-]{10,})/.test(read(f)))
ok('and no key of any kind', secretish.length === 0, secretish.join(', '))

console.log('\n=== Children\'s names are private on the parent screens ===')
for (const f of ['src/screens/parent/ParentDashboard.jsx', 'src/screens/parent/ParentApprovals.jsx', 'src/screens/parent/ParentKids.jsx',
  'src/screens/parent/ParentMoney.jsx', 'src/screens/parent/ParentSettings.jsx', 'src/screens/parent/ParentHistory.jsx',
  'src/screens/parent/ParentLeaderboards.jsx', 'src/screens/parent/ParentPairKid.jsx', 'src/screens/parent/ParentOverride.jsx',
  'src/components/PocketMoney.jsx', 'src/components/KidThemesParent.jsx']) {
  const src = read(f)
  const bare = [...src.matchAll(/<(span|div|p|h1|h2)\b([^>]*)>\{(kid|k|linked|confirm)\??\.name\}<\/\1>/g)].filter((m) => !/data-pilot-private/.test(m[2]))
  ok(`${f.split('/').pop()}: each child's name shown on its own is marked data-pilot-private`, /data-pilot-private=""/.test(src) && bare.length === 0,
    bare.map((m) => m[0]).join(' '))
}
const bridge = read('src/pilot/pilotRankUp.js')
ok('"Explain this screen" also takes out every family name left on the screen', /withoutNames\(raw, privateNames\(\)\)/.test(bridge))

console.log('\n=== The privacy policy describes Pilot ===')
const legal = read('src/data/legalText.js')
const section = legal.slice(legal.indexOf("heading: 'Pilot"), legal.indexOf("heading: 'Pilot") + 3000)
ok('a section on Pilot', legal.includes("heading: 'Pilot"))
ok('parents only, never a child', /Parent Mode/.test(section) && /never on a child/i.test(section))
ok("the parent's own key, kept in their browser", /your own (AI )?key/i.test(section) && /browser/i.test(section))
ok('what is sent, and what never is', /first names and chore titles/i.test(section) && /never/i.test(section) && /photo/i.test(section))
ok('RankUp\'s server receives none of it', /server never receives your key or your conversation/.test(section))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
