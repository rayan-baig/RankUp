/**
 * The Parent Mode PIN: kept as a salted hash, and guarded against guessing.
 *
 * WHAT IS KEPT. The PIN lives on the parent's phone only (it never goes to
 * the server), and it used to sit in this phone's storage as typed:
 * "pin":"4321", readable by anyone who opened the browser's storage panel.
 * Now the phone keeps `pinHash`, a random salt and the SHA-256 of the salt
 * and the PIN stirred PIN_ROUNDS times, and never the PIN. A four-digit PIN
 * is a small space and no hash makes it a secret from somebody who has the
 * phone's storage and time to try all ten thousand; what the hash does is
 * keep the PIN from being simply read off the screen, or copied out with the
 * rest of the data.
 *
 * MOVING OVER. A phone saved by an older version still holds the plain PIN.
 * `securePin` swaps it for the hash, and runs when the app opens and again
 * on the first unlock, so the plain value is gone at the latest the first
 * time the parent opens Parent Mode, and in practice the moment the app
 * starts.
 *
 * GUESSING. Every PIN box (Who's playing?, the theme lock on a child's
 * profile, Theme Genesis) counts wrong tries in one place. After MAX_WRONG
 * wrong tries the boxes wait LOCK_MS, a minute; each lock after that is twice
 * the one before (two minutes, four, eight…) up to MAX_LOCK_MS, a day. It is
 * kept in this phone's storage beside the app's state, so reloading the page
 * does not start the count again. The right PIN clears it.
 *
 * OFFLINE. All of it runs on the phone: no server, no network, and no
 * crypto.subtle (which a page served over plain http on a home network does
 * not have). SHA-256 is written out below, synchronously, so checking a PIN
 * as its last digit is typed needs no waiting.
 */
export const MAX_WRONG = 5
export const LOCK_MS = 60 * 1000
export const MAX_LOCK_MS = 24 * 60 * 60 * 1000
export const PIN_ROUNDS = 2000
const VERSION = 'v1'
/*
 * Beside the app's state, in the same device namespace (lib/storage.js:
 * `?device=kid` is a separate phone while developing). Worked out here
 * rather than imported, so this file needs nothing but the browser.
 */
function lockKey() {
  let name = ''
  try { name = (new URLSearchParams(window.location.search).get('device') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) } catch { name = '' }
  return `rankup.pinlock.v1${name ? `.${name}` : ''}`
}

/* ---------- SHA-256 (FIPS 180-4), on bytes ---------- */

/*
 * The round constants and the starting hash, worked out rather than typed:
 * the first 32 bits of the fractional parts of the cube roots of the first
 * 64 primes, and of the square roots of the first 8 (FIPS 180-4, 4.2.2 and
 * 5.3.3). A double carries enough bits for both. Tested against node:crypto.
 */
const PRIMES = []
for (let n = 2; PRIMES.length < 64; n += 1) if (PRIMES.every((p) => n % p)) PRIMES.push(n)
const frac32 = (x) => ((x - Math.floor(x)) * 4294967296) >>> 0
const K = new Uint32Array(PRIMES.map((p) => frac32(Math.cbrt(p))))
const H0 = PRIMES.slice(0, 8).map((p) => frac32(Math.sqrt(p)))

const rotr = (x, n) => (x >>> n) | (x << (32 - n))

/** SHA-256 of a byte array, as 32 bytes. */
export function sha256(bytes) {
  const len = bytes.length
  const total = ((len + 9 + 63) >> 6) << 6
  const m = new Uint8Array(total)
  m.set(bytes)
  m[len] = 0x80
  const bits = len * 8
  // Lengths here are tiny, so the high word of the 64-bit length is zero.
  m[total - 4] = (bits >>> 24) & 0xff
  m[total - 3] = (bits >>> 16) & 0xff
  m[total - 2] = (bits >>> 8) & 0xff
  m[total - 1] = bits & 0xff
  const h = new Uint32Array(H0)
  const w = new Uint32Array(64)
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = off + i * 4
      w[i] = (m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3]
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0
      d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh
  }
  const out = new Uint8Array(32)
  for (let i = 0; i < 8; i += 1) {
    out[i * 4] = h[i] >>> 24; out[i * 4 + 1] = (h[i] >>> 16) & 0xff
    out[i * 4 + 2] = (h[i] >>> 8) & 0xff; out[i * 4 + 3] = h[i] & 0xff
  }
  return out
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (s) => new Uint8Array((String(s).match(/../g) || []).map((b) => parseInt(b, 16)))
const utf8 = (s) => new TextEncoder().encode(String(s))

/**
 * The hash of a PIN with a salt: SHA-256 of salt + PIN, then of salt + the
 * previous round, `rounds` times. Hex.
 */
export function hashPin(pin, saltHex, rounds = PIN_ROUNDS) {
  const salt = fromHex(saltHex)
  const join = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out }
  let d = sha256(join(salt, utf8(pin)))
  for (let i = 1; i < rounds; i += 1) d = sha256(join(salt, d))
  return hex(d)
}

function randomSalt() {
  const bytes = new Uint8Array(16)
  const c = typeof crypto !== 'undefined' ? crypto : null
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return hex(bytes)
}

/**
 * What is stored for a new PIN: "v1$<rounds>$<length>$<salt>$<hash>".
 *
 * The length is kept so the box can open Parent Mode as the last digit goes
 * in (and count a wrong PIN of that length as a try) without checking every
 * shorter prefix for free. It says how many digits, nothing about which.
 */
