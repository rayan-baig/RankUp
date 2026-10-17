import { useEffect, useRef } from 'react'

/**
 * The two ways a child steers a game: a finger and, if they have one, a
 * keyboard. Both live here so Snake, 2048 and the slide puzzle do not each
 * invent their own and get one of them subtly wrong.
 */

/** Arrow keys and WASD, for whoever is playing on a laptop. */
export function useArrowKeys(onDir) {
  const ref = useRef(onDir)
  ref.current = onDir
  useEffect(() => {
    const keys = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    }
    const onKey = (e) => {
      const dir = keys[e.key]
      if (!dir) return
      // Otherwise the page scrolls underneath the game on every press.
      e.preventDefault()
      ref.current(dir)
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * Swipe handlers to spread onto the play area.
 *
 * A swipe has to travel a real distance before it counts, or a child resting a
 * thumb on the screen steers the snake into a wall. 24 CSS pixels is about a
 * finger's width and is far enough to be deliberate.
 */
export function swipeHandlers(onDir, min = 24) {
  let from = null
  return {
    style: { touchAction: 'none' },
    onPointerDown: (e) => { from = { x: e.clientX, y: e.clientY } },
    onPointerUp: (e) => {
      if (!from) return
      const dx = e.clientX - from.x
      const dy = e.clientY - from.y
      from = null
      if (Math.abs(dx) < min && Math.abs(dy) < min) return
      // The bigger movement wins, so a diagonal still does something sensible.
      if (Math.abs(dx) > Math.abs(dy)) onDir(dx > 0 ? 'right' : 'left')
      else onDir(dy > 0 ? 'down' : 'up')
    },
    onPointerCancel: () => { from = null },
  }
}

/** A four-way pad, for the games where swiping alone is too fiddly. */
export function DPad({ onDir, label = 'Move' }) {
  const b = (dir, glyph, name) => (
    <button
      type="button"
      aria-label={name}
      onClick={() => onDir(dir)}
      className="btn btn-soft"
      style={{ minHeight: 0, padding: '14px 0', fontSize: 18, lineHeight: 1 }}
    >
      {glyph}
    </button>
  )
  return (
    <div
      className="grid grid-cols-3 gap-2 mx-auto mt-3"
      style={{ maxWidth: 190 }}
      role="group"
      aria-label={label}
    >
      <span />{b('up', '▲', 'Up')}<span />
      {b('left', '◀', 'Left')}<span />{b('right', '▶', 'Right')}
      <span />{b('down', '▼', 'Down')}<span />
    </div>
  )
}
