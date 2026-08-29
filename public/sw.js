/**
 * RankUp service worker.
 *
 * Its whole job is notifications. It deliberately does NOT cache the app: an
 * offline-capable cache that serves a stale build is a well-known way to leave
 * someone stuck on a broken version, and the app already works offline through
 * its own local storage.
 *
 * Two paths arrive here:
 *
 *   push  — a real Web Push message from the server. Works with the app closed,
 *           which is the entire point of push.
 *   message — the page asking for a notification directly. No push service, no
 *           network, works immediately; but only while the app is running.
 */

const DEFAULT_ICON = '/icon.svg'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function show(payload) {
  const {
    title = 'RankUp',
    body = '',
    tag,
    url = '/',
    requireInteraction = false,
  } = payload || {}

  return self.registration.showNotification(title, {
    body,
    icon: DEFAULT_ICON,
    badge: DEFAULT_ICON,
    // A tag replaces an earlier notification with the same one, so five
    // approvals do not stack into five separate buzzes.
    tag: tag || 'rankup',
    renotify: Boolean(tag),
    requireInteraction,
    data: { url },
  })
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'RankUp', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(show(payload))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'show-notification') {
    event.waitUntil(show(event.data.payload))
  }
})

/**
 * Tapping a notification should land on the thing it is about, and should reuse
 * an already-open tab rather than piling up new ones.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(target)
          return client.focus()
        }
      }
      return self.clients.openWindow?.(target)
    }),
  )
})
