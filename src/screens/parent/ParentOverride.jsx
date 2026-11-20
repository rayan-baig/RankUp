import { useState } from 'react'
import { useApp, useElite } from '../../state/AppContext.jsx'
import { activeLockout, overrideHasExpired } from '../../state/reducer.js'
import { levelFromXp, formatXp } from '../../lib/xp.js'
import { resolveKidTheme } from '../../data/kidThemes.js'
import { relativeTime, formatDuration } from '../../lib/dates.js'
import { Screen, Card, Button, SectionTitle, Field, TextInput, TextArea, Select, Banner, Chip, Modal } from '../../components/ui.jsx'
import EliteGate from '../../components/EliteGate.jsx'
import EmptyNext from '../../components/EmptyNext.jsx'

/**
 * Pause and limits (was "the Parental Consequence Engine" and "System
 * Override Protocol").
 *
 * Plain names and calm words: a short break from the app, a pause until the
 * parent lifts it, or taking back some coins. Each asks for a reason, which
 * the child sees, because a limit a child cannot see the reason for teaches
 * nothing. The plan screens no longer sell any of this as a perk: they say
 * "your own house rules in one place".
 */

const TIERS = [
  {
    id: 'tax',
    icon: '💰',
    name: 'Take back some coins',
    tone: 'var(--warn)',
    blurb: 'Takes back part of the coins they have saved. The app keeps working as normal.',
  },
  {
    id: 'dimension',
    icon: '⏸️',
    name: 'A short break',
    tone: 'var(--warn)',
    blurb: 'Gives the app a rest for a set time. It opens again by itself.',
  },
  {
    id: 'red',
    icon: '🛑',
    name: 'Pause until I lift it',
    tone: 'var(--bad)',
    blurb: 'Gives the app a rest until you come back here and lift it.',
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
        perk="override"
        icon="🛡️"
        title="Pause and limits"
        body="Your own house rules in one place, in your words, and a way to give the app a rest for a while when it is needed."
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
        <p className="text-xs uppercase tracking-widest text-muted">Elite</p>
        <h1 className="font-display text-2xl font-extrabold">Pause and limits</h1>
        <p className="text-sm text-muted mt-1">
          For the days a talk is not enough. Whatever you choose, your child sees your reason, and
          nothing they have earned in XP, levels or streaks is taken away.
        </p>
      </header>

      {state.kids.length === 0 ? (
        <EmptyNext which="noKids" />
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
                    {kid.name}&apos;s app is {lock.type === 'red' ? 'paused until you lift it' : 'on a short break'}
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

          <SectionTitle>Choose one</SectionTitle>
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
              <Field label={`How much to take back — ${percent}%`} hint={kid ? `Takes ${Math.floor((kid.coins * percent) / 100)} of ${formatXp(kid.coins)} ${resolveKidTheme(kid.themeId, levelFromXp(kid.xp).level).currency.name}.` : ''}>
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
              <Field label="How long">
                <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                  {[15, 30, 60, 120, 240, 480, 1440].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} minutes` : m === 1440 ? '24 hours' : `${m / 60} hours`}</option>
                  ))}
                </Select>
              </Field>
            )}

            {kind === 'red' && (
              <Banner tone="bad" icon="⏸️" title="This does not lift itself">
                The app stays paused for {kid?.name || 'your child'} until you come back here and lift it.
              </Banner>
            )}

            <div className="mt-3">
              <Field label="Reason" hint="Shown to your child on their screen. Required.">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sent someone else's tidy room" />
              </Field>

              <Field label="What happens away from the app (optional)" hint="Shown to your child with the reason.">
                <TextArea value={consequence} onChange={(e) => setConsequence(e.target.value)} placeholder="e.g. No console until the bathroom is genuinely done and checked." />
              </Field>
            </div>

            <Banner tone="info" icon="🧊" title="What is never touched">
              XP, level and streak are never removed. Progress your child earned stays earned.
            </Banner>

            <Button
              variant="danger"
              className="w-full mt-3"
              disabled={!reason.trim() || !kidId}
              onClick={() => setConfirm(true)}
            >
              {tier.icon} Use: {tier.name}
            </Button>
            {!reason.trim() && <p className="text-xs text-muted text-center mt-2">Write a reason first.</p>}
          </Card>
        </>
      )}

      <SectionTitle>History</SectionTitle>
      {history.length === 0 ? (
        <Card><p className="text-sm text-muted">Nothing used yet.</p></Card>
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
        title={`Use “${tier?.name}”?`}
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={apply}>Confirm</Button>
          </>
        }
      >
        <p className="text-sm mb-2">
          {kind === 'tax' && `${percent}% of ${kid?.name}'s coins are taken back now.`}
          {kind === 'dimension' && `The app rests for ${kid?.name} for ${minutes >= 60 ? `${minutes / 60} hours` : `${minutes} minutes`}, then opens again by itself.`}
          {kind === 'red' && `The app rests for ${kid?.name} until you lift it here.`}
        </p>
        <p className="text-xs text-muted">Reason shown to them: “{reason}”</p>
      </Modal>
    </Screen>
  )
}
