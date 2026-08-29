/**
 * A local stand-in for Supabase's REST API, backed by a real Postgres.
 *
 * WHY THIS EXISTS: without it, every line of sync code is written hopefully and
 * verified never. With it, the browser talks real HTTP to a real database with
 * real row level security, so the security rules are tested the way they will
 * actually be used rather than only from a SQL prompt.
 *
 * It implements the small slice of Supabase the app uses:
 *   POST /rest/v1/rpc/<fn>   call a Postgres function
 *   GET  /rest/v1/<table>    read rows (RLS applies)
 *   POST /auth/v1/token      hand out a fake session for a test user
 *
 * DEVELOPMENT ONLY. It trusts the bearer token completely and does no
 * signature checking, which is precisely what a real auth server must not do.
 * It is never imported by the app and never deployed.
 */

import http from 'node:http'
import pg from 'pg'

const PORT = Number(process.env.MOCK_PORT || 54321)
const pool = new pg.Pool({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
  max: 8,
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS })
  res.end(JSON.stringify(body))
}

/** The bearer token here is just a user id — enough to exercise auth.uid(). */
function userIdFrom(req) {
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token || token === 'anon' || token.startsWith('eyJ')) return null
  return /^[0-9a-f-]{36}$/i.test(token) ? token : null
}

/**
 * Every request runs as `app_user`, never the owner, so row level security is
 * genuinely in force. A superuser connection would silently bypass every policy
 * and make these tests worthless.
 */
async function withUser(userId, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local role app_user')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId || ''])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
  })

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }

  const url = new URL(req.url, 'http://localhost')
  const userId = userIdFrom(req)
  if (process.env.MOCK_LOG) console.log(req.method, url.pathname, 'as', userId || '(anon)')

  try {
    // --- call a database function -------------------------------------------
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.slice('/rest/v1/rpc/'.length)
      if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return send(res, 400, { message: 'bad function name' })
      const body = await readBody(req)
      const names = Object.keys(body)
      const args = names.map((n, i) => `${n} => $${i + 1}`).join(', ')
      const values = names.map((n) => {
        const v = body[n]
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
      })

      // PostgREST hands back JSON. A raw driver hands back a composite type as
      // the string "(123456,...)", which every caller would then have to parse.
      // to_jsonb() makes this harness behave the way the real thing does.
      let out
      try {
        out = await withUser(userId, (c) => c.query(`select to_jsonb(${fn}(${args})) as result`, values))
      } catch (err) {
        // Functions returning void have no jsonb form; call them plainly.
        if (err.code === '42883' || /function to_jsonb/.test(err.message || '')) {
          out = await withUser(userId, (c) => c.query(`select ${fn}(${args}) as result`, values))
        } else {
          throw err
        }
      }
      return send(res, 200, out.rows[0]?.result ?? null)
    }

    // --- read a table (row level security decides what comes back) ----------
    if (url.pathname.startsWith('/rest/v1/') && req.method === 'GET') {
      const table = url.pathname.slice('/rest/v1/'.length)
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) return send(res, 400, { message: 'bad table' })
      const filters = []
      const values = []
      for (const [key, raw] of url.searchParams.entries()) {
        if (['select', 'order', 'limit'].includes(key)) continue
        const [op, value] = raw.split('.')
        const sqlOp = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=', neq: '<>' }[op]
        if (!sqlOp || !/^[a-z_][a-z0-9_]*$/.test(key)) continue
        values.push(value)
        filters.push(`${key} ${sqlOp} $${values.length}`)
      }
      const where = filters.length ? ` where ${filters.join(' and ')}` : ''
      const limit = url.searchParams.get('limit')
      const sql = `select * from ${table}${where}${limit ? ` limit ${Number(limit) || 100}` : ''}`
      const out = await withUser(userId, (c) => c.query(sql, values))
      return send(res, 200, out.rows)
    }

    // --- insert or replace a row (row level security decides) ---------------
    if (url.pathname.startsWith('/rest/v1/') && req.method === 'POST') {
      const table = url.pathname.slice('/rest/v1/'.length)
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) return send(res, 400, { message: 'bad table' })
      const row = await readBody(req)
      const cols = Object.keys(row).filter((c) => /^[a-z_][a-z0-9_]*$/.test(c))
      if (!cols.length) return send(res, 400, { message: 'no columns' })

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')
      const merge = String(req.headers.prefer || '').includes('merge-duplicates')
      const conflict = merge && updates ? `on conflict (id) do update set ${updates}` : 'on conflict (id) do nothing'
      const sql = `insert into ${table} (${cols.join(', ')}) values (${placeholders}) ${conflict}`

      const values = cols.map((c) => {
        const v = row[c]
        // Postgres wants JSON for jsonb columns and arrays for text[].
        return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v
      })
      await withUser(userId, (c) => c.query(sql, values))
      return send(res, 201, {})
    }

    // --- delete a row -------------------------------------------------------
    if (url.pathname.startsWith('/rest/v1/') && req.method === 'DELETE') {
      const table = url.pathname.slice('/rest/v1/'.length)
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) return send(res, 400, { message: 'bad table' })
      const idFilter = url.searchParams.get('id') || ''
      const id = idFilter.replace(/^eq\./, '')
      if (!id) return send(res, 400, { message: 'id filter required' })
      await withUser(userId, (c) => c.query(`delete from ${table} where id = $1`, [id]))
      return send(res, 204, {})
    }

    // --- accounts -----------------------------------------------------------
    // Passwords are NOT checked here. This harness exists to exercise row level
    // security, and a real auth server is what checks credentials. Never deploy it.
    if (url.pathname.startsWith('/auth/v1/')) {
      const body = await readBody(req)

      if (url.pathname === '/auth/v1/signup' && body.anonymous) {
        const out = await pool.query('insert into auth.users (email) values (null) returning id')
        const id = out.rows[0].id
        return send(res, 200, { access_token: id, user: { id, email: null, is_anonymous: true } })
      }

      if (url.pathname === '/auth/v1/signup') {
        const existing = await pool.query('select id from auth.users where email = $1', [body.email])
        if (existing.rows.length) return send(res, 400, { message: 'User already registered' })
        const out = await pool.query('insert into auth.users (email) values ($1) returning id', [body.email])
        const id = out.rows[0].id
        return send(res, 200, { access_token: id, user: { id, email: body.email } })
      }

      if (url.pathname.startsWith('/auth/v1/token')) {
        const out = await pool.query('select id from auth.users where email = $1', [body.email])
        if (!out.rows.length) return send(res, 400, { message: 'Invalid login credentials' })
        const id = out.rows[0].id
        return send(res, 200, { access_token: id, user: { id, email: body.email } })
      }
    }

    return send(res, 404, { message: 'not found' })
  } catch (err) {
    // Postgres raises exceptions for policy violations; pass the reason through
    // so tests can assert on it.
    return send(res, 400, { message: err.message, code: err.code })
  }
})

server.listen(PORT, () => console.log(`mock supabase on http://localhost:${PORT}`))
