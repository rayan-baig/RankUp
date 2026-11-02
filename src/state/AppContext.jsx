import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, useLayoutEffect } from 'react'
import { reducer, isElite, guildCapacity, activeLockout } from './reducer.js'
import { createInitialState, TIERS } from './initialState.js'
import { buildDemoFamily, DEMO_VERSION } from '../lib/demoFamily.js'
import { loadState, saveState, clearState, dropOldPhotos, wipeDevice } from '../lib/storage.js'
import { createSyncEngine, SYNC_STATUS, resetCursor } from '../lib/sync/syncEngine.js'
import { queueChanges, recordDelivered, pendingRows } from '../lib/sync/shadow.js'
import { enqueue as enqueueOp, readOutbox } from '../lib/sync/outbox.js'
import { transport } from '../lib/sync/transport.js'
import { NOTICES, notifyLocally, notifyRemote, routeNotice, pushConfigured, remindersToFire, getPrefs as notificationPrefs, disable as disableNotifications } from '../lib/notifications.js'
import { resolveKidTheme } from '../data/kidThemes.js'
import { storyProgress } from '../lib/dragonFight.js'
import { resolveParentTheme } from '../data/parentThemes.js'
import { levelFromXp } from '../lib/xp.js'
import { dayOf } from '../lib/recurrence.js'

const AppContext = createContext(null)

/** The phone's own time zone, so "today" on the server is the family's today. */
function localZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/** What an older version's submit_quest carried about a photo, which none now has. */
const OLD_PHOTO_KEYS = ['photo_data', 'photo_hash', 'capture_source', 'ai_verdict', 'ai_score', 'ai_report']
function withoutPhoto(payload) {
  const copy = { ...payload }
  OLD_PHOTO_KEYS.forEach((key) => delete copy[key])
  return copy
}

/** The photo and photo-check fields an older version kept on a submission. */
const OLD_SUBMISSION_FIELDS = ['photoId', 'photoData', 'hasPhoto', 'photoDeletedAt', 'photoUnavailable',
  'hash', 'captureSource', 'report']
function forgetPhotos(saved) {
  if (!Array.isArray(saved.submissions)) return saved
  return {
    ...saved,
    submissions: saved.submissions.map((s) => {
      if (!s || !OLD_SUBMISSION_FIELDS.some((key) => key in s)) return s
      const copy = { ...s }
      OLD_SUBMISSION_FIELDS.forEach((key) => delete copy[key])
      return copy
    }),
  }
}

function init() {
  /*
   * RankUp takes no photos. A phone that ran an older version may still hold
   * proof pictures, and photo-check verdicts on its submissions: both go the
   * first time this version starts, rather than sitting on the phone for ever.
   */
  dropOldPhotos()
  const loaded = loadState()
  if (!loaded) return createInitialState()
  const saved = forgetPhotos(loaded)

  /*
   * A saved look-around is rebuilt when it is out of date, and otherwise
   * restored like anything else.
   *
   * The demo family is disposable by definition, and a visitor who opened
   * it once must not keep that exact copy for ever: a new theme, a new
   * game, a changed screen, none of it would reach them and from their
   * side the app simply had not changed.
   *
   * But rebuilding on EVERY load is the opposite mistake, and it is worse,
   * because it is the one the visitor can see. Everything they did in the
   * demo vanished on the next load — pick a theme, reload, back to the
   * default. The version stamp draws the line in the right place: stale
   * demos are replaced, a demo of the current build is left alone.
   */
  if (saved.demo && saved.demoVersion !== DEMO_VERSION) return buildDemoFamily()

  // Merge onto a fresh state so a new field added in a later version never
  // crashes an app that is loading data saved by an older version.
  return { ...createInitialState(), ...saved, settings: { ...createInitialState().settings, ...saved.settings } }
}

