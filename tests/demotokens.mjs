/**
 * Unlimited play tokens in the demo, and nowhere else.
 *
 * The look-around demo is a shop window: nobody in it has really done a
 * chore, so gating its arcade behind earned tokens means a person trying the
 * app opens two games and hits a wall. In the demo the tokens never run out.
 *
 * The other half of that sentence is the part worth testing. A real family's
 * tokens come from approved chores and nothing else, and that gate is the
 * only thing keeping the arcade from being a reason not to do them. A change
 * that made tokens free everywhere would look identical in the demo — which
 * is exactly why this checks both.
 *
 * Pure reducer, no browser: the rule lives in FINISH_MINIGAME and that is
 * where it is checked.
 */
import { reducer } from '../src/state/reducer.js'
import { createInitialState } from '../src/state/initialState.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

/** A family with one kid holding exactly `tokens` play tokens. */
const familyWith = (tokens, demo = false) => {
  const base = createInitialState()
  return {
    ...base,
    demo,
    kids: [{ ...base.kids[0], playTokens: tokens, coins: 0, gameCoinsToday: 0, gameDay: null }],
  }
}

const play = (state) => reducer(state, {
  type: 'FINISH_MINIGAME', kidId: state.kids[0].id, game: 'snake', score: 80, coins: 4,
})

console.log('\n=== A real family spends a token per game ===')
{
  let s = familyWith(2)
  s = play(s)
  ok('two tokens becomes one', s.kids[0].playTokens === 1, String(s.kids[0].playTokens))
  s = play(s)
  ok('one becomes none', s.kids[0].playTokens === 0, String(s.kids[0].playTokens))

  // The important one: with no tokens the action must do nothing at all —
  // not pay out, not record a score, not go negative.
  const before = s
  const after = play(s)
  ok('and with none left the game does not pay', after === before)
  ok('tokens never go negative', after.kids[0].playTokens === 0, String(after.kids[0].playTokens))
}

console.log('\n=== The demo never runs out ===')
{
  let s = familyWith(0, true)
  for (let i = 0; i < 25; i += 1) s = play(s)
  ok('twenty-five games on zero tokens all went through',
    s.kids[0].bestScores.snake === 80, JSON.stringify(s.kids[0].bestScores))
  ok('and the token count did not go below zero',
    s.kids[0].playTokens === 0, String(s.kids[0].playTokens))
}

console.log('\n=== But the demo does not break the coin cap ===')
{
  // Unlimited PLAY is not unlimited MONEY. If the demo paid out forever it
  // would be showing a product that does not exist.
  let s = familyWith(0, true)
  for (let i = 0; i < 25; i += 1) s = play(s)
  ok('the day still tops out at the cap',
    s.kids[0].gameCoinsToday <= 15, String(s.kids[0].gameCoinsToday))
  ok('and the coins match what was paid',
    s.kids[0].coins === s.kids[0].gameCoinsToday,
    `${s.kids[0].coins} vs ${s.kids[0].gameCoinsToday}`)
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
