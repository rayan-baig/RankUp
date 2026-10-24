import { useState } from 'react'
import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import QuestCard from '../../components/QuestCard.jsx'
import { Screen, SectionTitle, Segmented, EmptyState } from '../../components/ui.jsx'
import HeroArt from '../../components/HeroArt.jsx'
import { navigate } from '../../lib/router.js'

const TABS = [
  { id: 'todo', name: 'To Do' },
  { id: 'waiting', name: 'Waiting' },
  { id: 'done', name: 'Done' },
]

export default function KidQuests() {
  const { state } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const [tab, setTab] = useState('todo')
  if (!kid) return null

  const all = state.quests.filter((q) => q.kidId === kid.id)
  const lists = {
    todo: all.filter((q) => q.status === 'assigned' || q.status === 'redo'),
    waiting: all.filter((q) => q.status === 'submitted'),
    done: all.filter((q) => q.status === 'approved').sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
  }
  const list = lists[tab]

  return (
    <Screen>
      <HeroArt
        slot="hero-quests"
        emblem="⚔️"
        title="Quests"
        sub="Complete quests. Earn XP. Unlock rewards."
      />
      {/* The design counts each pill, so you can see what is waiting
          without opening it. */}
      <Segmented
        options={TABS.map((t) => ({ ...t, name: `${t.name} (${lists[t.id].length})` }))}
        value={tab}
        onChange={setTab}
        label="Which quests"
      />

      {list.length === 0 ? (
        <EmptyState
          icon={tab === 'done' ? '🏅' : '📭'}
          title={tab === 'todo' ? 'No quests to do' : tab === 'waiting' ? 'Nothing waiting' : 'No finished quests yet'}
          body={tab === 'todo' ? 'Ask your parent to assign one.' : undefined}
        />
      ) : (
        <>
          {tab === 'todo' && lists.todo.some((q) => q.status === 'redo') && (
            <SectionTitle>Sent back — do these again</SectionTitle>
          )}
          {/* Keyed on the tab so switching tabs replays the arrival — without
              it, React reuses the nodes and the second tab appears all at
              once while the first one animated. */}
          <div key={tab} className="anim-stagger">
            {list.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                currency={theme.currency}
                onClick={() => navigate(`/kid/quest/${q.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </Screen>
  )
}