export function AppProvider({ children }) {
/**
 * Does this installation talk to a server?
 *
 * A backend being configured is not enough on its own, for two reasons that a
 * test caught rather than a review.
 *
 * The look-around family is not signed in to anything and its rows belong to
 * nobody, so every one of them would be refused — and worse, a visitor who
 * liked it and then made a real account would find a stranger's children
 * queued up to upload into their household.
 *
 * And nothing at all should be polled before setup is finished. A visitor
 * standing on the welcome screen was firing family_snapshot every fifteen
 * seconds at a server with no account to answer for. The kid's pairing screen
 * is the one thing that runs before onboarding and it watches its code itself,
 * so nothing here depends on the engine being up.
 *
 * One function, asked everywhere, rather than a condition each effect has to
 * remember.
 */
const syncs = (state) =>
  transport.isConfigured() && !state.demo && state.onboarded

  const [state, dispatch] = useReducer(reducer, undefined, init)
  const saveTimer = useRef(null)
  const engineRef = useRef(null)
  /** The state as last rendered, for the engine, which lives outside React. */
  const latest = useRef(state)
  latest.current = state
  /** The last save to this phone's storage failed (it is full). See StorageFullBanner. */
  const [storageFull, setStorageFull] = useState(false)
  const [sync, setSync] = useState({
    status: transport.isConfigured() ? SYNC_STATUS.IDLE : SYNC_STATUS.DISABLED,
    error: null,
    pending: 0,
  })

  // One engine for the life of the app.
  if (!engineRef.current) {
    engineRef.current = createSyncEngine({
      dispatch: (action) => {
        /*
         * A pull landing next to a local edit.
         *
         * Three steps, in this order, before the merge:
         *   1. Queue any edit that is still waiting for the debounced save, so
         *      it is in the outbox rather than only in memory.
         *   2. Note every row with a change of ours still waiting to go. The
         *      merge leaves those alone: the server's copy is the older one.
         *   3. Record what the server sent as the server's, from the rows it
         *      sent rather than from the state a moment later.
         * Before, a pull arriving within a quarter second of an edit wrote the
         * server's old row over it, and recorded the result as synced, so the
         * edit was gone on this phone and never sent. Lifting a lockdown as a
         * pull landed left the child locked out.
         */
        if (action?.type === 'MERGE_SNAPSHOT') {
          const current = latest.current
          let pending = new Set()
          if (syncs(current)) {
            queueChanges(current, { role: current.device?.role })
            pending = pendingRows(readOutbox(), current)
            recordDelivered(current, action.snapshot, { skip: pending })
          }
          dispatch({ ...action, pending: [...pending] })
          return
        }
        dispatch(action)
      },
      onStatus: setSync,
      // The server said no. Undo what this phone showed, and fetch the
      // family afresh so everything else it touched is put right too.
      onRefused: (refusal) => {
        dispatch({ type: 'RPC_REFUSED', ...refusal })
        resetCursor()
      },
      // A submission queued by an older version may still carry a picture
      // and the photo check's verdict: they are dropped here, before they can
      // leave the phone. The server would ignore them; the picture should
      // never cross the network at all.
      prepare: async (op) => (op.fn === 'submit_quest' && op.args?.p_payload
        ? { ...op.args, p_payload: withoutPhoto(op.args.p_payload) }
        : op.args),
      /*
       * The server says this signed-in phone is in no family. A child's phone
       * that was paired (so it was unlinked, or its child deleted), or a
       * parent's that had a family (so they were removed from it, or it was
       * deleted): erased, sign-in and all. A phone that never had a family —
       * a supporter's, or one still being set up — is left alone.
       */
      onNoFamily: () => {
        const s = latest.current
        const pairedKid = s.device?.role === 'kid' && Boolean(s.device?.pairedAt)
        const formerParent = s.device?.role !== 'kid' && s.onboarded && !s.demo && Boolean(s.lastSyncedAt)
        if (!pairedKid && !formerParent) return
        engineRef.current?.stop()
        disableNotifications().catch(() => {})
        wipeDevice()
        transport.signOut()
        dispatch({ type: 'DEVICE_WIPED', reason: pairedKid ? 'unlinked' : 'removed' })
        window.location.hash = '/'
      },
      // A push to the family's other phones, sent from the outbox in its turn.
      // Not reaching the server is worth another try; any answer from it is
      // final, because a push that cannot be sent must never hold up the
      // family's chores behind it.
      sendNotice: async (notice) => {
        const result = await notifyRemote(notice)
        if (result.reason === 'network' || result.reason === 'signed_out') {
          const err = new Error('The notice could not be sent yet.')
          err.retryable = true
          err.auth = result.reason === 'signed_out'
          throw err
        }
        return result
      },
    })
  }

  /*
   * The engine itself, stopped for the look-around.
   *
   * Gating the individual effects is not enough: the engine polls on its own
   * timer, and a demo visitor would generate a failing request every fifteen
   * seconds for as long as they browsed. It restarts when they leave the demo
   * and make a real family, because `state.demo` goes false and this runs
   * again.
   */
  /*
   * The switch at the door, flipped before anything else can fire.
   *
   * A layout effect rather than an ordinary one: children of this provider run
   * their own mount effects, and several of them fetch. Left until after
   * paint, the demo would have made two requests before this ran.
   */
  useLayoutEffect(() => {
    transport.pauseNetwork(Boolean(state.demo))
  }, [state.demo])

  const syncing = syncs(state)
  useEffect(() => {
    if (!syncing) return undefined
    const engine = engineRef.current
    engine.start()
    return () => engine.stop()
  }, [syncing])

  /**
   * Bring back the repeating chores that are due, and keep watching the clock.
   *
   * A phone left open overnight is the normal case for a tablet on a kitchen
   * counter, so this cannot only run at start-up — it checks every minute for
   * the date rolling over. The reducer refuses when nothing is due, so the
   * check is free on all but one tick a day.
   */
  // Checked whenever the quest list changes, because on a fresh device the list
  // arrives from the server AFTER start-up — anything due while the app was
  // closed would otherwise wait for the next midnight. The reducer returns the
  // same state when nothing is due, so this settles immediately rather than
  // chasing its own tail.
  useEffect(() => {
    dispatch({ type: 'RETURN_RECURRING', today: dayOf(new Date()), tz: localZone() })
  }, [state.quests])

  // And a phone left open overnight — a tablet on a kitchen counter is the
  // normal case — has to notice the date turning over on its own.
  useEffect(() => {
    let today = dayOf(new Date())
    const timer = setInterval(() => {
      const now = dayOf(new Date())
      if (now === today) return
      today = now
      dispatch({ type: 'RETURN_RECURRING', today: now, tz: localZone() })
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  // The moment a kid's device is linked, it is holding nothing: no quests, no
  // XP, no rewards. Waiting out the ordinary eight-second poll there means the
  // child's first sight of the app is an empty screen, so pull immediately.
  useEffect(() => {
    if (!state.device?.pairedAt) return
    engineRef.current?.sync()
  }, [state.device?.pairedAt])

  /*
   * Move any server calls the reducer asked for into the outbox.
   *
   * Only the ones that actually made it in leave the queue. The outbox lives in
   * localStorage, which fills up, and when it
   * refused the write this used to drain the queue anyway: a child's chore
   * submission vanished while their phone said "waiting for approval" for
   * ever, and could not be sent again because one was already waiting.
   *
   */
  const queueRetry = useRef(null)
  useEffect(() => {
    if (!state.syncQueue?.length) return undefined
    if (!syncs(state)) {
      dispatch({ type: 'DRAIN_SYNC_QUEUE' })
      return undefined
    }
    const left = []
    for (const item of state.syncQueue) {
      const { fn, args, foldKey } = item
      const op = foldKey ? { type: 'rpc', fn, args, foldKey } : { type: 'rpc', fn, args }
      if (!enqueueOp(op)) left.push(item)
    }
    if (left.length < state.syncQueue.length) engineRef.current?.wake()
    dispatch({ type: 'DRAIN_SYNC_QUEUE', keep: left })
    if (!left.length) return undefined
    setStorageFull(true)
    console.warn(`[RankUp] ${left.length} change(s) could not be saved for sending yet (storage is full); retrying.`)
    clearTimeout(queueRetry.current)
    queueRetry.current = setTimeout(() => dispatch({ type: 'RETRY_SYNC_QUEUE' }), 15000)
    return () => clearTimeout(queueRetry.current)
  }, [state.syncQueue])

  // A family goal set before goals were shared goes up once (SHARE_FAMILY_GOAL).
  const goal = state.familyGoal
  const unsharedGoal = syncing && state.device?.role !== 'kid' && goal && !goal.shared && goal.rev == null
  useEffect(() => {
    if (unsharedGoal) dispatch({ type: 'SHARE_FAMILY_GOAL' })
  }, [unsharedGoal])

  /**
   * Send the notifications the reducer asked for.
   *
   * Local first, because that works with no keys and no server and is what most
   * people will actually have. Then the remote push, which reaches the other
   * device when the app is closed — the case that matters for a parent who
   * needs to review something.
   *
   * The push goes into the outbox, behind the change it is about, rather than
   * straight out. Sent on the spot, a child tapping "I did it!" with no signal
   * lost the notice for good while the chore itself went up later, so the
   * parent was never told; and even with signal, the push could reach the
   * parent before the chore did, so tapping it showed nothing to review.
   */
  useEffect(() => {
    if (!state.noticeQueue?.length) return
    const queue = state.noticeQueue
    dispatch({ type: 'DRAIN_NOTICE_QUEUE' })

    const pushReady = pushConfigured() && syncs(latest.current) && Boolean(state.family.id)
    let queued = 0
    queue.forEach((notice) => {
      const route = routeNotice(notice, {
        deviceRole: state.device?.role,
        showHere: notificationPrefs().enabled,
        pushReady,
      })
      if (route.local) notifyLocally(route.local)
      if (!route.remote) return
      // The words are the server's to write — see api/send-push.js. This only
      // says which notice it is, so a device cannot put its own sentence on
      // somebody else's lock screen.
      const sent = enqueueOp({
        type: 'notice',
        ...(notice.ref ? { ref: notice.ref } : {}),
        notice: {
          familyId: state.family.id,
          role: notice.role,
          kidId: notice.kidId,
          kind: notice.kind,
          args: notice.args || [],
        },
      })
      if (sent) queued += 1
    })
    if (queued) engineRef.current?.wake()
  }, [state.noticeQueue, state.device?.role, state.family.id])

  /**
   * Daily reminders.
   *
   * Checks the clock once a minute and fires each enabled reminder at most once
   * a day. That genuinely works — but only while RankUp is open, which is the
   * honest limit of a reminder with no server behind it. A reminder that arrives
   * with the app closed needs scheduled push; docs/NOTIFICATIONS.md says so and
   * the settings screen says so too.
   */
  useEffect(() => {
    const FIRED_KEY = 'rankup.reminders.fired.v1'
    const check = () => {
      if (!notificationPrefs().enabled) return
      let fired = {}
      try { fired = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') } catch { fired = {} }
      // See remindersToFire: once a day, on this phone's own date.
      const result = remindersToFire(state.settings.reminders, new Date(), fired)
      result.due.forEach((reminder) => notifyLocally(NOTICES.reminder(reminder.label)))
      if (result.due.length) {
        try { localStorage.setItem(FIRED_KEY, JSON.stringify(result.fired)) } catch { /* storage full: worst case, a repeat */ }
      }
    }

    check()
    const t = setInterval(check, 60000)
    return () => clearInterval(t)
  }, [state.settings.reminders])

  /**
   * Push soon after something changes, rather than waiting for the next poll.
   *
   * Without this a parent's approval could sit in the outbox for up to fifteen
   * seconds before leaving the phone, and then wait again for the kid's next
   * poll — half a minute between tapping Approve and the child seeing their XP.
   * The short delay still batches a burst of edits into one round trip.
   */
  useEffect(() => {
    if (!syncs(state)) return undefined
    const t = setTimeout(() => engineRef.current?.sync({ silent: true }), 1200)
    return () => clearTimeout(t)
  }, [state.quests, state.submissions, state.kids, state.syncQueue])

  // Debounced save: writing on every keystroke would be wasteful.
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      // A full phone is told so, rather than losing everything since the last
      // good save without a word. The app keeps going on what is in memory.
      setStorageFull(!saveState(state))
      if (syncs(state)) {
        // Rows the server sent were recorded as the server's when they arrived
        // (see the engine's dispatch above); everything else goes out.
        //
        // Anything queued should go now rather than wait out the idle backoff —
        // the poll slows down precisely because nothing is happening, and this
        // is something happening.
        if (queueChanges(state, { role: state.device?.role }) > 0) {
          engineRef.current?.wake()
        }
      }
    }, 250)
    return () => clearTimeout(saveTimer.current)
  }, [state])

  const value = useMemo(
    () => ({ state, dispatch, sync, storageFull, syncNow: () => engineRef.current?.sync() }),
    [state, sync, storageFull],
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* Selectors — small helpers so screens don't re-derive the same thing */
/* ------------------------------------------------------------------ */

export function useKid(kidId) {
  const { state } = useApp()
  const id = kidId ?? state.session.kidId
  // Fall back to the first kid rather than null. A session pointing at a kid who
  // has since been removed used to render a completely blank screen.
  return state.kids.find((k) => k.id === id) || state.kids[0] || null
}

export function useKidTheme(kidId) {
  const { state } = useApp()
  const kid = useKid(kidId)
  if (!kid) return resolveKidTheme(undefined, 1)
  const { level } = levelFromXp(kid.xp)
  return resolveKidTheme(kid.themeId, level, storyProgress(state, kid))
}

export function useParentTheme() {
  const { state } = useApp()
  return resolveParentTheme(state.family.parentThemeId)
}

export function useTier() {
  const { state } = useApp()
  return TIERS[state.family.tier] || TIERS.standard
}

export function useElite() {
  const { state } = useApp()
  return isElite(state)
}

export function questsForKid(state, kidId) {
  return state.quests.filter((q) => q.kidId === kidId)
}

export function activeQuestsForKid(state, kidId) {
  return questsForKid(state, kidId).filter((q) => q.status === 'assigned' || q.status === 'redo')
}

export function pendingSubmissions(state) {
  return state.submissions.filter((s) => s.status === 'pending').sort((a, b) => a.submittedAt - b.submittedAt)
}

export function kidLevel(kid) {
  return levelFromXp(kid?.xp || 0)
}

/** Sync status for the UI: connected, offline, how much is still queued. */
export function useSync() {
  const { sync, syncNow } = useApp()
  return { ...sync, syncNow, configured: transport.isConfigured() }
}

export { isElite, guildCapacity, activeLockout, clearState, SYNC_STATUS }
