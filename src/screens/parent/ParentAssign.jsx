import { useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { DIFFICULTY_LIST, DIFFICULTY } from '../../lib/xp.js'
import { CATEGORIES, QUEST_PACKS, ADAPTIVE_SUPPORTS } from '../../data/questTemplates.js'
import { Screen, Card, Button, Field, TextInput, TextArea, Select, Toggle, Chip, Banner, Tabs } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

const TABS = [
  { id: 'custom', label: 'Write one' },
  { id: 'packs', label: 'Quest packs' },
]

const blankQuest = (kidId, adaptive) => ({
  kidId,
  title: '',
  description: '',
  category: 'bedroom',
  difficulty: 'medium',
  xp: DIFFICULTY.medium.xp,
  requiresPhoto: true,
  adaptive,
  doneMeans: '',
  supports: [],
  why: '',
  timerSeconds: 0,
  testScore: false,
  doubleXp: false,
})

export default function ParentAssign({ initialKidId }) {
  const { state, dispatch } = useApp()
  const [kidId, setKidId] = useState(initialKidId || state.kids[0]?.id || '')
  const [tab, setTab] = useState('custom')
  const kid = state.kids.find((k) => k.id === kidId)
  const [quest, setQuest] = useState(() => blankQuest(kidId, Boolean(kid?.accessibility?.hasNeeds)))
  const [saved, setSaved] = useState('')

  const set = (patch) => setQuest((q) => ({ ...q, ...patch }))

  const switchKid = (id) => {
    setKidId(id)
    const k = state.kids.find((x) => x.id === id)
    setQuest((q) => ({ ...q, kidId: id, adaptive: Boolean(k?.accessibility?.hasNeeds), supports: k?.accessibility?.supports || [] }))
  }

  const save = () => {
    if (!quest.title.trim() || !kidId) return
    dispatch({
      type: 'ADD_QUESTS',
      quests: [{ ...quest, kidId, title: quest.title.trim(), xp: Number(quest.xp) || DIFFICULTY[quest.difficulty].xp }],
    })
    setSaved(`“${quest.title.trim()}” assigned to ${kid?.name}.`)
    setQuest(blankQuest(kidId, Boolean(kid?.accessibility?.hasNeeds)))
    setTimeout(() => setSaved(''), 4000)
  }

  const addPack = (pack) => {
    dispatch({
      type: 'ADD_QUESTS',
      quests: pack.quests.map((q) => ({
        ...q,
        kidId,
        xp: DIFFICULTY[q.difficulty]?.xp ?? DIFFICULTY.medium.xp,
        supports: q.supports || [],
        // A random one-in-six chance of a surprise double-XP quest.
        doubleXp: Math.random() < 0.17,
      })),
    })
    setSaved(`${pack.quests.length} quests from the ${pack.label} added to ${kid?.name}.`)
    setTimeout(() => setSaved(''), 4000)
  }

  const toggleSupport = (s) =>
    set({ supports: quest.supports.includes(s) ? quest.supports.filter((x) => x !== s) : [...quest.supports, s] })

  if (state.kids.length === 0) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-3">Assign a quest</h1>
        <Banner tone="warn" icon="👶" title="Add a kid first">
          Quests belong to a kid profile.
        </Banner>
        <Button className="w-full mt-3" onClick={() => navigate('/parent/kids')}>Add a kid</Button>
      </Screen>
    )
  }

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-3">Assign a quest</h1>

      <Field label="For which kid">
        <Select value={kidId} onChange={(e) => switchKid(e.target.value)}>
          {state.kids.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </Select>
      </Field>

      {kid?.accessibility?.hasNeeds && (
        <Banner tone="info" icon="♿" title="Adaptive mode is on for this kid">
          {kid.accessibility.notes || 'Quests default to adaptive: same rewards, difficulty and "done" set around what they can do.'}
        </Banner>
      )}

      {saved && <div className="mt-3"><Banner tone="good" icon="✅" title="Assigned">{saved}</Banner></div>}

      <div className="mt-3">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'packs' ? (
        QUEST_PACKS.map((pack) => (
          <Card key={pack.id} className="mb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display font-bold">{pack.label}</h3>
                <p className="text-xs text-muted">Ages {pack.ages} · {pack.blurb}</p>
              </div>
              {pack.adaptive && <Chip tone="var(--accent-2)">♿</Chip>}
            </div>
            <ul className="text-sm text-muted mt-2 space-y-1">
              {pack.quests.slice(0, 4).map((q) => (
                <li key={q.title} className="truncate">• {q.title}</li>
              ))}
              {pack.quests.length > 4 && <li className="text-xs">+ {pack.quests.length - 4} more</li>}
            </ul>
            <Button variant="soft" className="w-full mt-3" onClick={() => addPack(pack)}>
              Add all {pack.quests.length} to {kid?.name}
            </Button>
          </Card>
        ))
      ) : (
        <Card>
          <Field label="Quest title">
            <TextInput value={quest.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Make your bed" />
          </Field>

          <Field label="Details (optional)">
            <TextArea value={quest.description} onChange={(e) => set({ description: e.target.value })} placeholder="Anything they need to know before starting." />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={quest.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Difficulty">
              <Select
                value={quest.difficulty}
                onChange={(e) => set({ difficulty: e.target.value, xp: DIFFICULTY[e.target.value].xp })}
              >
                {DIFFICULTY_LIST.map((d) => (
                  <option key={d.id} value={d.id}>{d.label} · {d.xp} XP</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="XP reward" hint="Defaults to the difficulty. Override it for anything unusual.">
            <TextInput
              value={quest.xp}
              onChange={(e) => set({ xp: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              inputMode="numeric"
            />
          </Field>

          <Field
            label={quest.adaptive ? 'What counts as done for this kid' : 'What counts as done'}
            hint="Both your kid and the photo check read this. Be concrete."
          >
            <TextArea
              value={quest.doneMeans}
              onChange={(e) => set({ doneMeans: e.target.value })}
              placeholder={quest.adaptive ? 'e.g. Three items put away. Which three is up to them.' : 'e.g. Duvet flat, pillows at the top, floor clear.'}
            />
          </Field>

          <Field label="Why this matters (optional)" hint="Shown to your kid as a tooltip on the quest.">
            <TextInput value={quest.why} onChange={(e) => set({ why: e.target.value })} placeholder="e.g. Starting the day with one finished thing makes the rest easier." />
          </Field>

          <div className="card-flat p-3 mb-3">
            <Toggle
              checked={quest.adaptive}
              onChange={(v) => set({ adaptive: v })}
              label="Adaptive / special task"
              hint="Same reward structure; difficulty and the definition of done are scoped to this kid's limits."
            />
            {quest.adaptive && (
              <div className="mt-3">
                <span className="label">Supports</span>
                <div className="flex flex-wrap gap-2">
                  {ADAPTIVE_SUPPORTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSupport(s)}
                      className="chip"
                      style={quest.supports.includes(s) ? { borderColor: 'var(--accent-2)', color: 'var(--accent-2)' } : undefined}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-2">
                  Adaptive quests are scored more leniently by the photo check, and partial credit is
                  expected rather than exceptional.
                </p>
              </div>
            )}
          </div>

          <div className="card-flat p-3 mb-3 divide-y" style={{ borderColor: 'var(--line)' }}>
            <Toggle checked={quest.requiresPhoto} onChange={(v) => set({ requiresPhoto: v })} label="Require photo proof" hint="Uses the in-app camera and runs the AI check." />
            <Toggle checked={quest.doubleXp} onChange={(v) => set({ doubleXp: v })} label="Surprise 2× XP" hint="Doubles the base XP for this quest." />
            <Toggle checked={quest.testScore} onChange={(v) => set({ testScore: v })} label="Test-score quest" hint="Kid enters a percentage; 80%+ earns a bonus." />
            <Toggle
              checked={quest.timerSeconds > 0}
              onChange={(v) => set({ timerSeconds: v ? 600 : 0 })}
              label="Race the clock"
              hint="Adds a timer and a 25% bonus for finishing inside it."
            />
            {quest.timerSeconds > 0 && (
              <div className="pt-3">
                <Field label="Target time (minutes)">
                  <TextInput
                    value={Math.round(quest.timerSeconds / 60)}
                    onChange={(e) => set({ timerSeconds: (Number(e.target.value.replace(/\D/g, '')) || 0) * 60 })}
                    inputMode="numeric"
                  />
                </Field>
              </div>
            )}
          </div>

          <Button className="w-full" disabled={!quest.title.trim()} onClick={save}>
            Assign to {kid?.name}
          </Button>
        </Card>
      )}
    </Screen>
  )
}
