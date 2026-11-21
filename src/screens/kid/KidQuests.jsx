import { useEffect, useState } from 'react'
import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import QuestCard from '../../components/QuestCard.jsx'
import { Screen, SectionTitle, Segmented, EmptyState } from '../../components/ui.jsx'
import HeroArt from '../../components/HeroArt.jsx'
import AppHeader from '../../components/AppHeader.jsx'
import { navigate } from '../../lib/router.js'
import EmptyNext from '../../components/EmptyNext.jsx'
import { peekSent, clearSent, SENT_MS } from '../../lib/sentFlash.js'
// A child's screens sit in a frame on a computer (styles/desk.css).
import '../../styles/desk.css'

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
  // "Sent!", for a moment, when this list was opened by Send to parent.
  const [sent, setSent] = useState(() => peekSent())
  useEffect(() => { clearSent() }, [])
  useEffect(() => {
    if (!sent) return undefined
    const t = setTimeout(() => setSent(null), SENT_MS)
    return () => clearTimeout(t)
  }, [sent])
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
      <AppHeader theme={theme} />
      <HeroArt
        slot="hero-quests"
        emblem="⚔️"
        title="Quests"
        sub="Complete quests. Earn XP. Unlock rewards."
      />
      {sent && (
        <button type="button" className="sent-moment anim-pop" role="status" data-testid="sent-moment" onClick={() => setSent(null)}>
          <span className="sent-moment-tick" aria-hidden="true">✓</span>
          <span className="min-w-0 text-left">
            <span className="block font-display font-extrabold text-lg leading-tight">Sent!</span>
            <span className="block text-xs text-muted line-clamp-2">
              {sent.queued
                ? `“${sent.title}” is saved on your phone and goes to your parent when there is internet.`
                : `“${sent.title}” is with your parent. XP lands when they accept it.`}
            </span>
          </span>
        </button>
      )}
      {/* The design counts each pill, so you can see what is waiting
          without opening it. */}
      <Segmented
        options={TABS.map((t) => ({ ...t, name: `${t.name} (${lists[t.id].length})` }))}
        value={tab}
        onChange={setTab}
        label="Which quests"
      />

      {list.length === 0 && tab === 'todo' && !lists.waiting.length && !lists.done.length ? (
        <EmptyNext which="kidQuests" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={tab === 'done' ? '🏅' : '📭'}
          title={tab === 'todo' ? 'No quests to do' : tab === 'waiting' ? 'Nothing waiting' : 'No finished quests yet'}
          body={tab === 'todo' ? 'Ask your grown-up for another one.' : undefined}
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
