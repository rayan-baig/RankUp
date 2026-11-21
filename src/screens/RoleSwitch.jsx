import { Suspense, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { resolveKidTheme } from '../data/kidThemes.js'
import { storyProgress } from '../lib/dragonFight.js'
import { levelFromXp } from '../lib/xp.js'
import Avatar from '../components/Avatar.jsx'
import { Card, Button, TextInput } from '../components/ui.jsx'
import { navigate, afterUnlock } from '../lib/router.js'
import Logo from '../components/Logo.jsx'
import { lazyLoad } from '../lib/lazy.js'
import { hasPin, pinLength } from '../lib/parentPin.js'
import { usePinLock } from '../components/usePinLock.js'

/**
 * Who is holding the phone?
 *
 * With no accounts yet, this is a profile switcher rather than a login. Parent
 * Mode is behind the PIN so a kid cannot approve their own quests — which is
 * the one piece of access control this build genuinely needs.
 */
/*
 * "Forgot your PIN?" is a piece of its own, fetched when it is tapped: it
 * and its rules were a tenth of this screen, in the file every phone
 * downloads first, for a form most parents never open.
 */
const PinReset = lazyLoad(() => import('../components/PinReset.jsx'))

export default function RoleSwitch() {
  const { state, dispatch } = useApp()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState(false)
  // The value last checked, so tapping Unlock on a PIN already refused as it
  // was typed is not counted as a second wrong try.
  const [checked, setChecked] = useState('')
  const needsPin = !(state.demo || !hasPin(state.family))
  const lock = usePinLock()

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

  /*
   * One try at the PIN, counted (lib/parentPin.js): after five wrong ones the
   * box waits a minute, then two, then four, and says so calmly. An empty
   * box never matches, nor does a family with no PIN.
   */
  const check = (value) => {
    setChecked(value)
    const r = lock.attempt(state.family, value)
    if (r.result === 'ok') unlock()
    else { setError(r.message); if (r.result === 'locked') setPin('') }
  }

  const submitPin = () => {
    if (lock.locked || !pin) return
    if (pin === checked) { setError(error || 'That PIN is not right.'); return }
    check(pin)
  }

  /*
   * The PIN box is on the screen rather than behind an "Enter PIN" button,
   * and the PIN is checked as its last digit is typed: the right one opens
   * Parent Mode, a wrong one of the same length is one wrong try. Shorter
   * than the PIN, nothing is checked, so a half-typed PIN is neither met
   * with an error nor a free guess. Only the length is known, never digits.
   */
  const typePin = (value) => {
    if (lock.locked) return
    const next = value.replace(/\D/g, '').slice(0, 8)
    setPin(next)
    setError('')
    const length = pinLength(state.family)
    if (length && next.length === length) check(next)
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
              disabled={lock.locked}
              className="field flex-1 min-w-0 text-center"
            />
            <Button className="shrink-0" onClick={submitPin} disabled={!pin || lock.locked}>Unlock</Button>
          </div>
        ) : (
          <Button className="w-full" onClick={openParent}>Open Parent Mode</Button>
        )}
        {needsPin && lock.locked ? (
          <p className="text-xs mt-2 text-muted" role="status" data-testid="pin-wait">{lock.lockText}</p>
        ) : error && <p className="text-xs mt-2" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}
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
      {resetting && (
        <Suspense fallback={null}>
          <PinReset open={resetting} onClose={() => setResetting(false)} onDone={unlock} />
        </Suspense>
      )}
    </div>
  )
}
