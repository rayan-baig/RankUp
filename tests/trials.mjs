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
import { effectiveTier, trialDaysLeft } from '../src/state/reducer.js'

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
