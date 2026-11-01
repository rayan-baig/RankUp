/**
 * An in-app reminder fires once a day, on the family's day.
 *
 * "Fired today" was remembered under the UTC date while the time was read in
 * local hours. A reminder set within ninety minutes before UTC midnight (half
 * past three in the afternoon in California, say) fired at its time, then
 * again once UTC's date turned, because by then "today" was a different key.
 */
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { remindersToFire } = await import('../src/lib/notifications.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

// Run in a zone behind UTC so that local evening is the next UTC day.
const reminders = [{ id: 'r1', label: 'Chores!', time: '15:30', on: true }]
const at = (h, m) => { const d = new Date(2026, 10, 3, h, m); return d }

console.log('\n=== A reminder fires once on its day ===')
let fired = {}
let r = remindersToFire(reminders, at(15, 31), fired)
ok('it fires at its time', r.due.length === 1, JSON.stringify(r))
fired = r.fired
r = remindersToFire(reminders, at(16, 45), fired)
ok('and not again later the same afternoon', r.due.length === 0,
  `${JSON.stringify(r)} (zone ${Intl.DateTimeFormat().resolvedOptions().timeZone})`)
r = remindersToFire(reminders, at(9, 0), fired)
ok('nor before its time', r.due.length === 0)
r = remindersToFire(reminders, new Date(2026, 10, 4, 15, 40), fired)
ok('and it fires again the next day', r.due.length === 1)
r = remindersToFire(reminders, at(20, 0), {})
ok('opening the app hours late does not replay it', r.due.length === 0)
r = remindersToFire([{ ...reminders[0], on: false }], at(15, 31), {})
ok('a reminder turned off does not fire', r.due.length === 0)

console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
