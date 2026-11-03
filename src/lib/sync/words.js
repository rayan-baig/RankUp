/**
 * What the sync line says, in plain words (SyncBadge).
 *
 * The line answers "is what I'm looking at up to date, and is anything I did
 * stuck?". When RankUp's server is down for a while, it says that, since
 * when, and that what was done is safe on the phone and goes by itself; when
 * it comes back, it says so once. tests/outage.mjs holds it to the engine.
 */
import { SYNC_STATUS } from './syncEngine.js'

/** A server failing for this long is "down", not a blip. */
export const DOWN_AFTER_MS = 60 * 1000
/** "Back online" shows this long after a real outage ends. */
export const BACK_FOR_MS = 15 * 1000

const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * `{ text, hint, tone }` for the sync line. `online` is the phone's own idea
 * (navigator.onLine): with no answer from the server but a connection to the
 * internet, the server is the problem, not the phone.
 */
export function syncWords({ status, pending = 0, error = null, downSince = null, backAt = null, now = Date.now(), online = true } = {}) {
  const saved = pending ? ` · ${pending} saved on this phone` : ''
  const waiting = 'Nothing is lost. It sends by itself as soon as it can.'
  if (/sign in again/i.test(error || '')) {
    return { text: 'Sign in again to sync', hint: 'Nothing waiting has been lost.', tone: 'bad' }
  }
  const down = downSince != null && now - downSince >= DOWN_AFTER_MS
  if (status === SYNC_STATUS.OFFLINE && !online) {
    return { text: `No internet${saved}`, hint: 'Everything is saved on this phone. It sends next time RankUp is open with internet.', tone: 'warn' }
  }
  if (status === SYNC_STATUS.OFFLINE || status === SYNC_STATUS.ERROR) {
    if (down) return { text: `RankUp’s server has been down since ${clock(downSince)}${saved}`, hint: waiting, tone: 'bad' }
    return { text: `Can’t sync yet${saved}`, hint: waiting, tone: 'bad' }
  }
  if (status === SYNC_STATUS.SYNCING) return { text: 'Syncing…', hint: null, tone: 'accent' }
  if (status === SYNC_STATUS.IDLE) {
    if (pending) return { text: `${pending} waiting to send`, hint: null, tone: 'good' }
    if (backAt != null && now - backAt < BACK_FOR_MS) return { text: 'Back online · everything sent', hint: null, tone: 'good' }
    return { text: 'Up to date', hint: null, tone: 'good' }
  }
  return { text: '', hint: null, tone: 'muted' }
}
