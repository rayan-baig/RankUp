/**
 * Money, checked two ways.
 *
 * Reading and printing an amount is the part that goes wrong quietly. A parent
 * types "2.50" and a child is owed 250 pence — or 25, or 2.5, and nobody
 * notices until somebody is handed the wrong money. So parseMoney and
 * formatMoney are exercised over the cases people actually type, including the
 * ones that must be REFUSED rather than guessed at.
 *
 * Then the same argument as tests/awards.mjs: the app and the database both
 * decide what a chore paid, so they are run over the same chores and
 * compared. This pair is much less likely to drift than XP, and deliberately
 * so — the amount is paid exactly as set, with no multipliers for the two
 * implementations to disagree about. The test is here to keep it that way.
 *
 * Needs Postgres with the schema applied:  supabase/test/run.sh
 */
import pg from 'pg'
import { parseMoney, formatMoney, minorDigits } from '../src/lib/money.js'
import { reducer, potFor } from '../src/state/reducer.js'
import { createInitialState, makeKid } from '../src/state/initialState.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

console.log('\n=== Reading what a parent typed ===')
const READS = [
  ['2', 200], ['2.5', 250], ['2.50', 250], ['0.05', 5], ['10', 1000],
  ['£2.50', 250], [' 2.50 ', 250], ['2,50', 250], ['100', 10000], ['0', 0],
  // Everything below must be refused, not guessed at.
  ['', null], ['abc', null], ['.', null], ['2.505', null], ['-2', null],
  ['2.5.0', null],
]
for (const [input, expected] of READS) {
  const got = parseMoney(input, 'GBP')
  ok(`"${input}" → ${expected === null ? 'refused' : expected + 'p'}`, got === expected, `got ${got}`)
}

console.log('\n=== Currencies without a hundredth ===')
minorDigits('JPY') === 0
  ? ok('yen has no minor unit', true)
  : ok('yen has no minor unit', false)
parseMoney('150', 'JPY') === 150
  ? ok('so 150 yen is 150, not 15000', true)
  : ok('so 150 yen is 150, not 15000', false, String(parseMoney('150', 'JPY')))
parseMoney('1.5', 'JPY') === null
  ? ok('and half a yen is refused rather than rounded', true)
  : ok('and half a yen is refused rather than rounded', false, String(parseMoney('1.5', 'JPY')))

console.log('\n=== Printing it back ===')
const twoFifty = /2[.,]50/.test(formatMoney(250, 'GBP'))
ok('250p prints as two pounds fifty', twoFifty, formatMoney(250, 'GBP'))
const fivePence = /0[.,]05/.test(formatMoney(5, 'GBP'))
ok('and five pence keeps its leading zero', fivePence, formatMoney(5, 'GBP'))
// The round trip is the one that matters: whatever is printed must read back.
const ROUND = [1, 5, 50, 99, 100, 250, 999, 1000, 10000]
const broke = ROUND.filter((p) => parseMoney(formatMoney(p, 'GBP'), 'GBP') !== p)
broke.length === 0
  ? ok('every amount survives being printed and read back', true)
  : ok('round trip', false, `broke on ${broke.join(', ')}`)

console.log('\n=== The app and the database agree ===')
const client = new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
await client.connect()

// A family in the database to approve real chores in.
await client.query(`
  insert into auth.users (id, email) values
    ('9e111111-1111-1111-1111-111111111111', 'money-test@example.com')
  on conflict do nothing;
  -- Elite, because this walks eight prices and therefore needs eight children.
  -- Starter is a one-child plan and the database is right to say so.
  insert into families (id, name, tier) values
    ('9e222222-0000-0000-0000-000000000001', 'Money Test', 'elite') on conflict do nothing;
  insert into parents (user_id, family_id, name) values
    ('9e111111-1111-1111-1111-111111111111', '9e222222-0000-0000-0000-000000000001', 'MT')
  on conflict do nothing;
`)
await client.query(
  `insert into parental_consents (family_id, parent_id, version, method, signed_name)
   select '9e222222-0000-0000-0000-000000000001', p.id, '2026-01', 'payment_card', 'MT'
     from parents p where p.user_id = '9e111111-1111-1111-1111-111111111111'
     and not exists (select 1 from parental_consents
                      where family_id = '9e222222-0000-0000-0000-000000000001')`,
)

