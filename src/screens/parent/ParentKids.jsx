import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { canAddKid, planOf } from '../../state/reducer.js'
import { makeKid } from '../../state/initialState.js'
import { ADAPTIVE_SUPPORTS } from '../../data/questTemplates.js'
import { KID_THEMES, resolveKidTheme } from '../../data/kidThemes.js'
import { levelFromXp, formatXp } from '../../lib/xp.js'
import Avatar from '../../components/Avatar.jsx'
import ThemePicker from '../../components/ThemePicker.jsx'
import { Screen, Card, Button, Field, TextInput, TextArea, Modal, Chip, Banner, Toggle } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

export default function ParentKids() {
  const { state, dispatch } = useApp()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [draft, setDraft] = useState({ name: '', themeId: KID_THEMES[0].id, hasNeeds: false, notes: '', supports: [] })

  const resetDraft = () => setDraft({ name: '', themeId: KID_THEMES[0].id, hasNeeds: false, notes: '', supports: [] })

  const addKid = () => {
    dispatch({
      type: 'ADD_KID',
      kid: makeKid({
        name: draft.name.trim(),
        themeId: draft.themeId,
        accessibility: { hasNeeds: draft.hasNeeds, notes: draft.notes.trim(), supports: draft.supports },
      }),
    })
    resetDraft()
    setAdding(false)
  }

  const toggleSupport = (list, s) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s])
  const room = canAddKid(state)

  return (
    <Screen>
      <div className="flex items-center justify-between mb-3">
        <h1 className="font-display text-2xl font-extrabold">Kids</h1>
        <Button
          className="px-3 py-2 min-h-0 text-sm"
          disabled={!room}
          onClick={() => setAdding(true)}
        >
          + Add
        </Button>
      </div>

      {room ? (
        <Banner tone="info" icon="∞" title="Unlimited kid profiles">
          {planOf(state).name} allows as many kid profiles as you need.
        </Banner>
      ) : (
        <Banner
          tone="warn"
          icon="👧"
          title={`${planOf(state).name} covers one child`}
          action={<Button className="px-3 py-2 min-h-0 text-sm" onClick={() => navigate('/parent/plan')}>See plans</Button>}
        >
          Standard is $5 more a month and adds unlimited children, plus the AI check on every
          photo. Nothing this child has earned is affected either way.
        </Banner>
      )}

      <div className="mt-3">
        {state.kids.map((kid) => {
          const { level } = levelFromXp(kid.xp)
          const theme = resolveKidTheme(kid.themeId, level)
          const questCount = state.quests.filter((q) => q.kidId === kid.id && q.status !== 'approved').length
          return (
            <Card key={kid.id} className="mb-3">
              <div className="flex items-center gap-3">
                <Avatar theme={theme} level={level} size={56} interactive={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold truncate">{kid.name}</span>
                    <Chip>Lv {level}</Chip>
                    {kid.accessibility?.hasNeeds && <Chip tone="var(--accent-2)">♿ Adaptive</Chip>}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {theme.name} · {theme.currency.icon} {formatXp(kid.coins)} · {questCount} open quests
                  </div>
                </div>
              </div>

              {kid.accessibility?.hasNeeds && kid.accessibility.notes && (
                <p className="text-xs text-muted mt-2 italic">“{kid.accessibility.notes}”</p>
              )}
              {kid.accessibility?.supports?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {kid.accessibility.supports.map((s) => <Chip key={s} tone="var(--accent-2)">{s}</Chip>)}
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <Button variant="soft" className="flex-1 py-2 min-h-0 text-sm" onClick={() => setEditing({ ...kid, ...kid.accessibility })}>
                  Edit
                </Button>
                <Button variant="soft" className="flex-1 py-2 min-h-0 text-sm" onClick={() => navigate(`/parent/assign?kid=${kid.id}`)}>
                  Assign
                </Button>
                <Button variant="ghost" className="px-3 py-2 min-h-0 text-sm" onClick={() => setRemoving(kid)} aria-label={`Remove ${kid.name}`}>
                  🗑
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Add kid */}
      <Modal
        open={adding}
        onClose={() => { setAdding(false); resetDraft() }}
        title="Add a kid"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => { setAdding(false); resetDraft() }}>Cancel</Button>
            <Button className="flex-1" disabled={!draft.name.trim()} onClick={addKid}>Add</Button>
          </>
        }
      >
        <Field label="Name">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
        </Field>
        <div className="card-flat p-3 mb-3">
          <Toggle
            checked={draft.hasNeeds}
            onChange={(v) => setDraft({ ...draft, hasNeeds: v })}
            label="Physical or mental disability"
            hint="Turns on adaptive quests by default for this kid."
          />
        </div>
        {draft.hasNeeds && (
          <>
            <Field label="Notes (private to you)">
              <TextArea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            <span className="label">Default supports</span>
            <div className="flex flex-wrap gap-2 mb-3">
              {ADAPTIVE_SUPPORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  style={draft.supports.includes(s) ? { borderColor: 'var(--accent-2)', color: 'var(--accent-2)' } : undefined}
                  onClick={() => setDraft({ ...draft, supports: toggleSupport(draft.supports, s) })}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        <span className="label">Starting theme</span>
        <p className="text-xs text-muted mb-2">Your kid can be the one to pick this — hand them the phone.</p>
        <ThemePicker value={draft.themeId} onChange={(id) => setDraft({ ...draft, themeId: id })} showEvolutionPreview={false} />
      </Modal>

      {/* Edit kid */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name || ''}`}
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              className="flex-1"
              onClick={() => {
                dispatch({
                  type: 'UPDATE_KID',
                  kidId: editing.id,
                  patch: {
                    name: editing.name.trim(),
                    accessibility: { hasNeeds: editing.hasNeeds, notes: editing.notes || '', supports: editing.supports || [] },
                  },
                })
                setEditing(null)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Name">
              <TextInput value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <div className="card-flat p-3 mb-3">
              <Toggle
                checked={Boolean(editing.hasNeeds)}
                onChange={(v) => setEditing({ ...editing, hasNeeds: v })}
                label="Physical or mental disability"
                hint="New quests for this kid default to adaptive."
              />
            </div>
            {editing.hasNeeds && (
              <>
                <Field label="Notes (private to you)">
                  <TextArea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
                </Field>
                <span className="label">Default supports</span>
                <div className="flex flex-wrap gap-2">
                  {ADAPTIVE_SUPPORTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chip"
                      style={(editing.supports || []).includes(s) ? { borderColor: 'var(--accent-2)', color: 'var(--accent-2)' } : undefined}
                      onClick={() => setEditing({ ...editing, supports: toggleSupport(editing.supports || [], s) })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      {/* Remove kid */}
      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                dispatch({ type: 'REMOVE_KID', kidId: removing.id })
                setRemoving(null)
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm">
          This deletes {removing?.name}'s profile, their quests and their submissions. Their XP and
          currency cannot be recovered.
        </p>
      </Modal>
    </Screen>
  )
}
