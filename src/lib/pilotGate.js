/**
 * Where Pilot, the AI helper, may appear, and the small switch that loads it.
 *
 * Pilot is for grown-ups: a parent in Parent Mode after the PIN, and the
 * public pages a parent or a visitor reads (the signed-out front door, the
 * gift pages, the School League pages). Never a child's screen, never a
 * child's phone. Two locks, both needed:
 *
 *   1. pilotRoute: the screen is one of Pilot's (the route check);
 *   2. childMayHaveIt: nothing in the app's state says a child could be
 *      holding the phone (a child's phone, set up, being set up or unlinked;
 *      a child's profile chosen; Parent Mode locked). Pilot's config refuses
 *      to mount on it too (src/pilot/pilotRankUp.js, kidView).
 *
 * A screen a child uses before any of that is in the state (setting a phone
 * up as a child's) says so with useKidHere (components/PilotGate.jsx), which
 * keeps Pilot away while it is open.
 *
 * Everything else about Pilot is fetched only once it is allowed and the
 * page has finished loading: this file is all a phone gets before that, so
 * a child's phone never downloads Pilot at all. docs/PILOT.md.
 */

/** The public pages Pilot is on, for parents and visitors. */
const PUBLIC_PAGES = new Set(['/gift', '/gift/card', '/school', '/school/help', '/school/report', '/district'])

/** Lock 1: is this one of Pilot's screens? */
export function pilotRoute(route, state) {
  const r = String(route || '').split('?')[0]
  if (r === '/parent' || r.startsWith('/parent/')) return Boolean(state?.onboarded)
  if (PUBLIC_PAGES.has(r)) return true
  // The signed-out front door (the guard keeps a set-up phone off it).
  return (r === '/welcome' || r === '/') && !state?.onboarded
}

/** A child's own phone: set up as one, being set up as one, or unlinked from being one. */
export function childsPhone(state) {
  const device = state?.device || {}
  return device.role === 'kid' || Boolean(device.linkedKidId) || Boolean(state?.pendingPairing) || Boolean(state?.deviceWipedChild)
}

/** Lock 2: does the app's state say a child may be holding the phone? */
export function childMayHaveIt(state) {
  if (!state || childsPhone(state)) return true
  if (state.session?.role === 'kid') return true
  // A set-up phone with Parent Mode locked is the child's turn on it.
  return Boolean(state.onboarded && !state.session?.parentUnlocked)
}

let snapshot = null
let kidScreens = 0
let bridge = null
let loading = false
let forgotten = false

/** Pilot is shown right now: both locks open and no child's screen open. */
export function pilotShows(snap = snapshot) {
  return Boolean(snap) && kidScreens === 0 && pilotRoute(snap.route, snap.state) && !childMayHaveIt(snap.state)
}

/** The latest state, dispatch and route, for Pilot's tools. */
export const pilotSnapshot = () => snapshot

/** Called on every render of the app (before the screen is painted). */
export function updatePilot(next) {
  snapshot = next
  apply()
}

/** A child's screen opened (+1) or closed (-1). */
export function markKidScreen(delta) {
  kidScreens = Math.max(0, kidScreens + delta)
  apply()
}

function apply() {
  if (!snapshot || typeof document === 'undefined') return
  const on = pilotShows()
  const root = document.documentElement
  root.dataset.pilot = on ? 'on' : 'off'
  // Parent Mode has the tab bar along the bottom: the robot sits above it.
  root.dataset.pilotTabs = on && String(snapshot.route).startsWith('/parent') ? 'on' : 'off'
  if (childsPhone(snapshot.state)) forgetPilot()
  if (bridge) bridge.update(snapshot, on)
  else if (on && !loading) load()
}

/** Fetch the rest of Pilot once the page has loaded. */
function load() {
  loading = true
  const go = () => import('../pilot/pilotRankUp.js')
    .then((m) => { bridge = m.connect(); apply() })
    .catch(() => { loading = false })
  const later = () => setTimeout(go, 600)
  if (document.readyState === 'complete') later()
  else window.addEventListener('load', later, { once: true })
}

/*
 * On a child's phone nothing of Pilot is kept: a phone a parent once used
 * Pilot on and that later became a child's loses any key or chat it held.
 */
function forgetPilot() {
  if (forgotten) return
  forgotten = true
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const store = window[name]
      const keys = []
      for (let i = 0; i < store.length; i += 1) keys.push(store.key(i))
      keys.filter((k) => k && k.startsWith('rankup-pilot')).forEach((k) => store.removeItem(k))
    } catch { /* storage blocked: nothing kept there either */ }
  }
}