// Prices worth checking: nothing, a penny, ordinary pocket money, the cap.
const PRICES = [0, 1, 50, 100, 250, 499, 1000, 10000]
let drifts = 0
for (const pence of PRICES) {
  const { rows: [kid] } = await client.query(
    `insert into kids (family_id, name) values ('9e222222-0000-0000-0000-000000000001', $1)
     returning id`, [`K${pence}`],
  )
  const { rows: [quest] } = await client.query(
    `insert into quests (family_id, kid_id, title, xp, pence, done_means)
     values ('9e222222-0000-0000-0000-000000000001', $1, $2, 30, $3, 'done')
     returning id`, [kid.id, `Chore ${pence}`, pence],
  )
  const { rows: [sub] } = await client.query(
    `insert into submissions (family_id, quest_id, kid_id, status)
     values ('9e222222-0000-0000-0000-000000000001', $1, $2, 'pending')
     returning id`, [quest.id, kid.id],
  )

  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`,
    ['9e111111-1111-1111-1111-111111111111'])
  await client.query('select approve_submission($1, 30, 6, $2)', [sub.id, ''])

  const { rows: [{ pot }] } = await client.query(
    'select coalesce(sum(pence), 0)::int as pot from allowance_entries where kid_id = $1',
    [kid.id],
  )

  // The same chore, approved by the app's own reducer.
  const appKid = makeKid({ name: 'App' })
  let s = reducer(createInitialState(), {
    type: 'COMPLETE_ONBOARDING',
    family: { name: 'App', parentName: 'P', pin: '1234' },
    kid: appKid,
    guildName: 'g',
  })
  s = reducer(s, {
    type: 'ADD_QUESTS',
    quests: [{ title: `Chore ${pence}`, kidId: appKid.id, xp: 30, pence, difficulty: 'medium' }],
  })
  const q = s.quests[s.quests.length - 1]
  s = reducer(s, {
    type: 'SUBMIT_QUEST',
    submission: { questId: q.id, kidId: appKid.id, photoId: null, onTime: true, captureSource: 'none' },
  })
  const appSub = s.submissions[s.submissions.length - 1]
  s = reducer(s, { type: 'APPROVE_SUBMISSION', submissionId: appSub.id })

  const appPot = potFor(s, appKid.id)
  if (appPot !== pot) {
    drifts += 1
    console.log(`  FAIL a ${pence}p chore — app says ${appPot}, database says ${pot}`)
  }
}
drifts === 0
  ? ok(`the app and the database pay the same on all ${PRICES.length} prices`, true)
  : ok('app and database agree', false, `${drifts} disagreed`)

console.log('\n=== A payout the app refuses before the server can ===')
{
  const kid = makeKid({ name: 'Offline' })
  let s = reducer(createInitialState(), {
    type: 'COMPLETE_ONBOARDING',
    family: { name: 'O', parentName: 'P', pin: '1234' },
    kid,
    guildName: 'g',
  })
  s = reducer(s, { type: 'RECORD_MONEY', kidId: kid.id, pence: 500, kind: 'gift', note: 'birthday' })
  potFor(s, kid.id) === 500
  ? ok('a gift goes in', true)
  : ok('a gift goes in', false, String(potFor(s, kid.id)))

  const over = reducer(s, { type: 'RECORD_MONEY', kidId: kid.id, pence: 600, kind: 'paid', note: '' })
  potFor(over, kid.id) === 500
    ? ok('and paying out more than the pot does nothing, with no signal to ask', true)
    : ok('over-payment refused offline', false, String(potFor(over, kid.id)))

  const paid = reducer(s, { type: 'RECORD_MONEY', kidId: kid.id, pence: 500, kind: 'paid', note: '' })
  potFor(paid, kid.id) === 0
    ? ok('paying it all leaves nothing owed', true)
    : ok('paying it all', false, String(potFor(paid, kid.id)))
}

console.log('\n=== The pot survives a truncated ledger ===')
// The trap this was written for: the summary sums every line but only returns
// the most recent two hundred. An app that adds up the lines it was sent loses
// every penny older than that.
{
  const kid = makeKid({ name: 'Long' })
  let s = reducer(createInitialState(), {
    type: 'COMPLETE_ONBOARDING',
    family: { name: 'L', parentName: 'P', pin: '1234' },
    kid,
    guildName: 'g',
  })
  s = reducer(s, {
    type: 'MERGE_ALLOWANCE',
    // The server says £340 across all time, and shows two of the lines.
    pots: { [kid.id]: 34000 },
    entries: [
      { id: 'a', kidId: kid.id, pence: 500, kind: 'earned', note: 'recent', at: 1000 },
      { id: 'b', kidId: kid.id, pence: 500, kind: 'earned', note: 'recent', at: 900 },
    ],
    at: 2000,
  })
  potFor(s, kid.id) === 34000
    ? ok('the pot is the server\'s total, not the sum of the lines it sent', true)
    : ok('pot from server total', false, String(potFor(s, kid.id)))

  // And a line written after that answer is still counted.
  const after = reducer(s, { type: 'RECORD_MONEY', kidId: kid.id, pence: 1000, kind: 'gift', note: '' })
  potFor(after, kid.id) === 35000
    ? ok('and something added since is still on top of it', true)
    : ok('local line after merge', false, String(potFor(after, kid.id)))
}

await client.end()
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
