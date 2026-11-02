import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Content-Security-Policy, written into the built page.
 *
 * Scripts only from this site, so that if a bug ever let somebody put markup
 * into a page, the browser would still refuse to run it. In the page rather
 * than in the host's headers because connect-src has to name the Supabase
 * the build talks to, which is only known at build time (a self-hosted one
 * on its own domain, or a local one while testing). Builds only: the dev
 * server runs its own inline script for hot reloading.
 */
function contentSecurityPolicy(env) {
  let supabase = ''
  try { supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : '' } catch { supabase = '' }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${supabase ? ` ${supabase}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'rankup-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`)
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

export default defineConfig(({ mode }) => ({
  plugins: [react(), contentSecurityPolicy(loadEnv(mode, process.cwd(), '')), offlineFileList()],
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
}))
