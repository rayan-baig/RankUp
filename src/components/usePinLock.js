import { useEffect, useState } from 'react'
import { pinLockedFor, tryPin, lockMessage, wrongMessage } from '../lib/parentPin.js'

/**
 * A PIN box's side of the wrong-try limit (lib/parentPin.js): one try at a
 * time, the wait while it is locked, counting down once a second, and the
 * words to show. Every PIN box uses it, so they share one count.
 */
export function usePinLock() {
  const [wait, setWait] = useState(() => pinLockedFor())
  const locked = wait > 0
  useEffect(() => {
    if (!locked) return undefined
    const t = setInterval(() => setWait(pinLockedFor()), 1000)
    return () => clearInterval(t)
  }, [locked])

  /** 'ok' | 'wrong' | 'locked', with the words for the last two. */
  const attempt = (family, typed) => {
    const r = tryPin(family, typed)
    setWait(r.wait)
    return { ...r, message: r.result === 'locked' ? lockMessage(r.wait) : r.result === 'wrong' ? wrongMessage() : '' }
  }

  return { locked, wait, attempt, lockText: locked ? lockMessage(wait) : '' }
}
