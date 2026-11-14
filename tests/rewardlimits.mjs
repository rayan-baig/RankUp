/**
 * A reward's weekly limit, offline and on two phones.
 *
 * A parent can say a reward may be taken at most so many times a week by each
 * child (Settings, Rewards catalogue). The app holds a child to it before any
 * coins move, counting purchases still queued on that phone; the database
 * holds it again when they arrive (supabase/test/42-reward-limits.sql), which
 * is what stops two phones that were both offline going over it between them.
 * This runs the app's own reducer as those phones against a real Postgres.
 *
 * Needs Postgres with the schema applied:  supabase/test/run.sh
 */
import pg from 'pg'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = globalThis.window || { location: { search: '' }, addEventListener() {}, removeEventListener() {} }

const { reducer, rewardLeftThisWeek, rewardFreesUpAt } = await import('../src/state/reducer.js')
const { createInitialState } = await import('../src/state/initialState.js')
const { rewards: rewardMapper } = await import('../src/lib/sync/mappers.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const conn = () => new pg.Client({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 55432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'rankup_test',
})
const admin = conn()
const phoneA = conn()
const phoneB = conn()
await Promise.all([admin.connect(), phoneA.connect(), phoneB.connect()])

const FAMILY = '82222222-0000-4000-8000-00000000000a'
const PARENT = '82111111-0000-4000-8000-00000000000a'
const KID_DEVICE = '82111111-0000-4000-8000-0000000000c1'
const KID = '82444444-0000-4000-8000-0000000000a1'
const SCREEN = '82777777-0000-4000-8000-000000000001'

