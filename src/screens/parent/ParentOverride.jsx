import { useState } from 'react'
import { useApp, useElite } from '../../state/AppContext.jsx'
import { activeLockout, overrideHasExpired } from '../../state/reducer.js'
import { levelFromXp, formatXp } from '../../lib/xp.js'
import { resolveKidTheme } from '../../data/kidThemes.js'
import { relativeTime, formatDuration } from '../../lib/dates.js'
import { Screen, Card, Button, SectionTitle, Field, TextInput, TextArea, Select, Banner, Chip, Modal, EmptyState } from '../../components/ui.jsx'
import EliteGate from '../../components/EliteGate.jsx'

/**
 * The Parental Consequence Engine — System Override Protocol.
 *
 * Three tiers, deliberately escalating, and every one of them asks for a written
 * reason before it will fire. A consequence a kid cannot see the reason for
 * teaches nothing; it just makes the app the enemy.
 */

const TIERS = [
  {
    id: 'tax',
    icon: '💰',
    name: 'Currency Tax',
    tone: 'var(--warn)',
    blurb: 'Deducts a percentage of the kid\'s in-app currency. The app stays usable.',
  },
  {
    id: 'dimension',
    icon: '⏸️',
    name: 'Dimension Lockout',
    tone: 'var(--warn)',
    blurb: 'Locks the kid out of the app for a set time, then lifts itself.',
  },
  {
    id: 'red',
    icon: '🛑',
    name: 'Red Security Lockdown',
    tone: 'var(--bad)',
    blurb: 'Full lockout that stays in effect until you manually lift it.',
  },
]

