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

/**
 * How long the push service holds a notice for a phone that is off or out of
 * signal, in seconds. A phone that is offline when a notice is sent gets it
 * when it comes back, as long as it comes back within this.
 *
 * Said here rather than left to web-push's default (also four weeks), so a
 * library update cannot quietly change it, and so a sender with a reason to
 * keep a notice shorter can say so: a reminder is worth having at its time,
 * not the next afternoon (see send-reminders).
 */
export const NOTICE_TTL_SECONDS = 28 * 24 * 60 * 60

export async function sendPush(subscription, payload, { ttl = NOTICE_TTL_SECONDS } = {}) {
  // Uses the keys given to webpush.setVapidDetails, as sendNotification did.
  const request = webpush.generateRequestDetails(subscription, payload, { TTL: ttl, urgency: 'normal' })
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
 * Only an answer from the push service about this subscription does. An error
 * with no status (no network, a bug here) is not the phone's fault, and
 * counting it against the phone was how working phones got dropped.
 *
 * Nor is "slow down" (429) or the push service having trouble (5xx): those
 * are about the service, not the phone. They were counted, and a phone is
 * left out after five (push_targets), with nothing that ever resets the count
 * but turning notifications off and on — so a bad hour at a push service
 * silenced every phone that happened to be sent something in it, for good.
 */
export function failureFor(reason) {
  const status = reason?.statusCode
  if (!status || status === 429 || status >= 500) return null
  return { gone: status === 404 || status === 410 }
}
