/**
 * Device pairing codes.
 *
 * A kid's device shows a 6-digit code. A parent types it into their own device
 * to link the two. Six digits is only a million combinations, so the code alone
 * is not the security — the rules around it are:
 *
 *   - it expires after 10 minutes
 *   - it dies after 5 wrong guesses
 *   - it works exactly once
 *   - it is generated from the operating system's cryptographic random source,
 *     not Math.random, so it cannot be predicted from earlier codes
 *
 * Those four together make guessing a live code impractical: an attacker gets
 * five tries out of a million within a ten-minute window, and has to be trying
 * against a specific kid's device that is sitting on the pairing screen at that
 * exact moment.
 */

export const CODE_LENGTH = 6
export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_ATTEMPTS = 5

export const PAIRING_STATUS = {
  ACTIVE: 'active',
  CLAIMED: 'claimed',
  EXPIRED: 'expired',
  BLOCKED: 'blocked',
  REVOKED: 'revoked',
}

/**
 * A uniformly random 6-digit code, leading zeros included.
 *
 * Rejection sampling rather than `random % 1000000`: the modulo version makes
 * low codes very slightly more likely, which is exactly the kind of bias that
 * makes a short code easier to attack.
 */
export function generateCode() {
  const LIMIT = 10 ** CODE_LENGTH
  const MAX_ACCEPTABLE = Math.floor(0xffffffff / LIMIT) * LIMIT
  const buf = new Uint32Array(1)
  let value
  do {
    crypto.getRandomValues(buf)
    ;[value] = buf
  } while (value >= MAX_ACCEPTABLE)
  return String(value % LIMIT).padStart(CODE_LENGTH, '0')
}

/** "123456" -> "123 456", which is far easier to read aloud to a parent. */
export function formatCode(code) {
  if (!code) return ''
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

/** Strip anything that is not a digit, and cap the length. */
export function normaliseCode(input) {
  return (input || '').replace(/\D/g, '').slice(0, CODE_LENGTH)
}

export function isCompleteCode(input) {
  return normaliseCode(input).length === CODE_LENGTH
}

/** What state is this pairing record actually in, right now? */
export function pairingStatus(record, now = Date.now()) {
  if (!record) return PAIRING_STATUS.EXPIRED
  if (record.claimedAt) return PAIRING_STATUS.CLAIMED
  if (record.revokedAt) return PAIRING_STATUS.REVOKED
  if (record.attempts >= MAX_ATTEMPTS) return PAIRING_STATUS.BLOCKED
  if (now >= record.expiresAt) return PAIRING_STATUS.EXPIRED
  return PAIRING_STATUS.ACTIVE
}

export function isUsable(record, now = Date.now()) {
  return pairingStatus(record, now) === PAIRING_STATUS.ACTIVE
}

export function msRemaining(record, now = Date.now()) {
  if (!record) return 0
  return Math.max(0, record.expiresAt - now)
}

/** Wording the parent sees when a code does not work. Never says which digit was wrong. */
export const CLAIM_ERRORS = {
  not_found: "That code doesn't match any device waiting to be linked. Check the digits and try again.",
  expired: 'That code has expired. Ask them to tap "New code" on their device.',
  blocked: 'That code has been tried too many times and is no longer valid. Ask them for a new one.',
  claimed: 'That device has already been linked to a family.',
  revoked: 'That code was cancelled. Ask them for a new one.',
  already_linked: 'That device is already linked to your family.',
  unavailable: 'Could not reach the sync service. Check your connection and try again.',
}

export function claimErrorMessage(reason) {
  return CLAIM_ERRORS[reason] || CLAIM_ERRORS.not_found
}

/** A fresh pairing record for a kid device that is waiting to be claimed. */
export function newPairingRecord({ code, kidId, kidName, themeId, now = Date.now() }) {
  return {
    code,
    kidId,
    kidName,
    themeId,
    createdAt: now,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    claimedAt: null,
    claimedByFamilyId: null,
    revokedAt: null,
  }
}
