import { useState } from 'react'
import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import QuestCard from '../../components/QuestCard.jsx'
import { Screen, SectionTitle, Tabs, EmptyState } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

const TABS = [
  { id: 'todo', label: 'To do' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'done', label: 'Done' },
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
      <h1 className="font-display text-2xl font-extrabold mb-3">Quests</h1>
      <Tabs tabs={TABS.map((t) => ({ ...t, label: `${t.label} (${lists[t.id].length})` }))} value={tab} onChange={setTab} />

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
          {list.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              currency={theme.currency}
              onClick={() => navigate(`/kid/quest/${q.id}`)}
            />
          ))}
        </>
      )}
    </Screen>
  )
}
