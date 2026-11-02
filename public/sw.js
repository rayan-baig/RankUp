/**
 * RankUp service worker.
 *
 * Two jobs: notifications, and letting the app open with no signal.
 *
 * OFFLINE
 *
 * The app's data already lives on the phone (src/lib/storage.js). What a phone
 * with no signal was missing was the app itself: the page and its code. Those
 * are kept here, in a way chosen so it cannot leave anybody stuck on an old
 * build — the classic failure of an offline cache:
 *
 *   the page — always asked of the network first. Online, you get whatever is
 *              deployed now, every time. Only when the network fails does the
 *              last copy you had answer instead.
 *   the rest — the code and pictures under assets/ have their contents'
 *              fingerprint in their names, so a name never means two
 *              different files. Those are safe to answer from the cache
 *              without asking, and are.
 *
 * The code comes in pieces, fetched as each screen or game is first opened.
 * Once the first screen is up the page asks for the rest of assets/ to be
 * fetched quietly in the background, so a screen nobody has opened yet still
 * opens offline later, pictures included. Each file is fetched once: a new
 * version only fetches the files that changed. Files the new version no
 * longer has are thrown away when it takes over.
 *
 * Which files exist is written into BUILD by vite.config.js at build time. On
 * the dev server BUILD stays null and nothing is cached at all.
 *
 * NOTIFICATIONS
 *
 * Two paths arrive here:
 *
 *   push  — a real Web Push message from the server. Works with the app closed,
 *           which is the entire point of push.
 *   message — the page asking for a notification directly. No push service, no
 *           network, works immediately; but only while the app is running.
 */

const BUILD = null // replaced at build time; see vite.config.js

const DEFAULT_ICON = '/icon.svg'
const CACHE = 'rankup-app'
// Hosts mark files as varying by Origin, and the page asks for its scripts
// with one while this worker fetched them without. One address is one file
// here whoever asks, so that difference must not make a kept file miss.
const MATCH = { ignoreVary: true }

const scope = () => self.registration.scope
const PAGE_URL = () => new URL('./', scope()).href
const ASSETS = () => new URL('assets/', scope()).pathname
const inScope = (path) => new URL(path, scope()).href

self.addEventListener('install', (event) => {
  self.skipWaiting()
  if (BUILD) event.waitUntil(keepShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (BUILD) await forgetOldFiles().catch(() => {})
    await self.clients.claim()
  })())
})

/** A response that can be stored and replayed for a page load. */
function storable(response) {
  // A response that followed a redirect cannot answer a page load from the
  // cache — the browser refuses it. A copy without that history can.
  if (!response.redirected) return response
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

function isHtml(response) {
  return (response.headers.get('content-type') || '').includes('text/html')
}

/**
 * Keep one file. Never a page where code was asked for: a host that answers
 * every unknown address with the app's page (ours do — that is how the routes
 * work) would otherwise store a page under a script's name, and the app
 * would fail to start until that was cleared by hand.
 */
async function keep(cache, url, { page = false } = {}) {
  // The page is checked with the server; a fingerprinted file never changes,
  // so whatever copy the browser already holds is the right one.
  const response = await fetch(url, page ? { cache: 'no-cache' } : undefined)
  if (!response.ok || isHtml(response) !== page) return
  await cache.put(url, storable(response))
}

/**
 * The page and what the first screen needs. Small, and most of it is already
 * in the browser's own cache from the visit that registered this worker.
 * Failures are ignored on purpose: this worker also delivers notifications,
 * and a dropped connection mid-install must not cost a parent those.
 */
async function keepShell() {
  const cache = await caches.open(CACHE)
  await Promise.allSettled([
    keep(cache, PAGE_URL(), { page: true }),
    ...BUILD.shell.map((path) => keep(cache, inScope(path))),
  ])
}

/** Every file this version has, fetched only if not already kept. */
async function keepEverything() {
  const cache = await caches.open(CACHE)
  const missing = []
  for (const path of BUILD.files) {
    const url = inScope(path)
    if (!(await cache.match(url, MATCH))) missing.push(url)
  }
  // A few at a time, so a phone on a weak signal is not asked for everything
  // at once while somebody is using the app.
  while (missing.length) {
    await Promise.allSettled(missing.splice(0, 4).map((url) => keep(cache, url)))
  }
}

/** Throw away files this version no longer has. */
async function forgetOldFiles() {
  const current = new Set(BUILD.files.map((path) => inScope(path)))
  const cache = await caches.open(CACHE)
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith(ASSETS()) && !current.has(request.url)) await cache.delete(request)
  }
}

async function answerPage(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && isHtml(response) && request.url.split('#')[0].split('?')[0] === PAGE_URL()) {
      await cache.put(PAGE_URL(), storable(response.clone()))
    }
    return response
  } catch (err) {
    const kept = await cache.match(PAGE_URL(), MATCH)
    if (kept) return kept
    throw err
  }
}

async function answerAsset(request) {
  const cache = await caches.open(CACHE)
  const kept = await cache.match(request, MATCH)
  if (kept) return kept
  const response = await fetch(request)
  if (response.ok && !isHtml(response)) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  if (!BUILD) return
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    // The server's own endpoints are never the app's page.
    if (url.pathname.startsWith(new URL('api/', scope()).pathname)) return
    event.respondWith(answerPage(request))
    return
  }
  if (url.pathname.startsWith(ASSETS())) event.respondWith(answerAsset(request))
})

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
  if (event.data?.type === 'keep-app' && BUILD) {
    event.waitUntil(keepEverything().catch(() => {}))
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
