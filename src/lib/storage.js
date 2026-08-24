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

const KEY = 'rankup.state.v1'
const PHOTO_KEY = 'rankup.photos.v1'

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
    // Most likely the 5MB localStorage quota, usually from stored photos.
    console.warn('[RankUp] Could not save data:', err)
    return false
  }
}

export function clearState() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(PHOTO_KEY)
}

/**
 * Photos are kept in a separate bucket so the main state object stays small and
 * fast to serialise. In the Supabase version these become Storage objects and
 * the state only holds their URLs.
 */
function readPhotos() {
  try {
    return JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}')
  } catch {
    return {}
  }
}

export function putPhoto(id, dataUrl) {
  const photos = readPhotos()
  photos[id] = dataUrl
  try {
    localStorage.setItem(PHOTO_KEY, JSON.stringify(photos))
  } catch {
    // Out of space: drop the oldest half and retry once.
    const keys = Object.keys(photos)
    keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => delete photos[k])
    photos[id] = dataUrl
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(photos))
    } catch {
      console.warn('[RankUp] Photo storage full; this photo was not saved.')
      return false
    }
  }
  return true
}

export function getPhoto(id) {
  if (!id) return null
  return readPhotos()[id] || null
}

export function deletePhoto(id) {
  const photos = readPhotos()
  delete photos[id]
  localStorage.setItem(PHOTO_KEY, JSON.stringify(photos))
}

/**
 * Delete any stored photo that no submission points at any more.
 *
 * Deleting a kid or a quest removes their submissions, which used to leave the
 * photos behind forever — invisible, taking up the storage budget, and (the part
 * that actually matters) keeping pictures of a child's home on the device after
 * the parent thought they had deleted them.
 *
 * Called after every save, so it self-heals no matter which path removed the
 * submission. Returns the number of photos removed.
 */
export function purgeOrphanPhotos(state) {
  const photos = readPhotos()
  const ids = Object.keys(photos)
  if (!ids.length) return 0

  const referenced = new Set(
    (state.submissions || []).map((s) => s.photoId).filter(Boolean),
  )
  const orphans = ids.filter((id) => !referenced.has(id))
  if (!orphans.length) return 0

  orphans.forEach((id) => delete photos[id])
  try {
    localStorage.setItem(PHOTO_KEY, JSON.stringify(photos))
  } catch (err) {
    console.warn('[RankUp] Could not purge old photos:', err)
    return 0
  }
  return orphans.length
}

export function storageUsageBytes() {
  let total = 0
  for (const k of [KEY, PHOTO_KEY]) total += (localStorage.getItem(k) || '').length * 2
  return total
}
