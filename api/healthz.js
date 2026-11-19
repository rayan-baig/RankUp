/**
 * Serverless function: is the site's server answering at all?
 *
 * The cheapest check there is. It reads no setting and asks no database, so
 * it can be asked every minute for ever at no cost, and a 200 means exactly
 * one thing: the host is up and running RankUp's functions. When this is fine
 * and /api/health is not, the problem is the database (Supabase), not the
 * host. See api/health.js and docs/OPERATIONS.md.
 */
import pkg from '../package.json' with { type: 'json' }

const VERSION = pkg.version

export default function handler(req, res) {
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'method_not_allowed', version: VERSION })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ ok: true, version: VERSION })
}
