import { defineConfig } from 'vite'
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

export default defineConfig({
  plugins: [react(), devApiRoutes()],
  server: { host: true, port: 5173 },
  build: { outDir: 'dist' },
})
