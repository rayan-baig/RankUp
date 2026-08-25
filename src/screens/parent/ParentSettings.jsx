import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { PARENT_THEMES } from '../../data/parentThemes.js'
import { clearState, storageUsageBytes } from '../../lib/storage.js'
import { relativeTime } from '../../lib/dates.js'
import { canSyncAcrossDevices } from '../../lib/sync/index.js'
import { Screen, Card, Button, SectionTitle, Field, TextInput, TextArea, Toggle, Banner, Modal, Select, Chip } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

export default function ParentSettings() {
  const { state, dispatch } = useApp()
  const [reset, setReset] = useState(false)
  const [note, setNote] = useState('')
  const [noteKid, setNoteKid] = useState(state.kids[0]?.id || '')
  const [reward, setReward] = useState({ name: '', cost: 50, description: '', icon: '🎁' })
  const [goal, setGoal] = useState(state.familyGoal || { name: '', targetXp: 2000 })

  const usageKb = Math.round(storageUsageBytes() / 1024)
  const kidNotes = state.notes.filter((n) => n.kidId === noteKid).slice(-6)
  const linkedCount = state.kids.filter((k) => k.pairedDeviceAt).length

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-3">Settings</h1>

      <SectionTitle>Dashboard theme</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {PARENT_THEMES.map((t) => {
          const active = state.family.parentThemeId === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => dispatch({ type: 'SET_PARENT_THEME', themeId: t.id })}
              aria-pressed={active}
              className="text-left p-2.5 transition-transform active:scale-[0.97]"
              style={{
                background: t.colors.surface,
                color: t.colors.ink,
                border: `2px solid ${active ? t.colors.accent : t.colors.line}`,
                borderRadius: 'var(--radius)',
              }}
            >
              <div className="h-8 mb-2 rounded" style={{ background: t.colors.bg, border: `1px solid ${t.colors.line}` }}>
                <div className="h-full w-1/3" style={{ background: t.colors.accent, opacity: 0.7 }} />
              </div>
              <div className="text-[13px] font-bold leading-tight">{t.icon} {t.name}</div>
              <div className="text-[10px] leading-tight mt-0.5" style={{ color: t.colors.inkMuted }}>{t.blurb}</div>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted -mt-2 mb-4">Visual only — parent themes never change how anything works.</p>

      <SectionTitle>Rewards catalogue</SectionTitle>
      <Card className="mb-4">
        <p className="text-sm text-muted mb-3">
          What kids can spend their currency on. Real-world things work best.
        </p>
        {state.rewards.map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
            <span aria-hidden="true">{r.icon || '🎁'}</span>
            <span className="flex-1 min-w-0 text-sm truncate">{r.name}</span>
            <span className="text-sm font-semibold">{r.cost}</span>
            <button type="button" className="text-muted px-2" onClick={() => dispatch({ type: 'DELETE_REWARD', rewardId: r.id })} aria-label={`Delete ${r.name}`}>
              ✕
            </button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_88px] gap-2 mt-3">
          <TextInput value={reward.name} onChange={(e) => setReward({ ...reward, name: e.target.value })} placeholder="e.g. Pick Friday's film" />
          <TextInput
            value={reward.cost}
            onChange={(e) => setReward({ ...reward, cost: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            inputMode="numeric"
            aria-label="Cost"
          />
        </div>
        <Button
          variant="soft"
          className="w-full mt-2"
          disabled={!reward.name.trim()}
          onClick={() => {
            dispatch({ type: 'ADD_REWARD', reward: { ...reward, name: reward.name.trim() } })
            setReward({ name: '', cost: 50, description: '', icon: '🎁' })
          }}
        >
          Add reward
        </Button>

        {state.redemptions.filter((r) => r.status === 'requested').length > 0 && (
          <div className="mt-4">
            <SectionTitle>Waiting to be given</SectionTitle>
            {state.redemptions.filter((r) => r.status === 'requested').map((r) => {
              const kid = state.kids.find((k) => k.id === r.kidId)
              return (
                <div key={r.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1 text-sm truncate">{kid?.name}: {r.name}</span>
                  <Button className="px-3 py-1.5 min-h-0 text-xs" onClick={() => dispatch({ type: 'FULFIL_REDEMPTION', redemptionId: r.id })}>
                    Mark given
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <SectionTitle>Family goal</SectionTitle>
      <Card className="mb-4">
        <p className="text-sm text-muted mb-3">Everyone's XP adds to one shared bar.</p>
        <Field label="Reward for hitting it">
          <TextInput value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} placeholder="e.g. Trip to the aquarium" />
        </Field>
        <Field label="Target XP">
          <TextInput
            value={goal.targetXp}
            onChange={(e) => setGoal({ ...goal, targetXp: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            inputMode="numeric"
          />
        </Field>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!goal.name.trim()} onClick={() => dispatch({ type: 'SET_FAMILY_GOAL', goal })}>
            Save goal
          </Button>
          {state.familyGoal && (
            <Button variant="ghost" onClick={() => { dispatch({ type: 'SET_FAMILY_GOAL', goal: null }); setGoal({ name: '', targetXp: 2000 }) }}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      <SectionTitle>Notes to your kid</SectionTitle>
      <Card className="mb-4">
        <Field label="Kid">
          <Select value={noteKid} onChange={(e) => setNoteKid(e.target.value)}>
            {state.kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </Select>
        </Field>
        <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
          {kidNotes.map((n) => (
            <div key={n.id} className="card-flat p-2.5">
              <div className="flex justify-between text-[11px] text-muted">
                <span>{n.from === 'parent' ? 'You' : 'Them'}</span>
                <span>{relativeTime(n.at)}</span>
              </div>
              <p className="text-sm">{n.text}</p>
            </div>
          ))}
          {kidNotes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
        </div>
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Great job on the bathroom — genuinely noticed." rows={2} />
        <Button
          variant="soft"
          className="w-full mt-2"
          disabled={!note.trim() || !noteKid}
          onClick={() => {
            dispatch({ type: 'ADD_NOTE', note: { kidId: noteKid, from: 'parent', text: note.trim() } })
            setNote('')
          }}
        >
          Send note
        </Button>
      </Card>

      <SectionTitle>Reminders</SectionTitle>
      <Card className="mb-4">
        <Banner tone="warn" icon="🔔" title="Not working yet">
          These toggles are saved but nothing is scheduled. Real reminders need push notifications,
          which need a server and, on iOS, the app installed to the home screen.
        </Banner>
        <div className="mt-2">
          {state.settings.reminders.map((r) => (
            <Toggle
              key={r.id}
              checked={r.on}
              onChange={() => dispatch({ type: 'TOGGLE_REMINDER', reminderId: r.id })}
              label={`${r.label} · ${r.time}`}
            />
          ))}
        </div>
      </Card>

      <SectionTitle>Family sync</SectionTitle>
      <Card className="mb-4">
        <button
          type="button"
          onClick={() => navigate('/parent/pair')}
          className="w-full flex items-center gap-3 text-left"
        >
          <span className="text-2xl" aria-hidden="true">🔗</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-sm">Link a kid's device</span>
            <span className="block text-xs text-muted">
              Enter the six-digit code from their phone.
              {linkedCount > 0 && ` ${linkedCount} linked.`}
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>

        <div className="mt-3">
          {canSyncAcrossDevices ? (
            <Banner tone="good" icon="☁️" title="Connected to your sync service">
              Quests, approvals and XP are shared between linked devices.
            </Banner>
          ) : (
            <Banner tone="warn" icon="⚠️" title="Pairing works, syncing does not">
              The pairing flow above is real, but there is no server behind it yet, so it only
              connects two tabs of this browser. Quests and XP still live on this device alone.
              See docs/SYNC.md.
            </Banner>
          )}
        </div>
        <p className="text-xs text-muted mt-2">Local data in use: about {usageKb} KB.</p>
      </Card>

      <SectionTitle>Accessibility & motion</SectionTitle>
      <Card className="mb-4">
        <Toggle
          checked={state.settings.reduceMotion}
          onChange={(v) => dispatch({ type: 'UPDATE_SETTINGS', patch: { reduceMotion: v } })}
          label="Reduce motion"
          hint="Stops background animation and avatar effects."
        />
      </Card>

      <SectionTitle>Parent account</SectionTitle>
      <Card className="mb-4">
        <Field label="Family name">
          <TextInput
            value={state.family.name}
            onChange={(e) => dispatch({ type: 'UPDATE_FAMILY', patch: { name: e.target.value } })}
          />
        </Field>
        <Field label="Parent PIN" hint="Used to open Parent Mode and to change a kid's theme.">
          <TextInput
            value={state.family.pin}
            onChange={(e) => dispatch({ type: 'UPDATE_FAMILY', patch: { pin: e.target.value.replace(/\D/g, '').slice(0, 8) } })}
            inputMode="numeric"
          />
        </Field>
        <Chip>Plan: {state.family.tier === 'elite' ? 'Elite Pass' : 'Standard'}</Chip>
      </Card>

      <Button variant="danger" className="w-full" onClick={() => setReset(true)}>
        Erase all local data
      </Button>

      <Modal
        open={reset}
        onClose={() => setReset(false)}
        title="Erase everything?"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                clearState()
                dispatch({ type: 'RESET' })
                navigate('/')
                window.location.reload()
              }}
            >
              Erase
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Deletes every kid, quest, photo and XP total stored in this browser. There is no backup and
          no undo.
        </p>
      </Modal>
    </Screen>
  )
}
