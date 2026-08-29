import { useEffect, useState } from 'react'
import {
  SUPPORTED, permission, enable, disable, getPrefs, iosNeedsInstall,
  pushConfigured, notifyLocally, NOTICES,
} from '../lib/notifications.js'
import { Card, Button, Banner, Toggle, SectionTitle } from './ui.jsx'

/**
 * Turning notifications on, and being honest about what that actually gets you.
 *
 * There are three genuinely different states and the interface says which one
 * you are in, because "notifications are on" would be a lie in two of them:
 * unsupported, on-but-only-while-the-app-is-open, and real background push.
 */
export default function NotificationSettings() {
  const [prefs, setPrefsState] = useState(getPrefs())
  const [perm, setPerm] = useState(permission())
  const [mode, setMode] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPerm(permission())
  }, [prefs.enabled])

  if (!SUPPORTED) {
    return (
      <Card className="mb-4">
        <SectionTitle>Notifications</SectionTitle>
        <Banner tone="warn" icon="🔕" title="This browser cannot show notifications">
          Try Chrome or Safari, or add RankUp to your home screen.
        </Banner>
      </Card>
    )
  }

  const toggle = async (on) => {
    setBusy(true)
    if (on) {
      const result = await enable()
      if (result.ok) {
        setMode(result.mode)
        setPrefsState(getPrefs())
      } else {
        setMode(null)
        setPerm(result.reason)
      }
    } else {
      await disable()
      setMode(null)
      setPrefsState(getPrefs())
    }
    setBusy(false)
  }

  const active = prefs.enabled && perm === 'granted'

  return (
    <Card className="mb-4">
      <SectionTitle>Notifications</SectionTitle>

      {iosNeedsInstall() && (
        <Banner tone="warn" icon="📲" title="Add RankUp to your home screen first">
          iPhones only allow notifications for apps added to the home screen. Tap Share, then
          "Add to Home Screen", then come back here.
        </Banner>
      )}

      <div className={iosNeedsInstall() ? 'opacity-50 pointer-events-none mt-3' : 'mt-1'}>
        <Toggle
          checked={active}
          onChange={toggle}
          label={busy ? 'Working…' : 'Tell me when something happens'}
          hint="A kid finishing a quest, and a parent approving or sending one back."
        />
      </div>

      {perm === 'denied' && (
        <Banner tone="bad" icon="🚫" title="Notifications are blocked">
          Your browser is blocking them for this site. You will need to allow them in its site
          settings — the app cannot ask again once you have said no.
        </Banner>
      )}

      {active && (
        <div className="mt-3">
          {pushConfigured() && mode === 'push' ? (
            <Banner tone="good" icon="🔔" title="On, even when the app is closed">
              Notifications will reach this device in the background.
            </Banner>
          ) : (
            <Banner tone="info" icon="🔔" title="On while RankUp is open">
              Background delivery needs push keys on the server. Until then you will only see
              these while the app is running — see docs/NOTIFICATIONS.md.
            </Banner>
          )}

          <Button
            variant="soft"
            className="w-full mt-3"
            onClick={() => notifyLocally(NOTICES.submission('Someone', 'a test quest'))}
          >
            Send me a test notification
          </Button>
        </div>
      )}
    </Card>
  )
}
