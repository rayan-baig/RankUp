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

/**
 * Wording the parent sees when a code does not work, one per reason
 * claim_pairing_code gives. Each says what happened and the one thing to do
 * next. Never says which digit was wrong, and never names another family.
 */
const MINUTES = CODE_TTL_MS / 60000
export const CLAIM_ERRORS = {
  not_found: "Those numbers don't match a phone waiting to be linked. Check them against the code on your child's screen and type them again.",
  expired: `That code has run out: codes last ${MINUTES} minutes. On your child's phone, tap “New code” and type the new one here.`,
  blocked: `That code was typed wrong ${MAX_ATTEMPTS} times, so it has stopped working. On your child's phone, tap “New code” and type the new one here.`,
  too_many: 'Too many wrong codes from this phone. Wait about ten minutes, then try again.',
  claimed: 'That phone is already linked to another family. It can only join yours once that family unlinks it.',
  revoked: "That code was cancelled on your child's phone. Type the code on their screen now.",
  already_linked: 'That phone is already linked to your family, so there is nothing more to do. Its quests are on it now.',
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
