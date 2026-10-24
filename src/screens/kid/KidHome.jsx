import { useMemo, useState } from 'react'
import { useApp, useKid, useKidTheme, useElite } from '../../state/AppContext.jsx'
import { levelFromXp, formatXp, xpToNext } from '../../lib/xp.js'
import { nextEvolution } from '../../data/kidThemes.js'
import { isMarketOpen } from '../../data/marketSkins.js'
import { dayKey, lastSevenDays } from '../../lib/dates.js'
import Avatar, { avatarTier, nextTierLevel, tiersFor } from '../../components/Avatar.jsx'
import QuestCard from '../../components/QuestCard.jsx'
import { Screen, Card, Button, ProgressBar, Stat, SectionTitle, EmptyState, Banner, Chip } from '../../components/ui.jsx'
import { Words, CountUp } from '../../components/Motion.jsx'
import SyncBadge from '../../components/SyncBadge.jsx'
import { navigate } from '../../lib/router.js'
import InstallPrompt from '../../components/InstallPrompt.jsx'

export default function KidHome() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const elite = useElite()
  const [levelPop, setLevelPop] = useState(false)

  if (!kid) return null

  const { level, intoLevel, needed, progress } = levelFromXp(kid.xp)
  const tier = avatarTier(level, theme)
  const nextTier = nextTierLevel(level, theme)
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
      {/*
        Laid out to match the design: a bar with the app name and the
        theme, then one header card with the avatar on the left and the
        level, XP and bar beside it, with the streak sitting to its right.
        Then the quest you are on, three small cards, and the way forward.
      */}
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="font-display font-extrabold tracking-tight"
            style={{
              fontSize: 20,
              color: 'var(--accent)',
              textShadow: '0 0 18px color-mix(in srgb, var(--accent) 60%, transparent)',
            }}
          >
            RANKUP
          </span>
          <span className="chip shrink-0">{theme.currency.icon} {theme.name}</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/kid/profile')}
          aria-label="Your profile"
          className="chip shrink-0"
        >
          Lv {level}
        </button>
      </header>

      <SyncBadge />

      {/* The header card: who you are and how far along you are. */}
      <Card className="mb-3 fx-hero">
        <div className="flex items-center gap-3">
          <Avatar
            theme={theme}
            level={level}
            size={78}
            companion={Boolean(theme.evolution?.companion)}
            frame={elite ? kid.profileFrame : 'none'}
            onTap={() => setLevelPop((p) => !p)}
          />
          <div className="min-w-0 flex-1">
            <Words as="h1" className="font-display text-xl font-extrabold truncate">
              {kid.name}
            </Words>
            {/* One line, so it does not wrap on a narrow phone and push
                the bar down. The form number lives on the chip below. */}
            <p className="text-xs text-muted mb-1.5 truncate">
              Level <CountUp value={level} /> · {formatXp(kid.xp)} XP
            </p>
            <ProgressBar value={progress} max={1} height={9} label="Level progress" />
            <p className="text-[11px] text-muted mt-1">
              Next level: {formatXp(needed - intoLevel)} XP to go
              {elite && <span style={{ color: 'var(--accent-2)' }}> · ⚡ 1.5× Elite</span>}
            </p>
          </div>
          {/* The streak, beside the avatar as in the design. */}
          <div
            className="text-center shrink-0 px-2.5 py-2 rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--warn) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--warn) 42%, transparent)',
              boxShadow: '0 0 18px -10px var(--warn)',
            }}
          >
            <div className="text-lg leading-none" aria-hidden="true">🔥</div>
            <div className="font-display font-extrabold text-lg leading-none mt-0.5">
              <CountUp value={kid.streak.count} />
            </div>
            <div className="text-[9px] uppercase tracking-wider text-muted">Day streak</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
            <Chip tone="var(--accent)">Form {tier} / {tiersFor(theme).length}</Chip>
            {nextTier && <Chip>Next form at level {nextTier}</Chip>}
            {evolution && (
              <Chip tone="var(--accent-2)">
                {evolution.label} unlocks at {evolution.level}
              </Chip>
            )}
        </div>
        {levelPop && (
          <p className="text-xs text-muted mt-2 anim-pop">
            Every quest your parent approves adds XP. {xpToNext(level)} XP per level right now.
          </p>
        )}
      </Card>

      {/* The one you are on, with how far through it you are. */}
      {active.length > 0 && (
        <>
          <SectionTitle>Current quest</SectionTitle>
          <Card
            className="mb-3"
            onClick={() => navigate(`/kid/quest/${active[0].id}`)}
            style={{ cursor: 'pointer' }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0" aria-hidden="true">{active[0].icon || '🎯'}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{active[0].title}</div>
                <div className="text-xs text-muted">
                  {active.length === 1 ? 'The only one left today.' : `${active.length} to do today.`}
                </div>
              </div>
              <span
                className="font-display font-extrabold text-sm shrink-0"
                style={{ color: 'var(--accent)' }}
              >
                {waiting.length + 1} / {active.length + waiting.length}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={waiting.length}
                max={active.length + waiting.length}
                height={8}
                label="Quests done today"
              />
            </div>
          </Card>
        </>
      )}

      {/* Three small cards, as in the design. */}
      <div className="flex gap-2 mb-3 anim-stagger">
        {/*
          * Counting, not just displaying.
          *
          * This is the one piece of motion in the app doing a job rather than
          * being nice: a child who watches 158 climb to 203 has felt the
          * reward. One who finds the number already sitting there has been
          * told about it.
          */}
        <Stat
          icon={theme.currency.icon}
          value={<CountUp value={kid.coins} format={formatXp} />}
          label={theme.currency.name}
          tone="var(--accent)"
        />
        <Stat
          icon="🎯"
          value={`${waiting.length}/${active.length + waiting.length || 1}`}
          label="Weekly goal"
          tone="var(--accent-2)"
        />
        <Stat icon="⭐" value={<CountUp value={weekXp} format={formatXp} />} label="XP this week" />
      </div>

      {/* The way forward, which the design puts right under the numbers. */}
      <Card
        className="mb-3 flex items-center gap-3"
        onClick={() => navigate(active.length ? '/kid/quests' : '/kid/arcade')}
        style={{ cursor: 'pointer', borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))' }}
      >
        <span className="text-2xl shrink-0" aria-hidden="true">{active.length ? '⚔️' : '🎮'}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">
            {active.length ? 'Ready for the next challenge?' : 'Nothing left to do'}
          </div>
          <div className="text-xs text-muted">
            {active.length ? "Keep going, you're doing great." : 'Spend a token in the arcade.'}
          </div>
        </div>
        <span className="text-muted shrink-0" aria-hidden="true">›</span>
      </Card>

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

      {/*
        Only while the market is actually open. A card counting down to it would
        be the exact pressure the market is written to avoid putting on a child
        — see the note at the top of data/marketSkins.js.
      */}
      {isMarketOpen() && (
        <button
          type="button"
          onClick={() => navigate('/kid/market')}
          className="card w-full mb-3 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
          style={{ borderColor: 'var(--accent)' }}
        >
          <span className="text-2xl" aria-hidden="true">🛍️</span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-sm">The Sunday Market is open</span>
            <span className="block text-xs text-muted">Skins you cannot get any other day.</span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>
      )}

      <InstallPrompt />

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
