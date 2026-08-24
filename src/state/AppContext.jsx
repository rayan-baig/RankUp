import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import { reducer, isElite, guildCapacity, activeLockout } from './reducer.js'
import { createInitialState, TIERS } from './initialState.js'
import { loadState, saveState, clearState } from '../lib/storage.js'
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

  // Debounced save: writing on every keystroke would be wasteful.
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveState(state), 250)
    return () => clearTimeout(saveTimer.current)
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
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
  return state.kids.find((k) => k.id === id) || null
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

export { isElite, guildCapacity, activeLockout, clearState }
