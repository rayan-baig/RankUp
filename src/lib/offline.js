/**
 * Keeping the app on the phone, so it opens with no signal.
 *
 * The service worker (public/sw.js) does the keeping. This starts it once the
 * first screen is up and the phone has a quiet moment — never before, because
 * the first screen is the thing being waited for — and then asks it to fetch
 * the screens and games not opened yet, in the background.
 *
 * Built app only. The dev server has no fixed file list to keep, and a worker
 * holding on to files there would only get in the way of editing.
 */
export function keepAppForOffline() {
  if (!import.meta.env.PROD) return
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const start = () => {
    // Resolved against the page, for the same reason as in notifications.js:
    // the app is not always served at the root of its domain.
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI))
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.active?.postMessage({ type: 'keep-app' }))
      .catch(() => { /* opened from a file, or a browser that refuses: online only */ })
  }
  const whenQuiet = () => (window.requestIdleCallback
    ? window.requestIdleCallback(start, { timeout: 5000 })
    : setTimeout(start, 2000))

  if (document.readyState === 'complete') whenQuiet()
  else window.addEventListener('load', whenQuiet, { once: true })
}
