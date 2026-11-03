import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { EXTERNAL_GAMES } from './src/components/games/external/bridges.js'

/**
 * The Content-Security-Policy, written into the built page.
 *
 * Scripts only from this site, so that if a bug ever let somebody put markup
 * into a page, the browser would still refuse to run it. In the page rather
 * than in the host's headers because connect-src has to name the Supabase
 * the build talks to, which is only known at build time (a self-hosted one
 * on its own domain, or a local one while testing). Builds only: the dev
 * server runs its own inline script for hot reloading.
 *
 * The one exception to "only from this site" is the arcade's four standalone
 * games, which run in sandboxed srcdoc frames — and a srcdoc frame lives
 * under this policy, not one of its own. Without them named here every one
 * of those games, and the bridge that reports its score, was refused in the
 * built app and drew a black rectangle, while the dev server (no policy)
 * showed nothing wrong. So each of their scripts is allowed by the hash of
 * its exact text, worked out below from the very string the frame is given,
 * plus the one file Tennis Tour imports from a CDN. See externalGames().
 */
function contentSecurityPolicy(env) {
  let root = process.cwd()
  let supabase = ''
  try { supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : '' } catch { supabase = '' }
  const policy = () => [
    "default-src 'self'",
    `script-src 'self' ${gameScriptSources(root).join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // data: for the small pictures the build inlines. Not blob:, which was
    // for previewing a photo before it was sent; RankUp takes none.
    "img-src 'self' data:",
    `connect-src 'self'${supabase ? ` ${supabase}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // The app has no form that submits anywhere: every one is handled in the page.
    "form-action 'none'",
  ].join('; ')
  return {
    name: 'rankup-csp',
    apply: 'build',
    configResolved(config) { root = config.root },
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy()}">`)
    },
  }
}

/**
 * The arcade's four standalone HTML games, as the documents their frames are
 * given: the game's own HTML with its bridge (external/bridges.js) appended.
 *
 * Built here rather than in the component so that the policy above hashes
 * exactly the text the frame runs. Each game is its own module,
 * 'virtual:rankup-game/<name>', so opening one game downloads that game and
 * not all four — and so the service worker keeps each with the rest of
 * assets/, which is what lets three of the four open with no signal.
 *
 * Why srcdoc and hashes, rather than serving each game as a page of its own
 * with its own policy? That was tried, and works online, but a frame
 * sandboxed without allow-same-origin has no origin, and a service worker
 * does not answer for a frame with no origin — so every game would need the
 * internet, where today only Tennis Tour does. The hashes let through only
 * those exact scripts, which is nothing a page injection could use.
 */
const GAMES_SOURCE = 'src/components/games/external'
const GAME_MODULE = 'virtual:rankup-game/'

function gameDocument(root, name) {
  const { file, bridge } = EXTERNAL_GAMES[name]
  const html = readFileSync(join(root, GAMES_SOURCE, file), 'utf8').replace(/\r\n?/g, '\n')
  // After the game's own markup, so the elements the bridge watches already
  // exist when it runs.
  return `${html}\n<script>${bridge}</script>\n`
}

