import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Runs the /api/verify-photo serverless function during `npm run dev` so the
 * photo check behaves the same locally as it does once deployed.
 * In production Vercel serves the same file — this plugin does nothing there.
 */
function devApiRoutes() {
  return {
    name: 'rankup-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/verify-photo', async (req, res) => {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        req.body = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''

        res.status = (code) => { res.statusCode = code; return res }
        res.json = (payload) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
          return res
        }

        try {
          const mod = await server.ssrLoadModule('/api/verify-photo.js')
          await mod.default(req, res)
        } catch (err) {
          server.config.logger.error(`[dev-api] ${err.message}`)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'dev_api_failed', message: err.message }))
        }
      })
    },
  }
}

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
  plugins: [react(), devApiRoutes(), contentSecurityPolicy(loadEnv(mode, process.cwd(), ''))],
  server: { host: true, port: 5173 },
  build: { outDir: 'dist' },
}))
