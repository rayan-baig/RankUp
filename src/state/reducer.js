import { uid } from '../lib/id.js'
import { dayKey, daysBetween, deviceZone } from '../lib/dates.js'
import { submissionReward, levelFromXp, liveStreak } from '../lib/xp.js'
import { createInitialState, TIERS, makeKid } from './initialState.js'
import { findSkin, isMarketOpen, ticketCost } from '../data/marketSkins.js'
import { DAILY_COIN_CAP, MAX_TOKENS, possibleScore, coinsForScore } from '../data/minigames.js'
import { ENTITIES, familyGoals } from '../lib/sync/mappers.js'
import { questsDueToReturn, dayOf } from '../lib/recurrence.js'
import { STICKER_MAP } from '../data/stickers.js'

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
function queueRpc(state, fn, args, foldKey = null) {
  // A call that moves a balance carries an id made now, when the thing
  // happened. If the phone sends it, never hears back and sends it again, the
  // server recognises the id and does not charge or pay a second time.
  const withId = RETRY_SAFE.has(fn) && !args?.p_request_id ? { ...args, p_request_id: uid('req') } : args
  // A fold key: a later call with the same key replaces one still waiting.
  const item = foldKey ? { fn, args: withId, foldKey } : { fn, args: withId }
  return { ...state, syncQueue: [...(state.syncQueue || []), item] }
}

/** Functions that take a request id. Mirrored by rpc_receipts in supabase/sync.sql. */
const RETRY_SAFE = new Set(['play_minigame', 'buy_market_skin', 'apply_currency_tax', 'record_payout', 'record_gift'])

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
export function bumpStreak(streak, today = dayKey()) {
  // Later than today happens when a zone changes; it is not a broken streak.
  if (streak.lastDay && streak.lastDay >= today) return streak
  if (!streak.lastDay) return { ...streak, count: 1, lastDay: today }
  const gap = daysBetween(streak.lastDay, today)
  if (gap === 1) return { ...streak, count: streak.count + 1, lastDay: today }
  // Exactly one missed day, and a freeze to cover it: spent here, and the run
  // carries on. MIRRORED in approve_submission.
  if (gap === 2 && streak.count > 0 && (streak.freezeTokens || 0) >= 1) {
    return { ...streak, count: streak.count + 1, lastDay: today, freezeTokens: streak.freezeTokens - 1 }
  }
  return { ...streak, count: 1, lastDay: today }
}

export function isElite(state) {
  return effectiveTier(state.family) === 'elite'
}

/** The plan a family is on, falling back to the cheapest rather than the best. */
/**
 * Is the richer visual tier actually on right now?
 *
 * Three things have to agree: the family pays for Elite, they have not turned
 * it off, and the device is not asking for reduced motion. That last one is not
 * a preference to weigh against the others — a child who gets motion sick, or a
 * parent who turned it on for them, outranks a paid feature every time.
 */
export function overdriveActive(state) {
  return isElite(state) && state.settings.overdrive !== false && !state.settings.reduceMotion
}

/**
 * What this family is entitled to right now: the better of what they pay for
 * and an unexpired trial.
 *
 * MIRRORS effective_tier() in supabase/schema.sql, which is the authority —
 * every gate in the database asks that one, and tests/trials.mjs runs the two
 * against each other so a trial can never be real on screen and refused by the
 * server, or the reverse.
 */
const TIER_RANK = { starter: 0, standard: 1, elite: 2 }

export function effectiveTier(family) {
  const paid = TIERS[family?.tier] ? family.tier : 'starter'
  const trial = family?.trialTier
  const until = family?.trialEndsAt
  if (!trial || !until || until <= Date.now()) return paid
  return (TIER_RANK[trial] ?? 0) > (TIER_RANK[paid] ?? 0) ? trial : paid
}

/** Days left on a running trial, or null when there is not one. */
export function trialDaysLeft(family) {
  if (!family?.trialTier || !family?.trialEndsAt) return null
  const ms = family.trialEndsAt - Date.now()
  if (ms <= 0) return null
  return Math.max(1, Math.ceil(ms / 86400000))
}

/** True while a trial is the reason they have what they have. */
export function onTrial(state) {
  return trialDaysLeft(state.family) !== null
    && effectiveTier(state.family) !== (state.family.tier || 'starter')
}