export function makePinHash(pin) {
  const p = String(pin || '')
  if (!p) return ''
  const salt = randomSalt()
  return [VERSION, PIN_ROUNDS, p.length, salt, hashPin(p, salt, PIN_ROUNDS)].join('$')
}

function parse(stored) {
  const [v, rounds, length, salt, hash] = String(stored || '').split('$')
  if (v !== VERSION || !salt || !hash) return null
  return { rounds: Number(rounds) || PIN_ROUNDS, length: Number(length) || 0, salt, hash }
}

/** Does this family have a parent PIN on this phone at all? */
export function hasPin(family) {
  return Boolean(parse(family?.pinHash) || family?.pin)
}

/** How many digits the PIN has, or 0 when unknown. */
export function pinLength(family) {
  const p = parse(family?.pinHash)
  if (p) return p.length
  return family?.pin ? String(family.pin).length : 0
}

/** Is this the PIN? An empty box never matches, nor does a family with none. */
export function pinMatches(family, typed) {
  const t = String(typed || '')
  if (!t) return false
  const p = parse(family?.pinHash)
  if (p) {
    if (p.length && t.length !== p.length) return false
    const got = hashPin(t, p.salt, p.rounds)
    // Compared in full, not stopping at the first difference.
    let diff = got.length ^ p.hash.length
    for (let i = 0; i < Math.min(got.length, p.hash.length); i += 1) diff |= got.charCodeAt(i) ^ p.hash.charCodeAt(i)
    return diff === 0
  }
  // A phone saved by an older version, not yet moved over.
  return Boolean(family?.pin) && t === String(family.pin)
}

/**
 * The family with any plain PIN swapped for its hash, and the plain value
 * removed. The same object when there is nothing to change.
 */
export function securePin(family) {
  if (!family || !Object.prototype.hasOwnProperty.call(family, 'pin')) return family
  const { pin, ...rest } = family
  if (!pin) return parse(rest.pinHash) ? rest : { ...rest, pinHash: '' }
  return { ...rest, pinHash: makePinHash(pin) }
}

/* ---------- wrong tries, kept across reloads ---------- */

function readLock() {
  try {
    const raw = JSON.parse(localStorage.getItem(lockKey()) || 'null')
    return {
      wrong: Number(raw?.wrong) || 0,
      locks: Number(raw?.locks) || 0,
      until: Number(raw?.until) || 0,
    }
  } catch {
    return { wrong: 0, locks: 0, until: 0 }
  }
}

function writeLock(lock) {
  try { localStorage.setItem(lockKey(), JSON.stringify(lock)) } catch { /* storage refused: the count lives as long as the page */ }
}

/** How long one lock lasts: a minute for the first, doubling, at most a day. */
export function lockLength(locks) {
  return Math.min(MAX_LOCK_MS, LOCK_MS * 2 ** Math.max(0, locks - 1))
}

/** Milliseconds until the PIN boxes take another try, or 0. */
export function pinLockedFor(now = Date.now()) {
  const { until } = readLock()
  return until > now ? until - now : 0
}

/** One wrong PIN. Returns how long the boxes now wait (0 if not yet). */
export function recordWrongPin(now = Date.now()) {
  const lock = readLock()
  if (lock.until > now) return lock.until - now
  const wrong = lock.wrong + 1
  if (wrong < MAX_WRONG) { writeLock({ ...lock, wrong, until: 0 }); return 0 }
  const locks = lock.locks + 1
  const until = now + lockLength(locks)
  writeLock({ wrong: 0, locks, until })
  return until - now
}

/** The right PIN (or a PIN reset proved with the account's password): start again. */
export function clearPinLock() {
  try { localStorage.removeItem(lockKey()) } catch { /* nothing to clear */ }
}

/** Wrong tries left before the next wait. */
export function wrongTriesLeft() {
  return Math.max(0, MAX_WRONG - readLock().wrong)
}

/** What a PIN box says after a wrong PIN: calm, and a warning near the wait. */
export function wrongMessage() {
  const left = wrongTriesLeft()
  return left > 0 && left <= 2
    ? `That PIN is not right. ${left} more ${left === 1 ? 'try' : 'tries'} before a short wait.`
    : 'That PIN is not right.'
}

/** The wait in calm words: "1 minute", "about 3 minutes", "2 hours". */
export function waitWords(ms) {
  const secs = Math.max(1, Math.ceil(ms / 1000))
  // Seconds only for the last half minute: "1 minute" reads calmer than "58 seconds".
  if (secs < 30) return `${secs} ${secs === 1 ? 'second' : 'seconds'}`
  const mins = Math.ceil(secs / 60)
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`
  const hours = Math.ceil(mins / 60)
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

/** What a PIN box says while it waits. */
export function lockMessage(ms) {
  return `Too many wrong PINs. Take a breather and try again in ${waitWords(ms)}.`
}

/**
 * One try at the PIN, for every PIN box: 'ok', 'wrong' or 'locked', and the
 * wait when locked. A right PIN while locked is still refused: the lock is
 * there so that guessing is slow, and a guess that happens to be right is
 * exactly what it must not let through early.
 */
export function tryPin(family, typed, now = Date.now()) {
  const waiting = pinLockedFor(now)
  if (waiting) return { result: 'locked', wait: waiting }
  if (pinMatches(family, typed)) { clearPinLock(); return { result: 'ok', wait: 0 } }
  const wait = recordWrongPin(now)
  return wait ? { result: 'locked', wait } : { result: 'wrong', wait: 0 }
}
