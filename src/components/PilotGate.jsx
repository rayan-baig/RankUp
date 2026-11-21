import { useLayoutEffect } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { useRoute } from '../lib/router.js'
import { updatePilot, markKidScreen } from '../lib/pilotGate.js'

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
