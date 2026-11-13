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

/**
 * The token a scheduled job presents. Real Supabase gives the service role key
 * a connection that bypasses row level security entirely, which is how the
 * cron endpoints reach functions revoked from `public`. Without an equivalent
 * here they get "permission denied" and none of the three scheduled jobs can be
 * tested outside production.
 */
const SERVICE_KEY = process.env.MOCK_SERVICE_ROLE_KEY || 'service-role-key'

/*
 * Passwords given at sign-up through this stand-in, so a wrong one is refused
 * the way Supabase refuses it (the PIN reset depends on that). Held in memory
 * and only for accounts made here: a fixture inserted straight into
 * auth.users has none, and signs in with anything, as before.
 */
const PASSWORDS = new Map()

function isServiceRole(req) {
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  return Boolean(auth) && auth === SERVICE_KEY
}

/**
 * The project's own keys, the only things Supabase's gateway accepts in the
 * `apikey` header: the public (anon) key the app is built with, and the
 * service role key. Anything else is turned away before the database is
 * asked, as it is on a real project. This stand-in used to ignore the header,
 * and four server functions sent a person's sign-in token there: every test
 * passed, and every push and checkout would have been refused in production.
 */
const ANON_KEY = process.env.MOCK_ANON_KEY || 'local-anon-key'
const apiKeyAccepted = (req) => [ANON_KEY, SERVICE_KEY].includes(String(req.headers.apikey || ''))

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
async function withUser(userId, fn, { service = false } = {}) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    // The service role keeps the owner connection, exactly as it does on real
    // Supabase. Everything else drops to app_user so row level security is
    // genuinely in force — a superuser connection for ordinary requests would
    // bypass every policy and make these tests worthless.
    if (!service) await client.query('set local role app_user')
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

