/**
 * Unique ids.
 *
 * These are real UUIDs, generated on the device. That matters for two reasons:
 *
 *   - Two phones create rows at the same time without coordinating, so ids have
 *     to be unique without a central authority handing them out. A counter
 *     would collide the moment a second device existed.
 *   - The database columns are `uuid`. An id like "kid_m4x1" is rejected, which
 *     is exactly what happened the first time sync was switched on.
 *
 * The `prefix` argument is kept for readability at call sites (`uid('quest')`)
 * and deliberately does not appear in the value.
 */
export function uid(prefix = 'id') {
  void prefix
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()

  // Older browsers: build a v4 UUID from whatever randomness is available.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** True for anything this app would accept as a row id. */
export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')
}
