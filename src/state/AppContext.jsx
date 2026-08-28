import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { reducer, isElite, guildCapacity, activeLockout } from './reducer.js'
import { createInitialState, TIERS } from './initialState.js'
import { loadState, saveState, clearState, purgeOrphanPhotos, getPhoto } from '../lib/storage.js'
import { createSyncEngine, SYNC_STATUS } from '../lib/sync/syncEngine.js'
import { queueChanges, recordServerState } from '../lib/sync/shadow.js'
import { enqueue as enqueueOp } from '../lib/sync/outbox.js'
import { transport } from '../lib/sync/transport.js'
import { resolveKidTheme } from '../data/kidThemes.js'
import { resolveParentTheme } from '../data/parentThemes.js'
import { levelFromXp } from '../lib/xp.js'

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
  const mergingRef = useRef(false)
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
        mergingRef.current = true
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

  // Move any server calls the reducer asked for into the outbox.
  useEffect(() => {
    if (!state.syncQueue?.length) return
    if (transport.isConfigured()) {
      state.syncQueue.forEach(({ fn, args }) => enqueueOp({ type: 'rpc', fn, args }))
    }
    dispatch({ type: 'DRAIN_SYNC_QUEUE' })
  }, [state.syncQueue])

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
        if (mergingRef.current) {
          // This state came from a pull: record it as the server's, do not resend.
          recordServerState(state, { photoFor })
          mergingRef.current = false
        } else {
          queueChanges(state, { photoFor })
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