/** The arguments of a database function that are arrays (text[] and the like), by name. */
const arrayArgCache = new Map()
async function arrayArgsOf(fn) {
  if (arrayArgCache.has(fn)) return arrayArgCache.get(fn)
  const { rows } = await pool.query(
    `select u.name from pg_proc p
       cross join lateral unnest(p.proargnames[1:coalesce(array_length(p.proargtypes::oid[], 1), 0)],
                                 p.proargtypes::oid[]) as u(name, type)
       join pg_type t on t.oid = u.type
      where p.proname = $1 and t.typcategory = 'A'`, [fn])
  const names = new Set(rows.map((r) => r.name))
  arrayArgCache.set(fn, names)
  return names
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
  if (!apiKeyAccepted(req)) {
    return send(res, 401, { message: req.headers.apikey ? 'Invalid API key' : 'No API key found in request' })
  }
  const userId = userIdFrom(req)
  const service = isServiceRole(req)
  if (process.env.MOCK_LOG) console.log(req.method, url.pathname, 'as', userId || '(anon)')

  try {
    // --- call a database function -------------------------------------------
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.slice('/rest/v1/rpc/'.length)
      if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return send(res, 400, { message: 'bad function name' })
      const body = await readBody(req)
      const names = Object.keys(body)
      const args = names.map((n, i) => `${n} => $${i + 1}`).join(', ')
      // PostgREST turns a JSON array into a Postgres array for a text[] (or
      // any array) argument, and into JSON for a jsonb one. So does this: an
      // array goes as an array only where the function says it takes one.
      const arrays = await arrayArgsOf(fn)
      const values = names.map((n) => {
        const v = body[n]
        if (Array.isArray(v) && arrays.has(n)) return v
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
      })

      // PostgREST hands back JSON. A raw driver hands back a composite type as
      // the string "(123456,...)", which every caller would then have to parse.
      // to_jsonb() makes this harness behave the way the real thing does.
      // A function that returns a set comes back from PostgREST as an array of
      // rows. Selecting it like a scalar returned only the first row, as a bare
      // object, and callers that map over the array (send-push over its
      // targets) then failed in tests that had any phone registered at all.
      const retset = await pool.query('select bool_or(proretset) as s from pg_proc where proname = $1', [fn])
      if (retset.rows[0]?.s) {
        const rows = await withUser(userId, (c) => c.query(
          `select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) as result from ${fn}(${args}) t`, values), { service })
        return send(res, 200, rows.rows[0]?.result ?? [])
      }

      let out
      try {
        out = await withUser(userId, (c) => c.query(`select to_jsonb(${fn}(${args})) as result`, values), { service })
      } catch (err) {
        // Functions returning void have no jsonb form; call them plainly.
        if (err.code === '42883' || /function to_jsonb/.test(err.message || '')) {
          out = await withUser(userId, (c) => c.query(`select ${fn}(${args}) as result`, values), { service })
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
      const out = await withUser(userId, (c) => c.query(sql, values), { service })
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
      await withUser(userId, (c) => c.query(sql, values), { service })
      return send(res, 201, {})
    }

    // --- change some columns of a row (row level security decides) ---------
    if (url.pathname.startsWith('/rest/v1/') && req.method === 'PATCH') {
      const table = url.pathname.slice('/rest/v1/'.length)
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) return send(res, 400, { message: 'bad table' })
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '')
      if (!id) return send(res, 400, { message: 'id filter required' })
      const row = await readBody(req)
      const cols = Object.keys(row).filter((c) => c !== 'id' && /^[a-z_][a-z0-9_]*$/.test(c))
      if (!cols.length) return send(res, 400, { message: 'no columns' })
      const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
      const values = cols.map((c) => {
        const v = row[c]
        return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v
      })
      await withUser(userId, (c) => c.query(`update ${table} set ${sets} where id = $${cols.length + 1}`, [...values, id]), { service })
      return send(res, 204, {})
    }

    // --- delete a row -------------------------------------------------------
    if (url.pathname.startsWith('/rest/v1/') && req.method === 'DELETE') {
      const table = url.pathname.slice('/rest/v1/'.length)
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) return send(res, 400, { message: 'bad table' })
      const idFilter = url.searchParams.get('id') || ''
      const id = idFilter.replace(/^eq\./, '')
      if (!id) return send(res, 400, { message: 'id filter required' })
      await withUser(userId, (c) => c.query(`delete from ${table} where id = $1`, [id]), { service })
      return send(res, 204, {})
    }

    // --- accounts -----------------------------------------------------------
    // Passwords are checked only for accounts signed up here (PASSWORDS above),
    // and are kept in plain memory. This harness exists to exercise row level
    // security, and a real auth server is what checks credentials. Never deploy it.
    if (url.pathname.startsWith('/auth/v1/')) {
      const body = await readBody(req)

      if (url.pathname === '/auth/v1/signup' && body.anonymous) {
        const out = await pool.query('insert into auth.users (email) values (null) returning id')
        const id = out.rows[0].id
        return send(res, 200, session(id, { id, email: null, is_anonymous: true }))
      }

      if (url.pathname === '/auth/v1/signup') {
        const existing = await pool.query('select id from auth.users where email = $1', [body.email])
        if (existing.rows.length) return send(res, 400, { message: 'User already registered' })
        const out = await pool.query('insert into auth.users (email) values ($1) returning id', [body.email])
        const id = out.rows[0].id
        if (body.password) PASSWORDS.set(String(body.email), String(body.password))
        return send(res, 200, session(id, { id, email: body.email }))
      }

      // Renewing a session. The refresh token is "r." and the user id.
      if (url.pathname.startsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'refresh_token') {
        const id = String(body.refresh_token || '').replace(/^r\./, '')
        const out = /^[0-9a-f-]{36}$/.test(id) ? await pool.query('select id, email from auth.users where id = $1', [id]) : { rows: [] }
        if (!out.rows.length) return send(res, 400, { message: 'Invalid Refresh Token' })
        return send(res, 200, session(id, { id, email: out.rows[0].email }))
      }

      if (url.pathname.startsWith('/auth/v1/token')) {
        const out = await pool.query('select id from auth.users where email = $1', [body.email])
        if (!out.rows.length) return send(res, 400, { message: 'Invalid login credentials' })
        const known = PASSWORDS.get(String(body.email))
        if (known !== undefined && known !== String(body.password ?? '')) {
          return send(res, 400, { message: 'Invalid login credentials' })
        }
        const id = out.rows[0].id
        return send(res, 200, session(id, { id, email: body.email }))
      }
    }

    return send(res, 404, { message: 'not found' })
  } catch (err) {
    // Postgres raises exceptions for policy violations; pass the reason through
    // so tests can assert on it.
    return send(res, 400, { message: err.message, code: err.code })
  }
})

/** A session as Supabase shapes it: the token here is just the user id. */
function session(id, user) {
  return { access_token: id, refresh_token: `r.${id}`, expires_in: 3600, token_type: 'bearer', user }
}

server.listen(PORT, () => console.log(`mock supabase on http://localhost:${PORT}`))
