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
