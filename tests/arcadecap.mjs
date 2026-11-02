/**
 * The arcade's limits, held by the server however many phones play.
 *
 * Two things a phone must not be able to do:
 *
 *   - beat the day's cap by playing on two phones at once. Each phone works
 *     the cap out on its own copy of the child, so the kid's phone and the
 *     parent's, both offline and both playing, each believe they have the
 *     whole day's winnings to give. The cap that counts is the one in the
 *     database, on the child's row, and it has to hold when both phones'
 *     games arrive in the same instant;
 *   - send a score higher than the game allows. Every game has a floor, the
 *     quickest a perfect round can be played, and the server holds a score to
 *     what that game allows in the time the round took — game by game.
 *
 * The app's own reducer plays as two phones; what each queued is sent to a
 * real Postgres over two connections at the same moment.
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
const { MINIGAMES, DAILY_COIN_CAP, possibleScore } = await import('../src/data/minigames.js')

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

const FAMILY = '8a222222-0000-4000-8000-00000000000a'
const PARENT = '8a111111-0000-4000-8000-00000000000a'
const KID_DEVICE = '8a111111-0000-4000-8000-0000000000c1'
const KID = '8a444444-0000-4000-8000-0000000000a1'

await admin.query('delete from families where id = $1', [FAMILY])
await admin.query(`insert into auth.users (id, email) values ($1, 'ac-parent@example.com'), ($2, 'ac-kid@example.com')
                   on conflict do nothing`, [PARENT, KID_DEVICE])
await admin.query(`insert into families (id, name, tier) values ($1, 'Arcade Cap', 'standard')`, [FAMILY])
await admin.query(`insert into parents (user_id, family_id, name, role) values ($1, $2, 'Pat', 'parent')
                   on conflict (user_id) do update set family_id = excluded.family_id, role = 'parent'`, [PARENT, FAMILY])
await admin.query('select seed_consent($1, $2)', [FAMILY, PARENT]).catch(() => {})
await admin.query(`insert into kids (id, family_id, name, user_id) values ($1, $2, 'Kit', $3)`, [KID, FAMILY, KID_DEVICE])

const kidRow = async () => (await admin.query('select * from kids where id = $1', [KID])).rows[0]
const reset = (tokens) => admin.query(
  `update kids set play_tokens = $2, coins = 0, game_coins_today = 0, game_day = null, best_scores = '{}' where id = $1`,
  [KID, tokens])

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

/** A phone holding the child with `tokens` and nothing won today. */
function phone(tokens, role) {
  const s = createInitialState()
  return {
    ...s,
    onboarded: true,
    device: { ...(s.device || {}), role, linkedKidId: role === 'kid' ? KID : null },
    family: { ...s.family, id: FAMILY, name: 'Arcade Cap' },
    kids: [{ ...(s.kids?.[0] || {}), id: KID, name: 'Kit', xp: 0, coins: 0, playTokens: tokens, gameDay: null, gameCoinsToday: 0 }],
    quests: [], submissions: [], syncQueue: [],
  }
}

/** Every call a phone queued, sent one after another on its own connection. */
async function send(state, client, user) {
  const answers = []
  for (const item of state.syncQueue) {
    // eslint-disable-next-line no-await-in-loop
    answers.push(await rpcAs(client, user, item.fn, item.args))
  }
  return answers
}