export default function ParentOverride() {
  const { state, dispatch } = useApp()
  const elite = useElite()
  const [kidId, setKidId] = useState(state.kids[0]?.id || '')
  const [kind, setKind] = useState('tax')
  const [percent, setPercent] = useState(10)
  const [minutes, setMinutes] = useState(60)
  const [reason, setReason] = useState('')
  const [consequence, setConsequence] = useState('')
  const [confirm, setConfirm] = useState(false)

  if (!elite) {
    return (
      <EliteGate
        icon="🛡️"
        title="The Parental Consequence Engine"
        body="Unlocks the System Override Protocol panel: write custom real-world consequences and trigger three lockout tiers — Currency Tax, Dimension Lockout and Red Security Lockdown."
      />
    )
  }

  const kid = state.kids.find((k) => k.id === kidId)
  const tier = TIERS.find((t) => t.id === kind)
  const lock = kid ? activeLockout(kid) : null
  const history = [...state.overrides].reverse()

  const apply = () => {
    dispatch({
      type: 'APPLY_OVERRIDE',
      kidId,
      kind,
      percent: Number(percent),
      minutes: Number(minutes),
      reason: reason.trim(),
      consequence: consequence.trim(),
    })
    setReason('')
    setConsequence('')
    setConfirm(false)
  }

  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">Elite · Consequence Engine</p>
        <h1 className="font-display text-2xl font-extrabold">System Override Protocol</h1>
      </header>

      {state.kids.length === 0 ? (
        <EmptyState icon="👶" title="No kids to apply this to" />
      ) : (
        <>
          <Field label="Kid">
            <Select value={kidId} onChange={(e) => setKidId(e.target.value)}>
              {state.kids.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </Select>
          </Field>

          {kid && lock && (
            <Card className="mb-3" style={{ borderColor: 'var(--bad)' }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">{lock.type === 'red' ? '🛑' : '⏸️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: 'var(--bad)' }}>
                    {kid.name} is currently {lock.type === 'red' ? 'in Red Security Lockdown' : 'in a Dimension Lockout'}
                  </div>
                  {lock.until && <div className="text-xs text-muted">Lifts in {formatDuration(lock.until - Date.now())}</div>}
                  {lock.reason && <div className="text-xs text-muted mt-1">“{lock.reason}”</div>}
                </div>
              </div>
              <Button
                variant="soft"
                className="w-full mt-3"
                onClick={() => dispatch({ type: 'LIFT_OVERRIDE', overrideId: lock.overrideId })}
              >
                🔓 Lift now
              </Button>
            </Card>
          )}

          <SectionTitle>Choose a tier</SectionTitle>
          <div className="space-y-2 mb-3">
            {TIERS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setKind(t.id)}
                className="card w-full text-left p-3 flex items-start gap-3"
                style={{ borderColor: kind === t.id ? t.tone : 'var(--line)' }}
              >
                <span className="text-xl" aria-hidden="true">{t.icon}</span>
                <span className="min-w-0">
                  <span className="block font-display font-bold text-sm" style={{ color: kind === t.id ? t.tone : undefined }}>
                    {t.name}
                  </span>
                  <span className="block text-xs text-muted">{t.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          <Card className="mb-3">
            {kind === 'tax' && (
              <Field label={`Tax percentage — ${percent}%`} hint={kid ? `Takes ${Math.floor((kid.coins * percent) / 100)} of ${formatXp(kid.coins)} ${resolveKidTheme(kid.themeId, levelFromXp(kid.xp).level).currency.name}.` : ''}>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </Field>
            )}

            {kind === 'dimension' && (
              <Field label="Lockout length">
                <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                  {[15, 30, 60, 120, 240, 480, 1440].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} minutes` : m === 1440 ? '24 hours' : `${m / 60} hours`}</option>
                  ))}
                </Select>
              </Field>
            )}

            {kind === 'red' && (
              <Banner tone="bad" icon="🛑" title="This does not lift itself">
                {kid?.name || 'Your kid'} cannot use the app at all until you come back here and lift it.
              </Banner>
            )}

            <div className="mt-3">
              <Field label="Reason" hint="Shown to your kid on the lockout screen. Required.">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Submitted a photo of someone else's tidy room" />
              </Field>

              <Field label="Real-world consequence (optional)" hint="The part that actually happens away from the app.">
                <TextArea value={consequence} onChange={(e) => setConsequence(e.target.value)} placeholder="e.g. No console until the bathroom is genuinely done and checked." />
              </Field>
            </div>

            <Banner tone="info" icon="🧊" title="What is never touched">
              XP, level and streak are never removed by an override. Progress a kid earned stays earned.
            </Banner>

            <Button
              variant="danger"
              className="w-full mt-3"
              disabled={!reason.trim() || !kidId}
              onClick={() => setConfirm(true)}
            >
              {tier.icon} Trigger {tier.name}
            </Button>
            {!reason.trim() && <p className="text-xs text-muted text-center mt-2">Write a reason first.</p>}
          </Card>
        </>
      )}

      <SectionTitle>Override history</SectionTitle>
      {history.length === 0 ? (
        <Card><p className="text-sm text-muted">No overrides have been used.</p></Card>
      ) : (
        history.map((o) => {
          const k = state.kids.find((x) => x.id === o.kidId)
          const t = TIERS.find((x) => x.id === o.kind)
          return (
            <Card key={o.id} flat className="mb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{t?.icon} {t?.name} · {k?.name || 'Removed kid'}</div>
                  {o.reason && <div className="text-xs text-muted">“{o.reason}”</div>}
                  {o.kind === 'tax' && <div className="text-xs text-muted">Took {o.amount} ({o.percent}%)</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-muted">{relativeTime(o.createdAt)}</div>
                  {o.kind !== 'tax' && (() => {
                    const timedOut = o.endedBy === 'timer' || overrideHasExpired(o)
                    const done = Boolean(o.liftedAt) || timedOut
                    return (
                      <Chip tone={done ? 'var(--good)' : 'var(--bad)'}>
                        {!done ? 'Active' : timedOut ? 'Expired' : 'Lifted'}
                      </Chip>
                    )
                  })()}
                </div>
              </div>
            </Card>
          )
        })
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Trigger ${tier?.name}?`}
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={apply}>Confirm</Button>
          </>
        }
      >
        <p className="text-sm mb-2">
          {kind === 'tax' && `${kid?.name} loses ${percent}% of their currency immediately.`}
          {kind === 'dimension' && `${kid?.name} cannot open the app for ${minutes >= 60 ? `${minutes / 60} hours` : `${minutes} minutes`}.`}
          {kind === 'red' && `${kid?.name} is locked out until you lift it by hand.`}
        </p>
        <p className="text-xs text-muted">Reason shown to them: “{reason}”</p>
      </Modal>
    </Screen>
  )
}
