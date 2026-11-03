/**
 * The bits every scheduled job repeats: the shared secret, and recording that
 * the run happened.
 *
 * The recording is what makes a job that silently stops being called visible —
 * see supabase/health.sql. It is best-effort on purpose: failing to write the
 * bookkeeping must never turn a successful run into a failed one.
 */

/** Timing-safe, so the secret cannot be discovered one character at a time. */
export function secretMatches(given, expected) {
  if (!expected || !given || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Headers for calling the database as the signed-in person, with their own
 * token, so row level security decides what they may do.
 *
 * `apikey` is the project's public (anon) key, not the person's token. The
 * gateway in front of a real Supabase project accepts only the project's own
 * keys there and turns anything else away before the database is asked; the
 * person is named by the Authorization header. Sending the person's token as
 * `apikey` worked against the local stand-in, which did not check it, and
 * would have failed every push, checkout and billing-portal call on a real
 * project. The local stand-in now checks it as Supabase does
 * (supabase/test/mock-server.mjs).
 *
 * VITE_SUPABASE_ANON_KEY is the same value the app is built with; the host
 * gives the functions the project's settings as well as the build.
 */
export function userHeaders(token) {
  const anon = process.env.VITE_SUPABASE_ANON_KEY || ''
  return { 'Content-Type': 'application/json', apikey: anon || token, Authorization: `Bearer ${token}` }
}

export function makeServiceRpc(supabaseUrl, serviceKey) {
  return async function serviceRpc(fn, args) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(args),
    })
    if (!res.ok) throw new Error(`${fn} failed: ${res.status}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
}

export async function recordRun(serviceRpc, job, ok, error) {
  try {
    await serviceRpc('record_job_run', { p_job: job, p_ok: ok, p_error: error || null })
  } catch {
    // Bookkeeping must never be the thing that fails a run.
  }
  // A run that failed is an error like any other: it goes in the error report.
  if (!ok) await reportError(job, error || 'failed')
}

/**
 * Take out of an error message anything that could point at somebody before
 * it is stored or sent: sign-in tokens and keys, emails, ids (a family's is a
 * uuid; Stripe's start cus_, sub_ and so on), anything in quotes (an error
 * quotes the value that caused it) and runs of four or more digits. The
 * database does the same again (error_scrub, supabase/crashes.sql), and the
 * error report also takes out every name it knows.
 */
export function scrubErrorText(text) {
  return String(text ?? '')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 [token]')
    .replace(/(access_token|refresh_token|token|code|key|password|pin)=[^&\s]+/gi, '$1=[removed]')
    .replace(/[\w.%+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b(cus|sub|si|pi|pm|cs|in|ii|ch|re|txn|evt|price|prod|seti|acct|sk|pk|rk|whsec)_(test_|live_)?[A-Za-z0-9]{8,}/g, '[id]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"…"')
    .replace(/\d{4,}/g, '[number]')
}

/**
 * A server function's error: to the host's log, as before, and to the
 * database (record_server_error), where the hourly error report finds it.
 * `where` is the function's name; `err` an Error or a message. Never the
 * request, never who asked: only the message, scrubbed. Best effort, and
 * never more than three seconds: reporting an error must not become one.
 */
export async function reportError(where, err) {
  const message = scrubErrorText(String(err?.message ?? err ?? 'error')).slice(0, 300)
  console.error(`[${where}]`, message)
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    await fetch(`${url}/rest/v1/rpc/record_server_error`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_where: String(where).slice(0, 40), p_message: message }),
    })
  } catch {
    // The log line above is all there is, and that is fine.
  } finally {
    clearTimeout(timer)
  }
}
