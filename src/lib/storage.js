/**
 * Persistence.
 *
 * Right now everything lives in the browser's localStorage, which means data
 * survives a refresh but does NOT sync between devices and is not shared
 * between a parent's phone and a kid's phone. That is the single biggest gap
 * between this build and a real product — see docs/BACKEND.md.
 *
 * All reads/writes in the app go through this one file on purpose: swapping to
 * Supabase later means rewriting this file, not the rest of the app.
 */

import { clearShadow } from './sync/shadow.js'
import { clearOutbox } from './sync/outbox.js'
import { resetCursor } from './sync/syncEngine.js'

/**
 * Device namespace.
 *
 * Normally there is one store per browser, which is one device. Adding
 * `?device=kid` to the address gives that tab its own separate store, so a
 * parent device and a kid device can be run side by side on one computer while
 * building and testing pairing. It is a development convenience only — on two
 * real phones each has its own storage already and no parameter is needed.
 */
function deviceSuffix() {
  try {
    const name = new URLSearchParams(window.location.search).get('device')
    if (!name) return ''
    return `.${name.replace(/[^a-z0-9_-]/gi, '').slice(0, 24)}`
  } catch {
    return ''
  }
}

export const DEVICE_NAME = deviceSuffix().replace(/^\./, '') || null

const KEY = `rankup.state.v1${deviceSuffix()}`
// Where an older version kept proof photos. Only ever deleted now.
const PHOTO_KEY = `rankup.photos.v1${deviceSuffix()}`

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    console.warn('[RankUp] Could not read saved data:', err)
    return null
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch (err) {
    // Most likely the 5MB localStorage quota.
    console.warn('[RankUp] Could not save data:', err)
    return false
  }
}

/**
 * Forget everything this device holds.
 *
 * The sync bookkeeping has to go with the data, and this is why: the shadow is
 * this device's record of "the server already has these rows". Wiping the
 * state while leaving the shadow behind meant the next save compared an EMPTY
 * state against a shadow that still remembered every kid, quest, reward, note
 * and override — and queueChanges treats anything in the shadow but not in the
 * state as deleted. So "Erase this device", whose own wording promises it
 * touches nothing synced, queued a DELETE for the whole family, sent it under
 * the parent's still-valid session, and propagated it to the other parent's
 * phone and the child's through the deletions feed.
 *
 * clearShadow, clearOutbox and resetCursor were all written for this and had
 * no callers anywhere in the project. Doing it here rather than at the three
 * call sites is what stops the fourth one forgetting.
 *
 * The session is deliberately left alone: erasing a device is not signing out,
 * and the one caller that does mean to sign out already says so itself.
 */
export function clearState() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(PHOTO_KEY)
  clearShadow()
  clearOutbox()
  resetCursor()
}

/**
 * Erase everything RankUp keeps on this device, the sign-in included.
 *
 * For a phone that no longer belongs to a family: a child's phone the parent
 * unlinked (or whose child was deleted), or a parent removed from the family.
 * Unlinking used to cut the phone off on the server and leave the child's
 * name, chores, notes and progress on it, readable by whoever has the phone.
 *
 * Every key this device namespace wrote, not a list of known ones, so a key
 * added later cannot be forgotten here. With `?device=` (development only)
 * that is the keys ending in the device's name; without, every key that does
 * not belong to some other named device.
 */
export function wipeDevice() {
  const mine = (k) => {
    if (!k || !k.startsWith('rankup.')) return false
    if (DEVICE_NAME) return k.endsWith(`.${DEVICE_NAME}`)
    return !/\.v\d+\.[a-z0-9_-]+$/i.test(k)
  }
  clearState()
  const keys = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i))
  } catch { /* storage unreadable: clearState above did what it could */ }
  keys.filter(mine).forEach((k) => { try { localStorage.removeItem(k) } catch { /* ignore */ } })
}

/**
 * Delete the photos an older version of RankUp kept on this device.
 *
 * RankUp takes no photos now, and nothing reads this bucket. A phone that ran
 * an older version may still hold proof pictures of a child's room in it, so
 * it is removed whole the first time this version starts. Returns whether
 * there was anything to remove.
 */
export function dropOldPhotos() {
  try {
    if (localStorage.getItem(PHOTO_KEY) == null) return false
    localStorage.removeItem(PHOTO_KEY)
    return true
  } catch {
    return false
  }
}

export function storageUsageBytes() {
  let total = 0
  total += (localStorage.getItem(KEY) || '').length * 2
  return total
}
