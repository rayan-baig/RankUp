/**
 * What strangers and search engines see: the icons, the link preview, and
 * robots.txt and the sitemap.
 *
 *   - every icon index.html and the manifest name is a file in public/, at
 *     the size it claims;
 *   - the link preview has a title, a description and a picture, and the
 *     picture's address is whole (https://rankup.<your domain>/og-image.png)
 *     or left out, never relative;
 *   - nothing a person reads in it claims RankUp takes photos;
 *   - robots.txt keeps crawlers off /api/, and the sitemap lists the front
 *     door and nothing else: every other screen is a hash route inside that
 *     one page, and a family's data is never in a page at all.
 *
 * Reads files and runs the build's own functions; needs nothing running.
 * tests/bundle.mjs checks a real build without PUBLIC_SITE_URL has no picture
 * tag; this checks both ways through the same code.
 *
 *   node tests/sharecard.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { publicSiteUrl, shareCardHtml, sitemapXml } from '../vite.config.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

/** Width and height of a PNG, from its header. */
function pngSize(path) {
  const b = readFileSync(path)
  if (b.toString('ascii', 1, 4) !== 'PNG') return null
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`
}

const html = readFileSync('index.html', 'utf8')
const tag = (re) => html.match(re)?.[1] ?? null
const meta = (attr, name) => tag(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))

console.log('\n=== Every icon named is a real file, at the size it says ===')
const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon|manifest)" href="([^"]+)"(?: sizes="([^"]+)")?/g)]
  .map((m) => ({ rel: m[1], href: m[2], sizes: m[3] || null }))
ok('index.html names a favicon, an apple-touch-icon and the manifest',
  ['icon', 'apple-touch-icon', 'manifest'].every((rel) => links.some((l) => l.rel === rel)))
for (const l of links) {
  const file = `public${l.href}`
  ok(`${l.rel} ${l.href} exists`, existsSync(file))
  if (existsSync(file) && l.sizes && l.href.endsWith('.png')) ok(`  and is ${l.sizes}`, pngSize(file) === l.sizes, pngSize(file))
}
const touch = links.find((l) => l.rel === 'apple-touch-icon')
ok('the apple-touch-icon is 180x180, what iOS asks for', touch && pngSize(`public${touch.href}`) === '180x180')

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
ok('the manifest has a name and icons', Boolean(manifest.name && manifest.icons?.length))
for (const icon of manifest.icons || []) {
  const file = `public/${icon.src.replace(/^\.?\//, '')}`
  ok(`manifest icon ${icon.src} exists`, existsSync(file))
  if (existsSync(file) && icon.type === 'image/png') ok(`  and is ${icon.sizes}`, pngSize(file) === icon.sizes, pngSize(file))
}
ok('the manifest has a 192 and a 512 icon, which Android needs to install',
  ['192x192', '512x512'].every((s) => (manifest.icons || []).some((i) => i.sizes === s)))
ok('and a maskable one', (manifest.icons || []).some((i) => i.purpose === 'maskable'))

console.log('\n=== The link preview ===')
ok('og:title', Boolean(meta('property', 'og:title')))
ok('og:description', Boolean(meta('property', 'og:description')))
ok('og:image, built from the site address', meta('property', 'og:image') === '{{SITE}}/og-image.png', meta('property', 'og:image'))
ok('twitter:image the same', meta('name', 'twitter:image') === '{{SITE}}/og-image.png')
ok('the picture exists, at 1200x630', pngSize('public/og-image.png') === '1200x630')
const words = [meta('name', 'description'), meta('property', 'og:description'), meta('name', 'twitter:description')].join(' ')
ok('no preview text says RankUp takes or checks photos', !/photo|picture|camera|the app checks/i.test(words), words)

const SITE = 'https://rankup.example.com'
ok('the site address is read as an origin', publicSiteUrl(`${SITE}/`) === SITE && publicSiteUrl(` ${SITE} `) === SITE)
for (const junk of ['', undefined, 'rankup.example.com', '/', 'sentinel-public_site_url-4f1c9a', 'javascript:alert(1)', 'ftp://x.example.com']) {
  ok(`and ${JSON.stringify(junk)} is no address at all`, publicSiteUrl(junk) === '')
}
const withSite = shareCardHtml(html, SITE)
ok('with an address, og:image is whole', /<meta property="og:image" content="https:\/\/rankup\.example\.com\/og-image\.png"/.test(withSite))
ok('and twitter:image', /<meta name="twitter:image" content="https:\/\/rankup\.example\.com\/og-image\.png"/.test(withSite))
ok('and og:url is the front door', /<meta property="og:url" content="https:\/\/rankup\.example\.com\/"/.test(withSite))
ok('and no marker is left', !withSite.includes('{{SITE}}'))
const without = shareCardHtml(html, '')
ok('without one, the picture tags are left out', !/og:image|twitter:image/.test(without), without.match(/.*(og:image|twitter:image).*/)?.[0])
ok('and no marker or relative picture is left', !without.includes('{{SITE}}') && !/content="\/og-image/.test(without))
ok('but the title and description stay', /og:title/.test(without) && /og:description/.test(without))
const relative = [...withSite.matchAll(/<meta (?:property|name)="(?:og:image|og:url|twitter:image)" content="([^"]+)"/g)].filter((m) => !/^https?:\/\//.test(m[1]))
ok('no preview address is relative', relative.length === 0, relative.map((m) => m[1]).join(', '))

console.log('\n=== robots.txt and the sitemap ===')
const robots = readFileSync('public/robots.txt', 'utf8')
const rules = robots.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
ok('robots.txt speaks to every crawler', rules.includes('User-agent: *'))
ok('and keeps them off /api/', rules.includes('Disallow: /api/'))
ok('without shutting the front door', !rules.some((l) => /^Disallow:\s*\/?\s*$/.test(l)))
ok('and names no sitemap itself: the build adds it, whole, when it knows the address', !/^Sitemap:/m.test(robots))
const sitemap = sitemapXml(SITE)
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
ok('the sitemap lists the front door and nothing else', locs.length === 1 && locs[0] === `${SITE}/`, locs.join(', '))
ok('no hash route, no /api, nothing private', !/#|\/api|parent|kid|operator|school/.test(sitemap))
const vite = readFileSync('vite.config.js', 'utf8')
ok('the build writes them only with a real address', /if \(!site\) return/.test(vite) && /Sitemap: \$\{site\}\/sitemap\.xml/.test(vite))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
