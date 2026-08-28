/**
 * Talking to Supabase over plain HTTP.
 *
 * Deliberately no Supabase client library: the app needs four verbs, and going
 * direct keeps every request visible. It also means the whole stack can be
 * pointed at a local Postgres during development (see supabase/test/mock-server.mjs)
 * without swapping libraries.
 */

const BASE = import.meta.env?.VITE_SUPABASE_URL || ''
const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY || ''
const SESSION_KEY = 'rankup.session.v1'

export function isConfigured() {
  return Boolean(BASE && ANON)
}

/** The signed-in user's token, if there is one. */
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

function headers(extra = {}) {
  const session = getSession()
  return {
    'Content-Type': 'application/json',
    apikey: ANON,
    Authorization: `Bearer ${session?.access_token || ANON}`,
    ...extra,
  }
}

class HttpError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed (${status})`)
    this.status = status
    this.body = body
    // 4xx means the request itself is wrong; retrying it forever is pointless.
    this.retryable = status === 0 || status === 408 || status === 429 || status >= 500
  }
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, options)
  } catch (err) {
    // No network at all — always worth retrying.
    throw new HttpError(0, { message: err.message })
  }
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = { message: text } }
  if (!res.ok) throw new HttpError(res.status, body)
  return body
}

export const transport = {
  isConfigured,

  /** Call a Postgres function. */
  rpc: (fn, args = {}) =>
    request(`/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) }),

  /** Insert or replace a row. Row level security decides whether it is allowed. */
  upsert: (table, row) =>
    request(`/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row),
    }),

  delete: (table, id) =>
    request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' }),
    }),

  select: (table, params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/rest/v1/${table}${query ? `?${query}` : ''}`, { method: 'GET', headers: headers() })
  },

  /* ---------------- accounts ---------------- */

  signUp: async (email, password) => {
    const session = await request('/auth/v1/signup', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    })
    // Supabase can be configured to require email confirmation, in which case
    // no token comes back and the person has to click a link first.
    if (session?.access_token) setSession(session)
    return session
  },

  signIn: async (email, password) => {
    const session = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    })
    setSession(session)
    return session
  },

  /**
   * A kid's phone signs in anonymously.
   *
   * It genuinely has no account — no email, no password — but it still needs an
   * identity, because row level security decides what it may read by asking who
   * is calling. The anonymous id is handed to the pairing code and written onto
   * the kids row when a parent claims it.
   */
  signInAnonymously: async () => {
    const session = await request('/auth/v1/signup', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ data: {}, anonymous: true }),
    })
    if (session?.access_token) setSession(session)
    return session
  },

  signOut: () => setSession(null),

  currentUserId: () => getSession()?.user?.id || null,
}

export { HttpError }
