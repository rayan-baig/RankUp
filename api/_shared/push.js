/**
 * Sending one Web Push message, on either runtime.
 *
 * web-push's own sendNotification sends with Node's https module. Cloudflare
 * Workers do not have it ("https.request is not implemented"), so on the host
 * this app deploys to, every push failed after it had been encrypted: no
 * reminder, digest or approval notice was ever delivered, each failure was
 * counted against the phone until it was dropped, and the jobs still reported
 * success. Here web-push builds and encrypts the request as before (that part
 * works everywhere) and fetch, which every runtime has, sends it.
 */
import webpush from 'web-push'

export async function sendPush(subscription, payload) {
  // Uses the keys given to webpush.setVapidDetails, as sendNotification did.
  const request = webpush.generateRequestDetails(subscription, payload)
  const res = await fetch(request.endpoint, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  })
  if (!res.ok) {
    const err = new Error(`push service answered ${res.status}`)
    err.statusCode = res.status
    throw err
  }
  return res.status
}

/**
 * Whether a failed send says anything about the phone.
 *
 * Only an answer from the push service does. An error with no status (no
 * network, a bug here) is not the phone's fault, and counting it against the
 * phone was how working phones got dropped.
 */
export function failureFor(reason) {
  const status = reason?.statusCode
  if (!status) return null
  return { gone: status === 404 || status === 410 }
}
