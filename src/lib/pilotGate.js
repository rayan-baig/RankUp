/**
 * Where Pilot, the AI helper, may appear, and the small switch that loads it.
 *
 * For grown-ups: Parent Mode after the PIN, a parent's set-up after "I'm a
 * parent", the gift and School League pages. Never the front door (nobody
 * has said whose phone it is), a child's screen or a child's phone. Two locks:
 *
 *   1. pilotRoute: the screen is one of Pilot's;
 *   2. childMayHaveIt: the state says a child could be holding the phone (a
 *      child's phone in any state, a child's profile, Parent Mode locked).
 *      Pilot's config refuses to mount then too (kidView).
 *
 * useKidHere and useParentHere (components/PilotGate.jsx) mark the set-up
 * screens of a child and of a parent, before the state says anything.
 * The rest of Pilot is fetched only once allowed and the page has loaded,
 * so a child's phone never downloads it. docs/PILOT.md.
 */

/** The public pages Pilot is on, for parents and visitors. */
const PUBLIC_PAGES = new Set(['/gift', '/gift/card', '/school', '/school/help', '/school/report', '/district'])

/** Lock 1: one of Pilot's screens? parentSetup: a parent's set-up screen is open. */
export function pilotRoute(route, state, parentSetup = false) {
  const r = String(route || '').split('?')[0]
  if (r === '/parent' || r.startsWith('/parent/')) return Boolean(state?.onboarded)
  if (PUBLIC_PAGES.has(r)) return true
  // The door's route: only for the parent's set-up, never the door itself.
  return (r === '/welcome' || r === '/') && !state?.onboarded && parentSetup
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
let parentScreens = 0
let bridge = null
let loading = false
let forgotten = false

/** Pilot is shown right now: both locks open and no child's screen open. */
export function pilotShows(snap = snapshot) {
  return Boolean(snap) && kidScreens === 0
    && pilotRoute(snap.route, snap.state, parentScreens > 0) && !childMayHaveIt(snap.state)
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

/** A parent's set-up screen (after "I'm a parent") opened (+1) or closed (-1). */
export function markParentScreen(delta) {
  parentScreens = Math.max(0, parentScreens + delta)
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
