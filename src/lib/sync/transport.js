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
/**
 * The signed-in session is namespaced per device for the same reason the app
 * state is: with `?device=` running a second device in one browser, a shared
 * session key would silently sign both of them in as the same account.
 */
function sessionKey() {
  try {
    const device = new URLSearchParams(window.location.search).get('device')
    return device ? `rankup.session.v1.${device.replace(/[^a-z0-9_-]/gi, '')}` : 'rankup.session.v1'
  } catch {
    return 'rankup.session.v1'
  }
}

export function isConfigured() {
  return Boolean(BASE && ANON)
}

/** The signed-in user's token, if there is one. */
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey()) || 'null')
  } catch {
    return null
  }
}

export function setSession(session) {
  if (session) localStorage.setItem(sessionKey(), JSON.stringify(withExpiry(session)))
  else localStorage.removeItem(sessionKey())
}

/**
 * The access token to send to one of the app's own endpoints, renewed first if
 * it is about to run out. Those endpoints check it the same way the database
 * does, so an hour-old token fails there too.
 */
export async function freshAccessToken() {
  /*
   * Not while the network is paused for the look-around. The endpoints that
   * take this token (deleting the account, checkout, a push to the family's
   * phones) are reached with fetch, not through `request`, so the pause did
   * not cover them: a visitor who had signed up, stepped back to the welcome
   * screen and opened the look-around could delete their real account, or
   * buzz their real family, from the demo's buttons.
   */
  if (paused) return null
  await refreshSession()
  return getSession()?.access_token || null
}

/** Supabase sends expires_in (seconds from now); keep the moment it expires. */
function withExpiry(session) {
  if (!session || !session.expires_in || session.expiry_counted) return session
  // Counted from this phone's clock, not the server's expires_at: a phone
  // whose clock is an hour fast would otherwise think every token had already
  // run out and renew before every request.
  return { ...session, expires_at: Math.floor(Date.now() / 1000) + Number(session.expires_in), expiry_counted: true }
}

/**
 * Keeping the sign-in alive.
 *
 * A Supabase access token lasts an hour. Nothing here ever renewed it, so an
 * hour after signing in every request came back 401 "JWT expired" — and a 401
 * was treated as the server refusing the write, which the outbox drops. Every
 * approval, submission and edit from that phone after the first hour was
 * silently thrown away while the screen showed it as done. A kid's phone,
 * signed in anonymously, stopped syncing for the same reason.
 *
 * Now the token is renewed with the refresh token a minute before it runs
 * out, and again if the server says it has expired anyway. One renewal at a
 * time: a dozen requests finding an old token at once share one.
 */
const REFRESH_EARLY_S = 60
let refreshing = null
let signInNeeded = false

async function refreshSession({ force = false } = {}) {
  const session = getSession()
  if (!session?.refresh_token) return null
  if (!force) {
    const expiresAt = Number(session.expires_at) || 0
    if (!expiresAt || expiresAt - Date.now() / 1000 > REFRESH_EARLY_S) return session
  }
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        })
        const body = await res.json().catch(() => null)
        // Signed out, or signed in as somebody else, while this was in flight:
        // the answer belongs to a session that no longer exists.
        if (getSession()?.refresh_token !== session.refresh_token) return getSession()
        if (res.ok && body?.access_token) {
          // Keep the user if the answer leaves it out: currentUserId reads it.
          setSession({ ...body, user: body.user || session.user })
          signInNeeded = false
          return getSession()
        }
        // The refresh token itself was refused: only signing in again helps.
        // Not 429 (asked too often) or anything else passing.
        if (res.status === 400 || res.status === 401) signInNeeded = true
        return null
      } catch {
        return null // offline; try again on the next request
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
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
    // Except 401: that says who is asking has run out, not that the write is
    // wrong. Dropping on it is how an expired token threw away every change;
    // a write waiting on a sign-in has to wait, not vanish.
    this.retryable = status === 0 || status === 401 || status === 408 || status === 429 || status >= 500
    this.auth = status === 401
  }
}

/**
 * One request. `extra` headers are added to the usual ones, which are worked
 * out here rather than by the caller so a renewed token is the one sent.
 */
