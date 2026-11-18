/**
 * The app and the database must agree on what a family is entitled to.
 *
 * Both work it out. They have to: the app runs with no backend at all, so it
 * cannot ask; and the database must never take a browser's word for what it
 * has paid for.
 *
 * So the danger is drift, and it is the worst kind — the screens would show a
 * trial working and the server would refuse the call behind it. A parent taps
 * the AI check they can plainly see is on, and nothing happens.
 *
 * Needs Postgres with the schema applied:  supabase/test/run.sh
 */
import pg from 'pg'
import { effectiveTier, trialDaysLeft, pausedUntilOf } from '../src/state/reducer.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const db = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await db.connect()

const FAMILY = 'b0a11111-0000-4000-8000-00000000f001'
await db.query(
  `insert into families (id, name, tier) values ($1, 'Agreement Family', 'starter')
     on conflict (id) do nothing`, [FAMILY])

const TIERS = ['starter', 'standard', 'elite']
const TRIALS = [null, 'standard', 'elite']
// Hours from now: long past, just past, right on the line, and ahead.
const ENDS = [null, -720, -1, 0, 1, 336]

console.log('\n=== Every combination of what they pay for and what they are lent ===')
const mismatches = []
let checked = 0

for (const tier of TIERS) {
  for (const trial of TRIALS) {
    for (const hours of ENDS) {
      if (trial === null && hours !== null) continue
      const endsAt = hours === null ? null : new Date(Date.now() + hours * 3600000)
      await db.query(
        'update families set tier = $1, trial_tier = $2, trial_ends_at = $3 where id = $4',
        [tier, trial, endsAt, FAMILY],
      )
      const fromDb = (await db.query('select effective_tier($1) as t', [FAMILY])).rows[0].t
      const fromApp = effectiveTier({
        tier,
        trialTier: trial,
        trialEndsAt: endsAt ? endsAt.getTime() : null,
      })
      checked += 1
      // The zero-hour case sits exactly on "now" and either answer is honest,
      // so it is skipped rather than made flaky.
      if (hours !== 0 && fromDb !== fromApp) {
        mismatches.push(`paid=${tier} trial=${trial} ends=${hours}h app=${fromApp} db=${fromDb}`)
      }
    }
  }
}
ok(`the app and the database agree on all ${checked} of them`, mismatches.length === 0,
  `${mismatches.length} differ, first: ${mismatches[0] || ''}`)

console.log('\n=== A trial only ever raises ===')
ok('it does not demote a paying family',
  effectiveTier({ tier: 'elite', trialTier: 'standard', trialEndsAt: Date.now() + 8.64e7 }) === 'elite')
ok('it does lift a free one',
  effectiveTier({ tier: 'starter', trialTier: 'elite', trialEndsAt: Date.now() + 8.64e7 }) === 'elite')
ok('and when it runs out they keep what they pay for',
  effectiveTier({ tier: 'standard', trialTier: 'elite', trialEndsAt: Date.now() - 1000 }) === 'standard')

console.log('\n=== A gift plan: the app and the database agree on that too ===')
{
  // What they pay for, a trial or none, and a gift that has ended, is
  // running, or is waiting for a paid plan to end (gift_starts_at ahead).
  const GIFTS = [null, 'standard', 'elite']
  const SPANS = [[-9000, -1], [-1, 300], [24, 9000], [-48, 0]]
  const off = []
  let n = 0
  for (const tier of TIERS) {
    for (const trial of [null, 'standard']) {
      for (const gift of GIFTS) {
        for (const [from, to] of gift ? SPANS : [[null, null]]) {
          const starts = from === null ? null : new Date(Date.now() + from * 3600000)
          const until = to === null ? null : new Date(Date.now() + to * 3600000)
          const trialEnds = trial ? new Date(Date.now() + 72 * 3600000) : null
          await db.query(
            `update families set tier = $1, trial_tier = $2, trial_ends_at = $3, gift_tier = $4, gift_starts_at = $5, gift_until = $6
              where id = $7`, [tier, trial, trialEnds, gift, starts, until, FAMILY])
          const fromDb = (await db.query('select effective_tier($1) as t', [FAMILY])).rows[0].t
          const fromApp = effectiveTier({ tier, trialTier: trial, trialEndsAt: trialEnds?.getTime() ?? null,
            giftTier: gift, giftStartsAt: starts?.getTime() ?? null, giftUntil: until?.getTime() ?? null })
          n += 1
          if (to !== 0 && fromDb !== fromApp) off.push(`paid=${tier} trial=${trial} gift=${gift} ${from}..${to}h app=${fromApp} db=${fromDb}`)
        }
      }
    }
  }
  ok(`the app and the database agree on all ${n} of them`, off.length === 0, `${off.length} differ, first: ${off[0] || ''}`)
  ok('a running gift lifts a free family', effectiveTier({ tier: 'starter', giftTier: 'elite', giftStartsAt: Date.now() - 1000, giftUntil: Date.now() + 8.64e7 }) === 'elite')
  ok('one waiting for the paid plan to end does not, yet', effectiveTier({ tier: 'standard', giftTier: 'elite', giftStartsAt: Date.now() + 8.64e7, giftUntil: Date.now() + 9e9 }) === 'standard')
  ok('and one past gift_until is over', effectiveTier({ tier: 'starter', giftTier: 'elite', giftStartsAt: Date.now() - 9e9, giftUntil: Date.now() - 1000 }) === 'starter')
  // Two gifts stacked: Elite Pass first, then Standard. The app and the
  // database agree before, during and after each.
  const stackOff = []
  for (const [elitePast, thenLeft] of [[-1, 5000], [-5000, 300], [-9000, -1], [300, 9000]]) {
    const until = new Date(Date.now() + elitePast * 3600000)
    const thenUntil = new Date(Date.now() + thenLeft * 3600000)
    await db.query(`update families set tier = 'starter', trial_tier = null, trial_ends_at = null, gift_tier = 'elite',
                      gift_starts_at = now() - interval '400 days', gift_until = $1, gift_then_tier = 'standard', gift_then_until = $2
                     where id = $3`, [until, thenUntil, FAMILY])
    const fromDb = (await db.query('select effective_tier($1) as t', [FAMILY])).rows[0].t
    const fromApp = effectiveTier({ tier: 'starter', giftTier: 'elite', giftStartsAt: Date.now() - 400 * 8.64e7, giftUntil: until.getTime(),
      giftThenTier: 'standard', giftThenUntil: thenUntil.getTime() })
    if (fromDb !== fromApp) stackOff.push(`${elitePast}h/${thenLeft}h app=${fromApp} db=${fromDb}`)
  }
  ok('two gifts stacked: the app and the database agree, Elite Pass first, then Standard', stackOff.length === 0, stackOff.join('; '))
  ok('after the Elite Pass year the second gift is Standard', effectiveTier({ tier: 'starter', giftTier: 'elite',
    giftStartsAt: Date.now() - 9e9, giftUntil: Date.now() - 1000, giftThenTier: 'standard', giftThenUntil: Date.now() + 8.64e7 }) === 'standard')
  await db.query('update families set gift_tier = null, gift_starts_at = null, gift_until = null, gift_then_tier = null, gift_then_until = null where id = $1', [FAMILY])
}