console.log('\n=== Two phones, one day\'s cap ===')
{
  await reset(30)
  // Ten perfect rounds on each phone, offline, each round a believable length.
  let kidPhone = phone(30, 'kid')
  let parentPhone = phone(30, 'parent')
  for (let i = 0; i < 10; i += 1) {
    kidPhone = reducer(kidPhone, { type: 'FINISH_MINIGAME', kidId: KID, game: 'memory', score: 100, coins: 5, elapsedMs: 40000 })
    parentPhone = reducer(parentPhone, { type: 'FINISH_MINIGAME', kidId: KID, game: 'stack', score: 100, coins: 5, elapsedMs: 40000 })
  }
  const onPhone = (s) => s.kids[0].coins
  ok('each phone, on its own, believes it won the whole cap', onPhone(kidPhone) === DAILY_COIN_CAP && onPhone(parentPhone) === DAILY_COIN_CAP,
    `${onPhone(kidPhone)} / ${onPhone(parentPhone)}`)
  ok('every queued game carries how long it took', kidPhone.syncQueue.every((c) => c.args.p_elapsed_ms === 40000))

  // Both phones come back online at the same instant.
  const [a, b] = await Promise.all([send(kidPhone, phoneA, KID_DEVICE), send(parentPhone, phoneB, PARENT)])
  const row = await kidRow()
  const paid = [...a, ...b].reduce((n, r) => n + (r?.coins || 0), 0)
  ok('every game was accepted', [...a, ...b].every((r) => r?.ok === true), JSON.stringify([...a, ...b].find((r) => !r?.ok)))
  ok(`the server paid exactly the day's cap of ${DAILY_COIN_CAP}, not twice it`, row.coins === DAILY_COIN_CAP && paid === DAILY_COIN_CAP,
    `coins ${row.coins}, answers paid ${paid}`)
  ok('and the day\'s tally says so', row.game_coins_today === DAILY_COIN_CAP, String(row.game_coins_today))
  ok('each game used one token, twenty in all', row.play_tokens === 10, String(row.play_tokens))
  ok('the games past the cap say they were capped', [...a, ...b].filter((r) => r.capped).length >= 17)

  // And the phones come back to the server's numbers on the next pull.
  const merged = reducer(kidPhone, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [await kidRow()].map((k) => ({ ...k, game_day: k.game_day && k.game_day.toISOString().slice(0, 10) })) }, pending: [] })
  ok('after a pull the kid\'s phone shows what the server holds', merged.kids[0].coins === DAILY_COIN_CAP, String(merged.kids[0].coins))
}

console.log('\n=== The same retried game is paid once, on whichever phone ===')
{
  await reset(5)
  const kidPhone = reducer(phone(5, 'kid'), { type: 'FINISH_MINIGAME', kidId: KID, game: 'memory', score: 100, coins: 5, elapsedMs: 40000 })
  const call = kidPhone.syncQueue[0]
  // A phone that never heard the answer sends it again, from two connections.
  const answers = await Promise.all([
    rpcAs(phoneA, KID_DEVICE, call.fn, call.args), rpcAs(phoneB, KID_DEVICE, call.fn, call.args)])
  const row = await kidRow()
  ok('sent twice at once, it pays once', row.coins === 5 && row.play_tokens === 4, `coins ${row.coins}, tokens ${row.play_tokens}`)
  ok('and both answers agree', answers[0].coins === answers[1].coins, JSON.stringify(answers))
}

console.log('\n=== No score higher than the game allows, game by game ===')
{
  await reset(200)
  const held = []
  for (const game of MINIGAMES) {
    // A score of 100 claimed one second after the game opened.
    // eslint-disable-next-line no-await-in-loop
    const r = await rpcAs(phoneA, KID_DEVICE, 'play_minigame',
      { p_kid_id: KID, p_game: game.id, p_score: 100, p_elapsed_ms: 1000 })
    const expected = possibleScore(game.id, 1000)
    if (!(r.ok && r.score === expected && r.score < 100 && r.held)) held.push(`${game.id}: ${JSON.stringify(r)}, expected ${expected}`)
  }
  ok(`all ${MINIGAMES.length} games hold a 100 sent a second in to what a second allows`, held.length === 0, held.join('; '))

  const fair = []
  for (const game of MINIGAMES) {
    // eslint-disable-next-line no-await-in-loop
    const r = await rpcAs(phoneA, KID_DEVICE, 'play_minigame',
      { p_kid_id: KID, p_game: game.id, p_score: 100, p_elapsed_ms: game.minMs })
    if (!(r.ok && r.score === 100 && !r.held)) fair.push(`${game.id}: ${JSON.stringify(r)}`)
  }
  ok('and every game pays a real perfect round in full', fair.length === 0, fair.join('; '))

  const bare = await rpcAs(phoneA, KID_DEVICE, 'play_minigame', { p_kid_id: KID, p_game: 'snake', p_score: 100 })
  ok('a score sent with no time at all counts for 50 at most', bare.score === 50 && bare.held === true, JSON.stringify(bare))

  // The phone shows the same held score the server keeps.
  const s = reducer(phone(3, 'kid'), { type: 'FINISH_MINIGAME', kidId: KID, game: 'merge', score: 100, coins: 5, elapsedMs: 6000 })
  ok('the phone holds the score the same way, so the screen and the server agree',
    s.syncQueue[0].args.p_score === possibleScore('merge', 6000) && s.kids[0].bestScores.merge === 10,
    JSON.stringify(s.syncQueue[0].args))
}

await admin.query('delete from families where id = $1', [FAMILY])
await Promise.all([admin.end(), phoneA.end(), phoneB.end()])
console.log(fails ? `\n${fails} FAILED` : '\nALL CHECKS PASSED')
process.exit(fails ? 1 : 0)
