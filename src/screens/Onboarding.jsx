import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { makeKid } from '../state/initialState.js'
import { KID_THEMES } from '../data/kidThemes.js'
import { ADAPTIVE_SUPPORTS } from '../data/questTemplates.js'
import { Button, Card, Field, TextInput, TextArea, Banner, ProgressBar } from '../components/ui.jsx'
import ThemePicker from '../components/ThemePicker.jsx'
import KidDeviceSetup from './kid/KidDeviceSetup.jsx'
import SignIn from './SignIn.jsx'
import { transport } from '../lib/sync/transport.js'
import { navigate } from '../lib/router.js'

const STEPS = ['Welcome', 'Your family', 'Add a kid', 'Pick a theme']

export default function Onboarding() {
  const { dispatch } = useApp()
  // null until someone says whose phone this is. A parent sets up the family;
  // a kid's phone joins one with a pairing code and never creates an account.
  const [mode, setMode] = useState(null)
  const [step, setStep] = useState(0)
  // With a backend configured the parent needs a real account before anything
  // can sync. Without one the app is device-only and there is nothing to join.
  const [signedIn, setSignedIn] = useState(!transport.isConfigured() || Boolean(transport.currentUserId()))
  const [family, setFamily] = useState({ name: '', parentName: '', pin: '' })
  const [kid, setKid] = useState({ name: '', hasNeeds: false, notes: '', supports: [] })
  const [themeId, setThemeId] = useState(KID_THEMES[0].id)

  const canContinue =
    (step === 0) ||
    (step === 1 && family.parentName.trim() && family.pin.length >= 4) ||
    (step === 2 && kid.name.trim()) ||
    step === 3

  const finish = async () => {
    const familyName = family.name.trim() || `${family.parentName.trim()}'s family`
    const newKid = makeKid({
      name: kid.name.trim(),
      themeId,
      accessibility: { hasNeeds: kid.hasNeeds, notes: kid.notes.trim(), supports: kid.supports },
    })

    // The server assigns the real family id, so both devices agree on it.
    let familyId = null
    if (transport.isConfigured()) {
      try {
        const result = await transport.rpc('create_family', {
          p_family_name: familyName,
          p_parent_name: family.parentName.trim(),
        })
        familyId = result?.family_id || null
      } catch (err) {
        console.warn('[RankUp] Could not create the family on the server:', err.message)
      }
    }

    dispatch({
      type: 'COMPLETE_ONBOARDING',
      family: { ...family, name: familyName, ...(familyId ? { id: familyId } : {}) },
      kid: newKid,
      guildName: `${kid.name.trim()}'s Guild`,
    })
    navigate('/parent')
  }

  const toggleSupport = (s) =>
    setKid((k) => ({ ...k, supports: k.supports.includes(s) ? k.supports.filter((x) => x !== s) : [...k.supports, s] }))

  if (mode === 'kid') return <KidDeviceSetup onBack={() => setMode(null)} />

  if (mode === 'parent' && !signedIn) {
    return <SignIn onDone={() => setSignedIn(true)} onBack={() => setMode(null)} />
  }

  if (mode === null) {
    return (
      <div className="shell px-5 py-8 min-h-screen flex flex-col justify-center">
        <div className="text-center mb-7 anim-slide-up">
          <div className="text-5xl mb-3" aria-hidden="true">🏆</div>
          <h1 className="font-display text-3xl font-extrabold leading-tight">RankUp</h1>
          <p className="text-muted mt-2">
            Chores become quests. Kids earn XP for finishing them — and you approve every one.
          </p>
        </div>

        <p className="section-title text-center">Whose phone is this?</p>

        <button
          type="button"
          onClick={() => setMode('parent')}
          className="card w-full text-left p-4 mb-3 flex items-center gap-4 transition-transform active:scale-[0.98]"
        >
          <span className="text-3xl" aria-hidden="true">🧑‍🍳</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold">I'm a parent</span>
            <span className="block text-xs text-muted">
              Set up your family, add kids and assign quests.
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('kid')}
          className="card w-full text-left p-4 flex items-center gap-4 transition-transform active:scale-[0.98]"
        >
          <span className="text-3xl" aria-hidden="true">🎮</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold">I'm a kid</span>
            <span className="block text-xs text-muted">
              Get a code to connect to your grown-up's account.
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>

        <p className="text-xs text-muted text-center mt-6">
          A kid's phone never creates its own account — it joins a parent's.
        </p>
      </div>
    )
  }

  return (
    <div className="shell px-4 py-6 min-h-screen flex flex-col">
      <div className="mb-5">
        <ProgressBar value={step + 1} max={STEPS.length} label="Setup progress" />
        <p className="text-xs text-muted mt-2">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      {step === 0 && (
        <div className="flex-1 flex flex-col justify-center text-center gap-4 anim-slide-up">
          <div className="text-5xl" aria-hidden="true">🏆</div>
          <h1 className="font-display text-3xl font-extrabold leading-tight">RankUp</h1>
          <p className="text-muted">
            Chores become quests. Kids earn XP and a currency that matches the world they picked.
            You approve every completed quest before anything is awarded.
          </p>
          <Card className="text-left">
            <h2 className="font-display font-bold mb-2 text-sm">How the loop works</h2>
            <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
              <li>You assign a quest to a kid.</li>
              <li>They do it, then photograph the result in the app.</li>
              <li>An AI check flags anything that looks faked — as advice, not a decision.</li>
              <li>You approve or send it back. Approving awards XP and currency.</li>
            </ol>
          </Card>
          <Banner tone="warn" icon="⚠️" title="Before you invite real users">
            Data currently lives only on this device and there are no real payments. Read
            docs/LEGAL.md — a kids' app needs verified parental consent (COPPA) before you
            collect a real child's data.
          </Banner>
        </div>
      )}

      {step === 1 && (
        <div className="flex-1 anim-slide-up">
          <h1 className="font-display text-2xl font-extrabold mb-1">Your family</h1>
          <p className="text-muted text-sm mb-4">You are the parent account. Kids get their own profiles inside it.</p>
          <Field label="Your name">
            <TextInput value={family.parentName} onChange={(e) => setFamily({ ...family, parentName: e.target.value })} placeholder="e.g. Sam" autoFocus />
          </Field>
          <Field label="Family name" hint="Shown on the dashboard and the guild.">
            <TextInput value={family.name} onChange={(e) => setFamily({ ...family, name: e.target.value })} placeholder="e.g. The Rivera family" />
          </Field>
          <Field label="Parent PIN" hint="4+ digits. Stops a kid opening Parent Mode or changing their theme on their own.">
            <TextInput
              value={family.pin}
              onChange={(e) => setFamily({ ...family, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              inputMode="numeric"
              placeholder="••••"
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 anim-slide-up">
          <h1 className="font-display text-2xl font-extrabold mb-1">Add your first kid</h1>
          <p className="text-muted text-sm mb-4">You can add more later — there is no limit.</p>
          <Field label="Kid's name">
            <TextInput value={kid.name} onChange={(e) => setKid({ ...kid, name: e.target.value })} placeholder="e.g. Ava" autoFocus />
          </Field>

          <Card flat className="mb-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={kid.hasNeeds}
                onChange={(e) => setKid({ ...kid, hasNeeds: e.target.checked })}
                className="mt-1 w-5 h-5 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-semibold text-sm">This kid has a physical or mental disability</span>
                <span className="block text-xs text-muted mt-0.5">
                  Turns on adaptive quests: same XP and currency, but the difficulty and the definition of
                  "done" are set around what this kid can do rather than a fixed standard.
                </span>
              </span>
            </label>
          </Card>

          {kid.hasNeeds && (
            <div className="anim-slide-up">
              <Field label="Notes for yourself" hint="Only you see this. It never leaves the app.">
                <TextArea
                  value={kid.notes}
                  onChange={(e) => setKid({ ...kid, notes: e.target.value })}
                  placeholder="e.g. Gets overwhelmed by open-ended instructions. Works best with a countable target."
                />
              </Field>
              <span className="label">Default supports for their quests</span>
              <div className="flex flex-wrap gap-2 mb-3">
                {ADAPTIVE_SUPPORTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSupport(s)}
                    className="chip"
                    style={kid.supports.includes(s) ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex-1 anim-slide-up">
          <h1 className="font-display text-2xl font-extrabold mb-1">{kid.name || 'Your kid'} picks a world</h1>
          <p className="text-muted text-sm mb-4">
            The theme changes the background, the avatar and what the currency is called. Once chosen it is
            locked — changing it later needs your PIN.
          </p>
          <ThemePicker value={themeId} onChange={setThemeId} />
        </div>
      )}

      <div className="flex gap-2 mt-6 sticky bottom-3">
        <Button variant="ghost" onClick={() => (step === 0 ? setMode(null) : setStep((s) => s - 1))}>
          Back
        </Button>
        <Button className="flex-1" disabled={!canContinue} onClick={() => (step === 3 ? finish() : setStep((s) => s + 1))}>
          {step === 3 ? 'Start playing' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
