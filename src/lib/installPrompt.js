/**
 * When to offer "Add to Home Screen", and how.
 *
 * Offered on a first visit it is noise: nobody adds an app to their home
 * screen before it has done anything for them, and a parent who says "not
 * now" to it there is never asked again. The moment it is worth something is
 * just after the loop has worked once, so it waits for the family's first
 * accepted chore and then appears once on the parent's dashboard.
 *
 * Never on a child's phone, and never anywhere a child is playing: a child
 * cannot install anything on a parent's behalf, and a card about the home
 * screen in the middle of their quests is in the way. (A child's own phone
 * is set up by the parent who links it.)
 *
 * The two platforms want opposite things. Chrome and Edge on Android fire
 * `beforeinstallprompt`, which is caught here as early as the page loads
 * (it fires once, often long before the dashboard is open), kept, and
 * replayed from our own button. iPhone Safari fires nothing and has no API,
 * so it gets the two steps in words: Share, then Add to Home Screen.
 *
 * Once answered, never again on that phone: "Install", "Not now" and "Got it"
 * are all remembered, and an app already on the home screen never asks.
 */

export const INSTALL_DISMISSED_KEY = 'rankup.install.dismissed.v1'

let deferred = null
const listeners = new Set()
const tell = () => listeners.forEach((fn) => { try { fn(deferred) } catch { /* a listener's own problem */ } })

/**
 * Called once at start-up (src/main.jsx), before any screen, so the event is
 * not missed. Chrome would otherwise show its own install bar at whatever
 * moment it chose; it is held for ours.
 */
export function listenForInstall(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.addEventListener) return
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    tell()
  })
  win.addEventListener('appinstalled', () => {
    deferred = null
    rememberInstallAnswered()
    tell()
  })
}

/** The saved event, if Chrome offered one; and a way to hear when it does. */
export const savedInstallEvent = () => deferred
export function onInstallEvent(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
/** The saved event can be used once; after it is, it is gone. */
export function spendInstallEvent() {
  deferred = null
  tell()
}

export function installAnswered() {
  try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1' } catch { return false }
}
export function rememberInstallAnswered() {
  try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1') } catch { /* private mode: asked again next time */ }
}

/** Already opened from the home screen. */
export function isStandalone(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false
  return Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches || win.navigator?.standalone)
}

/** An iPhone, iPad or iPod, including an iPad that says it is a Mac. */
export function isIos(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false
  const ua = String(nav.userAgent || '')
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1)
}

/** Has this family accepted a chore yet? The moment the card waits for. */
export function hasAcceptedChore(state) {
  return (state?.submissions || []).some((s) => s.status === 'approved')
}

/**
 * Which card to show, if any: 'install' (a button that opens Chrome's own
 * prompt), 'ios' (the steps in words), or null.
 */
export function installCard(state, { event = deferred, standalone = isStandalone(), ios = isIos(), answered = installAnswered() } = {}) {
  if (!state || state.demo) return null
  if (state.device?.role === 'kid') return null
  if (state.session?.role === 'kid') return null
  if (standalone || answered) return null
  if (!hasAcceptedChore(state)) return null
  if (event) return 'install'
  if (ios) return 'ios'
  // A browser that cannot install, or has not offered to: a card describing
  // something impossible is worse than none.
  return null
}
