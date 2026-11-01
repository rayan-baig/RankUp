import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig(({ mode }) => ({
  plugins: [react(), contentSecurityPolicy(loadEnv(mode, process.cwd(), ''))],
  server: { host: true, port: 5173 },
  build: { outDir: 'dist' },
}))
