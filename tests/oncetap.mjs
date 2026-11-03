/**
 * One tap on a reward is one purchase, even as a level-up closes under it.
 *
 * CI once saw a single tap leave two "Pick the film" purchases, about ten
 * milliseconds apart and with different ids: one the server had, one it had
 * never heard of. "Mark given" then handed over the second, so the reward the
 * child actually bought stayed on the parent's dashboard.
 *
 * The cause was the reducer, not the tap. React may work out one dispatched
 * action more than once: a tap that lands while an update from a timer or the
 * network is still waiting to be drawn is worked out on its own first, and
 * then again on top of the waiting one. The reducer drew a new id and read the
 * clock each time, so the second run was a second purchase. The first had
 * already gone to the outbox; the second replaced it on screen, was never
 * sent, and the next pull brought the first back beside it.
 *
 * The first half runs the reducer in Node. The second taps a reward in a
 * browser in the same moment a level-up's own timer closes it, which is the
 * easiest way to have an update waiting when the tap lands, and checks the
 * server as well as the phone.
 */
import {
  launch, reporter, finish, readState, setUpFamily, asParent, asKid, setKidInDatabase,
} from './helpers.mjs'
import { reducer } from '../src/state/reducer.js'
import { createInitialState, makeKid } from '../src/state/initialState.js'
import { LEVEL_UP_MS } from '../src/lib/moments.js'

const { fails, pass, fail } = reporter()
const ok = (label, cond, detail = '') => (cond ? pass(label) : fail(label, detail))

console.log('\n=== One action, worked out twice, is one outcome ===')
{
  const kid = { ...makeKid({ name: 'Ava' }), coins: 20, rev: 1 }
  const s0 = createInitialState()
  const state = {
    ...s0,
    onboarded: true,
    kids: [kid],
    rewards: [{ id: '00000000-0000-4000-8000-0000000000aa', name: 'Pick the film', cost: 3 }],
    redemptions: [],
  }
  const tap = { type: 'REDEEM_REWARD', rewardId: state.rewards[0].id, kidId: kid.id }

  // What React does when something else was waiting: the tap on its own, then
  // the tap again on top of the update that was waiting (here, a moment closing).
  const alone = reducer(state, tap)
  const waiting = reducer(state, { type: 'CLEAR_LEVEL_UP' })
  const again = reducer(waiting, tap)
  const first = alone.redemptions[0]
  const second = again.redemptions[0]
  ok('the second run makes the same purchase, with the same id',
    first && second && first.id === second.id, JSON.stringify({ first: first?.id, second: second?.id }))
  ok('at the same time', first?.at === second?.at, JSON.stringify({ first: first?.at, second: second?.at }))
  const sent = alone.syncQueue.find((q) => q.fn === 'redeem_reward')
  ok('and the purchase sent to the server is the one the phone shows after the second run',
    sent?.args.p_redemption_id === second?.id, JSON.stringify({ sent: sent?.args, shown: second?.id }))
  ok('and it costs the coins once', again.kids[0].coins === 17, String(again.kids[0].coins))

  // A money call's request id is the server's guard against paying twice; a
  // rerun that drew a new one would be a second payment if it were ever sent.
  const gift = { type: 'RECORD_MONEY', kidId: kid.id, pence: 200, kind: 'gift', note: '' }
  const g1 = reducer(state, gift)
  const g2 = reducer(waiting, gift)
  const req = (s) => s.syncQueue.find((q) => q.fn === 'record_gift')?.args.p_request_id
  ok('a money call keeps its request id when worked out again',
    req(g1) && req(g1) === req(g2) && g1.allowance[0].id === g2.allowance[0].id,
    JSON.stringify({ first: req(g1), second: req(g2) }))

  // Two taps are still two purchases: the id belongs to the tap, not the reward.
  const twice = reducer(reducer(state, { ...tap }), { ...tap })
  ok('two separate taps are still two purchases, with two ids',
    twice.redemptions.length === 2 && twice.redemptions[0].id !== twice.redemptions[1].id,
    JSON.stringify(twice.redemptions.map((r) => r.id)))
}