await admin.query('delete from families where id = $1', [FAMILY])
await admin.query(`insert into auth.users (id, email) values ($1, 'rlimits-parent@example.com'), ($2, null) on conflict do nothing`, [PARENT, KID_DEVICE])
await admin.query(`insert into families (id, name, tier) values ($1, 'Reward Limits', 'standard')`, [FAMILY])
await admin.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, 'Pat', 'parent')
                   on conflict (user_id) do update set family_id = excluded.family_id, role = 'parent'`, [PARENT, FAMILY])
await admin.query('select seed_consent($1, $2)', [FAMILY, PARENT])
await admin.query(`insert into kids (id, family_id, name, user_id) values ($1, $2, 'Mia', $3)`, [KID, FAMILY, KID_DEVICE])
await admin.query(`insert into rewards (id, family_id, name, cost, weekly_limit) values ($1, $2, 'Screen time', 10, 2)`, [SCREEN, FAMILY])
const setLimit = (n) => admin.query('update rewards set weekly_limit = $1 where id = $2', [n, SCREEN])
const reset = async (coins) => {
  await admin.query('delete from redemptions where kid_id = $1', [KID])
  await admin.query('update kids set coins = $1 where id = $2', [coins, KID])
}
const serverCoins = async () => (await admin.query('select coins from kids where id = $1', [KID])).rows[0].coins
const serverCount = async () => (await admin.query('select count(*)::int as n from redemptions where kid_id = $1 and reward_id = $2', [KID, SCREEN])).rows[0].n

async function rpcAs(client, user, fn, args) {
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user])
  await client.query('set role authenticated')
  try {
    const names = Object.keys(args)
    return (await client.query(`select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`, names.map((n) => args[n]))).rows[0].r
  } catch (err) {
    return { ok: false, reason: err.message }
  } finally {
    await client.query('reset role')
  }
}

/** A phone holding the family's child and the reward, as its last sync left them. */
function phone(coins, limit, role = 'parent') {
  const s = createInitialState()
  return {
    ...s,
    onboarded: true,
    device: { ...(s.device || {}), role, linkedKidId: role === 'kid' ? KID : null },
    family: { ...s.family, id: FAMILY, name: 'Reward Limits' },
    kids: [{ ...(s.kids?.[0] || {}), id: KID, name: 'Mia', xp: 0, coins, lockout: null }],
    rewards: [{ id: SCREEN, name: 'Screen time', cost: 10, weeklyLimit: limit }],
    quests: [], submissions: [], redemptions: [], notes: [], overrides: [], syncQueue: [],
  }
}
const buy = (s) => reducer(s, { type: 'REDEEM_REWARD', rewardId: SCREEN, kidId: KID })
const coinsOn = (s) => s.kids.find((k) => k.id === KID).coins
const reward = (s) => s.rewards.find((r) => r.id === SCREEN)

/** What the sync engine does: send each queued call, feed back any refusal. */
async function sync(state, client, user) {
  let next = state
  for (const item of state.syncQueue) {
    // eslint-disable-next-line no-await-in-loop
    const result = await rpcAs(client, user, item.fn, item.args)
    if (result && result.ok === false) next = reducer(next, { type: 'RPC_REFUSED', fn: item.fn, args: item.args, reason: result.reason })
  }
  return { ...next, syncQueue: [] }
}
const pull = async (state, client, user) => reducer(state,
  { type: 'MERGE_SNAPSHOT', snapshot: await rpcAs(client, user, 'family_snapshot', { p_since: 0 }), pending: [] })

console.log('\n=== The limit travels with the reward ===')
{
  const row = rewardMapper.toRow({ id: SCREEN, name: 'Screen time', cost: 10, weeklyLimit: 3 }, FAMILY)
  ok('a limit is sent to the database as weekly_limit', row.weekly_limit === 3)
  ok('"no limit" is sent as null, and so is anything the database would refuse',
    rewardMapper.toRow({ weeklyLimit: null }, FAMILY).weekly_limit === null
    && rewardMapper.toRow({ weeklyLimit: 0 }, FAMILY).weekly_limit === null
    && rewardMapper.toRow({ weeklyLimit: 99 }, FAMILY).weekly_limit === null
    && rewardMapper.toRow({ weeklyLimit: 2.5 }, FAMILY).weekly_limit === null)
  ok('and read back', rewardMapper.fromRow({ id: SCREEN, weekly_limit: 2 }).weeklyLimit === 2
    && rewardMapper.fromRow({ id: SCREEN, weekly_limit: null }).weeklyLimit === null)
  const set = reducer(phone(50, null), { type: 'UPDATE_REWARD', rewardId: SCREEN, patch: { weeklyLimit: 2 } })
  ok('a parent sets it on the phone', reward(set).weeklyLimit === 2)
  ok('and takes it off', reward(reducer(set, { type: 'UPDATE_REWARD', rewardId: SCREEN, patch: { weeklyLimit: null } })).weeklyLimit === null)
  const added = reducer(phone(50, null), { type: 'ADD_REWARD', reward: { name: 'Pizza', cost: 30, weeklyLimit: 1 } })
  ok('a new reward can start with one', added.rewards.at(-1).weeklyLimit === 1)
}

console.log('\n=== One phone, no signal: the third tap is refused on the phone ===')
{
  await reset(50)
  await setLimit(2)
  let kidPhone = phone(50, 2, 'kid')
  ok('two left this week before anything is bought', rewardLeftThisWeek(kidPhone, KID, reward(kidPhone)) === 2)
  kidPhone = buy(buy(kidPhone))
  ok('two bought with no signal: 20 coins spent on screen, both queued', coinsOn(kidPhone) === 30 && kidPhone.syncQueue.length === 2)
  ok('none left this week, and the shop says when the next one frees up',
    rewardLeftThisWeek(kidPhone, KID, reward(kidPhone)) === 0
    && rewardFreesUpAt(kidPhone, KID, reward(kidPhone)) - kidPhone.redemptions[0].at === 7 * 86400000)
  const third = buy(kidPhone)
  ok('a third tap changes nothing: no coins, nothing queued', third === kidPhone || (coinsOn(third) === 30 && third.syncQueue.length === 2))
  kidPhone = await sync(kidPhone, phoneA, KID_DEVICE)
  ok('back in signal, both land', (await serverCount()) === 2 && (await serverCoins()) === 30 && !kidPhone.syncNotice)
  kidPhone = await pull(kidPhone, phoneA, KID_DEVICE)
  ok('after the pull the phone still says none left this week (counted from the server\'s times)',
    rewardLeftThisWeek(kidPhone, KID, reward(kidPhone)) === 0 && coinsOn(kidPhone) === 30, JSON.stringify(kidPhone.redemptions.map((r) => r.at)))
}

console.log('\n=== Two phones, both offline, both buying: the server holds the limit between them ===')
{
  await reset(60)
  await setLimit(2)
  // The child buys two on their phone; a parent, not knowing, buys one for
  // them on theirs. Each phone thinks it is within the limit.
  let kidPhone = buy(buy(phone(60, 2, 'kid')))
  let parentPhone = buy(phone(60, 2))
  ok('each phone allowed what it could see', kidPhone.syncQueue.length === 2 && parentPhone.syncQueue.length === 1)
  ;[kidPhone, parentPhone] = await Promise.all([sync(kidPhone, phoneA, KID_DEVICE), sync(parentPhone, phoneB, PARENT)])
  ok('the server lets two through, not three', (await serverCount()) === 2, String(await serverCount()))
  ok('and charges for two', (await serverCoins()) === 40, String(await serverCoins()))
  const refused = [kidPhone, parentPhone].find((s) => s.syncNotice)
  ok('the phone whose purchase came third is told, in words, that the week\'s are used',
    /as often as it can be this week/.test(refused?.syncNotice?.message || '') && /coins are back/.test(refused.syncNotice.message),
    refused?.syncNotice?.message)
  ok('and gives the coins back on screen', refused && coinsOn(refused) === 60 - 10 * refused.redemptions.length,
    refused && `${coinsOn(refused)} with ${refused.redemptions.length} kept`)
  ;[kidPhone, parentPhone] = await Promise.all([pull(kidPhone, phoneA, KID_DEVICE), pull(parentPhone, phoneB, PARENT)])
  ok('after the next pull both phones agree with the server', coinsOn(kidPhone) === 40 && coinsOn(parentPhone) === 40
    && rewardLeftThisWeek(kidPhone, KID, reward(kidPhone)) === 0 && rewardLeftThisWeek(parentPhone, KID, reward(parentPhone)) === 0,
  `${coinsOn(kidPhone)} / ${coinsOn(parentPhone)}`)
}

console.log('\n=== The limit lowered while purchases were queued ===')
{
  await reset(50)
  await setLimit(3)
  let kidPhone = buy(buy(phone(50, 3, 'kid')))
  // Meanwhile a parent lowers it to one a week.
  await setLimit(1)
  kidPhone = await sync(kidPhone, phoneA, KID_DEVICE)
  ok('the first queued purchase lands, the second is refused under the new limit',
    (await serverCount()) === 1 && (await serverCoins()) === 40 && /this week/.test(kidPhone.syncNotice?.message || ''),
    kidPhone.syncNotice?.message)
  kidPhone = await pull(kidPhone, phoneA, KID_DEVICE)
  ok('and the phone learns the new limit from the pull', reward(kidPhone).weeklyLimit === 1
    && rewardLeftThisWeek(kidPhone, KID, reward(kidPhone)) === 0 && coinsOn(kidPhone) === 40)
}

console.log('\n=== No limit, no change ===')
{
  await reset(50)
  await setLimit(null)
  let kidPhone = phone(50, null, 'kid')
  ok('a reward with no limit says nothing about weeks', rewardLeftThisWeek(kidPhone, KID, reward(kidPhone)) === null)
  for (let i = 0; i < 5; i += 1) kidPhone = buy(kidPhone)
  kidPhone = await sync(kidPhone, phoneA, KID_DEVICE)
  ok('five in a row, all bought', (await serverCount()) === 5 && (await serverCoins()) === 0 && !kidPhone.syncNotice)
}

await Promise.all([admin.end(), phoneA.end(), phoneB.end()])
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
