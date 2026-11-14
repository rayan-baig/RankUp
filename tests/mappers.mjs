/**
 * What a pull is allowed to overwrite.
 *
 * These run the mappers straight, with no browser: they are pure functions and
 * the bugs in them are about which local facts a server row is permitted to
 * destroy. The lockout one matters most — the override's id exists only on the
 * device, the server row has no column for it, and both ways of ENDING a
 * lockout match on it. Lose it and a Red Security Lockdown, which has no
 * expiry, can never be lifted: the parent taps Lift, the history says it ended,
 * and the child is locked out of the app permanently.
 */
import { kids } from '../src/lib/sync/mappers.js'

let fails = 0
const ok = (label, cond) => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}`); fails += 1 }
}

const serverRow = {
  id: 'k1', name: 'Ava', xp: 120, coins: 3,
  lockout_kind: 'red', lockout_until: null, lockout_reason: 'Testing',
}

console.log('\n=== A pull must not strip the override id ===')
const local = {
  id: 'k1',
  lockout: { type: 'red', until: null, reason: 'Testing', overrideId: 'ovr_42', consequence: 'No console' },
}
const merged = kids.fromRow(serverRow, local)
ok('the lockout survives the pull', merged.lockout?.type === 'red')
ok('and still knows which override it belongs to', merged.lockout?.overrideId === 'ovr_42')
ok('and keeps the real-world consequence the parent wrote',
  merged.lockout?.consequence === 'No console')
ok('while the server still owns the reason', merged.lockout?.reason === 'Testing')

console.log('\n=== A different lockout replaces it rather than inheriting ===')
const swapped = kids.fromRow(
  { ...serverRow, lockout_kind: 'dimension', lockout_until: '2026-01-01T00:00:00Z' },
  local,
)
ok('a lockout of another kind does not keep the old id',
  swapped.lockout?.type === 'dimension' && swapped.lockout?.overrideId === undefined)

console.log('\n=== A cleared lockout really clears ===')
const cleared = kids.fromRow({ ...serverRow, lockout_kind: null }, local)
ok('no lockout on the server means no lockout here', cleared.lockout === null)

console.log('\n=== Whether a child has a phone is the server\'s to say ===')
const linkedAt = 1700000000000
ok('a row with a phone signed in marks the child linked, on every parent\'s phone',
  Boolean(kids.fromRow({ ...serverRow, lockout_kind: null, user_id: 'u-kid' }, { id: 'k1' }).pairedDeviceAt))
ok('and keeps the date this phone first saw it',
  kids.fromRow({ ...serverRow, user_id: 'u-kid' }, { id: 'k1', pairedDeviceAt: linkedAt }).pairedDeviceAt === linkedAt)
ok('a row whose phone was unlinked clears it',
  kids.fromRow({ ...serverRow, user_id: null }, { id: 'k1', pairedDeviceAt: linkedAt }).pairedDeviceAt === null)
ok('a row that does not say leaves it alone',
  kids.fromRow({ ...serverRow }, { id: 'k1', pairedDeviceAt: linkedAt }).pairedDeviceAt === linkedAt)

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
