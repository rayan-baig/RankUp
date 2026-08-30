import { uid } from '../lib/id.js'
import { dayKey, daysBetween } from '../lib/dates.js'
import { calcReward, levelFromXp, testScoreBonus } from '../lib/xp.js'
import { createInitialState, TIERS, monthKey, makeKid } from './initialState.js'
import { findSkin, isMarketOpen } from '../data/marketSkins.js'
import { ENTITIES } from '../lib/sync/mappers.js'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function mapKid(state, kidId, fn) {
  return { ...state, kids: state.kids.map((k) => (k.id === kidId ? fn(k) : k)) }
}

/**
 * Ask for a server call without breaking the reducer's purity.
 *
 * Some changes cannot be a plain table write: awarding XP, deciding a
 * submission, spending currency. Those run as database functions so a tampered
 * device cannot fake them. The reducer records the request here and the
 * provider moves it into the outbox — which keeps this file free of side
 * effects while keeping the arguments where they are actually computed.
 */
function queueRpc(state, fn, args) {
  return { ...state, syncQueue: [...(state.syncQueue || []), { fn, args }] }
}

/**
 * Ask for a notification to be sent, without the reducer doing it itself.
 * Same shape as queueRpc, and for the same reason: the reducer stays pure and
 * the provider does the talking.
 */
