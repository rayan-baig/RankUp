/**
 * Two phones, one balance.
 *
 * The SQL suite (supabase/test/29-money-floor.sql) proves each rule one call
 * at a time. What it cannot show is two phones arriving at once, which is the
 * normal case for a family: a child's phone and a parent's both offline, both
 * buying, both syncing the moment the wifi comes back. So this runs the app's
 * own reducer as two phones, sends what each queued to a real Postgres over
 * two connections at the same instant, and feeds the answers back the way the
 * sync engine does.
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

const { reducer } = await import('../src/state/reducer.js')
const { createInitialState } = await import('../src/state/initialState.js')
const { pendingRows } = await import('../src/lib/sync/shadow.js')

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

const FAMILY = '81222222-0000-4000-8000-00000000000a'
const PARENT = '81111111-0000-4000-8000-00000000000a'
const COPARENT = '81111111-0000-4000-8000-00000000000b'
const KID_DEVICE = '81111111-0000-4000-8000-0000000000c1'
const KID = '81444444-0000-4000-8000-0000000000a1'
const FILM = '81777777-0000-4000-8000-000000000001'
const GONE = '81777777-0000-4000-8000-000000000002'

await admin.query(`delete from families where id = $1`, [FAMILY])
await admin.query(`insert into auth.users (id, email) values ($1, 'rr-parent@example.com'), ($2, 'rr-coparent@example.com'),
                   ($3, 'rr-kid@example.com') on conflict do nothing`, [PARENT, COPARENT, KID_DEVICE])
await admin.query(`insert into families (id, name, tier) values ($1, 'Reward Races', 'standard')`, [FAMILY])
await admin.query(`insert into parents (user_id, family_id, name, role) values ($1, $3, 'Pat', 'parent'), ($2, $3, 'Lee', 'parent')
                   on conflict (user_id) do update set family_id = excluded.family_id, role = 'parent'`, [PARENT, COPARENT, FAMILY])
await admin.query(`select seed_consent($1, $2)`, [FAMILY, PARENT]).catch(() => {})
await admin.query(`insert into kids (id, family_id, name, user_id) values ($1, $2, 'Mia', $3)`, [KID, FAMILY, KID_DEVICE])
await admin.query(`insert into rewards (id, family_id, name, cost) values ($1, $3, 'Film night', 30), ($2, $3, 'Late bedtime', 5)`,
  [FILM, GONE, FAMILY])
const setCoins = (n) => admin.query('update kids set coins = $1 where id = $2', [n, KID])
const serverCoins = async () => (await admin.query('select coins from kids where id = $1', [KID])).rows[0].coins
const serverKidRow = async () => (await admin.query('select to_jsonb(k) as row from kids k where id = $1', [KID])).rows[0].row

/** Call a database function as a signed-in user, the way the API does. */
async function rpcAs(client, user, fn, args) {
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user])
  await client.query('set role authenticated')
  try {
    const names = Object.keys(args)
    const sql = `select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
    return (await client.query(sql, names.map((n) => args[n]))).rows[0].r
  } catch (err) {
    return { ok: false, reason: err.message }
  } finally {
    await client.query('reset role')
  }
}

/** A phone's state with the family's child and rewards, holding `coins`. */
function phone(coins, role = 'parent') {
  const s = createInitialState()
  return {
    ...s,
    onboarded: true,
    device: { ...(s.device || {}), role, linkedKidId: role === 'kid' ? KID : null },
    family: { ...s.family, id: FAMILY, name: 'Reward Races' },
    kids: [{ ...(s.kids?.[0] || {}), id: KID, name: 'Mia', xp: 0, coins, lockout: null }],
    rewards: [{ id: FILM, name: 'Film night', cost: 30 }, { id: GONE, name: 'Late bedtime', cost: 5 }],
    quests: [], submissions: [], redemptions: [], notes: [], overrides: [], syncQueue: [],
  }
}
const coinsOn = (s) => s.kids.find((k) => k.id === KID).coins

/** Send what a phone queued, and apply the answer as the engine would. */
async function sync(state, client, user) {
  let next = state
  for (const item of state.syncQueue) {
    // eslint-disable-next-line no-await-in-loop
    const result = await rpcAs(client, user, item.fn, item.args)
    if (result && result.ok === false) next = reducer(next, { type: 'RPC_REFUSED', fn: item.fn, args: item.args, reason: result.reason })
  }
  return { ...next, syncQueue: [] }
}
const pull = async (state) => reducer(state, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [await serverKidRow()] }, pending: [] })

console.log('\n=== The same reward bought on two phones while both were offline ===')
{
  await setCoins(45)
  let kidPhone = reducer(phone(45, 'kid'), { type: 'REDEEM_REWARD', rewardId: FILM, kidId: KID })
  let parentPhone = reducer(phone(45), { type: 'REDEEM_REWARD', rewardId: FILM, kidId: KID })
  ok('each phone takes the coins on screen at once', coinsOn(kidPhone) === 15 && coinsOn(parentPhone) === 15)
  const idA = kidPhone.syncQueue[0]?.args?.p_redemption_id
  const idB = parentPhone.syncQueue[0]?.args?.p_redemption_id
  ok('as two purchases, each with its own id', idA && idB && idA !== idB)

  // Both come back online in the same instant.
  ;[kidPhone, parentPhone] = await Promise.all([sync(kidPhone, phoneA, KID_DEVICE), sync(parentPhone, phoneB, PARENT)])
  const bought = (await admin.query('select count(*)::int as n from redemptions where kid_id = $1', [KID])).rows[0].n
  ok('the server charges one of them: 45 -> 15, never below zero', (await serverCoins()) === 15, String(await serverCoins()))
  ok('and records one redemption', bought === 1, String(bought))
  const refused = [kidPhone, parentPhone].find((s) => s.syncNotice)
  ok('the phone whose purchase was refused is told why',
    /not enough coins/.test(refused?.syncNotice?.message || ''), refused?.syncNotice?.message)
  ok('and drops it from its list', refused && refused.redemptions.length === 0)
  ;[kidPhone, parentPhone] = await Promise.all([pull(kidPhone), pull(parentPhone)])
  ok('after the next pull both phones show what the server holds', coinsOn(kidPhone) === 15 && coinsOn(parentPhone) === 15,
    `${coinsOn(kidPhone)} / ${coinsOn(parentPhone)}`)
}

console.log('\n=== Enough for both: two purchases, two charges ===')
{
  await admin.query('delete from redemptions where kid_id = $1', [KID])
  await setCoins(60)
  const a = reducer(phone(60, 'kid'), { type: 'REDEEM_REWARD', rewardId: FILM, kidId: KID })
  const b = reducer(phone(60), { type: 'REDEEM_REWARD', rewardId: FILM, kidId: KID })
  await Promise.all([sync(a, phoneA, KID_DEVICE), sync(b, phoneB, PARENT)])
  ok('two real purchases are two charges, landing on exactly zero', (await serverCoins()) === 0, String(await serverCoins()))
}

console.log('\n=== One purchase sent twice at once (a retry racing the first try) ===')
{
  await admin.query('delete from redemptions where kid_id = $1', [KID])
  await setCoins(100)
  const s = reducer(phone(100, 'kid'), { type: 'REDEEM_REWARD', rewardId: FILM, kidId: KID })
  const item = s.syncQueue[0]
  const answers = await Promise.all([
    rpcAs(phoneA, KID_DEVICE, item.fn, item.args),
    rpcAs(phoneB, KID_DEVICE, item.fn, item.args),
  ])
  ok('both answers are "ok"', answers.every((r) => r.ok === true), JSON.stringify(answers))
  ok('one charge', (await serverCoins()) === 70, String(await serverCoins()))
  ok('one redemption', (await admin.query('select count(*)::int as n from redemptions where id = $1', [item.args.p_redemption_id])).rows[0].n === 1)
}

console.log('\n=== A purchase and a tax at the same moment ===')
{
  await admin.query('delete from redemptions where kid_id = $1', [KID])
  await setCoins(40)
  // The parent's tax holds the child's row while the purchase waits for it.
  await phoneB.query(`select set_config('request.jwt.claim.sub', $1, false)`, [PARENT])
  await phoneB.query('begin')
  await phoneB.query('set local role authenticated')
  await phoneB.query(`select apply_currency_tax($1, 75, gen_random_uuid())`, [KID])
  const buying = rpcAs(phoneA, KID_DEVICE, 'redeem_reward',
    { p_redemption_id: '81999999-0000-4000-8000-000000000040', p_reward_id: FILM, p_kid_id: KID })
  await new Promise((r) => setTimeout(r, 300))
  await phoneB.query('commit')
  const bought = await buying
  ok('the purchase waits for the tax, then sees what it left (10) and is refused',
    bought.ok === false && bought.reason === 'insufficient', JSON.stringify(bought))
  ok('so the balance is 10, not -20', (await serverCoins()) === 10, String(await serverCoins()))
}

console.log('\n=== A pull while a purchase is still on its way ===')
{
  await setCoins(50)
  let s = reducer(phone(50, 'kid'), { type: 'REDEEM_REWARD', rewardId: FILM, kidId: KID })
  const ops = s.syncQueue.map((q) => ({ type: 'rpc', fn: q.fn, args: q.args }))
  const pending = pendingRows(ops, s)
  ok('the child\'s row is held while the purchase is unsent', pending.has(`kids:${KID}`), [...pending].join(', '))
  // The server's row, from before the purchase landed.
  s = reducer(s, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [await serverKidRow()] }, pending: [...pending] })
  ok('so an older pull does not hand the 30 coins back on screen', coinsOn(s) === 20, String(coinsOn(s)))
  ok('and a second purchase with the same coins is refused on the phone itself',
    coinsOn(reducer(s, { type: 'REDEEM_REWARD', rewardId: FILM, kidId: KID })) === 20)
  const tax = reducer(phone(50), { type: 'APPLY_OVERRIDE', kidId: KID, kind: 'tax', percent: 50 })
  ok('a tax on its way holds the row too',
    pendingRows(tax.syncQueue.map((q) => ({ type: 'rpc', fn: q.fn, args: q.args })), tax).has(`kids:${KID}`))
}

console.log('\n=== A reward deleted by a parent while a child buys it offline ===')
{
  await admin.query('delete from redemptions where kid_id = $1', [KID])
  await setCoins(20)
  let kidPhone = reducer(phone(20, 'kid'), { type: 'REDEEM_REWARD', rewardId: GONE, kidId: KID })
  ok('offline, the child buys the late bedtime: 20 -> 15', coinsOn(kidPhone) === 15)
  // Meanwhile the parent deletes it, on their phone, online.
  await admin.query('delete from rewards where id = $1', [GONE])
  kidPhone = await sync(kidPhone, phoneA, KID_DEVICE)
  ok('nothing is charged on the server', (await serverCoins()) === 20, String(await serverCoins()))
  ok('the phone gives the coins back', coinsOn(kidPhone) === 20, String(coinsOn(kidPhone)))
  ok('and says the reward was taken off the list', /taken off the rewards list/.test(kidPhone.syncNotice?.message || ''),
    kidPhone.syncNotice?.message)
  kidPhone = reducer(await pull(kidPhone), {
    type: 'MERGE_SNAPSHOT', snapshot: { deletions: [{ table_name: 'rewards', row_id: GONE }] }, pending: [],
  })
  ok('and the reward leaves the child\'s shop with the next pull', !kidPhone.rewards.some((r) => r.id === GONE))
}

console.log('\n=== "Mark given" tapped on two parent phones at once ===')
{
  await admin.query('delete from redemptions where kid_id = $1', [KID])
  await setCoins(30)
  const RD = '81999999-0000-4000-8000-000000000050'
  await rpcAs(phoneA, KID_DEVICE, 'redeem_reward', { p_redemption_id: RD, p_reward_id: FILM, p_kid_id: KID })
  const owed = { id: RD, rewardId: FILM, kidId: KID, name: 'Film night', cost: 30, status: 'requested', at: Date.now() }
  let one = reducer({ ...phone(0), redemptions: [owed] }, { type: 'FULFIL_REDEMPTION', redemptionId: RD })
  let two = reducer({ ...phone(0), redemptions: [owed] }, { type: 'FULFIL_REDEMPTION', redemptionId: RD })
  ok('a second tap on the same phone sends nothing more',
    reducer(one, { type: 'FULFIL_REDEMPTION', redemptionId: RD }).syncQueue.length === one.syncQueue.length)
  ok('"Mark given" on its way holds the row against an older pull',
    pendingRows(one.syncQueue.map((q) => ({ type: 'rpc', fn: q.fn, args: q.args })), one).has(`redemptions:${RD}`))
  ;[one, two] = await Promise.all([sync(one, phoneA, PARENT), sync(two, phoneB, COPARENT)])
  ok('neither parent is shown an error', !one.syncNotice && !two.syncNotice,
    `${one.syncNotice?.message} / ${two.syncNotice?.message}`)
  const row = (await admin.query('select status, given_at from redemptions where id = $1', [RD])).rows[0]
  ok('the reward is given once, with one time', row.status === 'given' && row.given_at)
  ok('both phones show it given', one.redemptions[0].status === 'given' && two.redemptions[0].status === 'given')
  ok('and nothing was charged or refunded by it', (await serverCoins()) === 0)
}

console.log('\n=== Two parents paying out the same pocket money at once ===')
{
  await admin.query(`insert into allowance_entries (family_id, kid_id, pence, kind, note) values ($1, $2, 500, 'gift', 'birthday')`,
    [FAMILY, KID])
  const pay = (client, user) => rpcAs(client, user, 'record_payout',
    { p_kid_id: KID, p_pence: 500, p_note: '', p_request_id: crypto.randomUUID() })
  const answers = await Promise.all([pay(phoneA, PARENT), pay(phoneB, COPARENT)])
  const pot = (await admin.query('select coalesce(sum(pence), 0)::int as pot from allowance_entries where kid_id = $1', [KID])).rows[0].pot
  ok('one payout is recorded and the other refused', answers.filter((r) => r.ok === true).length === 1
    && answers.some((r) => r.reason === 'more_than_the_pot'), JSON.stringify(answers))
  ok('so the pot is 0, not -£5', pot === 0, String(pot))
}

console.log('\n=== No sequence of taps takes a balance below zero on the phone ===')
{
  // A seeded walk, so a failure can be replayed.
  let seed = 20261102
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let worst = Infinity
  let s = phone(37)
  for (let i = 0; i < 4000; i += 1) {
    const roll = rand()
    if (roll < 0.35) s = reducer(s, { type: 'REDEEM_REWARD', rewardId: rand() < 0.5 ? FILM : GONE, kidId: KID })
    else if (roll < 0.5) s = reducer(s, { type: 'APPLY_OVERRIDE', kidId: KID, kind: 'tax', percent: Math.floor(rand() * 250) - 50 })
    else if (roll < 0.6) s = reducer(s, { type: 'BUY_SKIN', kidId: KID, skinId: 'ember' })
    else if (roll < 0.75 && s.redemptions.length) {
      const r = s.redemptions[Math.floor(rand() * s.redemptions.length)]
      s = reducer(s, { type: 'RPC_REFUSED', fn: 'redeem_reward', args: { p_redemption_id: r.id }, reason: 'insufficient' })
    } else if (roll < 0.9) {
      s = reducer(s, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [{ ...(await serverKidRow()), coins: Math.floor(rand() * 60) }] }, pending: [] })
    } else s = reducer(s, { type: 'CLAIM_LOGIN_BONUS', kidId: KID })
    s = { ...s, syncQueue: [] }
    worst = Math.min(worst, coinsOn(s))
  }
  ok('4,000 random purchases, taxes, refusals and pulls never show a negative balance', worst >= 0, `lowest ${worst}`)
}

await admin.query('delete from families where id = $1', [FAMILY])
await Promise.all([admin.end(), phoneA.end(), phoneB.end()])
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
