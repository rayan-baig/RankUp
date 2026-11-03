import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { resolveKidTheme } from '../data/kidThemes.js'
import { storyProgress } from '../lib/dragonFight.js'
import { levelFromXp } from '../lib/xp.js'
import Avatar from '../components/Avatar.jsx'
import { Card, Button, TextInput } from '../components/ui.jsx'
import { navigate, afterUnlock } from '../lib/router.js'
import Logo from '../components/Logo.jsx'
import PinReset from '../components/PinReset.jsx'

/**
 * Who is holding the phone?
 *
 * With no accounts yet, this is a profile switcher rather than a login. Parent
 * Mode is behind the PIN so a kid cannot approve their own quests — which is
 * the one piece of access control this build genuinely needs.
 */
export default function RoleSwitch() {
  const { state, dispatch } = useApp()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState(false)
  const needsPin = !(state.demo || !state.family.pin)

  const openParent = () => {
    /*
     * No PIN in the look-around.
     *
     * The demo family has one, because a real family does and the screen
     * should look like the real thing. But a visitor was never given it, so
     * the lock stopped people at the most important door in the app — the
     * parent side is where the product actually is. Being shut out by a
     * four-digit code nobody told you is not a feature demonstration, it is
     * a dead end.
     */
    if (!needsPin) {
      dispatch({ type: 'UNLOCK_PARENT' })
      navigate(afterUnlock())
    }
  }

  const unlock = () => {
    dispatch({ type: 'UNLOCK_PARENT' })
    setPin('')
    setError('')
    // Where a link was going (a notification, the digest), or the dashboard.
    navigate(afterUnlock())
  }

  const submitPin = () => {
    // An empty stored PIN must never be matched by an empty box.
    if (state.family.pin && pin === state.family.pin) unlock()
    else setError('That PIN is not right.')
  }

  /*
   * The PIN box is on the screen rather than behind an "Enter PIN" button,
   * and the right PIN opens Parent Mode as its last digit is typed. A wrong
   * one waits for Unlock, so a mistyped digit is not met with an error
   * halfway through. Opening on a match tells nobody more than tapping
   * Unlock would have.
   */
  const typePin = (value) => {
    const next = value.replace(/\D/g, '').slice(0, 8)
    setPin(next)
    setError('')
    if (state.family.pin && next === state.family.pin) unlock()
  }

  return (
    <div className="shell px-4 py-8 min-h-screen flex flex-col justify-center">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-3"><Logo size={56} /></div>
        <h1 className="font-display text-2xl font-extrabold">Who's playing?</h1>
        <p className="text-sm text-muted">{state.family.name}</p>
      </div>

      <div className="space-y-2.5 mb-5">
        {state.kids.map((kid) => {
          const { level } = levelFromXp(kid.xp)
          const theme = resolveKidTheme(kid.themeId, level, storyProgress(state, kid))
          return (
            <button
              key={kid.id}
              type="button"
              onClick={() => {
                dispatch({ type: 'SET_ROLE', role: 'kid', kidId: kid.id })
                navigate('/kid')
              }}
              className="card w-full p-3 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
            >
              <Avatar theme={theme} level={level} size={52} interactive={false} />
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold">{kid.name}</span>
                <span className="block text-xs text-muted">{theme.name} · Level {level}</span>
              </span>
              <span aria-hidden="true" className="text-muted">›</span>
            </button>
          )
        })}
      </div>

      <Card className="text-center">
        <div className="text-2xl mb-1" aria-hidden="true">🔐</div>
        <h2 className="font-display font-bold mb-1">Parent Mode</h2>
        <p className="text-xs text-muted mb-3">Assign quests, accept finished chores, manage the plan.</p>
        {needsPin ? (
          <div className="flex gap-2">
            <TextInput
              value={pin}
              onChange={(e) => typePin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitPin()}
              inputMode="numeric"
              type="password"
              placeholder="Parent PIN"
              aria-label="Parent PIN"
              className="field flex-1 min-w-0 text-center"
            />
            <Button className="shrink-0" onClick={submitPin} disabled={!pin}>Unlock</Button>
          </div>
        ) : (
          <Button className="w-full" onClick={openParent}>Open Parent Mode</Button>
        )}
        {error && <p className="text-xs mt-2" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}
        {needsPin && (
          <button
            type="button"
            className="text-xs underline text-muted mt-2"
            onClick={() => setResetting(true)}
          >
            Forgot your PIN?
          </button>
        )}
      </Card>
      <PinReset open={resetting} onClose={() => setResetting(false)} onDone={unlock} />
    </div>
  )
}