console.log('\n=== In the browser: a tap as a level-up closes ===')
const { browser, page, errors } = await launch()
// The level-up's own timer, with the child's tap landing in the same frame it
// fires: the close is waiting to be drawn when the tap arrives.
await page.addInitScript((ms) => {
  const original = window.setTimeout
  window.setTimeout = function setTimeout(fn, delay, ...rest) {
    if (delay !== ms || typeof fn !== 'function') return original.call(this, fn, delay, ...rest)
    return original.call(this, () => {
      fn()
      const tap = window.__tapAsMomentEnds
      window.__tapAsMomentEnds = null
      if (tap) { tap(); window.__tapped = true }
    }, delay, ...rest)
  }
}, LEVEL_UP_MS)

const { default: pg } = await import('pg')
async function db(sql, params) {
  const client = new pg.Client({
    host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT || 55432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'rankup_test',
  })
  await client.connect()
  try { return (await client.query(sql, params)).rows } finally { await client.end() }
}

await setUpFamily(page)
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent/settings' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Rewards catalogue/ }).click()
await page.waitForTimeout(200)
await page.locator('input[placeholder="e.g. Pick Friday\'s film"]').fill('Pick the film')
await page.getByLabel('Cost').fill('3')
await page.getByRole('button', { name: 'Add reward' }).click()
await page.waitForTimeout(1500)

const kidId = (await readState(page)).kids[0].id
await setKidInDatabase('Ava', { coins: 50 })
await asKid(page)
await page.evaluate(() => { window.location.hash = '/kid/shop' })
for (let i = 0; i < 40 && (await readState(page)).kids[0].coins !== 50; i += 1) await page.waitForTimeout(500) // eslint-disable-line no-await-in-loop
ok('the child has 50 to spend', (await readState(page)).kids[0].coins === 50)

// A level-up arrives, as if a sync had just brought it.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  const level = 2
  localStorage.setItem('rankup.state.v1', JSON.stringify({ ...s, pendingLevelUp: { kidId: s.kids[0].id, from: level, to: level + 1 } }))
})
await page.reload({ waitUntil: 'networkidle' })
await page.getByTestId('level-up').waitFor({ state: 'visible', timeout: 4000 })
await page.evaluate(() => {
  window.__tapAsMomentEnds = () => {
    const buy = [...document.querySelectorAll('button')].find((b) => /\b3$/.test(b.textContent.trim()))
    buy.click()
  }
})
await page.getByTestId('level-up').waitFor({ state: 'detached', timeout: 5000 })
ok('the tap landed as the level-up closed', await page.evaluate(() => window.__tapped === true))

// Long enough for the purchase to reach the server and a pull to come back.
let mine = []
for (let i = 0; i < 20; i += 1) {
  await page.waitForTimeout(500) // eslint-disable-line no-await-in-loop
  mine = (await readState(page)).redemptions.filter((r) => r.kidId === kidId) // eslint-disable-line no-await-in-loop
  if (mine.length && mine.every((r) => r.rev != null)) break
}
await page.waitForTimeout(1500)
mine = (await readState(page)).redemptions.filter((r) => r.kidId === kidId)
const onServer = await db('select id, status from redemptions where kid_id = $1', [kidId])
const [{ coins }] = await db('select coins from kids where id = $1', [kidId])
ok('one tap is one purchase on the phone', mine.length === 1,
  JSON.stringify(mine.map((r) => ({ id: r.id, at: r.at, rev: r.rev }))))
ok('and one on the server', onServer.length === 1, JSON.stringify(onServer))
ok('the same one', mine.length === 1 && onServer.length === 1 && mine[0].id === onServer[0].id)
ok('the coins went once', coins === 47, String(coins))

console.log('\n=== "Mark given" hands over the purchase the child made ===')
await asParent(page)
await page.evaluate(() => { window.location.hash = '/parent' })
await page.waitForTimeout(800)
ok('one reward to hand over', (await page.getByText('1 reward to hand over').count()) === 1)
await page.getByRole('button', { name: 'Mark given' }).first().click()
let given = []
for (let i = 0; i < 20; i += 1) {
  await page.waitForTimeout(500) // eslint-disable-line no-await-in-loop
  given = await db('select id, status from redemptions where kid_id = $1', [kidId]) // eslint-disable-line no-await-in-loop
  if (given.every((r) => r.status === 'given')) break
}
ok('given on the server', given.length === 1 && given[0].status === 'given', JSON.stringify(given))
await page.waitForTimeout(1500)
ok('and it leaves the dashboard', (await page.getByText(/to hand over/).count()) === 0)

finish(errors, fails, browser)
