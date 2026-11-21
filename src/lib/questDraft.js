import { DIFFICULTY } from './xp.js'

/**
 * A new chore as the Assign screen starts it: the same fields whether a
 * parent fills in the form or asks Pilot to add one (src/pilot/pilotTools.js),
 * so both make exactly the same chore.
 */
export const blankQuest = (kidId, adaptive) => ({
  kidId,
  title: '',
  description: '',
  category: 'bedroom',
  difficulty: 'medium',
  xp: DIFFICULTY.medium.xp,
  money: '',
  requiresPhoto: true,
  adaptive,
  doneMeans: '',
  supports: [],
  why: '',
  timerSeconds: 0,
  testScore: false,
  doubleXp: false,
  recurrence: 'once',
})
