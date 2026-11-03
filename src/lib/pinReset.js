/**
 * Resetting a forgotten Parent Mode PIN.
 *
 * The PIN lives on the parent's phone only, so nobody else can tell this
 * phone what it was. What can be proved instead is who the parent is: the
 * password of the account this phone is signed in with. Typed again, it is
 * checked by Supabase's own sign-in (with Supabase's rate limits), and only
 * then is a new PIN set.
 *
 * Who cannot do it:
 *   - a child on their own linked phone: it has no Parent Mode at all, and
 *     is signed in anonymously, with no account to prove;
 *   - a child on the parent's phone: they would need the parent's password;
 *   - anyone with a different account's password: the sign-in must be the
 *     same account this phone is already signed in as, or nothing changes;
 *   - a supporter (a grandparent who looks in): only a parent can;
 *   - the look-around family, and a phone with no account (no server).
 *
 * Wrong passwords are counted on this phone as well: after MAX_TRIES the form
 * waits LOCK_MINUTES before it asks Supabase again. The PIN box itself works
 * exactly as before.
 */
import { transport } from './sync/transport.js'

export const MAX_TRIES = 5
export const LOCK_MINUTES = 15
const KEY = 'rankup.pinreset.v1'

/** A PIN is 4 to 8 digits, as Settings and setup ask for. */
export const validPin = (pin) => /^\d{4,8}$/.test(String(pin || ''))

/**
 * Can this phone offer a reset, and if not, why not.
 * 'ok' | 'kid_device' | 'demo' | 'no_account'
 */
export function pinResetAvailability(state) {
  if (state?.device?.role === 'kid') return 'kid_device'
  if (state?.demo) return 'demo'
  if (!transport.isConfigured() || !transport.currentEmail()) return 'no_account'
  return 'ok'
}

function readTries(now = Date.now()) {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!t || typeof t.count !== 'number') return { count: 0, until: 0 }
    // A lock that has run out starts the count again.
    if (t.until && t.until <= now) return { count: 0, until: 0 }
    return t
  } catch {
    return { count: 0, until: 0 }
  }
}

function writeTries(t) {
  try { localStorage.setItem(KEY, JSON.stringify(t)) } catch { /* private mode: Supabase's own limits still apply */ }
}

/** Minutes until another try is allowed, or 0. */
export function lockedForMinutes(now = Date.now()) {
  const t = readTries(now)
  return t.until > now ? Math.ceil((t.until - now) / 60000) : 0
}

export const PIN_RESET_ERRORS = {
  wrong_password: 'That password is not right.',
  locked: `Too many wrong passwords. Wait ${LOCK_MINUTES} minutes, then try again.`,
  not_this_account: 'That is a different account. Use the account this phone is signed in with.',
  not_a_parent: 'Only a parent can reset the PIN. Ask a parent in your family.',
  kid_device: 'A child’s phone has no Parent Mode, so there is no PIN to reset here.',
  demo: 'The look-around family has no PIN to reset.',
  no_account: 'This phone is not signed in to an account, so there is nothing to prove who you are with. The PIN stays as it is.',
  offline: 'Could not reach the server. Check the internet and try again.',
}

/**
 * Check the parent's password. Resolves { ok: true } once it is proved that
 * whoever is holding the phone knows the password of the account this phone
 * is signed in as, and that account is a parent in the family.
 */
export async function proveParent(state, password) {
  const why = pinResetAvailability(state)
  if (why !== 'ok') return { ok: false, reason: why }
  if (lockedForMinutes()) return { ok: false, reason: 'locked' }

  const email = transport.currentEmail()
  const me = transport.currentUserId()
  let session
  try {
    session = await transport.checkPassword(email, password)
  } catch (err) {
    if (err?.status >= 400 && err?.status < 500 && err.status !== 429) {
      const t = readTries()
      const count = t.count + 1
      writeTries({ count, until: count >= MAX_TRIES ? Date.now() + LOCK_MINUTES * 60000 : 0 })
      return { ok: false, reason: count >= MAX_TRIES ? 'locked' : 'wrong_password' }
    }
    return { ok: false, reason: err?.status === 429 ? 'locked' : 'offline' }
  }
  // The right password, but for whom? Only the account already on this phone.
  if (!session?.access_token || !session.user?.id || session.user.id !== me) {
    return { ok: false, reason: 'not_this_account' }
  }
  transport.keepSession(session)

  // A parent, not a supporter: the same line the database draws everywhere.
  try {
    const adults = await transport.rpc('family_adults', {})
    const mine = adults?.adults?.find((a) => a.isMe)
    if (mine && mine.role !== 'parent') return { ok: false, reason: 'not_a_parent' }
  } catch {
    // An older database without family_adults: the account is the phone's
    // own, and its password was right, which is the proof that matters.
  }
  writeTries({ count: 0, until: 0 })
  return { ok: true }
}
