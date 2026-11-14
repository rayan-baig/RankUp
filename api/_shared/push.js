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

/*
 * The VAPID signature, reused. web-push signs a fresh token for every message
 * it builds, and that signature is most of the work: 0.7 ms of processor
 * time a push, against 0.2 ms with the token reused (measured; see
 * docs/NOTIFICATIONS.md). A Cloudflare Function has a budget of processor
 * time per request, and a scheduled job sending a thousand pushes spent most
 * of it signing the same thing a thousand times. A token names the push
 * service it is for and is good for twelve hours; one is kept per push
 * service for an hour, per running copy of the function.
 */
const VAPID_REUSE_MS = 60 * 60 * 1000
const vapidTokens = new Map()

function vapidAuthorization(endpoint, vapid, now = Date.now()) {
  const audience = new URL(endpoint).origin
  const key = `${audience} ${vapid.publicKey}`
  const kept = vapidTokens.get(key)
  if (kept && kept.until > now) return kept.header
  const header = webpush.getVapidHeaders(audience, vapid.subject, vapid.publicKey, vapid.privateKey, 'aes128gcm').Authorization
  vapidTokens.set(key, { header, until: now + VAPID_REUSE_MS })
  return header
}

/** How long one push may take before it is given up on, so one slow push service cannot hold a job. */
const PUSH_TIMEOUT_MS = 10000

/**
 * Send one push. `vapid` ({ subject, publicKey, privateKey }) reuses the
 * signature as above; without it, the keys given to webpush.setVapidDetails
 * sign each message, as before. `topic` (at most 32 letters, digits, - and _)
 * lets the push service replace an undelivered message with the same topic
 * instead of keeping both, which is what makes a repeated send harmless.
 */
export async function sendPush(subscription, payload, { ttl = NOTICE_TTL_SECONDS, topic, vapid } = {}) {
  const options = { TTL: ttl, urgency: 'normal' }
  if (topic) options.topic = topic
  if (vapid) {
    options.vapidDetails = null
    options.headers = { Authorization: vapidAuthorization(subscription.endpoint, vapid) }
  }
  const request = webpush.generateRequestDetails(subscription, payload, options)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS)
  let res
  try {
    res = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    })
    // Read to the end, so the connection is free for the next push. Workers
    // allow six open at once, and an unread answer keeps its one open.
    await res.arrayBuffer().catch(() => null)
  } finally {
    clearTimeout(timer)
  }
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