/** What script-src must allow for the four games to run in their frames. */
function gameScriptSources(root) {
  const sources = []
  for (const name of Object.keys(EXTERNAL_GAMES)) {
    for (const m of gameDocument(root, name).matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/i.test(m[1] || '')) throw new Error(`rankup-external-games: ${name} loads a script by address; add it to its scripts in bridges.js`)
      sources.push(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`)
    }
    sources.push(...EXTERNAL_GAMES[name].scripts)
  }
  return [...new Set(sources)]
}

function externalGames() {
  let root = process.cwd()
  return {
    name: 'rankup-external-games',
    configResolved(config) { root = config.root },
    resolveId(id) {
      return id.startsWith(GAME_MODULE) ? `\0${id}` : null
    },
    load(id) {
      if (!id.startsWith(`\0${GAME_MODULE}`)) return null
      const name = id.slice(GAME_MODULE.length + 1)
      if (!Object.hasOwn(EXTERNAL_GAMES, name)) throw new Error(`rankup-external-games: no game called ${name}`)
      this.addWatchFile(join(root, GAMES_SOURCE, EXTERNAL_GAMES[name].file))
      // \u003c for <, so the game's own closing script tags cannot end a
      // script this bundle is ever inlined into.
      return `export default ${JSON.stringify(gameDocument(root, name)).replace(/</g, '\\u003c')}`
    },
  }
}


/**
 * Tells the service worker which files this build is made of.
 *
 * public/sw.js keeps the app on the phone so it opens offline. It needs two
 * lists, and only the build knows them, because every file name carries a
 * fingerprint of its contents:
 *
 *   shell — what the page loads before the first screen (its script, the
 *           shared pieces that script needs, and the stylesheet), read from
 *           the built page itself so it is exactly what a phone fetches.
 *   files — everything in assets/: the screens, the games and the pictures,
 *           so ones nobody has opened yet can be fetched in the background and
 *           open offline too, and pieces of older versions can be told apart
 *           and thrown away.
 *
 * Written into the copied sw.js rather than a separate file, so the worker
 * itself changes whenever the build does — which is how a browser learns
 * there is a new version to fetch.
 */
function offlineFileList() {
  return {
    name: 'rankup-offline-files',
    apply: 'build',
    writeBundle(options, bundle) {
      const worker = join(options.dir, 'sw.js')
      if (!existsSync(worker)) return
      const names = Object.keys(bundle).filter((name) => name.startsWith('assets/'))
      const page = String(bundle['index.html']?.source || '')
      const shell = [...page.matchAll(/(?:src|href)="(?:\.?\/)?(assets\/[^"]+)"/g)].map((m) => m[1])
      const build = { shell: [...new Set(shell)], files: names }
      const source = readFileSync(worker, 'utf8')
      const filled = source.replace(/^const BUILD = null\b.*$/m, `const BUILD = ${JSON.stringify(build)}`)
      if (filled === source) throw new Error('rankup-offline-files: could not find "const BUILD = null" in sw.js')
      writeFileSync(worker, filled)
    },
  }
}

/**
 * React itself in a file of its own. It is needed on the first screen like
 * the app's own code, but it changes far less often: kept apart, a phone that
 * already has it keeps it across app updates instead of downloading it again
 * inside a new app file every time.
 */
function vendorChunk(id) {
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
  return undefined
}

/**
 * The version, from package.json, built into the app as __APP_VERSION__ (read
 * through src/lib/version.js). Never typed anywhere by hand: bump
 * package.json and add its CHANGELOG.md entry, and Settings → About and
 * /api/health both follow. tests/release.mjs checks the two agree.
 */
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

/**
 * The site's public address, from PUBLIC_SITE_URL, as an origin with no
 * trailing slash — or '' when it is unset or not a real http(s) address.
 *
 * A link preview's picture and a sitemap's addresses must be whole addresses
 * (https://rankup.<your domain>/og-image.png): a relative one is ignored by
 * most of the apps a link gets pasted into, or worse, read against their own
 * domain. So with no address to build from, they are left out rather than
 * shipped half-made.
 */
export function publicSiteUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.origin
  } catch {
    return ''
  }
}

/**
 * The link-preview tags in index.html, made whole.
 *
 * index.html carries og:image and twitter:image as a path after a marker
 * (content="{{SITE}}/og-image.png"). Here the marker becomes the site's
 * address, and og:url is added; with no address every og:image and
 * twitter:image tag is removed, so a preview shows the title and description
 * and no broken picture.
 */
export function shareCardHtml(html, site) {
  if (site) {
    return html
      .replaceAll('{{SITE}}', site)
      .replace('<meta property="og:type"', `<meta property="og:url" content="${site}/" />\n    <meta property="og:type"`)
  }
  return html
    .replace(/^[ \t]*<meta (?:property="og:image[^"]*"|name="twitter:image")[^>]*>\r?\n/gm, '')
    .replace('content="summary_large_image"', 'content="summary"')
}

/**
 * robots.txt says where the sitemap is, and the sitemap lists the one public
 * page: the front door. Everything else is a hash route (#/parent, #/legal/…)
 * inside that one page, which a search engine does not treat as a page of its
 * own, so there is nothing else to list. Both need the whole address, so with
 * none the sitemap is not written and robots.txt names none.
 */
export function sitemapXml(site) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${site}/</loc></url>`,
    '</urlset>',
    '',
  ].join('\n')
}

function publicSiteFiles(env) {
  const site = publicSiteUrl(env.PUBLIC_SITE_URL)
  return {
    name: 'rankup-public-site',
    transformIndexHtml(html) { return shareCardHtml(html, site) },
    writeBundle(options) {
      if (!site) return
      writeFileSync(join(options.dir, 'sitemap.xml'), sitemapXml(site))
      const robots = join(options.dir, 'robots.txt')
      if (existsSync(robots)) writeFileSync(robots, `${readFileSync(robots, 'utf8').trimEnd()}\n\nSitemap: ${site}/sitemap.xml\n`)
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    contentSecurityPolicy(loadEnv(mode, process.cwd(), '')),
    publicSiteFiles(loadEnv(mode, process.cwd(), '')),
    externalGames(),
    offlineFileList(),
  ],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
}))
