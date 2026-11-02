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
}
