import { createElement, lazy } from 'react'

/**
 * A screen or game whose code is downloaded the first time it is shown.
 *
 * The app used to be one file holding every screen and all twenty-four games,
 * so opening it on a phone meant downloading and reading the lot before the
 * first screen appeared. Now the first file holds only what every screen
 * shares, and each screen arrives when somebody goes there — so opening the
 * app fetches that core plus the one screen it lands on. The service worker
 * keeps each piece once fetched and fetches the rest in the background, so
 * after the first visit they all open offline (public/sw.js).
 *
 * Two things can go wrong that a single file never had to think about, and
 * both are handled here rather than in every screen:
 *
 * A new version was deployed while the app sat open. The open page still asks
 * for the old pieces by their old names, and the server no longer has them.
 * Reloading picks up the new version, whose pieces do exist. Only once in a
 * short while, so a server that is genuinely broken shows the screen's own
 * crash card instead of reloading forever.
 *
 * The phone is offline and has never fetched this piece. The screen's card
 * says there is no internet (components/ScreenBoundary.jsx), and Try again,
 * or the signal coming back, fetches it afresh without restarting the app.
 */
const RELOADED_AT = 'rankup.reloadedForUpdate'
const RELOAD_GAP_MS = 30_000

function reloadForNewVersion() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) || 0)
    if (Date.now() - last < RELOAD_GAP_MS) return false
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch {
    return false // no storage to remember it in, so no way to stop a loop
  }
  window.location.reload()
  return true
}

/*
 * Pieces whose download failed, each with a way to ask for it afresh.
 *
 * A failed piece stays failed until somebody asks again — Try again on the
 * screen's card, or the phone coming back online. Swapping in a fresh
 * download the moment one failed (as this first did) meant the error never
 * reached the screen's card at all: React rendered again straight away,
 * which started the next download, which failed in turn, and a phone with no
 * signal sat on "Loading…" for ever instead of being told why.
 */
const failed = new Set()

/** Fetch every piece that failed again, the next time it is shown. */
export function retryFailedLoads() {
  for (const reset of failed) reset()
  failed.clear()
}

if (typeof window !== 'undefined') window.addEventListener('online', retryFailedLoads)

export function lazyLoad(load) {
  let Loaded = lazy(attempt)

  function attempt() {
    return load().catch((err) => {
      // Never settles: the page is about to be replaced.
      if (reloadForNewVersion()) return new Promise(() => {})
      failed.add(() => { Loaded = lazy(attempt) })
      throw err
    })
  }

  return function LazyLoaded(props) {
    return createElement(Loaded, props)
  }
}
