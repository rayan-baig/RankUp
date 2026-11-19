/**
 * The first load stays light on a slow phone. docs/PERFORMANCE.md has the
 * numbers; these are the changes that made them, so none can quietly undo:
 *
 *   - the artwork in src/assets/art is never copied into the JavaScript, and
 *     a typeface never into the stylesheet (vite.config.js, inlineAsset);
 *   - the typefaces are this site's own files, not Google's: no stylesheet
 *     from another company in the page's head, and every font file named in
 *     src/styles/fonts.css exists, at the weights the page used to ask for;
 *   - files under /assets/ are cached for a year on both hosts, and the page
 *     and the service worker never are;
 *   - the service worker fetches ahead only the basic Latin typefaces, not
 *     every alphabet;
 *   - the arcade's tiles and the theme picker's portraits load as they come
 *     into view.
 *
 * Reads files only. tests/bundle.mjs checks the same in a real build: the
 * first file's size, no picture in it, no third-party stylesheet.
 */
import { existsSync, readFileSync } from 'node:fs'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const read = (f) => readFileSync(f, 'utf8')

console.log('\n=== Pictures and typefaces are files of their own ===')
const { inlineAsset } = await import('../vite.config.js')
ok('an avatar, an arcade tile or an icon is never written into the code',
  inlineAsset('/repo/src/assets/art/avatar-apex.svg') === false
  && inlineAsset('/repo/src/assets/art/game-snake.svg') === false
  && inlineAsset('C:\\repo\\src\\assets\\art\\icon-coin.svg') === false)
ok('nor a typeface (the policy allows fonts from this site only, not data:)',
  inlineAsset('/repo/node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-cyrillic-ext-wght-normal.woff2') === false)
ok('anything else follows Vite\'s usual rule', inlineAsset('/repo/src/components/games/x.png') === undefined)
ok('and the build uses it', /assetsInlineLimit: inlineAsset/.test(read('vite.config.js')))

console.log('\n=== The typefaces come from this site ===')
const page = read('index.html')
ok('no stylesheet or connection to Google in the page', !/fonts\.(googleapis|gstatic)\.com/.test(page))
ok('no stylesheet from anywhere else either', ![...page.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].some((m) => /https?:\/\//.test(m[0])))
const fonts = read('src/styles/fonts.css')
const files = [...fonts.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1])
const missing = files.filter((f) => !existsSync(`node_modules/${f}`))
ok(`every font file named exists (${files.length})`, files.length >= 15 && missing.length === 0, missing.join(', '))
ok('and each is a package the app depends on',
  ['inter', 'outfit', 'jetbrains-mono'].every((p) => JSON.parse(read('package.json')).dependencies[`@fontsource-variable/${p}`]))
const faces = [...fonts.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1])
const weightsOf = (family) => [...new Set(faces.filter((f) => f.includes(`font-family: ${family};`))
  .map((f) => f.match(/font-weight: ([^;]+);/)[1]))].sort().join(' | ')
ok('Inter 400 to 800, as the page asked Google for', weightsOf('Inter') === '400 800', weightsOf('Inter'))
ok('Outfit 500 to 900', weightsOf('Outfit') === '500 900', weightsOf('Outfit'))
ok('JetBrains Mono 400, 600 and 700 (a 500 still falls back to 400)', weightsOf("'JetBrains Mono'") === '400 | 600 700', weightsOf("'JetBrains Mono'"))
ok('every face swaps in when it arrives, so text is never invisible while it loads',
  faces.every((f) => /font-display: swap;/.test(f)))
ok('the app loads them, before its own stylesheet',
  /import '\.\/styles\/fonts\.css'\nimport '\.\/styles\/index\.css'/.test(read('src/main.jsx')))
const csp = read('vite.config.js')
ok('and the policy no longer names Google', !/fonts\.(googleapis|gstatic)\.com/.test(csp) && /"font-src 'self'"/.test(csp))

console.log('\n=== Fingerprinted files are cached; the page never is ===')
const headers = read('public/_headers')
const vercel = JSON.parse(read('vercel.json'))
const YEAR = 'public, max-age=31536000, immutable'
ok('Cloudflare: /assets/* for a year, immutable', new RegExp(`^/assets/\\*\\n\\s+Cache-Control: ${YEAR}$`, 'm').test(headers))
const vAssets = vercel.headers.find((h) => h.source === '/assets/(.*)')?.headers.find((h) => h.key === 'Cache-Control')?.value
ok('Vercel: the same', vAssets === YEAR, String(vAssets))
ok('the service worker is never cached, so a new version is always found',
  /^\/sw\.js\n\s+Cache-Control: no-cache, no-store, must-revalidate$/m.test(headers)
  && vercel.headers.find((h) => h.source === '/sw.js')?.headers[0]?.value === 'no-cache, no-store, must-revalidate')
ok('nor the page: no rule caches / or /index.html', !/^\/(index\.html)?\s*\n\s+Cache-Control/m.test(headers)
  && !vercel.headers.some((h) => /^\/(index\.html)?$/.test(h.source)))

console.log('\n=== The service worker fetches ahead only what a phone will use ===')
const sw = read('public/sw.js')
const fn = sw.match(/function worthKeepingAhead\(path\) \{([\s\S]*?)\n\}/)?.[1]
const worth = fn ? new Function('path', fn) : () => true
ok('screens, games and pictures are all fetched ahead',
  worth('assets/KidHome-abc123.js') && worth('assets/avatar-blockcraft-1-abc.jpg') && worth('assets/index-abc.css'))
ok('the basic Latin typefaces too', worth('assets/inter-latin-wght-normal-Dx4kXJAl.woff2') && worth('assets/outfit-latin-wght-normal-B9.woff2'))
ok('but not every other alphabet (about 300 KB nobody here may read)',
  !worth('assets/inter-cyrillic-wght-normal-DqGufNeO.woff2') && !worth('assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2')
  && !worth('assets/jetbrains-mono-greek-wght-normal-Bw9x6K1M.woff2'))
ok('and that is what it fetches ahead from', /BUILD\.files\.filter\(worthKeepingAhead\)/.test(sw))

console.log('\n=== Pictures below the fold wait until they are near ===')
for (const f of ['src/screens/kid/KidArcade.jsx', 'src/components/ThemePicker.jsx']) {
  const img = read(f).match(/<img[\s\S]*?\/>/)?.[0] || ''
  ok(`${f.split('/').pop()}: loading="lazy"`, /loading="lazy"/.test(img) && /decoding="async"/.test(img))
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
