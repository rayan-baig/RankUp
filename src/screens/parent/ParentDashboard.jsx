import { useMemo } from 'react'
import { useApp, useElite, pendingSubmissions } from '../../state/AppContext.jsx'
import { levelFromXp, formatXp } from '../../lib/xp.js'
import { lastSevenDays, relativeTime } from '../../lib/dates.js'
import { resolveKidTheme } from '../../data/kidThemes.js'
import { activeLockout } from '../../state/reducer.js'
import Avatar from '../../components/Avatar.jsx'
import { Screen, Card, Button, SectionTitle, Stat, ProgressBar, EmptyState, Banner, Chip } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

export default function ParentDashboard() {
  const { state } = useApp()
  const elite = useElite()
  const pending = pendingSubmissions(state)

  const weekXp = useMemo(() => {
    const week = new Set(lastSevenDays())
    const per = {}
    state.events.forEach((e) => {
      if (e.type === 'quest_approved' && week.has(e.day)) per[e.kidId] = (per[e.kidId] || 0) + (e.meta?.xp || 0)
    })
    return per
  }, [state.events])

  const totalWeekXp = Object.values(weekXp).reduce((a, b) => a + b, 0)
  const flagged = pending.filter((s) => s.report && s.report.verdict !== 'looks_good')

  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">Parent dashboard</p>
        <h1 className="font-display text-2xl font-extrabold truncate">{state.family.name || 'Your family'}</h1>
      </header>

      <div className="flex gap-2 mb-3">
        <Stat icon="📥" value={pending.length} label="To review" tone={pending.length ? 'var(--warn)' : undefined} />
        <Stat icon="👧" value={state.kids.length} label="Kid profiles" />
        <Stat icon="⭐" value={formatXp(totalWeekXp)} label="XP this week" />
      </div>

      {pending.length > 0 && (
        <Card className="mb-3" style={{ borderColor: 'var(--warn)' }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">📸</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                {pending.length} {pending.length === 1 ? 'submission' : 'submissions'} waiting
              </div>
              <div className="text-xs text-muted">
                {flagged.length > 0 ? `${flagged.length} flagged by the photo check` : 'None flagged by the photo check'}
              </div>
            </div>
            <Button className="px-3 py-2 min-h-0 text-sm" onClick={() => navigate('/parent/approvals')}>Review</Button>
          </div>
        </Card>
      )}

      <SectionTitle action={<button type="button" className="text-xs text-muted underline" onClick={() => navigate('/parent/kids')}>Manage</button>}>
        Kids
      </SectionTitle>

      {state.kids.length === 0 ? (
        <EmptyState icon="👶" title="No kids yet" action={<Button onClick={() => navigate('/parent/kids')}>Add a kid</Button>} />
      ) : (
        state.kids.map((kid) => {
          const { level, progress } = levelFromXp(kid.xp)
          const theme = resolveKidTheme(kid.themeId, level)
          const lock = activeLockout(kid)
          const kidPending = pending.filter((s) => s.kidId === kid.id).length
          const active = state.quests.filter((q) => q.kidId === kid.id && (q.status === 'assigned' || q.status === 'redo')).length
          return (
            <Card key={kid.id} className="mb-2.5">
              <div className="flex items-center gap-3">
                <Avatar theme={theme} level={level} size={54} interactive={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold truncate">{kid.name}</span>
                    <Chip>Lv {level}</Chip>
                    {kid.accessibility?.hasNeeds && <Chip tone="var(--accent-2)">♿ Adaptive</Chip>}
                    {lock && <Chip tone="var(--bad)">{lock.type === 'red' ? 'Locked down' : 'Locked out'}</Chip>}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {theme.currency.icon} {formatXp(kid.coins)} · {active} active · {formatXp(weekXp[kid.id] || 0)} XP this week
                    {kidPending > 0 && ` · ${kidPending} to review`}
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={progress} max={1} height={6} label={`${kid.name} level progress`} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="soft" className="flex-1 py-2 min-h-0 text-sm" onClick={() => navigate(`/parent/assign?kid=${kid.id}`)}>
                  Assign quest
                </Button>
                <Button variant="soft" className="flex-1 py-2 min-h-0 text-sm" onClick={() => navigate(`/parent/blueprint?kid=${kid.id}`)}>
                  Blueprint
                </Button>
              </div>
            </Card>
          )
        })
      )}

      {state.familyGoal && (
        <>
          <SectionTitle>Family goal</SectionTitle>
          <Card className="mb-3">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-semibold">{state.familyGoal.name}</span>
              <span className="text-muted">
                {formatXp(state.kids.reduce((s, k) => s + k.xp, 0))} / {formatXp(state.familyGoal.targetXp)} XP
              </span>
            </div>
            <ProgressBar
              value={state.kids.reduce((s, k) => s + k.xp, 0)}
              max={state.familyGoal.targetXp}
              height={12}
              label="Family goal progress"
            />
          </Card>
        </>
      )}

      <SectionTitle>Elite tools</SectionTitle>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { icon: '🛡️', label: 'Override', to: '/parent/override' },
          { icon: '📊', label: 'Blueprints', to: '/parent/blueprint' },
          { icon: '🏆', label: 'Alliance', to: '/parent/alliance' },
        ].map((t) => (
          <button
            key={t.to}
            type="button"
            onClick={() => navigate(t.to)}
            className="card-flat p-3 text-center relative"
            style={{ opacity: elite ? 1 : 0.65 }}
          >
            <div className="text-xl mb-1" aria-hidden="true">{t.icon}</div>
            <div className="text-[11px] font-semibold">{t.label}</div>
            {!elite && <span className="absolute top-1 right-1.5 text-[10px]">🔒</span>}
          </button>
        ))}
      </div>

      {!elite && (
        <Banner tone="info" icon="⚡" title="Elite Pass — $15.99/mo" action={<Button className="px-3 py-2 min-h-0 text-xs shrink-0" onClick={() => navigate('/parent/plan')}>See it</Button>}>
          Adds the Consequence Engine, Behaviour Blueprints, Parent Alliances, 10-player guilds and a permanent 1.5× XP boost for kids.
        </Banner>
      )}

      <SectionTitle>Recent activity</SectionTitle>
      <Card>
        {state.events.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {[...state.events].reverse().slice(0, 8).map((e) => {
              const kid = state.kids.find((k) => k.id === e.kidId)
              return (
                <li key={e.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{describeEvent(e, kid)}</span>
                  <span className="text-[11px] text-muted shrink-0">{relativeTime(e.at)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </Screen>
  )
}

function describeEvent(e, kid) {
  const who = kid?.name || 'Someone'
  switch (e.type) {
    case 'quest_approved': return `✅ ${who} earned ${e.meta?.xp} XP`
    case 'quest_rejected': return `↩️ You sent a quest back to ${who}`
    case 'quest_submitted': return `📸 ${who} submitted proof`
    case 'quests_assigned': return `📋 ${e.meta?.count} quest(s) assigned to ${who}`
    case 'level_up': return `🎉 ${who} reached level ${e.meta?.to}`
    case 'reward_redeemed': return `🎁 ${who} redeemed ${e.meta?.name}`
    case 'override_applied': return `🛡️ Override (${e.meta?.kind}) applied to ${who}`
    case 'override_lifted': return `🔓 Override lifted for ${who}`
    case 'login_bonus': return `🎁 ${who} claimed the daily bonus`
    case 'tier_changed': return `💳 Plan changed to ${e.meta?.tier}`
    case 'theme_changed': return `🎨 ${who} changed theme`
    case 'kid_added': return `👶 ${who} was added`
    case 'alliance_joined': return '🏆 Joined a Parent Alliance'
    case 'streak_freeze': return `🧊 ${who} used a streak freeze`
    default: return e.type
  }
}
