/**
 * Level-ups, streaks and badges: rewarding, and quick.
 *
 * A moment lasts two to three seconds, a tap anywhere skips it, and it never
 * blocks the next tap: the tap that skips it reaches the button under it. And
 * there is only ever one of each waiting, so a big sync that brings five
 * levels is one level-up, not five in a queue.
 *
 * The first half runs the reducer in Node. The second opens the look-around
 * family in a browser (no account, no server) and times the real thing.
 */
import { launch, reporter, finish, BASE, SHOT_DIR } from './helpers.mjs'
import { reducer } from '../src/state/reducer.js'
import { createInitialState, makeKid } from '../src/state/initialState.js'
import { totalXpForLevel, levelFromXp } from '../src/lib/xp.js'
import { kids as kidMapper } from '../src/lib/sync/mappers.js'
import {
  LEVEL_UP_MS, NEW_WORLD_MS, STREAK_MS, BADGE_MS, MOMENT_MAX_MS, foldLevelUp, foldStreak, foldBadges,
} from '../src/lib/moments.js'

const { fails, pass, fail } = reporter()
const ok = (label, cond, detail = '') => (cond ? pass(label) : fail(label, detail))

console.log('\n=== Every moment is two to three seconds ===')
for (const [name, ms] of Object.entries({ LEVEL_UP_MS, NEW_WORLD_MS, STREAK_MS, BADGE_MS })) {
  ok(`${name} is ${ms} ms`, ms >= 2000 && ms <= MOMENT_MAX_MS && MOMENT_MAX_MS <= 3000)
}

console.log('\n=== Several level-ups at once are one moment ===')
{
  const FAMILY = '00000000-0000-4000-8000-00000000f0f0'
  const kid = { ...makeKid({ name: 'Ava' }), id: '00000000-0000-4000-8000-00000000a0a0', rev: 5 }
  const base = createInitialState()
  const kidPhone = (xp, streak = 1) => ({
    ...base, onboarded: true, family: { ...base.family, id: FAMILY },
    device: { ...base.device, role: 'kid', linkedKidId: kid.id },
    kids: [{ ...kid, xp, streak: { count: streak, lastDay: '2026-11-01', freezeTokens: 0 } }],
    pendingLevelUp: null, pendingStreak: null,
  })
  const row = (xp, streak, rev) => ({ ...kidMapper.toRow({ ...kid, xp }, FAMILY), xp, streak_count: streak, streak_last_day: '2026-11-02', rev })

  // A week offline, then one sync: four levels and three more streak days.
  const before = kidPhone(totalXpForLevel(3), 2)
  const bigXp = totalXpForLevel(7) + 5
  const after = reducer(before, { type: 'MERGE_SNAPSHOT', snapshot: { kids: [row(bigXp, 5, 9)] } })
  ok('a big sync is one level-up, from the first level to the last',
    after.pendingLevelUp?.from === 3 && after.pendingLevelUp?.to === 7, JSON.stringify(after.pendingLevelUp))
  ok('and one streak moment, at the newest count', after.pendingStreak?.count === 5, JSON.stringify(after.pendingStreak))

  // A second sync while it is still waiting folds in; it is not queued.
  const again = reducer({ ...after, kids: after.kids.map((k) => ({ ...k, rev: 9 })) },
    { type: 'MERGE_SNAPSHOT', snapshot: { kids: [row(totalXpForLevel(9) + 1, 6, 12)] } })
  ok('another sync while one waits widens it (3 to 9), never a second one',
    again.pendingLevelUp?.from === 3 && again.pendingLevelUp?.to === 9 && !Array.isArray(again.pendingLevelUp),
    JSON.stringify(again.pendingLevelUp))
  const cleared = reducer(again, { type: 'CLEAR_LEVEL_UP' })
  ok('closing the level-up closes the streak inside it too', !cleared.pendingLevelUp && !cleared.pendingStreak)

  const flat = reducer(kidPhone(totalXpForLevel(3), 2), { type: 'MERGE_SNAPSHOT', snapshot: { kids: [row(totalXpForLevel(3) + 1, 2, 9)] } })
  ok('XP inside a level and the same streak: no moment at all', !flat.pendingLevelUp && !flat.pendingStreak)
}

console.log('\n=== A parent accepting chore after chore ===')
{
  const s0 = createInitialState()
  let s = { ...s0, onboarded: true, family: { ...s0.family, id: 'fam', tier: 'starter', trialEndsAt: 0 } }
  s = reducer(s, { type: 'ADD_KID', kid: { ...makeKid({ name: 'Bo' }), xp: totalXpForLevel(2) - 1 } })
  const kidId = s.kids[0].id
  s = reducer(s, { type: 'ADD_QUESTS', quests: Array.from({ length: 6 }, (_, i) => ({ kidId, title: `Chore ${i}`, difficulty: 'boss', category: 'home' })) })
  for (const q of s.quests) {
    s = reducer(s, { type: 'SUBMIT_QUEST', submission: { questId: q.id, kidId } })
    s = reducer(s, { type: 'APPROVE_SUBMISSION', submissionId: s.submissions.at(-1).id })
  }
  const level = levelFromXp(s.kids[0].xp).level
  ok(`six accepts in a row are one level-up, 1 to ${level}`, s.pendingLevelUp?.from === 1 && s.pendingLevelUp?.to === level && level > 2,
    JSON.stringify(s.pendingLevelUp))
  ok('the first chore of the day starts a streak; day one is not a moment yet', !s.pendingStreak, JSON.stringify(s.pendingStreak))
}

