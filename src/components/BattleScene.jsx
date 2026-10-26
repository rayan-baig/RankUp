import { useEffect, useRef } from 'react'
import { createBattle } from '../lib/battleEngine.js'
import { useApp } from '../state/AppContext.jsx'
import { useStillness } from './Motion.jsx'

/**
 * One battle scene from the Block Craft story, as a 16:9 pixel-art screen.
 *
 * All the drawing is in lib/battleEngine.js; this only gives it a canvas and
 * takes it away again. `playKey` restarts the scene when it changes, which
 * is how the Replay button works without the engine knowing about React.
 */
export default function BattleScene({ chapter, fight, playKey = 0, onWon, onEvent, label }) {
  const { state } = useApp()
  const still = useStillness() || Boolean(state.settings.reduceMotion)
  const canvas = useRef(null)
  // Callbacks through a ref, so a parent re-rendering does not restart the fight.
  const calls = useRef({ onWon, onEvent })
  calls.current = { onWon, onEvent }

  useEffect(() => {
    if (!canvas.current) return undefined
    const battle = createBattle(canvas.current, {
      chapter,
      fight,
      reducedMotion: still,
      onWon: () => calls.current.onWon?.(),
      onEvent: (e) => calls.current.onEvent?.(e),
    })
    return () => battle.destroy()
    // `fight` is read once per play on purpose: the replay is of what had
    // happened when the screen opened, not a fight that rewrites itself.
  }, [chapter, playKey, still])

  return (
    <div
      className="relative overflow-hidden"
      style={{ border: '3px solid var(--line)', background: '#000', boxShadow: '4px 4px 0 0 rgb(0 0 0 / 0.45)' }}
    >
      <canvas
        ref={canvas}
        width={256}
        height={144}
        role="img"
        aria-label={label || 'An animated battle scene'}
        className="block w-full h-auto"
        style={{ aspectRatio: '16 / 9', imageRendering: 'pixelated' }}
      />
    </div>
  )
}
