import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { resolveKidTheme } from '../data/kidThemes.js'
import { levelFromXp } from '../lib/xp.js'
import Avatar from '../components/Avatar.jsx'
import { Card, Button, TextInput, Modal } from '../components/ui.jsx'
import { navigate } from '../lib/router.js'

/**
 * Who is holding the phone?
 *
 * With no accounts yet, this is a profile switcher rather than a login. Parent
 * Mode is behind the PIN so a kid cannot approve their own quests — which is
 * the one piece of access control this build genuinely needs.
 */
export default function RoleSwitch() {
  const { state, dispatch } = useApp()
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const openParent = () => {
    if (!state.family.pin) {
      dispatch({ type: 'UNLOCK_PARENT' })
      navigate('/parent')
      return
    }
    setPinOpen(true)
  }

  const submitPin = () => {
    // An empty stored PIN must never be matched by an empty box.
    if (state.family.pin && pin === state.family.pin) {
      dispatch({ type: 'UNLOCK_PARENT' })
      setPinOpen(false)
      setPin('')
      setError('')
      navigate('/parent')
    } else {
      setError('That PIN is not right.')
    }
  }

  return (
    <div className="shell px-4 py-8 min-h-screen flex flex-col justify-center">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2" aria-hidden="true">🏆</div>
        <h1 className="font-display text-2xl font-extrabold">Who's playing?</h1>
        <p className="text-sm text-muted">{state.family.name}</p>
      </div>

      <div className="space-y-2.5 mb-5">
        {state.kids.map((kid) => {
          const { level } = levelFromXp(kid.xp)
          const theme = resolveKidTheme(kid.themeId, level)
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
        <p className="text-xs text-muted mb-3">Assign quests, approve photo proof, manage the plan.</p>
        <Button className="w-full" onClick={openParent}>
          {state.family.pin ? 'Enter PIN' : 'Open Parent Mode'}
        </Button>
      </Card>

      <Modal
        open={pinOpen}
        onClose={() => { setPinOpen(false); setError('') }}
        title="Parent PIN"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setPinOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={submitPin}>Unlock</Button>
          </>
        }
      >
        <TextInput
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={(e) => e.key === 'Enter' && submitPin()}
          inputMode="numeric"
          type="password"
          placeholder="••••"
          autoFocus
        />
        {error && <p className="text-xs mt-2" style={{ color: 'var(--bad)' }}>{error}</p>}
        <p className="text-xs text-muted mt-3">
          Forgotten it? There is no reset yet — the PIN is stored with the rest of the local data.
        </p>
      </Modal>
    </div>
  )
}