async function request(path, { extra, auth = true, ...options } = {}, retried = false) {
  if (auth) await refreshSession()
  let res
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers: headers(extra) })
  } catch (err) {
    // No network at all — always worth retrying.
    throw new HttpError(0, { message: err.message })
  }
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = { message: text } }
  if (res.status === 401 && auth && !retried && getSession()?.refresh_token) {
    // Expired early, or the clock is wrong: renew once and ask again.
    if (await refreshSession({ force: true })) return request(path, { extra, auth, ...options }, true)
  }
  if (!res.ok) throw new HttpError(res.status, body)
  return body
}

/**
 * A hard stop on all outbound traffic.
 *
 * Set while somebody is looking around the demo family. Gating each caller
 * worked until the next screen was written that fetched something on mount,
 * and then the demo was quietly talking to a server again — which a test
 * caught twice in one afternoon. One switch at the door is the only version of
 * this that stays true as the app grows.
 *
 * Reads resolve to null and writes throw, because a read that fails should
 * leave a card showing nothing while a write that silently did not happen is a
 * lie to whoever called it.
 */
let paused = false

export function pauseNetwork(on) {
  paused = Boolean(on)
}

class NetworkPaused extends Error {
  constructor() {
    super('RankUp is in look-around mode; nothing is sent to a server.')
    this.name = 'NetworkPaused'
    this.retryable = false
  }
}

export const transport = {
  isConfigured,
  pauseNetwork,

  /** Call a Postgres function. */
  rpc: (fn, args = {}) =>
    (paused
      ? Promise.resolve(null)
      : request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })),

  /** Insert or replace a row. Row level security decides whether it is allowed. */
  upsert: (table, row) =>
    (paused
      ? Promise.reject(new NetworkPaused())
      : request(`/rest/v1/${table}`, {
        method: 'POST',
        extra: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      })),

  /**
   * Change some columns of a row that already exists, and only those.
   *
   * An upsert sends every column, so a parent who fixed a typo in a child's
   * name also sent the lockdown columns as their phone last saw them — and a
   * Red lockdown the other parent had just applied was lifted by a rename.
   */
  patch: (table, id, columns) => {
    if (paused) return Promise.reject(new NetworkPaused())
    const body = { ...columns }
    delete body.id
    return request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      extra: { Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    })
  },

  delete: (table, id) =>
    (paused
      ? Promise.reject(new NetworkPaused())
      : request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        extra: { Prefer: 'return=minimal' },
      })),

  select: (table, params = {}) => {
    if (paused) return Promise.resolve(null)
    const query = new URLSearchParams(params).toString()
    return request(`/rest/v1/${table}${query ? `?${query}` : ''}`, { method: 'GET' })
  },

  /* ---------------- accounts ---------------- */

  signUp: async (email, password) => {
    const session = await request('/auth/v1/signup', {
      method: 'POST',
      auth: false,
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
      auth: false,
      body: JSON.stringify({ email, password }),
    })
    setSession(session)
    signInNeeded = false
    return session
  },

  /**
   * Check an account's password without changing who this phone is signed
   * in as. Answers the session the server would give, or throws (a wrong
   * password is a 400). The caller decides whether to keep it: the PIN reset
   * keeps it only when it is the same account already signed in here, so a
   * correct password for some other account changes nothing.
   */
  checkPassword: (email, password) =>
    request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password }),
    }),

  /** Keep a session checkPassword gave, once the caller has checked it is this phone's account. */
  keepSession: (session) => { setSession(session); signInNeeded = false },

  /** The signed-in account's email, if it has one. A child's phone signs in anonymously and has none. */
  currentEmail: () => {
    const user = getSession()?.user
    return user && !user.is_anonymous && user.email ? user.email : null
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
      auth: false,
      body: JSON.stringify({ data: {}, anonymous: true }),
    })
    if (session?.access_token) setSession(session)
    return session
  },

  signOut: () => { signInNeeded = false; setSession(null) },

  currentUserId: () => getSession()?.user?.id || null,

  /** True once the server has refused to renew the sign-in: only signing in again helps. */
  needsSignIn: () => signInNeeded,

  /** For tests: renew now, as a request would. */
  refreshSession,
}

export { HttpError }
