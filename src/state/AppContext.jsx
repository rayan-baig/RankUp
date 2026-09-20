import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { reducer, isElite, guildCapacity, activeLockout } from './reducer.js'
import { createInitialState, TIERS } from './initialState.js'
import { loadState, saveState, clearState, purgeOrphanPhotos, getPhoto, putPhoto } from '../lib/storage.js'
import { createSyncEngine, SYNC_STATUS } from '../lib/sync/syncEngine.js'
import { queueChanges, recordServerState } from '../lib/sync/shadow.js'
import { enqueue as enqueueOp } from '../lib/sync/outbox.js'
import { transport } from '../lib/sync/transport.js'
import { NOTICES, notifyLocally, notifyRemote, getPrefs as notificationPrefs } from '../lib/notifications.js'
import { resolveKidTheme } from '../data/kidThemes.js'
import { resolveParentTheme } from '../data/parentThemes.js'
import { levelFromXp } from '../lib/xp.js'
import { dayOf } from '../lib/recurrence.js'

const AppContext = createContext(null)

function init() {
  const saved = loadState()
  if (!saved) return createInitialState()
  // Merge onto a fresh state so a new field added in a later version never
  // crashes an app that is loading data saved by an older version.
  return { ...createInitialState(), ...saved, settings: { ...createInitialState().settings, ...saved.settings } }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  const saveTimer = useRef(null)
  const engineRef = useRef(null)
  /**
   * The row ids the last pull actually delivered.
   *
   * This used to be a single boolean, and a boolean cannot tell the difference
   * between "this state came from the server" and "this state came from the
   * server AND has a local edit in it". Any change made in the same 250ms
   * debounce window as a pull was written into the shadow as already-synced and
   * therefore never sent — and never sent again, because a matching shadow
   * entry suppresses all future attempts. Pulls run every 8-20 seconds, so this
   * was routine, permanent, and silent.
   *
   * A set of ids fixes it: only what the server actually sent is recorded as
   * the server's, and everything else still goes through queueChanges.
   */
  const mergedIds = useRef(new Set())
  const [sync, setSync] = useState({
    status: transport.isConfigured() ? SYNC_STATUS.IDLE : SYNC_STATUS.DISABLED,
    error: null,
    pending: 0,
  })

  // One engine for the life of the app.
  if (!engineRef.current) {
    engineRef.current = createSyncEngine({
      dispatch: (action) => {
        // Rows arriving FROM the server must not be queued straight back to it.
        // Remember exactly which ones, so a local change that happens to be in
        // flight at the same moment is not mistaken for one of them.
        if (action?.type === 'MERGE_SNAPSHOT') {
          for (const [table, rows] of Object.entries(action.snapshot || {})) {
            if (!Array.isArray(rows)) continue
            for (const row of rows) {
              if (row?.id) mergedIds.current.add(`${table}:${row.id}`)
            }
          }
        }
        dispatch(action)
      },
      onStatus: setSync,
    })
  }

  useEffect(() => {
    const engine = engineRef.current
    engine.start()
    return () => engine.stop()
  }, [])

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
    dispatch({ type: 'RETURN_RECURRING', today: dayOf(new Date()) })
  }, [state.quests])

  // And a phone left open overnight — a tablet on a kitchen counter is the
  // normal case — has to notice the date turning over on its own.
  useEffect(() => {
    let today = dayOf(new Date())
    const timer = setInterval(() => {
      const now = dayOf(new Date())
      if (now === today) return
      today = now
      dispatch({ type: 'RETURN_RECURRING', today: now })
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

  /**
   * Fetch the proof photos this device needs, once each.
   *
   * The parent is being asked to approve a picture, so they have to be able to
   * see it. It used to ride along inside the submission row on every sync —
   * which meant the child's own phone was sent back the photograph it had just
   * taken, and the parent's phone was sent it two or three times over, because
   * the cursor deliberately lags so nothing committed late is stepped over. At
   * 80KB of base64 that was 96% of the payload, delivered about five times to
   * be looked at once.
   *
   * Now the snapshot carries a flag and this fetches the picture itself: only
   * on a device that does not already have it, only once, and only for a
   * submission still waiting to be decided — approving or sending back
   * destroys the image, so there is never anything to fetch for a finished one.
   */
  const photoAsked = useRef(new Set())

  useEffect(() => {
    // A device that took the photo already holds it under its own photoId, so
    // it matches nothing here and never asks for anything.
    const wanted = (state.submissions || []).filter(
      (s) => s.hasPhoto && !s.photoId && !s.photoData && s.status === 'pending' && !photoAsked.current.has(s.id),
    )
    // The submitting device's own row still carries the image for the moment
    // between capture and the photo store, so that path is kept as it was.
    const carried = (state.submissions || []).filter((s) => s.photoData && !s.photoId)

    if (carried.length) {
      dispatch({
        type: 'ATTACH_SYNCED_PHOTOS',
        photos: carried.map((s) => {
          const photoId = `photo_${s.id}`
          putPhoto(photoId, s.photoData)
          return { submissionId: s.id, photoId }
        }),
      })
    }

    if (!wanted.length || !transport.isConfigured()) return
    // Marked before the request, not after: two renders in the same tick would
    // otherwise both fire, and a photo is the most expensive thing to ask for
    // twice.
    wanted.forEach((s) => photoAsked.current.add(s.id))

    let cancelled = false
    ;(async () => {
      const photos = []
      for (const submission of wanted) {
        try {
          const data = await transport.rpc('submission_photo', { p_submission_id: submission.id })
          if (!data) continue
          const photoId = `photo_${submission.id}`
          if (putPhoto(photoId, data)) photos.push({ submissionId: submission.id, photoId })
        } catch (err) {
          // Let it be asked for again on the next pull: a photo that cannot be
          // fetched is a parent staring at a review screen with nothing on it.
          photoAsked.current.delete(submission.id)
          console.warn('[RankUp] Could not fetch a proof photo:', err.message)
        }
      }
      if (!cancelled && photos.length) dispatch({ type: 'ATTACH_SYNCED_PHOTOS', photos })
    })()

    return () => { cancelled = true }
  }, [state.submissions])

  // Move any server calls the reducer asked for into the outbox.
  useEffect(() => {
    if (!state.syncQueue?.length) return
    if (transport.isConfigured()) {
      state.syncQueue.forEach(({ fn, args }) => enqueueOp({ type: 'rpc', fn, args }))
      engineRef.current?.wake()
    }
    dispatch({ type: 'DRAIN_SYNC_QUEUE' })
  }, [state.syncQueue])

  /**
   * Send the notifications the reducer asked for.
   *
   * Local first, because that works with no keys and no server and is what most
   * people will actually have. Then the remote push, which reaches the other
   * device when the app is closed — the case that matters for a parent who
   * needs to review something.
   */
  useEffect(() => {
    if (!state.noticeQueue?.length) return
    const queue = state.noticeQueue
    dispatch({ type: 'DRAIN_NOTICE_QUEUE' })

    if (!notificationPrefs().enabled) return
    queue.forEach((notice) => {
      const payload = NOTICES[notice.kind]?.(...(notice.args || []))
      if (!payload) return
      // Do not buzz the device that caused it — only the other side.
      const forThisDevice =
        (notice.role === 'parent' && state.device?.role !== 'kid') ||
        (notice.role === 'kid' && state.device?.role === 'kid')
      if (!forThisDevice) notifyLocally(payload)
      // The words are the server's to write — see api/send-push.js. This only
      // says which notice it is, so a device cannot put its own sentence on
      // somebody else's lock screen.
      notifyRemote({
        familyId: state.family.id,
        role: notice.role,
        kidId: notice.kidId,
        kind: notice.kind,
        args: notice.args || [],
      })
    })
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
      const now = new Date()
      const today = now.toISOString().slice(0, 10)
      const minutes = now.getHours() * 60 + now.getMinutes()
      let fired = {}
      try { fired = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') } catch { fired = {} }

      let changed = false
      for (const reminder of state.settings.reminders || []) {
        if (!reminder.on) continue
        const [h, m] = (reminder.time || '00:00').split(':').map(Number)
        const due = h * 60 + m
        // Fire if the time has passed today, but not if it is hours stale —
        // opening the app at 9pm should not replay the morning reminder.
        if (minutes < due || minutes - due > 90) continue
        if (fired[reminder.id] === today) continue
        notifyLocally(NOTICES.reminder(reminder.label))
        fired[reminder.id] = today
        changed = true
      }
      if (changed) localStorage.setItem(FIRED_KEY, JSON.stringify(fired))
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
    if (!transport.isConfigured()) return undefined
    const t = setTimeout(() => engineRef.current?.sync({ silent: true }), 1200)
    return () => clearTimeout(t)
  }, [state.quests, state.submissions, state.kids, state.syncQueue])

  // Debounced save: writing on every keystroke would be wasteful.
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveState(state)
      // Drop photos nothing points at any more — see purgeOrphanPhotos.
      purgeOrphanPhotos(state)

      if (transport.isConfigured()) {
        const photoFor = (submission) => (submission.photoId ? getPhoto(submission.photoId) : null)
        // Rows the server just sent are recorded as the server's...
        if (mergedIds.current.size > 0) {
          recordServerState(state, { photoFor, only: mergedIds.current })
          mergedIds.current = new Set()
        }
        // ...and everything else still goes out. This runs on every save now,
        // not only on saves that had no pull in them, which is what stops a
        // local edit disappearing into a merge.
        //
        // Anything queued should go now rather than wait out the idle backoff —
        // the poll slows down precisely because nothing is happening, and this
        // is something happening.
        if (queueChanges(state, { photoFor, role: state.device?.role }) > 0) {
          engineRef.current?.wake()
        }
      }
    }, 250)
    return () => clearTimeout(saveTimer.current)
  }, [state])

  const value = useMemo(
    () => ({ state, dispatch, sync, syncNow: () => engineRef.current?.sync() }),
    [state, sync],
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
  const kid = useKid(kidId)
  if (!kid) return resolveKidTheme(undefined, 1)
  const { level } = levelFromXp(kid.xp)
  return resolveKidTheme(kid.themeId, level)
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
