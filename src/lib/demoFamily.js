/**
 * A family to look around, for somebody who has not signed up.
 *
 * Asking for an email before showing anything is the most expensive screen in
 * the app: everyone who bounces on it was free to acquire and is gone for
 * nothing. This builds a household that already has two children, a fortnight
 * of history and a chore waiting to be reviewed, so the first thing a visitor
 * sees is the product working rather than a form.
 *
 * It is built by running REAL actions through the REAL reducer rather than by
 * writing a state object out by hand. Hand-written state means guessing at
 * shapes the reducer owns, and one wrong field puts the whole thing inside a
 * crash boundary — in front of exactly the person we were trying to impress.
 * Whatever comes out of here is, by construction, state the app made itself.
 */

import { reducer, potFor } from '../state/reducer.js'
import { createInitialState, makeKid } from '../state/initialState.js'
import { QUEST_PACKS } from '../data/questTemplates.js'
import { DIFFICULTY } from './xp.js'

const day = 86400000

/** Wind a timestamp back, so the demo does not look like it started today. */
const ago = (days) => Date.now() - days * day

export function buildDemoFamily() {
  const run = (state, ...actions) => actions.reduce(reducer, state)

  const ava = makeKid({ name: 'Ava', themeId: 'matrixblocks' })
  const noah = makeKid({ name: 'Noah', themeId: 'matrixblocks' })

  let s = createInitialState()

  s = run(s, {
    type: 'COMPLETE_ONBOARDING',
    family: { name: 'The Rivera Family', parentName: 'Sam', pin: '1234' },
    kid: ava,
    guildName: "Ava's Guild",
  })
  // Elite, because the demo should show the whole product. A new family gets a
  // fortnight of it anyway, so this is what they would actually see.
  s = run(s, { type: 'SET_TIER', tier: 'elite' }, { type: 'ADD_KID', kid: noah })

  /*
   * A few of the chores are paid ones, because a demo where nothing has a
   * price shows none of the pocket money and a visitor concludes it is not
   * there. Deliberately only a few: most chores are unpaid, and a demo where
   * every single one pays would advertise something no family does.
   */
  const PRICES = {
    'Take the bins out': 100,
    'Tidy your desk': 150,
    'Vacuum the living room': 200,
    'Cook one family meal': 300,
    'Mow the lawn': 500,
  }

  const packFor = (id) => QUEST_PACKS.find((p) => p.id === id).quests
  const assign = (kidId, quests) => ({
    type: 'ADD_QUESTS',
    quests: quests.map((q) => ({
      ...q,
      kidId,
      xp: DIFFICULTY[q.difficulty]?.xp ?? DIFFICULTY.medium.xp,
      pence: PRICES[q.title] || 0,
      supports: [],
      doubleXp: false,
    })),
  })

  s = run(s, assign(ava.id, packFor('kid')), assign(noah.id, packFor('teen')))

  /*
   * A fortnight of history.
   *
   * Approved chores have had their photos destroyed — the app deletes them the
   * moment a parent decides — so a demo built this way is honest about what is
   * on screen rather than showing proof photos that would never still exist.
   */
  const finish = (state, title, kidId, daysAgo) => {
    const quest = state.quests.find((q) => q.title === title && q.kidId === kidId)
    if (!quest) return state
    let next = reducer(state, {
      type: 'SUBMIT_QUEST',
      submission: {
        questId: quest.id,
        kidId,
        photoId: null,
        hash: null,
        report: null,
        note: '',
        onTime: true,
        captureSource: 'none',
      },
    })
    const sub = next.submissions[next.submissions.length - 1]
    next = reducer(next, { type: 'APPROVE_SUBMISSION', submissionId: sub.id, sticker: 'proud' })
    // Backdate both, so the history reads like a fortnight rather than a minute.
    return {
      ...next,
      submissions: next.submissions.map((x) =>
        x.id === sub.id ? { ...x, submittedAt: ago(daysAgo), decidedAt: ago(daysAgo) } : x),
    }
  }

  s = finish(s, 'Make your bed', ava.id, 3)
  s = finish(s, 'Load the dishwasher', ava.id, 2)
  s = finish(s, 'Tidy your desk', ava.id, 2)
  s = finish(s, 'Take the bins out', ava.id, 1)
  s = finish(s, 'Cook one family meal', noah.id, 2)
  s = finish(s, 'Wash, dry and put away one load', noah.id, 1)

  /*
   * One chore waiting, and deliberately the timer one.
   *
   * The review queue is the best screen in the app and an empty one shows
   * nothing. It has no photo because there is no honest way to produce one: a
   * drawn placeholder would be flagged by the app's own fake-photo check, and
   * a stock bedroom would be a photograph of a child's room that nobody
   * consented to. The timer evidence is real and needs no picture.
   */
  const reading = s.quests.find((q) => q.title === 'Read for 20 minutes' && q.kidId === ava.id)
  if (reading) {
    s = run(s, {
      type: 'SUBMIT_QUEST',
      submission: {
        questId: reading.id,
        kidId: ava.id,
        photoId: null,
        hash: null,
        report: null,
        note: 'Finished the last two chapters.',
        elapsedMs: 1200000,
        onTime: true,
        captureSource: 'timer',
      },
    })
  }

  /*
   * One payout already made, so the ledger reads like a household that has
   * been doing this for a fortnight rather than one that started this
   * morning. The earned lines come from the approvals above.
   */
  if (potFor(s, ava.id) >= 100) {
    s = run(s, { type: 'RECORD_MONEY', kidId: ava.id, pence: 100, kind: 'paid', note: '' })
  }

  const rewards = [
    { name: "Pick Friday's film", cost: 60, icon: '🎬', description: 'Whatever you want, nobody argues.' },
    { name: 'An hour later bedtime', cost: 90, icon: '🌙', description: 'One night, your choice.' },
    { name: 'Day out, you choose', cost: 250, icon: '🎢', description: 'Anywhere within reason.' },
  ]
  s = run(s, ...rewards.map((reward) => ({ type: 'ADD_REWARD', reward })))

  return {
    ...s,
    /*
     * The flag every other part of the app reads.
     *
     * It does two jobs: it puts the "this is not your family" banner on screen,
     * and it stops anything here ever reaching a server. Nothing was signed in
     * to, so there is no account for these rows to belong to; the queues are
     * emptied so that a visitor who later creates a real family does not have
     * a stranger's demo chores waiting to upload into it.
     */
    demo: true,
    syncQueue: [],
    noticeQueue: [],
    /*
     * No level-up card waiting.
     *
     * Approving five chores above earns somebody a level, and the overlay
     * that celebrates it was still queued when the demo opened — so the first
     * thing a visitor saw was a full-screen modal about a child they had not
     * met yet, sitting on top of the dashboard on every screen until they
     * found the button. The celebration is right when you earn it and wrong
     * when you arrive.
     */
    pendingLevelUp: null,
    createdAt: ago(14),
  }
}
