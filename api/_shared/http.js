/**
 * Every call these functions make to the database, with a time limit.
 *
 * Stripe (api/_shared/stripe.js), email (email.js) and push (push.js) already
 * gave up after a few seconds. The database did not: every call to Supabase
 * (twenty in the functions themselves, and the shared makeServiceRpc most of
 * them use) waited for as long as the host let them. When Supabase is slow or
 * paused, a parent tapping "Manage billing" watched a spinner until the host
 * cut the function off, and a scheduled job could hold its run open for
 * minutes and then record nothing at all.
 *
 * Now each one stops waiting, and fails like a dropped connection, so the
 * function answers with its usual plain error and the job records the failure
 * (and /api/health shows it). Nothing is retried here: most of these calls
 * change something, and only the caller knows whether asking twice is safe.
 *
 * The answer is read to the end inside the limit too, so a server that sends
 * its headers and then stalls is caught as well. tests/failsoft.mjs holds it.
 */

/** A person is waiting on these: a checkout, the billing portal, a push. */
export const DB_TIMEOUT_MS = 10_000

/**
 * The scheduled jobs' bigger queries (the leaderboards, retention). Nobody is
 * watching a spinner, but a job must still finish, or fail, and say so.
 */
export const JOB_TIMEOUT_MS = 25_000

export class TimeoutError extends Error {
  constructor(ms) {
    super(`no answer within ${ms} ms`)
    this.name = 'TimeoutError'
    this.timeout = true
  }
}

/**
 * fetch(url, init), with the whole answer read within `ms`. Resolves to a
 * Response like fetch's (status, ok, headers, text(), json()); rejects with a
 * TimeoutError when the time runs out, or as fetch does when it fails.
 */
export async function timedFetch(url, init = {}, ms = DB_TIMEOUT_MS) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new TimeoutError(ms))
    }, ms)
  })
  try {
    const res = await Promise.race([fetch(url, { ...init, signal: controller.signal }), timeout])
    const body = await Promise.race([res.text(), timeout])
    // A function that returns nothing answers 204, which may carry no body.
    const empty = [101, 204, 205, 304].includes(res.status)
    return new Response(empty ? null : body, { status: res.status, statusText: res.statusText, headers: res.headers })
  } catch (err) {
    if (err?.name === 'AbortError') throw new TimeoutError(ms)
    throw err
  } finally {
    clearTimeout(timer)
  }
}
