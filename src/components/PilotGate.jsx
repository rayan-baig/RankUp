import { useLayoutEffect } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { useRoute } from '../lib/router.js'
import { updatePilot, markKidScreen, markParentScreen } from '../lib/pilotGate.js'

/**
 * Tells Pilot (lib/pilotGate.js) where the app is, on every render. A layout
 * effect, so leaving Parent Mode takes the robot away before the child's
 * screen is ever painted. Renders nothing.
 */
export default function PilotGate() {
  const { state, dispatch } = useApp()
  const { path: route } = useRoute()
  useLayoutEffect(() => { updatePilot({ state, dispatch, route }) }, [state, dispatch, route])
  return null
}

/** For a screen a child uses: Pilot stays away while it is open. */
export function useKidHere() {
  useLayoutEffect(() => {
    markKidScreen(1)
    return () => markKidScreen(-1)
  }, [])
}

/**
 * For a parent's own set-up screen, after "I'm a parent": the only place a
 * signed-out phone shows Pilot. The front door, where nobody has said yet
 * who is holding the phone, never does.
 */
export function useParentHere(on = true) {
  useLayoutEffect(() => {
    if (!on) return undefined
    markParentScreen(1)
    return () => markParentScreen(-1)
  }, [on])
}