function queueNotice(state, notice) {
  return { ...state, noticeQueue: [...(state.noticeQueue || []), notice] }
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

/** The plan a family is on, falling back to the cheapest rather than the best. */
export function planOf(state) {
  return TIERS[state.family.tier] || TIERS.starter
}

/**
 * How many children this plan allows. Starter is one child; the point of
 * Standard is the second one.
 */
export function kidLimit(state) {
  return planOf(state).limits.maxKids
}

export function canAddKid(state) {
  return state.kids.length < kidLimit(state)
}

/** Starter reviews photos by eye. The AI second opinion is what Standard adds. */
export function aiCheckAllowed(state) {
  return planOf(state).limits.aiPhotoCheck === true
}

export function guildsAllowedByPlan(state) {
  return planOf(state).limits.guilds === true
}

export function guildCapacity(state) {
  return TIERS[state.family.tier]?.guildSize ?? 0
}

/** A lockout that has run out of time is treated as lifted. */
export function activeLockout(kid) {
  if (!kid?.lockout) return null
  if (kid.lockout.type === 'dimension' && kid.lockout.until && Date.now() >= kid.lockout.until) return null
  return kid.lockout
}

/** True once a Dimension Lockout's timer has run out, even if nothing cleared it yet. */
export function overrideHasExpired(override) {
  return Boolean(override.kind === 'dimension' && override.until && Date.now() >= override.until)
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

export function reducer(state, action) {
  switch (action.type) {
    /* ---------- lifecycle ---------- */

    case 'HYDRATE':
      return action.state

    /**
     * Fold a server snapshot into local state.
     *
     * The merge rules, stated once so they are not re-invented per entity:
     *
     *   - XP, currency and streaks always take the server's value. Only
     *     approve_submission moves those, it runs inside the database, and a
     *     device's own copy is a guess that may be behind.
     *   - Everything else merges field by field onto whatever is already here,
     *     which preserves the local-only bits the server does not store (a
     *     kid's best times, a cached photo, an AI report's detail).
     *   - Rows the server reports as deleted are removed.
     *
     * There is deliberately no "last write wins on the whole row": that is how
     * a parent approving on one phone silently reverts a kid's theme change on
     * another.
     */
    case 'MERGE_SNAPSHOT': {
      const snap = action.snapshot
      let next = { ...state }

      for (const [snapshotKey, { key, mapper }] of Object.entries(ENTITIES)) {
        const incoming = snap[snapshotKey]
        if (!incoming?.length) continue
        const byId = new Map((next[key] || []).map((item) => [item.id, item]))
        for (const row of incoming) {
          byId.set(row.id, mapper.fromRow(row, byId.get(row.id) || {}))
        }
        next = { ...next, [key]: [...byId.values()] }
      }

      for (const deletion of snap.deletions || []) {
        const entity = Object.values(ENTITIES).find((e) => e.table === deletion.table_name)
        if (!entity) continue
        next = { ...next, [entity.key]: (next[entity.key] || []).filter((i) => i.id !== deletion.row_id) }
      }

      const family = snap.families?.[0]
      if (family) {
        next = {
          ...next,
          family: {
            ...next.family,
            id: family.id,
            name: family.name,
            parentThemeId: next.family.parentThemeId,
            tier: family.tier,
            flashTickets: family.flash_tickets ?? next.family.flashTickets ?? 0,
          },
        }
      }

      return { ...next, lastSyncedAt: Date.now() }
    }

    /**
     * A photo taken on a kid's phone travels inside the submission row and
     * arrives here as raw data. Once the device has written it to its own photo
     * store it is addressed by id like any other, and the copy in state is
     * dropped so the same image is not held twice.
     */
    case 'ATTACH_SYNCED_PHOTOS': {
      const byId = new Map(action.photos.map((p) => [p.submissionId, p.photoId]))
      return {
        ...state,
        submissions: (state.submissions || []).map((s) =>
          byId.has(s.id) ? { ...s, photoId: byId.get(s.id), photoData: null } : s,
        ),
      }
    }

    case 'RESET':
      return createInitialState()

    /* ---------- device pairing ---------- */

    /**
     * A kid's device has generated a code and is waiting for a parent to enter
     * it. Deliberately stores almost nothing: until a parent claims this device
     * there is no verified consent, so the app collects the child's first name
     * and a theme choice and nothing else. No quests, no photos, no XP.
     */
    case 'START_PAIRING':
      return {
        ...state,
        device: { ...state.device, role: 'kid', linkedKidId: null },
        // Every install invents a family id for itself so it works offline. On
        // a kid's phone that id is fiction — the real family is the parent's —
        // and writing rows into it just fills the outbox with rejections.
        // Dropped here, and supplied for real by the first sync after pairing.
        family: { ...state.family, id: null },
        pendingPairing: action.record,
      }

    case 'CANCEL_PAIRING':
      return { ...state, pendingPairing: null }

    /** A parent claimed this device's code. It is now part of their family. */
    case 'PAIRING_CLAIMED': {
      const pending = state.pendingPairing
      if (!pending) return state
      const kid = makeKid({ name: pending.kidName, themeId: pending.themeId })
      // The parent may already have a profile for this child, in which case
      // pairing joined it rather than making a second one. The id that comes
      // back with the claim is the one that owns the quests, so it wins over
      // the placeholder this device generated.
      const linked = { ...kid, id: action.kidId || pending.kidId || kid.id }
      const next = {
        ...state,
        onboarded: true,
        device: {
          role: 'kid',
          linkedKidId: linked.id,
          familyName: action.familyName || 'your family',
          pairedAt: Date.now(),
        },
        pendingPairing: null,
        // Deliberately does not touch family.id: a sync may already have landed
        // between the parent typing the code and this arriving, and it would be
        // holding the real one.
        family: { ...state.family, name: action.familyName || state.family.name },
        kids: [linked],
        session: { role: 'kid', kidId: linked.id, parentUnlocked: false },
      }
      return logEvent(next, { type: 'device_paired', kidId: linked.id })
    }

    /**
     * The parent's side: a code was accepted, so this kid joins the family.
     * If a profile with that name already exists it is linked rather than
     * duplicated — a parent who set the kid up here first, then handed them a
     * phone, should not end up with two Avas.
     */
    case 'ADOPT_PAIRED_KID': {
      const { kid: paired } = action
      const existing = state.kids.find(
        (k) => k.name.trim().toLowerCase() === paired.name.trim().toLowerCase(),
      )
      if (existing) {
        const next = mapKid(state, existing.id, (k) => ({
          ...k,
          pairedDeviceAt: Date.now(),
          pairedCodeId: paired.id,
        }))
        return logEvent(next, { type: 'device_linked', kidId: existing.id, meta: { merged: true } })
      }
      const kid = { ...makeKid({ name: paired.name, themeId: paired.themeId }), id: paired.id, pairedDeviceAt: Date.now() }
      const next = { ...state, kids: [...state.kids, kid] }
      return logEvent(next, { type: 'device_linked', kidId: kid.id, meta: { merged: false } })
    }

    /** Cut a kid's device loose. Their profile and progress stay with the family. */
    case 'UNLINK_KID_DEVICE':
      return logEvent(
        mapKid(state, action.kidId, (k) => ({ ...k, pairedDeviceAt: null, pairedCodeId: null })),
        { type: 'device_unlinked', kidId: action.kidId },
      )

    case 'COMPLETE_ONBOARDING': {
      const { family, kid, guildName } = action
      const next = {
        ...state,
        onboarded: true,
        device: { ...state.device, role: 'parent', linkedKidId: null },
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
      // Starter is a one-child plan. Refusing here rather than in the screen
      // means no other route into the app can quietly get round it.
      if (!canAddKid(state)) return state
      return logEvent({ ...state, kids: [...state.kids, action.kid] }, { type: 'kid_added', kidId: action.kid.id })

    case 'UPDATE_KID':
      return mapKid(state, action.kidId, (k) => ({ ...k, ...action.patch }))

    case 'REMOVE_KID':
      return {
        ...state,
        kids: state.kids.filter((k) => k.id !== action.kidId),
        quests: state.quests.filter((q) => q.kidId !== action.kidId),
        submissions: state.submissions.filter((s) => s.kidId !== action.kidId),
        redemptions: state.redemptions.filter((r) => r.kidId !== action.kidId),
        notes: state.notes.filter((n) => n.kidId !== action.kidId),
        overrides: state.overrides.filter((o) => o.kidId !== action.kidId),
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

    /**
     * Buy a Sunday Market skin with the child's own currency.
     *
     * Refused unless the market is actually open, so a tampered clock in the
     * browser is the only way round it — and that only cheats them out of the
     * occasion, never out of XP, because skins are paint.
     */
    case 'BUY_SKIN': {
      const kid = state.kids.find((k) => k.id === action.kidId)
      const skin = findSkin(action.skinId)
      if (!kid || !skin || !isMarketOpen()) return state
      if ((kid.skins || []).includes(skin.id)) return state
      if (kid.coins < skin.cost) return state
      const next = mapKid(state, kid.id, (k) => ({
        ...k,
        coins: k.coins - skin.cost,
        skins: [...(k.skins || []), skin.id],
        skinId: skin.id,
      }))
      return logEvent(queueRpc(next, 'buy_market_skin', {
        p_kid_id: kid.id, p_skin_id: skin.id, p_cost: skin.cost, p_use_ticket: false,
      }), { type: 'skin_bought', kidId: kid.id, meta: { skin: skin.id, ticket: false } })
    }

    /**
     * Spend one of the family's Flash Tickets instead of currency.
     *
     * The ticket was bought by a parent; a child spends it. That split is the
     * whole point — see the note on buyFlashTickets in lib/billing.js.
     */
    case 'CLAIM_SKIN_WITH_TICKET': {
      const kid = state.kids.find((k) => k.id === action.kidId)
      const skin = findSkin(action.skinId)
      if (!kid || !skin || !isMarketOpen()) return state
      if ((kid.skins || []).includes(skin.id)) return state
      if ((state.family.flashTickets || 0) < 1) return state
      const withKid = mapKid(state, kid.id, (k) => ({
        ...k,
        skins: [...(k.skins || []), skin.id],
        skinId: skin.id,
      }))
      const next = {
        ...withKid,
        family: { ...withKid.family, flashTickets: withKid.family.flashTickets - 1 },
      }
      return logEvent(queueRpc(next, 'buy_market_skin', {
        p_kid_id: kid.id, p_skin_id: skin.id, p_cost: 0, p_use_ticket: true,
      }), { type: 'skin_bought', kidId: kid.id, meta: { skin: skin.id, ticket: true } })
    }

    /** Wear a skin already owned. Free, and reversible. */
    case 'WEAR_SKIN': {
      const kid = state.kids.find((k) => k.id === action.kidId)
      if (!kid) return state
      if (action.skinId && !(kid.skins || []).includes(action.skinId)) return state
      return mapKid(state, kid.id, (k) => ({ ...k, skinId: action.skinId || null }))
    }

    /**
     * Credit Flash Tickets.
     *
     * In production this only ever runs from what the server sends back after
     * Stripe's webhook has confirmed a payment. With Stripe unconfigured the
     * settings screen dispatches it directly so the market can be exercised in
     * development, and says on screen that nothing was charged.
     */
    case 'GRANT_FLASH_TICKETS':
      return {
        ...state,
        family: {
          ...state.family,
          flashTickets: (state.family.flashTickets || 0) + (action.count || 0),
        },
      }

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
      // One pending submission per quest, ever. Without this a kid can open an
      // already-submitted quest, send a second photo, and have a parent approve
      // both — awarding the XP twice for one chore.
      const alreadyPending = state.submissions.some(
        (s) => s.questId === action.submission.questId && s.status === 'pending',
      )
      const quest = state.quests.find((q) => q.id === action.submission.questId)
      if (alreadyPending || !quest || quest.status === 'approved') return state

      // The image is carried to the server, not kept in state: this device
      // holds it in its photo store, addressed by photoId.
      const { photoData, ...fields } = action.submission
      const submission = {
        id: uid('sub'),
        status: 'pending',
        submittedAt: Date.now(),
        ...fields,
      }
      const next = {
        ...state,
        submissions: [...state.submissions, submission],
        quests: state.quests.map((q) => (q.id === submission.questId ? { ...q, status: 'submitted' } : q)),
      }
      const withRpc = queueRpc(next, 'submit_quest', {
        p_submission_id: submission.id,
        p_quest_id: submission.questId,
        p_kid_id: submission.kidId,
        p_payload: {
          photo_data: photoData || null,
          photo_hash: submission.hash || null,
          capture_source: submission.captureSource || 'none',
          note: submission.note || '',
          test_score: submission.testScore ?? null,
          elapsed_ms: submission.elapsedMs ?? null,
          on_time: submission.onTime !== false,
          ai_verdict: submission.report?.verdict || null,
          ai_score: submission.report?.score ?? null,
          ai_report: submission.report || null,
        },
      })
      const questForNotice = state.quests.find((q) => q.id === submission.questId)
      const kidForNotice = state.kids.find((k) => k.id === submission.kidId)
      const notified = queueNotice(withRpc, {
        role: 'parent',
        kind: 'submission',
        args: [kidForNotice?.name || 'Your kid', questForNotice?.title || 'a quest'],
      })

      return logEvent(notified, {
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
      // Second guard on the same exploit: even if a stray pending submission
      // exists, a quest can only ever pay out once.
      if (!quest || !kid || quest.status === 'approved') return state

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
            ? {
                ...s,
                status: 'approved',
                decidedAt: Date.now(),
                parentNote: action.note || '',
                awarded: { xp, coins, lines },
                // Dropping photoId is what actually deletes the image: the
                // provider's purge sweeps any photo no submission points at.
                photoId: null,
                photoData: null,
                photoDeletedAt: Date.now(),
              }
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

      next = queueRpc(next, 'approve_submission', {
        p_submission_id: action.submissionId,
        p_xp: xp,
        p_coins: coins,
        p_note: action.note || '',
      })

      next = queueNotice(next, {
        role: 'kid',
        kidId: kid.id,
        kind: 'approved',
        args: [quest.title, xp],
      })

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
      let next = {
        ...state,
        submissions: state.submissions.map((s) =>
          s.id === action.submissionId
            ? {
                ...s,
                status: 'rejected',
                decidedAt: Date.now(),
                parentNote: action.note || '',
                photoId: null,
                photoData: null,
                photoDeletedAt: Date.now(),
              }
            : s,
        ),
        // Rejected work goes straight back on the kid's list to redo.
        quests: state.quests.map((q) =>
          q.id === submission.questId ? { ...q, status: 'redo', redoNote: action.note || '', redoCount: (q.redoCount || 0) + 1 } : q,
        ),
      }
      const questRejected = state.quests.find((q) => q.id === submission.questId)
      next = queueNotice(next, {
        role: 'kid',
        kidId: submission.kidId,
        kind: 'rejected',
        args: [questRejected?.title || 'a quest'],
      })
      const rejected = queueRpc(next, 'reject_submission', {
        p_submission_id: action.submissionId,
        p_note: action.note || '',
      })
      return logEvent(rejected, { type: 'quest_rejected', kidId: submission.kidId, meta: { questId: submission.questId, reason: action.note || '' } })
    }

    case 'CLEAR_LEVEL_UP':
      return { ...state, pendingLevelUp: null }

    /** The provider has moved these into the outbox. */
    case 'DRAIN_SYNC_QUEUE':
      return { ...state, syncQueue: [] }

    case 'DRAIN_NOTICE_QUEUE':
      return { ...state, noticeQueue: [] }

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
      const redemptionId = uid('rd')
      next = {
        ...next,
        redemptions: [
          ...next.redemptions,
          { id: redemptionId, rewardId: reward.id, kidId: kid.id, name: reward.name, cost: reward.cost, at: Date.now(), status: 'requested' },
        ],
      }
      next = queueRpc(next, 'redeem_reward', {
        p_redemption_id: redemptionId,
        p_reward_id: reward.id,
        p_kid_id: kid.id,
      })
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
        next = queueRpc(next, 'apply_currency_tax', { p_kid_id: kidId, p_percent: percent })
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

    /**
     * Dimension Lockouts end on a timer, but nothing was writing that down: the
     * kid regained access (activeLockout checks the clock) while the override
     * history went on claiming the lockout was still active. Dispatched by the
     * app on load and on a timer.
     */
    case 'EXPIRE_LOCKOUTS': {
      const now = Date.now()
      const expired = state.overrides.filter(
        (o) => !o.liftedAt && o.kind === 'dimension' && o.until && now >= o.until,
      )
      if (!expired.length) return state
      const expiredIds = new Set(expired.map((o) => o.id))
      return {
        ...state,
        overrides: state.overrides.map((o) =>
          // endedBy distinguishes "ran out on its own" from "a parent lifted it".
          expiredIds.has(o.id) ? { ...o, liftedAt: o.until, endedBy: 'timer' } : o,
        ),
        kids: state.kids.map((k) =>
          k.lockout && expiredIds.has(k.lockout.overrideId) ? { ...k, lockout: null } : k,
        ),
      }
    }

    case 'LIFT_OVERRIDE': {
      const override = state.overrides.find((o) => o.id === action.overrideId)
      if (!override) return state
      let next = {
        ...state,
        overrides: state.overrides.map((o) =>
          o.id === action.overrideId ? { ...o, liftedAt: Date.now(), endedBy: 'parent' } : o,
        ),
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
      next = queueRpc(next, 'claim_login_bonus', { p_kid_id: kid.id, p_coins: coins })
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
