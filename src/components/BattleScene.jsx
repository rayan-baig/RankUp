import { useEffect, useRef } from 'react'
import { createBattle } from '../lib/battleEngine.js'
import { useApp } from '../state/AppContext.jsx'
import { useStillness } from './Motion.jsx'

/**
 * One battle scene from the Block Craft story, as a 16:9 animated screen.
 *
 * The fight is in lib/battleEngine.js and the drawing in lib/battleArt.js;
 * this only gives them a canvas, sized to the screen's real pixels, and
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
    const el = canvas.current
    if (!el) return undefined
    // Drawn at the screen's real pixels, not stretched, so it stays sharp.
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      const w = Math.max(256, Math.round((el.clientWidth || 360) * dpr))
      if (el.width !== w) { el.width = w; el.height = Math.round((w * 9) / 16) }
    }
    size()
    const battle = createBattle(el, {
      chapter,
      fight,
      reducedMotion: still,
      onWon: () => calls.current.onWon?.(),
      onEvent: (e) => calls.current.onEvent?.(e),
    })
    const watch = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { size(); battle.redraw() })
      : null
    watch?.observe(el)
    return () => { watch?.disconnect(); battle.destroy() }
    // `fight` is read once per play on purpose: the replay is of what had
    // happened when the screen opened, not a fight that rewrites itself.
  }, [chapter, playKey, still])

  return (
    <div
      className="relative overflow-hidden"
      style={{ border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--line))', background: '#000', boxShadow: '0 10px 30px -12px rgb(0 0 0 / 0.7)', borderRadius: 14 }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={label || 'An animated battle scene'}
        className="block w-full h-auto"
        style={{ aspectRatio: '16 / 9' }}
      />
    </div>
  )
}
