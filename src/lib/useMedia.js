import { useEffect, useState } from 'react'

/**
 * True while the window matches a media query, kept up to date as it is
 * resized. For a layout that has to put a piece in a different place, not
 * just style it differently: the parent dashboard on a computer, a child's
 * world art beside their frame.
 */
export function useMedia(query) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches))
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return undefined
    setOn(mq.matches)
    const onChange = (e) => setOn(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [query])
  return on
}

/**
 * True while the page's root carries data-<name>="on" (0.33.0: "pilotOpen",
 * set by src/pilot/pilotRankUp.js while Pilot's chat is open), kept up to
 * date. On a computer Pilot's chat is docked at the right and the page moves
 * over for it (styles/index.css), so a layout with less room can follow.
 */
export function useRootFlag(name) {
  const read = () => typeof document !== 'undefined' && document.documentElement?.dataset?.[name] === 'on'
  const [on, setOn] = useState(read)
  useEffect(() => {
    if (typeof MutationObserver !== 'function') return undefined
    const attr = `data-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
    const mo = new MutationObserver(() => setOn(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: [attr] })
    setOn(read())
    return () => mo.disconnect()
  }, [name])
  return on
}