console.log('\n=== A paused plan: the app and the database agree on that too ===')
{
  // What they pay for, a trial or none, a gift or none, and a pause that is
  // over, running, or running with no end date (made in Stripe's dashboard).
  const PAUSES = [null, -1, 720, 'infinity']
  const off = []
  let n = 0
  for (const tier of TIERS) {
    for (const trial of [null, 'elite']) {
      for (const gift of [null, 'standard']) {
        for (const hours of PAUSES) {
          const paused = hours === null ? null : hours === 'infinity' ? 'infinity' : new Date(Date.now() + hours * 3600000)
          const trialEnds = trial ? new Date(Date.now() + 72 * 3600000) : null
          const giftStarts = gift ? new Date(Date.now() - 3600000) : null
          const giftUntil = gift ? new Date(Date.now() + 9000 * 3600000) : null
          await db.query(
            `update families set tier = $1, trial_tier = $2, trial_ends_at = $3, gift_tier = $4, gift_starts_at = $5, gift_until = $6,
                    paused_until = $7 where id = $8`, [tier, trial, trialEnds, gift, giftStarts, giftUntil, paused, FAMILY])
          const fromDb = (await db.query('select effective_tier($1) as t', [FAMILY])).rows[0].t
          const fromApp = effectiveTier({ tier, trialTier: trial, trialEndsAt: trialEnds?.getTime() ?? null,
            giftTier: gift, giftStartsAt: giftStarts?.getTime() ?? null, giftUntil: giftUntil?.getTime() ?? null,
            pausedUntil: pausedUntilOf(paused instanceof Date ? paused.toISOString() : paused) })
          n += 1
          if (fromDb !== fromApp) off.push(`paid=${tier} trial=${trial} gift=${gift} paused=${hours} app=${fromApp} db=${fromDb}`)
        }
      }
    }
  }
  ok(`the app and the database agree on all ${n} of them`, off.length === 0, `${off.length} differ, first: ${off[0] || ''}`)
  ok('a pause takes a paying family to the free level', effectiveTier({ tier: 'elite', pausedUntil: Date.now() + 8.64e7 }) === 'starter')
  ok('but a trial still counts in full', effectiveTier({ tier: 'standard', pausedUntil: Date.now() + 8.64e7, trialTier: 'elite', trialEndsAt: Date.now() + 8.64e7 }) === 'elite')
  ok('and so does a gift', effectiveTier({ tier: 'elite', pausedUntil: Date.now() + 8.64e7, giftTier: 'standard', giftStartsAt: Date.now() - 1000, giftUntil: Date.now() + 8.64e7 }) === 'standard')
  ok('and when it is over, they have what they pay for', effectiveTier({ tier: 'elite', pausedUntil: Date.now() - 1000 }) === 'elite')
  await db.query('update families set paused_until = null, gift_tier = null, gift_starts_at = null, gift_until = null where id = $1', [FAMILY])
}

console.log('\n=== The countdown a parent is shown ===')
ok('a fortnight reads as 14 days', trialDaysLeft({ trialTier: 'elite', trialEndsAt: Date.now() + 14 * 86400000 }) === 14)
ok('the last few hours still read as a day, never zero',
  trialDaysLeft({ trialTier: 'elite', trialEndsAt: Date.now() + 3600000 }) === 1)
ok('an expired one reads as nothing at all',
  trialDaysLeft({ trialTier: 'elite', trialEndsAt: Date.now() - 1 }) === null)
ok('and a family that never had one reads the same', trialDaysLeft({ tier: 'standard' }) === null)

await db.query('update families set trial_tier = null, trial_ends_at = null where id = $1', [FAMILY])
await db.end()
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
