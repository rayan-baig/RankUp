import { uid } from '../lib/id.js'
import { dayKey, daysBetween } from '../lib/dates.js'
import { calcReward, levelFromXp, testScoreBonus } from '../lib/xp.js'
import { createInitialState, TIERS, monthKey } from './initialState.js'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function mapKid(state, kidId, fn) {
  return { ...state, kids: state.kids.map((k) => (k.id === kidId ? fn(k) : k)) }
}

function logEvent(state, event) {
  const entry = { id: uid('ev'), at: Date.now(), day: dayKey(), ...event }
  return { ...state, events: [...state.events, entry].slice(-2000) }
}

/** Advance a kid's streak for a completion recorded today. */
function bumpStreak(streak) {
  const today = dayKey()
  if (streak.lastDay === today) return streak
  if (!streak.lastDay) return { ...streak, count: 1, lastDay: today }
  const gap = daysBetween(streak.lastDay, today)
  if (gap === 1) return { ...streak, count: streak.count + 1, lastDay: today }
  return { ...streak, count: 1, lastDay: today }
}

export function isElite(state) {
  return state.family.tier === 'elite'
}

export function guildCapacity(state) {
  return TIERS[state.family.tier]?.guildSize ?? 5
}

/** A lockout that has run out of time is treated as lifted. */
export function activeLockout(kid) {
  if (!kid?.lockout) return null
  if (kid.lockout.type === 'dimension' && kid.lockout.until && Date.now() >= kid.lockout.until) return null
  return kid.lockout
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

export function reducer(state, action) {
  switch (action.type) {
    /* ---------- lifecycle ---------- */

    case 'HYDRATE':
      return action.state

    case 'RESET':
      return createInitialState()

    case 'COMPLETE_ONBOARDING': {
      const { family, kid, guildName } = action
      const next = {
        ...state,
        onboarded: true,
        family: { ...state.family, ...family },
        kids: [...state.kids, kid],
        guild: { ...state.guild, name: guildName || `${family.name || kid.name}'s Guild`, leaderKidId: kid.id },
        session: { role: 'parent', kidId: kid.id, parentUnlocked: true },
      }
      return logEvent(next, { type: 'family_created', kidId: kid.id })
    }

    /* ---------- session ---------- */

    case 'SET_ROLE':
      return {
        ...state,
        session: {
          ...state.session,
          role: action.role,
          kidId: action.kidId ?? state.session.kidId,
          parentUnlocked: action.role === 'parent' ? state.session.parentUnlocked : false,
        },
      }

    case 'UNLOCK_PARENT':
      return { ...state, session: { ...state.session, parentUnlocked: true, role: 'parent' } }

    case 'LOCK_PARENT':
      return { ...state, session: { ...state.session, parentUnlocked: false } }

    case 'SIGN_OUT':
      return { ...state, session: { role: null, kidId: state.session.kidId, parentUnlocked: false } }

    /* ---------- kids ---------- */

    case 'ADD_KID':
      return logEvent({ ...state, kids: [...state.kids, action.kid] }, { type: 'kid_added', kidId: action.kid.id })

    case 'UPDATE_KID':
      return mapKid(state, action.kidId, (k) => ({ ...k, ...action.patch }))

    case 'REMOVE_KID':
      return {
        ...state,
        kids: state.kids.filter((k) => k.id !== action.kidId),
        quests: state.quests.filter((q) => q.kidId !== action.kidId),
        submissions: state.submissions.filter((s) => s.kidId !== action.kidId),
        session: {
          ...state.session,
          kidId: state.session.kidId === action.kidId ? (state.kids.find((k) => k.id !== action.kidId)?.id ?? null) : state.session.kidId,
        },
      }

    case 'SET_KID_THEME':
      return logEvent(
        mapKid(state, action.kidId, (k) => ({ ...k, themeId: action.themeId, themeChosenAt: Date.now() })),
        { type: 'theme_changed', kidId: action.kidId, meta: { themeId: action.themeId } },
      )

    case 'SET_KID_COSMETIC':
      return mapKid(state, action.kidId, (k) => ({
        ...k,
        profileFrame: action.profileFrame ?? k.profileFrame,
        dropSelector: action.dropSelector ?? k.dropSelector,
      }))

    /* ---------- family / subscription ---------- */

    case 'SET_PARENT_THEME':
      return { ...state, family: { ...state.family, parentThemeId: action.themeId } }

    case 'UPDATE_FAMILY':
      return { ...state, family: { ...state.family, ...action.patch } }

    case 'SET_TIER': {
      const next = {
        ...state,
        family: {
          ...state.family,
          tier: action.tier,
          subscription: {
            ...state.family.subscription,
            tier: action.tier,
            status: 'active',
            startedAt: Date.now(),
            renewsAt: Date.now() + 30 * 86400000,
          },
        },
      }
      return logEvent(next, { type: 'tier_changed', meta: { tier: action.tier } })
    }

    /* ---------- quests ---------- */

    case 'ADD_QUESTS': {
      const quests = action.quests.map((q) => ({
        id: uid('q'),
        status: 'assigned',
        createdAt: Date.now(),
        difficulty: 'medium',
        requiresPhoto: true,
        adaptive: false,
        supports: [],
        recurrence: 'once',
        ...q,
      }))
      return logEvent({ ...state, quests: [...state.quests, ...quests] }, {
        type: 'quests_assigned',
        kidId: action.quests[0]?.kidId,
        meta: { count: quests.length },
      })
    }

    case 'UPDATE_QUEST':
      return { ...state, quests: state.quests.map((q) => (q.id === action.questId ? { ...q, ...action.patch } : q)) }

    case 'DELETE_QUEST':
      return {
        ...state,
        quests: state.quests.filter((q) => q.id !== action.questId),
        submissions: state.submissions.filter((s) => s.questId !== action.questId),
      }

    /* ---------- submissions ---------- */

    case 'SUBMIT_QUEST': {
      const submission = {
        id: uid('sub'),
        status: 'pending',
        submittedAt: Date.now(),
        ...action.submission,
      }
      const next = {
        ...state,
        submissions: [...state.submissions, submission],
        quests: state.quests.map((q) => (q.id === submission.questId ? { ...q, status: 'submitted' } : q)),
      }
      return logEvent(next, {
        type: 'quest_submitted',
        kidId: submission.kidId,
        meta: {
          questId: submission.questId,
          verdict: submission.report?.verdict || null,
          score: submission.report?.score ?? null,
        },
      })
    }

    case 'APPROVE_SUBMISSION': {
      const submission = state.submissions.find((s) => s.id === action.submissionId)
      if (!submission || submission.status !== 'pending') return state
      const quest = state.quests.find((q) => q.id === submission.questId)
      const kid = state.kids.find((k) => k.id === submission.kidId)
      if (!quest || !kid) return state

      const reward = calcReward(quest, {
        elite: isElite(state),
        streak: kid.streak.count,
        onTime: submission.onTime !== false,
      })

      let { xp, coins } = reward
      const lines = [...reward.lines]

      if (quest.testScore && typeof submission.testScore === 'number') {
        const bonus = testScoreBonus(submission.testScore, quest.xp || 30)
        if (bonus > 0) {
          lines.push({ label: `Scored ${submission.testScore}%`, value: bonus })
          xp += bonus
          coins += Math.max(1, Math.round(bonus / 5))
        }
      }

      const beforeLevel = levelFromXp(kid.xp).level
      const afterLevel = levelFromXp(kid.xp + xp).level

      let next = {
        ...state,
        submissions: state.submissions.map((s) =>
          s.id === action.submissionId
            ? { ...s, status: 'approved', decidedAt: Date.now(), parentNote: action.note || '', awarded: { xp, coins, lines } }
            : s,
        ),
        quests: state.quests.map((q) => (q.id === quest.id ? { ...q, status: 'approved', completedAt: Date.now() } : q)),
      }

      next = mapKid(next, kid.id, (k) => ({
        ...k,
        xp: k.xp + xp,
        coins: k.coins + coins,
        streak: bumpStreak(k.streak),
        bestTimes:
          quest.timerSeconds && submission.elapsedMs
            ? {
                ...k.bestTimes,
                [quest.title]: Math.min(k.bestTimes[quest.title] ?? Infinity, Math.round(submission.elapsedMs / 1000)),
              }
            : k.bestTimes,
      }))

      next = logEvent(next, {
        type: 'quest_approved',
        kidId: kid.id,
        meta: { questId: quest.id, xp, coins, category: quest.category, difficulty: quest.difficulty, adaptive: !!quest.adaptive },
      })

      if (afterLevel > beforeLevel) {
        next = logEvent(next, { type: 'level_up', kidId: kid.id, meta: { from: beforeLevel, to: afterLevel } })
        next = { ...next, pendingLevelUp: { kidId: kid.id, from: beforeLevel, to: afterLevel } }
      }
      return next
    }

    case 'REJECT_SUBMISSION': {
      const submission = state.submissions.find((s) => s.id === action.submissionId)
      if (!submission || submission.status !== 'pending') return state
      const next = {
        ...state,
        submissions: state.submissions.map((s) =>
          s.id === action.submissionId
            ? { ...s, status: 'rejected', decidedAt: Date.now(), parentNote: action.note || '' }
            : s,
        ),
        // Rejected work goes straight back on the kid's list to redo.
        quests: state.quests.map((q) =>
          q.id === submission.questId ? { ...q, status: 'redo', redoNote: action.note || '', redoCount: (q.redoCount || 0) + 1 } : q,
        ),
      }
      return logEvent(next, { type: 'quest_rejected', kidId: submission.kidId, meta: { questId: submission.questId, reason: action.note || '' } })
    }

    case 'CLEAR_LEVEL_UP':
      return { ...state, pendingLevelUp: null }

    /* ---------- rewards ---------- */

    case 'ADD_REWARD':
      return { ...state, rewards: [...state.rewards, { id: uid('rw'), createdAt: Date.now(), ...action.reward }] }

    case 'DELETE_REWARD':
      return { ...state, rewards: state.rewards.filter((r) => r.id !== action.rewardId) }

    case 'REDEEM_REWARD': {
      const reward = state.rewards.find((r) => r.id === action.rewardId)
      const kid = state.kids.find((k) => k.id === action.kidId)
      if (!reward || !kid || kid.coins < reward.cost) return state
      let next = mapKid(state, kid.id, (k) => ({ ...k, coins: k.coins - reward.cost }))
      next = {
        ...next,
        redemptions: [
          ...next.redemptions,
          { id: uid('rd'), rewardId: reward.id, kidId: kid.id, name: reward.name, cost: reward.cost, at: Date.now(), status: 'requested' },
        ],
      }
      return logEvent(next, { type: 'reward_redeemed', kidId: kid.id, meta: { name: reward.name, cost: reward.cost } })
    }

    case 'FULFIL_REDEMPTION':
      return {
        ...state,
        redemptions: state.redemptions.map((r) => (r.id === action.redemptionId ? { ...r, status: 'given', givenAt: Date.now() } : r)),
      }

    /* ---------- notes ---------- */

    case 'ADD_NOTE':
      return { ...state, notes: [...state.notes, { id: uid('note'), at: Date.now(), read: false, ...action.note }] }

    case 'MARK_NOTES_READ':
      return {
        ...state,
        notes: state.notes.map((n) => (n.kidId === action.kidId && n.from !== action.as ? { ...n, read: true } : n)),
      }

    /* ---------- System Override Protocol (Elite) ---------- */

    case 'APPLY_OVERRIDE': {
      const { kidId, kind, reason, consequence } = action
      const kid = state.kids.find((k) => k.id === kidId)
      if (!kid) return state

      const override = {
        id: uid('ovr'),
        kidId,
        kind,
        reason: reason || '',
        consequence: consequence || '',
        createdAt: Date.now(),
        liftedAt: null,
      }
      let next = state

      if (kind === 'tax') {
        const percent = Math.max(1, Math.min(100, action.percent || 10))
        const taken = Math.floor((kid.coins * percent) / 100)
        override.percent = percent
        override.amount = taken
        next = mapKid(next, kidId, (k) => ({ ...k, coins: k.coins - taken }))
        override.liftedAt = Date.now() // a tax is instantaneous, not an ongoing state
      } else if (kind === 'dimension') {
        const minutes = Math.max(5, action.minutes || 60)
        override.minutes = minutes
        override.until = Date.now() + minutes * 60000
        next = mapKid(next, kidId, (k) => ({ ...k, lockout: { type: 'dimension', until: override.until, reason: override.reason, consequence: override.consequence, overrideId: override.id } }))
      } else if (kind === 'red') {
        next = mapKid(next, kidId, (k) => ({ ...k, lockout: { type: 'red', until: null, reason: override.reason, consequence: override.consequence, overrideId: override.id } }))
      }

      next = { ...next, overrides: [...next.overrides, override] }
      return logEvent(next, { type: 'override_applied', kidId, meta: { kind, reason: override.reason } })
    }

    case 'LIFT_OVERRIDE': {
      const override = state.overrides.find((o) => o.id === action.overrideId)
      if (!override) return state
      let next = {
        ...state,
        overrides: state.overrides.map((o) => (o.id === action.overrideId ? { ...o, liftedAt: Date.now() } : o)),
      }
      next = mapKid(next, override.kidId, (k) =>
        k.lockout?.overrideId === override.id ? { ...k, lockout: null } : k,
      )
      return logEvent(next, { type: 'override_lifted', kidId: override.kidId, meta: { kind: override.kind } })
    }

    /* ---------- guild ---------- */

    case 'UPDATE_GUILD':
      return { ...state, guild: { ...state.guild, ...action.patch } }

    case 'INVITE_MATE': {
      const capacity = guildCapacity(state)
      const filled = state.kids.length + state.guild.invitedMates.length
      if (filled >= capacity) return state
      return {
        ...state,
        guild: {
          ...state.guild,
          invitedMates: [
            ...state.guild.invitedMates,
            { id: uid('mate'), name: action.name, invitedAt: Date.now(), status: 'invited', demo: true },
          ],
        },
      }
    }

    case 'REMOVE_MATE':
      return { ...state, guild: { ...state.guild, invitedMates: state.guild.invitedMates.filter((m) => m.id !== action.mateId) } }

    case 'POST_GUILD_MESSAGE':
      return {
        ...state,
        guild: {
          ...state.guild,
          chat: [...state.guild.chat, { id: uid('msg'), at: Date.now(), ...action.message }].slice(-200),
        },
      }

    /* ---------- parent alliance (Elite) ---------- */

    case 'JOIN_ALLIANCE':
      return logEvent(
        { ...state, alliance: { ...state.alliance, joined: true, name: action.name || 'My Alliance', joinedAt: Date.now(), monthKey: monthKey() } },
        { type: 'alliance_joined' },
      )

    case 'LEAVE_ALLIANCE':
      return { ...state, alliance: { ...state.alliance, joined: false } }

    /* ---------- misc ---------- */

    case 'SET_FAMILY_GOAL':
      return { ...state, familyGoal: action.goal }

    case 'CLAIM_LOGIN_BONUS': {
      const kid = state.kids.find((k) => k.id === action.kidId)
      const today = dayKey()
      if (!kid || kid.lastLoginBonus === today) return state
      const coins = 5
      let next = mapKid(state, kid.id, (k) => ({ ...k, coins: k.coins + coins, lastLoginBonus: today }))
      return logEvent(next, { type: 'login_bonus', kidId: kid.id, meta: { coins } })
    }

    case 'USE_STREAK_FREEZE': {
      const kid = state.kids.find((k) => k.id === action.kidId)
      if (!kid || kid.streak.freezeTokens < 1) return state
      const next = mapKid(state, kid.id, (k) => ({
        ...k,
        streak: { ...k.streak, freezeTokens: k.streak.freezeTokens - 1, lastDay: dayKey() },
      }))
      return logEvent(next, { type: 'streak_freeze', kidId: kid.id })
    }

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'TOGGLE_REMINDER':
      return {
        ...state,
        settings: {
          ...state.settings,
          reminders: state.settings.reminders.map((r) => (r.id === action.reminderId ? { ...r, on: !r.on } : r)),
        },
      }

    default:
      return state
  }
}
