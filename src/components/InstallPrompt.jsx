import { useEffect, useState } from 'react'
import { Card, Button } from './ui.jsx'
import Logo from './Logo.jsx'
import { useApp } from '../state/AppContext.jsx'
import {
  installCard, onInstallEvent, savedInstallEvent, spendInstallEvent, rememberInstallAnswered,
} from '../lib/installPrompt.js'

/**
 * Getting RankUp onto the home screen: its own icon, no browser around it,
 * and on an iPhone the only way notifications can work at all.
 *
 * When and where it shows is decided in src/lib/installPrompt.js: on the
 * parent's dashboard, after the family's first accepted chore, never on a
 * child's phone or while a child is playing, and once. Chrome on Android gets
 * a button that opens its own install prompt; iPhone Safari, which has no
 * such prompt, gets the two steps in words.
 */
export default function InstallPrompt() {
  const { state } = useApp()
  const [event, setEvent] = useState(savedInstallEvent)
  const [answered, setAnswered] = useState(false)

  useEffect(() => onInstallEvent(setEvent), [])

  if (answered) return null
  const card = installCard(state, { event })
  if (!card) return null

  const done = () => {
    rememberInstallAnswered()
    setAnswered(true)
  }

  return (
    <Card className="mb-3 flex items-start gap-3" style={{ borderColor: 'var(--accent)' }} data-testid="install-prompt" data-kind={card}>
      <Logo size={40} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm mb-0.5">Add RankUp to your Home Screen</p>
        {card === 'install' ? (
          <>
            <p className="text-xs text-muted mb-2">
              Your first chore is done. Open RankUp from its own icon next time, like any other app.
            </p>
            <div className="flex gap-2">
              <Button
                className="px-3 py-2 min-h-0 text-xs"
                onClick={async () => {
                  const saved = event
                  spendInstallEvent()
                  done()
                  try {
                    await saved.prompt()
                    // Either answer ends it: accepted installs, dismissed means
                    // asked and answered. The saved event works once anyway.
                    await saved.userChoice
                  } catch { /* the browser said no to asking; nothing to do */ }
                }}
              >
                Install
              </Button>
              <Button variant="ghost" className="px-3 py-2 min-h-0 text-xs" onClick={done}>
                Not now
              </Button>
            </div>
          </>
        ) : (
          <>
            <ol className="text-xs text-muted mb-2 list-decimal pl-4 space-y-0.5">
              <li>Tap <strong>Share</strong> <span aria-hidden="true">(the square with an arrow)</span> in Safari.</li>
              <li>Tap <strong>Add to Home Screen</strong>.</li>
            </ol>
            <p className="text-xs text-muted mb-2">On an iPhone that is also how notifications reach you.</p>
            <Button variant="ghost" className="px-3 py-2 min-h-0 text-xs" onClick={done}>
              Got it
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
