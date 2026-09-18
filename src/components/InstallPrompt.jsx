import { useEffect, useState } from 'react'
import { Card, Button } from './ui.jsx'
import Logo from './Logo.jsx'

/**
 * Getting RankUp onto the home screen.
 *
 * This is the whole difference between "a website my mum bookmarked" and
 * something that behaves like an app: its own icon, no browser chrome, opens
 * full screen, and — on iOS — it is the ONLY way notifications are allowed to
 * work at all. Nothing here was being offered, so almost nobody would have
 * found it.
 *
 * The two platforms need opposite things. Chrome and Edge fire
 * `beforeinstallprompt`, which can be saved and replayed from a button of our
 * own. Safari fires nothing and has no API, so the only honest thing is to
 * describe where the button is.
 *
 * It asks once. A parent who says no is not asked again on that device, and
 * an app already installed never asks — a banner begging you to install
 * something you already installed is the reason people distrust these.
 */
const DISMISSED = 'rankup.install.dismissed.v1'

function isStandalone() {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone,
  )
}

const isIos = () => typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent)

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED) === '1' } catch { return false }
  })
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = (e) => {
      // Chrome shows its own mini-bar unless this is prevented, and that bar
      // appears at the worst moment. Saved and replayed from our own button.
      e.preventDefault()
      setDeferred(e)
    }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const hide = () => {
    setDismissed(true)
    try { localStorage.setItem(DISMISSED, '1') } catch { /* private mode */ }
  }

  if (installed || dismissed) return null
  // Nothing to offer: a browser that never fired the event and is not iOS
  // cannot install, and a card describing something impossible is worse than
  // no card.
  if (!deferred && !isIos()) return null

  return (
    <Card className="mb-3 flex items-start gap-3" style={{ borderColor: 'var(--accent)' }}>
      <Logo size={40} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm mb-0.5">Put RankUp on your home screen</p>
        {deferred ? (
          <>
            <p className="text-xs text-muted mb-2">
              It opens full screen with its own icon, like any other app.
            </p>
            <div className="flex gap-2">
              <Button
                className="px-3 py-2 min-h-0 text-xs"
                onClick={async () => {
                  deferred.prompt()
                  // Either answer ends it: accepted installs, dismissed means
                  // asked and answered. The saved event is single-use anyway.
                  await deferred.userChoice.catch(() => {})
                  setDeferred(null)
                  hide()
                }}
              >
                Install
              </Button>
              <Button variant="ghost" className="px-3 py-2 min-h-0 text-xs" onClick={hide}>
                Not now
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted mb-2">
              Tap <strong>Share</strong> at the bottom of Safari, then{' '}
              <strong>Add to Home Screen</strong>. On an iPhone that is also the only way
              notifications can reach you.
            </p>
            <Button variant="ghost" className="px-3 py-2 min-h-0 text-xs" onClick={hide}>
              Got it
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