export function planOf(state) {
  return TIERS[effectiveTier(state.family)] || TIERS.starter
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


export function guildsAllowedByPlan(state) {
  return planOf(state).limits.guilds === true
}

export function guildCapacity(state) {
  return planOf(state).guildSize ?? 0
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

/**
 * What a child is owed: the lines, added up.
 *
 * Exported because every screen that shows a pot must add it up the same way
 * the reducer does. Two places summing a ledger slightly differently is how a
 * parent ends up looking at two different numbers on two screens.
 */
export function potFor(state, kidId) {
  const local = (state.allowance || []).filter((e) => e.kidId === kidId)
  const pots = state.allowancePots

  // No server answer yet — a device with no backend, or one that has not
  // synced. Its own lines are all there is, and they are complete.
  if (!pots) return local.reduce((total, e) => total + e.pence, 0)

  /*
   * With a server answer, the pot comes FROM it rather than from adding up the
   * lines it sent. The summary sums every line but only returns the most
   * recent two hundred, so re-adding them would quietly lose every penny older
   * than that.
   *
   * Lines made since that answer are added on top: a payout recorded on a
   * train has not reached the server yet, and a parent who has just tapped Paid
   * must not watch the number jump back up.
   */
  const since = state.allowanceAt || 0
  return (pots[kidId] || 0)
    + local.filter((e) => e.at > since).reduce((total, e) => total + e.pence, 0)
}

/**
 * XP earned towards the family goal since it was set.
 *
 * The bar used to add up everybody's lifetime XP, so a goal set after a month
 * of play was full the day it was set. A goal saved by an older version has
 * no starting point and counts from zero, as it always did.
 */
export function familyGoalProgress(state) {
  if (!state.familyGoal) return 0
  // A child's phone holds only its own child, so it cannot add everybody up:
  // it shows the figure the server added up (see family_goal_since).
  if (state.device?.role === 'kid') return Math.max(0, state.familyGoal.progress || 0)
  const total = (state.kids || []).reduce((sum, k) => sum + (k.xp || 0), 0)
  return Math.max(0, total - (state.familyGoal.startXp || 0))
}

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
     *     kid's best times).
     *   - Rows the server reports as deleted are removed.
     *
     * There is deliberately no "last write wins on the whole row": that is how
     * a parent approving on one phone silently reverts a kid's theme change on
     * another.
     */
    case 'MERGE_SNAPSHOT': {
      const snap = action.snapshot
      let next = { ...state }

      // Rows with a change of this device's still waiting to go are left as
      // they are: the server's copy is older. They come back with the next
      // pull once the change has landed. See the engine's dispatch.
      const pending = new Set(action.pending || [])
      for (const [snapshotKey, { key, mapper, table }] of Object.entries(ENTITIES)) {
        const incoming = snap[snapshotKey]
        if (!incoming?.length) continue
        const byId = new Map((next[key] || []).map((item) => [item.id, item]))
        for (const row of incoming) {
          if (pending.has(`${table}:${row.id}`) && byId.has(row.id)) continue
          // Deleted here, delete not yet sent: a pull must not bring it back.
          if (pending.has(`delete:${table}:${row.id}`)) continue
          byId.set(row.id, mapper.fromRow(row, byId.get(row.id) || {}))
        }
        next = { ...next, [key]: [...byId.values()] }
      }

      // One pass per table, not one per tombstone: a first sync for a family
      // with a year behind it carries thousands of each.
      const gone = new Map()
      for (const deletion of snap.deletions || []) {
        if (!gone.has(deletion.table_name)) gone.set(deletion.table_name, new Set())
        gone.get(deletion.table_name).add(deletion.row_id)
      }
      for (const entity of Object.values(ENTITIES)) {
        const ids = gone.get(entity.table)
        if (ids) next = { ...next, [entity.key]: (next[entity.key] || []).filter((i) => !ids.has(i.id)) }
      }

      // The family goal, set or cleared on another phone. A tombstone newer
      // than the goal row (and than the goal this phone has) means cleared.
      if (!pending.has('family_goals')) {
        const goalRow = snap.family_goals?.[0]
        const goneRev = (snap.deletions || [])
          .filter((d) => d.table_name === 'family_goals')
          .reduce((max, d) => Math.max(max, Number(d.rev) || 0), 0)
        if (goalRow && Number(goalRow.rev) > goneRev) {
          next = { ...next, familyGoal: familyGoals.fromRow(goalRow) }
        } else if (goneRev && goneRev > (Number(next.familyGoal?.rev) || 0)) {
          next = { ...next, familyGoal: null }
        }
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
            // Kept beside the paid tier, never merged into it: a trial ending
            // has to leave whatever they actually pay for sitting untouched.
            trialTier: family.trial_tier || null,
            trialEndsAt: family.trial_ends_at ? Date.parse(family.trial_ends_at) : null,
            flashTickets: family.flash_tickets ?? next.family.flashTickets ?? 0,
            // Why a paid plan stopped, if it has: the dashboard says so
            // rather than simply showing fewer features. See billingNotice.
            subscriptionStatus: family.subscription_status || null,
            lastPaidTier: family.last_paid_tier || null,
            subscriptionEndsAt: family.subscription_ends_at || null,
            // The day weekly chores come back; see recurrenceDue.
            weekResetsOn: family.week_resets_on ?? null,
          },
        }
      }

      /*
       * A level reached by sync, celebrated on the child's own phone.
       *
       * The overlay was only ever raised by APPROVE_SUBMISSION, on the phone
       * where the parent tapped Accept, so a child with their own phone never
       * saw a single level-up. Only a row this phone had already been sent
       * counts: the first pull after pairing brings every level the child
       * already had, and that is not news.
       */
      const mine = state.device?.role === 'kid' ? state.device.linkedKidId : null
      const was = mine && state.kids.find((k) => k.id === mine)
      const now = mine && next.kids.find((k) => k.id === mine)
      if (was && now && was.rev != null) {
        const from = levelFromXp(was.xp).level
        const to = levelFromXp(now.xp).level
        if (to > from) {
          const held = state.pendingLevelUp?.kidId === mine ? state.pendingLevelUp : null
          next = { ...next, pendingLevelUp: { kidId: mine, from: held ? Math.min(held.from, from) : from, to } }
        }
      }

      return { ...next, lastSyncedAt: Date.now() }
    }

    case 'RESET':
      return createInitialState()

    /**
     * This phone no longer belongs to a family and has been erased (see
     * wipeDevice). A fresh start, with one sentence saying why, which names
     * nobody: whoever picks the phone up next learns nothing from it.
     */
    case 'DEVICE_WIPED':
      return { ...createInitialState(), deviceWiped: action.reason === 'removed' ? 'removed' : 'unlinked' }

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
      // byId: the server chose the profile, so only that profile is "this
      // child". Matching by name as well marked a different, older profile
      // as the one with the phone.
      const existing = state.kids.find((k) => k.id === paired.id) || (action.byId ? null : state.kids.find(
        (k) => k.name.trim().toLowerCase() === paired.name.trim().toLowerCase(),
      ))
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
    // The server is what decides which phone is the child's, so the unlink has
    // to reach it: this used to change only the parent's own screen, and the
    // child's phone (or a lost one) kept full access.
    case 'UNLINK_KID_DEVICE':
      return logEvent(
        queueRpc(
          mapKid(state, action.kidId, (k) => ({ ...k, pairedDeviceAt: null, pairedCodeId: null })),
          'unlink_kid_device',
          { p_kid_id: action.kidId },
        ),
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

    /**
     * A second grown-up arriving in a family that already exists.
     *
     * Unlike COMPLETE_ONBOARDING there is no child to create and no guild to
     * name — the family already has both, and the sync layer brings them down
     * a moment later. All this does is stop the app asking to be set up and
     * point it at the right family.
     *
     * kidId is left null on purpose. App.jsx falls back to the first child it
     * knows about, which is the correct answer both before the first snapshot
     * arrives (none) and after it (theirs).
     */
    /**
     * Load the look-around family.
     *
     * The whole state is replaced rather than merged: a visitor who has been
     * halfway through setting up their own family and backed out must not end
     * up with their half-finished household tangled into the demo's.
     *
     * LEAVE_DEMO is deliberately a full reset rather than a flag being turned
     * off. Keeping any of it would mean a real family starting life with
     * somebody else's children in it.
     */
    case 'START_DEMO':
      return action.state

    case 'LEAVE_DEMO':
      return createInitialState()

    case 'JOIN_FAMILY': {
      const { familyId, familyName, parentName, pin } = action
      return {
        ...state,
        onboarded: true,
        device: { ...state.device, role: 'parent', linkedKidId: null },
        family: {
          ...state.family,
          id: familyId,
          name: familyName || state.family.name,
          parentName: parentName || state.family.parentName,
          pin: pin || state.family.pin,
        },
        session: { role: 'parent', kidId: null, parentUnlocked: true },
      }
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
        // Their XP leaves the total, so it leaves where the goal started too
        // (as goal_without_kid does on the server), or the bar would drop.
        familyGoal: state.familyGoal
          ? {
              ...state.familyGoal,
              startXp: Math.max(0, (state.familyGoal.startXp || 0)
                - (state.kids.find((k) => k.id === action.kidId)?.xp || 0)),
            }
          : state.familyGoal,
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

    /*
     * A chapter of the theme's story has been watched on this device. Local
     * only, like bestTimes: the mapper never sends it up, and a pull keeps
     * it. For the dragon it also marks where the next replay starts.
     */
    case 'SEE_STORY':
      return mapKid(state, action.kidId, (k) => ({
        ...k,
        storySeen: { ...(k.storySeen || {}), [action.chapter]: action.at ?? Date.now() },
      }))

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
     * The day a family's weekly chores come back (Monday 1 to Sunday 7), or
     * null for "seven days after it was done". The database decides which
     * chores reopen, so it has to know the day too.
     */
    case 'SET_WEEK_RESET_DAY': {
      const day = action.day >= 1 && action.day <= 7 ? Math.round(action.day) : null
      return queueRpc({ ...state, family: { ...state.family, weekResetsOn: day } },
        'set_week_reset_day', { p_day: day }, 'set_week_reset_day')
    }

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
      // Rarer skins cost more tickets. buy_market_skin decides the real price;
      // this is the local copy so the button can be disabled honestly.
      const cost = ticketCost(skin)
      if ((state.family.flashTickets || 0) < cost) return state
      const withKid = mapKid(state, kid.id, (k) => ({
        ...k,
        skins: [...(k.skins || []), skin.id],
        skinId: skin.id,
      }))
      const next = {
        ...withKid,
        family: { ...withKid.family, flashTickets: withKid.family.flashTickets - cost },
      }
      return logEvent(queueRpc(next, 'buy_market_skin', {
        p_kid_id: kid.id, p_skin_id: skin.id, p_cost: 0, p_use_ticket: true,
      }), { type: 'skin_bought', kidId: kid.id, meta: { skin: skin.id, ticket: true, cost } })
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
    /**
     * A minigame finished. Spends the token, pays the (already capped) coins
     * and records a best score.
     *
     * The server recomputes all of this in play_minigame — this is the local
     * copy so the app still works offline and the child sees the number at once.
     */
    case 'FINISH_MINIGAME': {
      const kid = state.kids.find((k) => k.id === action.kidId)
      /*
       * The look-around demo has no chores anybody actually did, so gating its
       * arcade behind earned tokens means somebody trying the app can open two
       * games and then hit a wall. In the demo the tokens never run out.
       *
       * Nowhere else. A real family's tokens come from approved chores and
       * nothing else — that gate is the only thing keeping the arcade from
       * being a reason not to do them.
       */
      const unlimited = Boolean(state.demo)
      if (!kid || (!unlimited && (kid.playTokens || 0) < 1)) return state
      const today = dayKey()
      // A day later than today (a zone change) is still today's tally.
      const earned = kid.gameDay && kid.gameDay >= today ? kid.gameCoinsToday || 0 : 0
      // Held to what the game allows in the time played, as the server does.
      const timed = typeof action.elapsedMs === 'number' && Number.isFinite(action.elapsedMs)
      const elapsedMs = timed ? Math.max(0, Math.min(2 ** 31 - 1, Math.round(action.elapsedMs))) : null
      const claimed = Math.max(0, Math.min(100, Math.round(action.score || 0)))
      const score = timed ? Math.min(claimed, possibleScore(action.game, elapsedMs)) : claimed
      const coins = Math.max(0, Math.min(action.coins || 0, coinsForScore(score), DAILY_COIN_CAP - earned))
      const next = mapKid(state, kid.id, (k) => ({
        ...k,
        playTokens: unlimited ? k.playTokens : k.playTokens - 1,
        coins: k.coins + coins,
        gameDay: kid.gameDay && kid.gameDay > today ? kid.gameDay : today,
        gameCoinsToday: earned + coins,
        bestScores: { ...(k.bestScores || {}), [action.game]: Math.max((k.bestScores || {})[action.game] || 0, score) },
      }))
      return logEvent(queueRpc(next, 'play_minigame', {
        p_kid_id: kid.id, p_game: action.game, p_score: score, p_tz: deviceZone(),
        ...(timed ? { p_elapsed_ms: elapsedMs } : {}),
      }), { type: 'minigame_played', kidId: kid.id, meta: { game: action.game, score, coins } })
    }

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
        lastResetOn: null,
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

    /**
     * Bring back the repeating chores that are due today.
     *
     * Dispatched when the app opens and when the date rolls over, so whoever
     * looks at their phone first in the morning brings the day's chores back
     * for everybody. The change is made here so a family with no backend still
     * works; reset_due_recurring_quests is what makes it true across devices,
     * and it applies the same rule to the rows as they actually are rather
     * than taking this device's word for which quests were due.
     */
    case 'RETURN_RECURRING': {
      const today = action.today || dayOf(new Date())
      const due = questsDueToReturn(state.quests, today, state.family?.weekResetsOn ?? null)
      if (!due.length) return state
      const ids = new Set(due.map((q) => q.id))
      const next = {
        ...state,
        quests: state.quests.map((q) =>
          ids.has(q.id)
            ? { ...q, status: 'assigned', completedAt: null, redoNote: undefined, redoCount: 0, lastResetOn: today }
            : q,
        ),
      }
      return logEvent(queueRpc(next, 'reset_due_recurring_quests', action.tz ? { p_tz: action.tz } : {}), {
        type: 'quests_returned',
        meta: { count: due.length },
      })
    }

    case 'DELETE_QUEST':
      return {
        ...state,
        quests: state.quests.filter((q) => q.id !== action.questId),
        submissions: state.submissions.filter((s) => s.questId !== action.questId),
      }

    /* ---------- submissions ---------- */

    case 'SUBMIT_QUEST': {
      // One pending submission per quest, ever. Without this a kid can open an
      // already-submitted quest, send it again, and have a parent approve
      // both — awarding the XP twice for one chore.
      const alreadyPending = state.submissions.some(
        (s) => s.questId === action.submission.questId && s.status === 'pending',
      )
      const quest = state.quests.find((q) => q.id === action.submission.questId)
      if (alreadyPending || !quest || quest.status === 'approved') return state

      // No photo, ever: RankUp does not take or keep pictures. A parent who
      // wants proof gets it from the child's own camera app, by message. Only
      // what a submission is made of is kept from what the screen sent.
      const fields = Object.fromEntries(
        ['questId', 'kidId', 'note', 'testScore', 'elapsedMs', 'onTime']
          .filter((key) => action.submission[key] !== undefined)
          .map((key) => [key, action.submission[key]]),
      )
      // A score is a percentage: 999 typed by mistake paid the top bonus here
      // and was refused by the server, bouncing the chore.
      if (typeof fields.testScore === 'number') {
        fields.testScore = Math.max(0, Math.min(100, Math.round(fields.testScore)))
      }
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
          note: submission.note || '',
          test_score: submission.testScore ?? null,
          elapsed_ms: submission.elapsedMs ?? null,
          on_time: submission.onTime !== false,
        },
      })
      const questForNotice = state.quests.find((q) => q.id === submission.questId)
      const kidForNotice = state.kids.find((k) => k.id === submission.kidId)
      const notified = queueNotice(withRpc, {
        role: 'parent',
        kind: 'submission',
        // Which submission it is about: a notice is not sent for one the
        // server turned down (see the sync engine).
        ref: submission.id,
        args: [kidForNotice?.name || 'Your kid', questForNotice?.title || 'a quest'],
      })

      return logEvent(notified, {
        type: 'quest_submitted',
        kidId: submission.kidId,
        meta: { questId: submission.questId },
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

      const { xp, coins, lines } = submissionReward(quest, submission, {
        elite: isElite(state),
        // A lapsed streak pays nothing; see liveStreak.
        streak: liveStreak(kid.streak),
      })

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
                sticker: STICKER_MAP[action.sticker] ? action.sticker : null,
                awarded: { xp, coins, lines },
              }
            : s,
        ),
        quests: state.quests.map((q) => (q.id === quest.id ? { ...q, status: 'approved', completedAt: Date.now() } : q)),
      }

      next = mapKid(next, kid.id, (k) => ({
        ...k,
        xp: k.xp + xp,
        coins: k.coins + coins,
        // One arcade token per approved chore — mirrored in approve_submission.
        playTokens: Math.min((k.playTokens || 0) + 1, MAX_TOKENS),
        streak: bumpStreak(k.streak),
        bestTimes:
          quest.timerSeconds && submission.elapsedMs
            ? {
                ...k.bestTimes,
                [quest.title]: Math.min(k.bestTimes[quest.title] ?? Infinity, Math.round(submission.elapsedMs / 1000)),
              }
            : k.bestTimes,
      }))

      /*
       * The chore's cash value, if it has one.
       *
       * Mirrors credit_allowance, and the mirroring is trivial on purpose: the
       * amount is paid exactly as set, with no streak bonus, no Elite
       * multiplier and no surprise double. XP is a game currency and
       * multipliers make it fun; real money with surprise multipliers is a
       * parent's budget going wrong. It also means the two implementations
       * have nothing to drift about.
       *
       * Keyed on the submission, like the database row, so the server's answer
       * replacing this one cannot double-count it.
       */
      if (quest.pence > 0) {
        next = {
          ...next,
          allowance: [
            ...next.allowance.filter((e) => e.submissionId !== submission.id),
            {
              id: uid('al'),
              kidId: kid.id,
              pence: quest.pence,
              kind: 'earned',
              submissionId: submission.id,
              note: quest.title,
              at: Date.now(),
            },
          ],
        }
      }

      next = queueRpc(next, 'approve_submission', {
        p_submission_id: action.submissionId,
        p_xp: xp,
        p_coins: coins,
        p_note: action.note || '',
        p_sticker: STICKER_MAP[action.sticker] ? action.sticker : null,
        // The streak moves on the family's day, not the server's.
        p_tz: deviceZone(),
      })

      next = queueNotice(next, {
        role: 'kid',
        kidId: kid.id,
        kind: 'approved',
        ref: action.submissionId,
        args: [quest.title, xp],
      })


      // The approval spent a streak freeze to cover yesterday; see bumpStreak.
      const spent = (kid.streak.freezeTokens || 0) - (next.kids.find((k) => k.id === kid.id)?.streak.freezeTokens || 0)
      if (spent > 0) next = logEvent(next, { type: 'streak_freeze', kidId: kid.id })

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
        ref: submission.id,
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

    /** The provider has moved these into the outbox; `keep` are the ones it could not. */
    case 'DRAIN_SYNC_QUEUE': {
      const keep = action.keep || []
      // Nothing could be saved: leave the state alone. A new array here made
      // the provider try again at once, hundreds of times a second, while
      // storage was full; the timed RETRY_SYNC_QUEUE does the retrying.
      const queue = state.syncQueue || []
      if (keep.length && keep.length === queue.length && keep.every((item, i) => item === queue[i])) return state
      return { ...state, syncQueue: keep }
    }

    /** Try the ones storage refused again. A new array is what makes the provider look. */
    case 'RETRY_SYNC_QUEUE':
      return state.syncQueue?.length ? { ...state, syncQueue: [...state.syncQueue] } : state

    /**
     * The server turned down something this phone had already shown as done.
     *
     * Put the phone's own picture back the way it was, as far as it can be
     * known here, and say so. The engine also fetches the whole family again,
     * which puts right anything this cannot (the server's balances, a quest's
     * real status).
     */
    case 'RPC_REFUSED': {
      const { fn, args = {}, reason } = action
      // "Already done" is not a refusal: the thing happened, perhaps on the
      // first try whose answer was lost. The fresh pull shows it.
      if (['already_claimed', 'already_safe', 'already_pending', 'repeat'].includes(reason)) return state
      let next = state
      let message = 'Something you did was not accepted by the server, so this phone is being brought up to date.'
      // reject_submission answers 'decided'; approve_submission raises, and its
      // words arrive as the reason. Both mean another phone got there first.
      if (reason === 'decided' || /already decided/.test(reason || '')) {
        message = 'That submission had already been decided on another device.'
      } else if (fn === 'submit_quest') {
        const quest = state.quests.find((q) => q.id === args.p_quest_id)
        next = {
          ...next,
          submissions: next.submissions.filter((sub) => !(sub.id === args.p_submission_id && sub.status === 'pending')),
          quests: next.quests.map((q) => (q.id === args.p_quest_id && q.status === 'submitted' ? { ...q, status: 'assigned' } : q)),
        }
        message = `"${quest?.title || 'A quest'}" was not sent: it was not open on the server. Check it and try again.`
      } else if (fn === 'redeem_reward') {
        const redemption = state.redemptions.find((r) => r.id === args.p_redemption_id)
        next = { ...next, redemptions: next.redemptions.filter((r) => r.id !== args.p_redemption_id) }
        if (redemption) next = mapKid(next, redemption.kidId, (k) => ({ ...k, coins: (k.coins || 0) + (redemption.cost || 0) }))
        const name = `"${redemption?.name || 'A reward'}"`
        // Said as it is: a parent took the reward off the list while this
        // purchase was on its way, or the coins had gone on something else
        // (another phone, a tax) by the time it arrived.
        message = reason === 'reward_gone'
          ? `${name} was taken off the rewards list before your purchase arrived, so nothing was spent and the coins are back.`
          : reason === 'insufficient'
            ? `${name} could not be bought: by the time it reached the server there were not enough coins left. Nothing was spent.`
            : `${name} could not be claimed, so the coins are back.`
      } else if (fn === 'mark_redemption_given') {
        next = {
          ...next,
          redemptions: next.redemptions.map((r) => (r.id === args.p_redemption_id ? { ...r, status: 'requested', givenAt: null } : r)),
        }
      }
      return { ...next, syncNotice: { message, at: Date.now() } }
    }

    case 'CLEAR_SYNC_NOTICE':
      return state.syncNotice ? { ...state, syncNotice: null } : state

    case 'DRAIN_NOTICE_QUEUE':
      return { ...state, noticeQueue: [] }

    /* ---------- rewards ---------- */

    /* ---------- pocket money ---------- */

    /**
     * A parent records handing money over, or adding some from outside the
     * chore list.
     *
     * Applied locally first so the screen answers immediately, and queued for
     * the server, which is the one that decides. When its summary comes back,
     * MERGE_ALLOWANCE replaces all of this with its answer.
     *
     * Over-payment is refused here as well as in the database, and for a
     * better reason than belt and braces: on a phone with no signal the
     * database is not there to refuse it, and a parent would see a pot go
     * negative and stay negative until they next had signal.
     */
    case 'RECORD_MONEY': {
      const { kidId, pence, kind, note } = action
      const kid = state.kids.find((k) => k.id === kidId)
      if (!kid || !Number.isInteger(pence) || pence <= 0) return state
      if (kind !== 'paid' && kind !== 'gift') return state

      const pot = potFor(state, kidId)
      if (kind === 'paid' && pence > pot) return state

      const signed = kind === 'paid' ? -pence : pence
      const next = {
        ...state,
        allowance: [
          ...state.allowance,
          { id: uid('al'), kidId, pence: signed, kind, note: note || '', at: Date.now() },
        ],
      }
      return queueRpc(next, kind === 'paid' ? 'record_payout' : 'record_gift', {
        p_kid_id: kidId,
        p_pence: pence,
        p_note: note || '',
      })
    }

    /**
     * The server's answer, which wins outright.
     *
     * Not a field-by-field merge like MERGE_SNAPSHOT: the ledger is
     * append-only and the database is the only thing allowed to decide what a
     * chore paid, so keeping any local line that the server does not have
     * would be keeping a line that never happened.
     */
    case 'MERGE_ALLOWANCE':
      return {
        ...state,
        allowance: action.entries,
        allowancePots: action.pots,
        // The moment the answer describes, not the moment it arrived: a line
        // written while the request was in flight is still in flight.
        allowanceAt: action.at,
      }

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

    // Reaches the server now. It used to change this phone only, so the next
    // pull put the reward back to "owed" and every other phone said the same.
    case 'FULFIL_REDEMPTION':
      // Already given (a second tap, or another parent's tap that synced in):
      // nothing to send again.
      if (!state.redemptions.some((r) => r.id === action.redemptionId && r.status !== 'given')) return state
      return queueRpc({
        ...state,
        redemptions: state.redemptions.map((r) => (r.id === action.redemptionId ? { ...r, status: 'given', givenAt: Date.now() } : r)),
      }, 'mark_redemption_given', { p_redemption_id: action.redemptionId })

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

    /* ---------- misc ---------- */

    /*
     * The family goal is the family's: it goes to the server, which every
     * other phone pulls it from. It used to stay on the phone that set it, so
     * the other parent and the children never saw it. The server decides
     * where the bar starts by the same rule as here; this is the instant copy.
     */
    case 'SET_FAMILY_GOAL': {
      if (!action.goal) {
        return queueRpc({ ...state, familyGoal: null }, 'set_family_goal', { p_name: null, p_target_xp: null }, 'set_family_goal')
      }
      const name = action.goal.name.trim()
      const targetXp = action.goal.targetXp
      // The same goal edited (a new target, say) keeps what was earned; a new
      // goal starts from where everybody is now.
      const same = state.familyGoal && state.familyGoal.name.trim() === name
      const startXp = same
        ? state.familyGoal.startXp || 0
        : state.kids.reduce((sum, k) => sum + (k.xp || 0), 0)
      const familyGoal = {
        name, targetXp, startXp,
        setAt: same ? state.familyGoal.setAt : Date.now(),
        progress: same ? state.familyGoal.progress || 0 : 0,
        shared: true,
      }
      return queueRpc({ ...state, familyGoal }, 'set_family_goal', { p_name: name, p_target_xp: targetXp }, 'set_family_goal')
    }

    /*
     * A goal set on this phone before goals were shared lives only here. It
     * goes up once, with where it started, and the server takes it only if
     * the family has no goal yet: one set on another phone since stands.
     */
    case 'SHARE_FAMILY_GOAL': {
      const goal = state.familyGoal
      if (!goal || goal.shared || goal.rev != null) return state
      return queueRpc({ ...state, familyGoal: { ...goal, shared: true } }, 'set_family_goal', {
        p_name: goal.name.trim(), p_target_xp: goal.targetXp, p_start_xp: goal.startXp || 0,
      }, 'set_family_goal')
    }

    case 'CLAIM_LOGIN_BONUS': {
      const kid = state.kids.find((k) => k.id === action.kidId)
      const today = dayKey()
      // A day later than today (a zone change) still counts as claimed.
      if (!kid || (kid.lastLoginBonus && kid.lastLoginBonus >= today)) return state
      const coins = 5
      let next = mapKid(state, kid.id, (k) => ({ ...k, coins: k.coins + coins, lastLoginBonus: today }))
      // The zone, so the server stamps the claim with this phone's day rather
      // than UTC's. With UTC, a bonus claimed on a US evening came back dated
      // tomorrow and the phone offered it again.
      next = queueRpc(next, 'claim_login_bonus', { p_kid_id: kid.id, p_coins: coins, p_tz: deviceZone() })
      return logEvent(next, { type: 'login_bonus', kidId: kid.id, meta: { coins } })
    }

    /**
     * Spend a Streak Freeze to keep a run alive.
     *
     * Both numbers this touches — the token count and the last day counted —
     * are the database's to move, which is why the call has to be queued. It
     * changed them here and queued nothing, so the token reappeared and the
     * streak broke again on the next pull, seconds after the child thought
     * they had saved it. The local change stays for the sake of the screen
     * responding at once; use_streak_freeze is what makes it true.
     */
    case 'USE_STREAK_FREEZE': {
      const kid = state.kids.find((k) => k.id === action.kidId)
      if (!kid || kid.streak.freezeTokens < 1) return state
      if (kid.streak.lastDay && kid.streak.lastDay >= dayKey()) return state
      const next = mapKid(state, kid.id, (k) => ({
        ...k,
        streak: { ...k.streak, freezeTokens: k.streak.freezeTokens - 1, lastDay: dayKey() },
      }))
      return logEvent(queueRpc(next, 'use_streak_freeze', { p_kid_id: kid.id, p_tz: deviceZone() }),
        { type: 'streak_freeze', kidId: kid.id })
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