console.log('\n=== The fold rules ===')
ok('a level-up for another child replaces, not queues', foldLevelUp({ kidId: 'a', from: 1, to: 2 }, 'b', 4, 5).kidId === 'b')
ok('a streak only counts from two days', foldStreak(null, 'a', 0, 1) === null && foldStreak(null, 'a', 1, 2)?.count === 2)
ok('a streak that went down is no moment', foldStreak(null, 'a', 6, 1) === null)
ok('badges earned together are one toast, without repeats', JSON.stringify(foldBadges(['ten'], ['ten', 'fifty'])) === '["ten","fifty"]')

/* ------------------------------------------------------------------ */
console.log('\n=== In the browser: quick, and never in the way ===')
const { browser, page, errors } = await launch()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Have a look around/ }).click()
await page.waitForTimeout(1500)
await page.getByTestId('demo-tour').getByRole('button', { name: /See Ava's world/ }).click()
await page.waitForTimeout(900)

/** Put a moment in the saved state and reload, as if it had just arrived. */
async function arrive(patch) {
  await page.evaluate((p) => {
    const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
    const kid = s.kids.find((k) => k.id === s.session.kidId) || s.kids[0]
    const fill = (m) => (m ? { ...m, kidId: kid.id } : m)
    localStorage.setItem('rankup.state.v1', JSON.stringify({
      ...s, pendingLevelUp: fill(p.pendingLevelUp ?? null), pendingStreak: fill(p.pendingStreak ?? null),
    }))
  }, patch)
  await page.reload({ waitUntil: 'networkidle' })
}

async function lifetime(testId) {
  const el = page.getByTestId(testId)
  await el.waitFor({ state: 'visible', timeout: 4000 })
  const t0 = Date.now()
  await el.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
  return Date.now() - t0
}

const xpNow = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rankup.state.v1'))
  return (s.kids.find((k) => k.id === s.session.kidId) || s.kids[0]).xp
})
const lvl = levelFromXp(xpNow).level
await arrive({ pendingLevelUp: { from: lvl, to: lvl + 3 }, pendingStreak: { count: 4 } })
await page.getByTestId('level-up').waitFor({ state: 'visible', timeout: 4000 })
const card = await page.getByTestId('level-up').innerText({ timeout: 1500 }).catch(() => '')
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOT_DIR}/moment-levelup.png` })
ok('three levels in one card, with the streak riding along', /3 levels up/i.test(card) && /4 days in a row/.test(card), card)
const gone = await page.getByTestId('level-up').waitFor({ state: 'detached', timeout: 4000 }).then(() => true, () => false)
ok('and it goes by itself, within three seconds', gone)

await arrive({ pendingLevelUp: { from: lvl, to: lvl + 1 } })
const lived = await lifetime('level-up')
ok(`a level-up lasts about ${LEVEL_UP_MS} ms (measured ${lived})`, lived >= 1600 && lived <= 3400, String(lived))

await arrive({ pendingLevelUp: { from: lvl, to: lvl + 1 } })
await page.getByTestId('level-up').waitFor({ state: 'visible', timeout: 4000 })
// When the tap went down, and when the level-up left the page, timed in the
// page itself, so a slow machine cannot blur "the tap closed it" with "it
// timed out".
await page.evaluate(() => {
  window.__moment = {}
  window.addEventListener('pointerdown', () => { window.__moment.tap = performance.now() }, { capture: true, once: true })
  new MutationObserver((_, obs) => {
    if (!document.querySelector('[data-testid="level-up"]')) { window.__moment.gone = performance.now(); obs.disconnect() }
  }).observe(document.body, { childList: true, subtree: true })
})
await page.getByRole('button', { name: /Arcade/ }).first().click({ timeout: 2000 })
await page.waitForTimeout(300)
const hash = await page.evaluate(() => location.hash)
ok('a tap on the screen behind it goes through (the arcade opens)', hash.startsWith('#/kid/arcade'), hash)
const timing = await page.evaluate(() => window.__moment)
ok('and the same tap closed the level-up', timing.tap != null && timing.gone != null && timing.gone - timing.tap < 500,
  JSON.stringify(timing))

await page.evaluate(() => { window.location.hash = '/kid' })
await arrive({ pendingLevelUp: { from: lvl, to: lvl + 1 } })
await page.getByTestId('level-up').waitFor({ state: 'visible', timeout: 4000 })
await page.getByTestId('level-up').locator('h2').click()
await page.waitForTimeout(250)
ok('tapping the card itself skips it', (await page.getByTestId('level-up').count()) === 0)

await arrive({ pendingStreak: { count: 6 } })
await page.getByTestId('streak-moment').waitFor({ state: 'visible', timeout: 4000 })
// Read before the screenshot: on a busy machine a screenshot can take longer than the moment lasts.
const streakText = await page.getByTestId('streak-moment').innerText({ timeout: 1500 }).catch(() => '')
await page.screenshot({ path: `${SHOT_DIR}/moment-streak.png` })
ok('a streak on its own says so', /6 days in a row/.test(streakText), streakText)
const streakGone = await page.getByTestId('streak-moment').waitFor({ state: 'detached', timeout: 3200 }).then(() => true, () => false)
ok(`and is gone within ${STREAK_MS} ms or so`, streakGone)

await finish(errors, fails, browser)
