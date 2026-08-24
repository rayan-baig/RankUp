import { useEffect, useMemo, useState } from 'react'
import { useApp, useKid, useKidTheme, useElite } from '../../state/AppContext.jsx'
import { levelFromXp, formatXp, xpToNext } from '../../lib/xp.js'
import { nextEvolution } from '../../data/kidThemes.js'
import { dayKey, lastSevenDays, formatDuration } from '../../lib/dates.js'
import Avatar, { avatarTier, nextTierLevel } from '../../components/Avatar.jsx'
import QuestCard from '../../components/QuestCard.jsx'
import { Screen, Card, Button, ProgressBar, Stat, SectionTitle, EmptyState, Banner, DemoTag, Chip } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

/** Countdown to the end of Sunday — the weekend challenge window. */
function useWeekendCountdown() {
  // Re-render once a minute, otherwise the "ends in" figure freezes at whatever
  // it was when the screen first opened.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const end = useMemo(() => {
    const now = new Date()
    const d = new Date(now)
    const daysToSunday = (7 - now.getDay()) % 7
    d.setDate(now.getDate() + daysToSunday)
    d.setHours(23, 59, 59, 999)
    return d
  }, [])
  return formatDuration(Math.max(0, end - Date.now()))
}

export default function KidHome() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const elite = useElite()
  const [levelPop, setLevelPop] = useState(false)
  const countdown = useWeekendCountdown()

  if (!kid) return null

  const { level, intoLevel, needed, progress } = levelFromXp(kid.xp)
  const tier = avatarTier(level)
  const nextTier = nextTierLevel(level)
  const evolution = nextEvolution(kid.themeId, level)
  const quests = state.quests.filter((q) => q.kidId === kid.id)
  const active = quests.filter((q) => q.status === 'assigned' || q.status === 'redo')
  const waiting = quests.filter((q) => q.status === 'submitted')
  const bonusAvailable = kid.lastLoginBonus !== dayKey()

  const weekXp = useMemo(() => {
    const week = new Set(lastSevenDays())
    return state.events
      .filter((e) => e.kidId === kid.id && e.type === 'quest_approved' && week.has(e.day))
      .reduce((sum, e) => sum + (e.meta?.xp || 0), 0)
  }, [state.events, kid.id])

  const unreadNotes = state.notes.filter((n) => n.kidId === kid.id && n.from === 'parent' && !n.read)

  return (
    <Screen>
      <header className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted">{theme.name}</p>
          <h1 className="font-display text-2xl font-extrabold truncate">Hi {kid.name} 👋</h1>
        </div>
        <button type="button" onClick={() => navigate('/kid/profile')} className="chip shrink-0">
          Lv {level}
        </button>
      </header>

      {/* Avatar + level */}
      <Card className="mb-3 text-center relative overflow-visible">
        <div className="flex justify-center mb-2">
          <Avatar
            theme={theme}
            level={level}
            size={132}
            companion={Boolean(theme.evolution?.companion)}
            frame={elite ? kid.profileFrame : 'none'}
            onTap={() => setLevelPop((p) => !p)}
          />
        </div>
        <div className="flex items-baseline justify-center gap-2 mb-1">
          <span className="font-display text-3xl font-extrabold">Level {level}</span>
          <span className="chip">Form {tier} / 5</span>
        </div>
        <p className="text-xs text-muted mb-3">
          {formatXp(intoLevel)} / {formatXp(needed)} XP to level {level + 1}
          {elite && <span style={{ color: 'var(--accent-2)' }}> · ⚡ 1.5× Elite boost active</span>}
        </p>
        <ProgressBar value={progress} max={1} height={12} label="Level progress" />

        {(nextTier || evolution) && (
          <div className="flex flex-wrap gap-1.5 justify-center mt-3">
            {nextTier && <Chip>Next form at level {nextTier}</Chip>}
            {evolution && (
              <Chip tone="var(--accent-2)">
                {evolution.label} unlocks at {evolution.level}
              </Chip>
            )}
          </div>
        )}
        {levelPop && (
          <p className="text-xs text-muted mt-2 anim-pop">
            Every quest your parent approves adds XP. {xpToNext(level)} XP per level right now.
          </p>
        )}
      </Card>

      <div className="flex gap-2 mb-3">
        <Stat icon={theme.currency.icon} value={formatXp(kid.coins)} label={theme.currency.name} tone="var(--accent)" />
        <Stat icon="🔥" value={kid.streak.count} label="Day streak" tone="var(--warn)" />
        <Stat icon="⭐" value={formatXp(weekXp)} label="XP this week" />
      </div>

      {bonusAvailable && (
        <Card className="mb-3 flex items-center gap-3" style={{ borderColor: 'var(--accent)' }}>
          <span className="text-2xl" aria-hidden="true">🎁</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Daily login bonus</div>
            <div className="text-xs text-muted">+5 {theme.currency.name} just for showing up.</div>
          </div>
          <Button className="px-3 py-2 min-h-0" onClick={() => dispatch({ type: 'CLAIM_LOGIN_BONUS', kidId: kid.id })}>
            Claim
          </Button>
        </Card>
      )}

      {unreadNotes.length > 0 && (
        <Card className="mb-3" style={{ borderColor: 'var(--accent-2)' }}>
          <SectionTitle>Note from your parent</SectionTitle>
          {unreadNotes.slice(-2).map((n) => (
            <p key={n.id} className="text-sm mb-1">“{n.text}”</p>
          ))}
          <Button variant="soft" className="w-full mt-2" onClick={() => dispatch({ type: 'MARK_NOTES_READ', kidId: kid.id, as: 'kid' })}>
            Got it
          </Button>
        </Card>
      )}

      <Card className="mb-3 flex items-center gap-3" style={{ borderColor: 'var(--warn)' }}>
        <span className="text-2xl" aria-hidden="true">🏁</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Weekend Challenge</span>
            <DemoTag>Sample event</DemoTag>
          </div>
          <div className="text-xs text-muted">Ends in {countdown}. Real timed events need a shared server.</div>
        </div>
      </Card>

      <SectionTitle action={<button type="button" className="text-xs text-muted underline" onClick={() => navigate('/kid/quests')}>See all</button>}>
        Today's quests
      </SectionTitle>

      {active.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="Nothing assigned right now"
          body="When your parent adds a quest it shows up here."
        />
      ) : (
        active.slice(0, 4).map((q) => (
          <QuestCard key={q.id} quest={q} currency={theme.currency} onClick={() => navigate(`/kid/quest/${q.id}`)} />
        ))
      )}

      {waiting.length > 0 && (
        <>
          <SectionTitle>Waiting for approval</SectionTitle>
          <Banner tone="info" icon="⏳">
            {waiting.length} {waiting.length === 1 ? 'quest is' : 'quests are'} with your parent. XP lands when they approve.
          </Banner>
        </>
      )}
    </Screen>
  )
}
