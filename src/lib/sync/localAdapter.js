/**
 * Pairing that works today, without a server.
 *
 * Codes live in this browser's localStorage and devices are notified through a
 * BroadcastChannel. That means it genuinely works between two TABS OR WINDOWS OF
 * THE SAME BROWSER — enough to build against, demo, and test the whole flow —
 * but it cannot cross to a different phone, because nothing here leaves the
 * device.
 *
 * Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to swap in the real one.
 */

import { PAIRING_STATUS, pairingStatus, MAX_ATTEMPTS } from '../pairing.js'

const KEY = 'rankup.pairing.v1'
const CHANNEL = 'rankup-pairing'

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAll(records) {
  // Drop anything long dead so this never grows without bound.
  const cutoff = Date.now() - 60 * 60 * 1000
  const kept = Object.fromEntries(
    Object.entries(records).filter(([, r]) => (r.claimedAt || r.expiresAt) > cutoff),
  )
  localStorage.setItem(KEY, JSON.stringify(kept))
  return kept
}

function broadcast(code) {
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage({ code })
    ch.close()
  } catch {
    // BroadcastChannel is missing in a few older browsers; the storage event
    // listener in watchCode covers those.
  }
}

export const localAdapter = {
  id: 'local',
  isReal: false,
  label: 'This browser only',

  async publishCode(record) {
    const all = readAll()
    // Refuse to reuse a code that is already live for someone else.
    if (all[record.code] && pairingStatus(all[record.code]) === PAIRING_STATUS.ACTIVE) {
      return { ok: false, reason: 'collision' }
    }
    all[record.code] = record
    writeAll(all)
    broadcast(record.code)
    return { ok: true, code: record.code }
  },

  async readCode(code) {
    return readAll()[code] || null
  },

  async revokeCode(code) {
    const all = readAll()
    if (all[code] && !all[code].claimedAt) {
      all[code] = { ...all[code], revokedAt: Date.now() }
      writeAll(all)
      broadcast(code)
    }
    return { ok: true }
  },

  /** Calls back whenever this code's record changes. Returns an unsubscribe fn. */
  watchCode(code, onChange) {
    let stopped = false
    const emit = async () => {
      if (stopped) return
      onChange(await this.readCode(code))
    }

    let channel = null
    try {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (e) => {
        if (e.data?.code === code) emit()
      }
    } catch {
      channel = null
    }

    const onStorage = (e) => {
      if (e.key === KEY) emit()
    }
    window.addEventListener('storage', onStorage)

    // Belt and braces: a slow poll also catches the expiry deadline passing.
    const poll = setInterval(emit, 3000)
    emit()

    return () => {
      stopped = true
      clearInterval(poll)
      window.removeEventListener('storage', onStorage)
      channel?.close()
    }
  },

  /**
   * The parent's side. Returns the kid to adopt, or a reason it failed.
   * A wrong guess is recorded against the code, which is what makes the
   * five-attempt limit real rather than decorative.
   */
  async claimCode(code, { familyId, familyName }) {
    const all = readAll()
    const record = all[code]

    if (!record) {
      // Count failures against every live code, so guessing at random still
      // burns through the attempt budget of whatever is actually out there.
      Object.keys(all).forEach((k) => {
        if (pairingStatus(all[k]) === PAIRING_STATUS.ACTIVE) {
          all[k] = { ...all[k], attempts: (all[k].attempts || 0) + 1 }
        }
      })
      writeAll(all)
      return { ok: false, reason: 'not_found' }
    }

    const status = pairingStatus(record)
    if (status !== PAIRING_STATUS.ACTIVE) {
      return { ok: false, reason: status === PAIRING_STATUS.CLAIMED ? 'claimed' : status }
    }

    all[code] = {
      ...record,
      claimedAt: Date.now(),
      claimedByFamilyId: familyId,
      claimedByFamilyName: familyName,
    }
    writeAll(all)
    broadcast(code)
    return { ok: true, kid: { id: record.kidId, name: record.kidName, themeId: record.themeId } }
  },

  /** Used only by the tests, to prove the attempt limit actually bites. */
  async _recordFailedAttempt(code) {
    const all = readAll()
    if (!all[code]) return { attempts: 0 }
    all[code] = { ...all[code], attempts: Math.min(MAX_ATTEMPTS, (all[code].attempts || 0) + 1) }
    writeAll(all)
    return { attempts: all[code].attempts }
  },
}
