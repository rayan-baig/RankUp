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
