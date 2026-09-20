/**
 * The app and the database have to agree on what a chore is worth.
 *
 * approve_submission used to add whatever XP and currency the request said.
 * One HTTP request from a parent's account could mint any number — and because
 * guild leaderboards show a child's XP to children in OTHER families, that is
 * not a private indulgence. The figure is computed in the database now, from
 * rows the caller cannot write.
 *
 * Which leaves the danger that always comes with computing the same thing
 * twice: the two drift, the screen promises 68 XP and the child is paid 45.
 * So this runs the real calcReward from the app and the real
 * award_for_submission from the database over the same cases and compares
 * them. It is not two copies of my arithmetic checked against each other —
 * it is the two implementations checked against each other.
 *
 * Needs Postgres with the schema applied:  supabase/test/run.sh
 */
import pg from 'pg'
import { calcReward, testScoreBonus } from '../src/lib/xp.js'

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

const FAMILY = 'c0ffee00-0000-4000-8000-00000000f001'
const KID = 'c0ffee00-0000-4000-8000-00000000c001'
const PARENT = 'c0ffee00-0000-4000-8000-00000000a001'

await db.query(`insert into auth.users (id, email) values ($1, 'awards@example.com') on conflict do nothing`, [PARENT])
await db.query(`insert into families (id, name, tier) values ($1, 'Awards Family', 'standard') on conflict do nothing`, [FAMILY])
await db.query(`insert into parents (user_id, family_id, name) values ($1, $2, 'Awards Parent') on conflict do nothing`, [PARENT, FAMILY])
// A child cannot exist without consent on file — enforced by the database.
await db.query('select seed_consent($1, $2)', [FAMILY, PARENT])
await db.query(`insert into kids (id, family_id, name) values ($1, $2, 'Awarded') on conflict do nothing`, [KID, FAMILY])

/** Every knob the reward formula turns, including the awkward .5 roundings. */
const CASES = []
for (const xp of [15, 30, 55, 100, 7]) {
  for (const doubleXp of [false, true]) {
    for (const timerSeconds of [0, 120]) {
      for (const onTime of [true, false]) {
        for (const streak of [0, 2, 3, 5, 9, 15, 40]) {
          for (const tier of ['standard', 'elite']) {
            for (const test of [null, 79, 80, 90, 95, 100]) {
              CASES.push({ xp, doubleXp, timerSeconds, onTime, streak, tier, test })
            }
          }
        }
      }
    }
  }
}

console.log(`\n=== ${CASES.length} ways a chore can pay out ===`)

let mismatches = []
for (const c of CASES) {
  await db.query('update families set tier = $1 where id = $2', [c.tier, FAMILY])
  await db.query('update kids set streak_count = $1 where id = $2', [c.streak, KID])
  const quest = (await db.query(
    `insert into quests (family_id, kid_id, title, xp, difficulty, timer_seconds, test_score, double_xp, status)
     values ($1, $2, 'Awarded quest', $3, 'medium', $4, $5, $6, 'submitted') returning id`,
    [FAMILY, KID, c.xp, c.timerSeconds, c.test !== null, c.doubleXp],
  )).rows[0].id
  const sub = (await db.query(
    `insert into submissions (family_id, quest_id, kid_id, on_time, test_score, status)
     values ($1, $2, $3, $4, $5, 'pending') returning id`,
    [FAMILY, quest, KID, c.onTime, c.test],
  )).rows[0].id

  const fromDb = (await db.query('select award_for_submission($1) as a', [sub])).rows[0].a

  // The app's own path, exactly as the reducer runs it.
  const reward = calcReward(
    { xp: c.xp, difficulty: 'medium', doubleXp: c.doubleXp, timerSeconds: c.timerSeconds, testScore: c.test !== null },
    { elite: c.tier === 'elite', streak: c.streak, onTime: c.onTime },
  )
  let { xp, coins } = reward
  if (c.test !== null) {
    const bonus = testScoreBonus(c.test, c.xp)
    if (bonus > 0) { xp += bonus; coins += Math.max(1, Math.round(bonus / 5)) }
  }

  if (fromDb.xp !== xp || fromDb.coins !== coins) {
    mismatches.push(`${JSON.stringify(c)} app=${xp}/${coins} db=${fromDb.xp}/${fromDb.coins}`)
  }
}

ok('the app and the database agree on every one', mismatches.length === 0,
  `${mismatches.length} differ, first: ${mismatches[0] || ''}`)

console.log('\n=== And the number in the request is ignored ===')
// The whole point. A parent's device asking for a million must not get one.
await db.query('update families set tier = $1 where id = $2', ['standard', FAMILY])
await db.query('update kids set streak_count = 0, xp = 0, coins = 0 where id = $1', [KID])
const quest = (await db.query(
  `insert into quests (family_id, kid_id, title, xp, difficulty, status)
   values ($1, $2, 'Honest quest', 30, 'medium', 'submitted') returning id`, [FAMILY, KID])).rows[0].id
const sub = (await db.query(
  `insert into submissions (family_id, quest_id, kid_id, status) values ($1, $2, $3, 'pending') returning id`,
  [FAMILY, quest, KID])).rows[0].id

await db.query('set role app_user')
await db.query('select become($1)', [PARENT])
await db.query('select approve_submission($1, $2, $3, $4)', [sub, 1000000, 1000000, 'nice work'])
await db.query('reset role')

const after = (await db.query('select xp, coins from kids where id = $1', [KID])).rows[0]
ok('a request for a million XP pays the quest’s 30', after.xp === 30, `xp=${after.xp}`)
ok('and the currency that goes with it, not a million', after.coins === 6, `coins=${after.coins}`)
const recorded = (await db.query('select awarded_xp, awarded_coins from submissions where id = $1', [sub])).rows[0]
ok('the submission records what was really paid', recorded.awarded_xp === 30 && recorded.awarded_coins === 6,
  `recorded ${recorded.awarded_xp}/${recorded.awarded_coins}`)

await db.end()
console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
