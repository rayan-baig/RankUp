import { useState } from 'react'
import { useApp, useKid, useKidTheme, useElite } from '../../state/AppContext.jsx'
import { levelFromXp, formatXp, xpToNext, liveStreak, DIFFICULTY } from '../../lib/xp.js'
import { nextEvolution, storyChapters } from '../../data/kidThemes.js'
import { storyProgress, dragonFight, DRAGON_HP, HERO_HP } from '../../lib/dragonFight.js'
import { isMarketOpen } from '../../data/marketSkins.js'
import { dayKey } from '../../lib/dates.js'
import Avatar, { avatarTier, nextTierLevel, tiersFor } from '../../components/Avatar.jsx'
import QuestCard from '../../components/QuestCard.jsx'
import { Screen, Card, Button, ProgressBar, Stat, SectionTitle, EmptyState, Banner, Chip } from '../../components/ui.jsx'
import { Words, CountUp } from '../../components/Motion.jsx'
import SyncBadge from '../../components/SyncBadge.jsx'
import { navigate } from '../../lib/router.js'
import AppHeader from '../../components/AppHeader.jsx'
import { useKidSchool } from './useKidSchool.js'
import { familyGoalProgress } from '../../state/reducer.js'
import { CATEGORY_MAP } from '../../data/questTemplates.js'

export default function KidHome() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const elite = useElite()
  const [levelPop, setLevelPop] = useState(false)
  const school = useKidSchool(kid)

  if (!kid) return null

  const { level, intoLevel, needed, progress } = levelFromXp(kid.xp)
  const tier = avatarTier(level, theme)
  const nextTier = nextTierLevel(level, theme)
  const story = storyProgress(state, kid)
  const evolution = nextEvolution(kid.themeId, level, story)
  /* Themes told as a story (Block Craft): the newest chapter not yet
     watched, and the dragon fight while it is on. */
  const chapters = storyChapters(kid.themeId, level, story)
  const unwatched = chapters.filter((c) => c.chapter !== 'dragon' && !kid.storySeen?.[c.chapter])
  const newChapter = unwatched[unwatched.length - 1] || null
  const fight = dragonFight(state, kid)
  const fightOn = fight.active && !fight.defeatedAt
  const fightNews = fightOn ? fight.events.filter((e) => e.at > (kid.storySeen?.dragon || 0)).length : 0
  const quests = state.quests.filter((q) => q.kidId === kid.id)
  const active = quests.filter((q) => q.status === 'assigned' || q.status === 'redo')
  const waiting = quests.filter((q) => q.status === 'submitted')
  /*
   * The way forward, said for where the child actually is, and the first
   * thing under their name. It used to be a "Current quest" row with a
   * "1 / 7" nobody could read, then three number cards, then "Ready for the
   * next challenge?" — so a child opening a fresh phone saw their level
   * three times before being told what to do. Now: the quest, what it pays,
   * and one button. "Nothing left to do, spend a token in the arcade" was
   * once shown to a child in a family that had just been set up: no chore
   * ever assigned and no token to spend, so each case says its own thing.
   */
  const hasTokens = Boolean(state.demo) || (kid.playTokens || 0) > 0
  // A chore sent back comes first: it is the one a parent is waiting on.
  const nextQuest = active.find((q) => q.status === 'redo') || active[0] || null
  const next = hasTokens
    ? { icon: '🎮', to: '/kid/arcade', title: 'Nothing left to do', line: 'Spend a token in the arcade.' }
    : waiting.length
      ? { icon: '⏳', to: '/kid/quests', title: 'All sent', line: 'Your parent is checking what you did.' }
      : quests.length
        ? { icon: '✅', to: '/kid/quests', title: 'All done for now', line: 'New quests show up here when your parent adds them.' }
        : { icon: '📜', to: '/kid/quests', title: 'No quests yet', line: 'Ask your parent to give you your first quest.' }
  // A day later than today (the server's, after a zone change) counts as claimed.
  const bonusAvailable = !kid.lastLoginBonus || kid.lastLoginBonus < dayKey()

  const unreadNotes = state.notes.filter((n) => n.kidId === kid.id && n.from === 'parent' && !n.read)

  /* The cheapest reward still out of reach — the one worth saving for. */
  const nextReward = [...state.rewards]
    .sort((a, b) => a.cost - b.cost)
    .find((r) => r.cost > kid.coins) || [...state.rewards].sort((a, b) => b.cost - a.cost)[0] || null

  return (
    <Screen>
      {/*
        Laid out to match the design: a bar with the app name and the
        theme, then one header card with the avatar on the left and the
        level, XP and bar beside it, with the streak sitting to its right.
        Then the quest you are on, three small cards, and the way forward.
      */}
      <AppHeader theme={theme} />

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
              <CountUp value={liveStreak(kid.streak)} />
            </div>
            <div className="text-[9px] uppercase tracking-wider text-muted">Day streak</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
            <Chip tone="var(--accent)">Form {tier} / {tiersFor(theme).length}</Chip>
            {nextTier && <Chip>Next form at level {nextTier}</Chip>}
            {/* When, never what: a world nobody has reached is a secret. */}
            {evolution && (
              <Chip tone="var(--accent-2)">
                {evolution.requires === 'dragonDefeated'
                  ? '🔒 Beat the dragon to find out what comes next'
                  : `🔒 Secret world at level ${evolution.level}`}
              </Chip>
            )}
        </div>
        {levelPop && (
          <p className="text-xs text-muted mt-2 anim-pop">
            Every quest your parent approves adds XP. {xpToNext(level)} XP per level right now.
          </p>
        )}
      </Card>

      <SectionTitle>Do this next</SectionTitle>
      {nextQuest ? (
        <Card className="mb-3" data-testid="next-up" style={{ borderColor: nextQuest.status === 'redo' ? 'var(--warn)' : 'var(--accent)' }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl shrink-0" aria-hidden="true">{CATEGORY_MAP[nextQuest.category]?.icon || '🎯'}</span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold truncate">{nextQuest.title}</div>
              <div className="text-xs text-muted">
                {nextQuest.status === 'redo'
                  ? 'Sent back. Have another go.'
                  : `+${nextQuest.xp ?? DIFFICULTY[nextQuest.difficulty]?.xp ?? 0} XP · ${theme.currency.icon} +${Math.max(1, Math.round((nextQuest.xp ?? DIFFICULTY[nextQuest.difficulty]?.xp ?? 0) / 5))}`}
              </div>
            </div>
          </div>
          <Button className="w-full mt-3" onClick={() => navigate(`/kid/quest/${nextQuest.id}`)}>
            Start this quest
          </Button>
          <p className="text-[11px] text-muted mt-2 text-center">
            {active.length === 1 ? 'Your last one for now.' : `${active.length - 1} more after this one.`}
          </p>
        </Card>
      ) : (
        <Card
          className="mb-3 flex items-center gap-3"
          data-testid="next-up"
          onClick={() => navigate(next.to)}
          style={{ cursor: 'pointer', borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))' }}
        >
          <span className="text-2xl shrink-0" aria-hidden="true">{next.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm">{next.title}</div>
            <div className="text-xs text-muted">{next.line}</div>
          </div>
          <span className="text-muted shrink-0" aria-hidden="true">›</span>
        </Card>
      )}

      {/* The story: a new chapter to watch, or the fight that is on. */}
      {newChapter && (
        <button
          type="button"
          onClick={() => navigate(`/kid/story/${newChapter.chapter}`)}
          className="card w-full mb-3 p-4 flex items-center gap-3 text-left transition-transform active:scale-[0.98] anim-pop"
          style={{ borderColor: 'var(--accent)', boxShadow: '0 0 22px -10px var(--accent)' }}
        >
          <span className="text-2xl shrink-0" aria-hidden="true">🎬</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-wider" style={{ color: 'var(--accent)' }}>New chapter</span>
            <span className="block font-semibold text-sm truncate">{newChapter.label}</span>
            <span className="block text-xs text-muted">Watch the battle.</span>
          </span>
          <span aria-hidden="true" className="text-muted">▶</span>
        </button>
      )}
      {fightOn && (
        <button
          type="button"
          onClick={() => navigate('/kid/dragon')}
          className="card w-full mb-3 p-4 text-left transition-transform active:scale-[0.98]"
          style={{ borderColor: '#c94bff' }}
        >
          <span className="flex items-center gap-3 mb-2">
            <span className="text-2xl shrink-0" aria-hidden="true">🐉</span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-sm">The dragon fight</span>
              <span className="block text-xs text-muted">
                {fightNews ? `${fightNews} new ${fightNews === 1 ? 'move' : 'moves'} to watch.` : 'Every chore you finish is a hit.'}
              </span>
            </span>
            <span aria-hidden="true" className="text-muted">›</span>
          </span>
          <span className="grid grid-cols-2 gap-3 text-[11px]">
            <span>
              <span className="block mb-1">You · {fight.hero}</span>
              <ProgressBar value={fight.hero} max={HERO_HP} height={7} tone="#5ad85a" label="Your health" />
            </span>
            <span>
              <span className="block mb-1">Dragon · {fight.dragon}</span>
              <ProgressBar value={fight.dragon} max={DRAGON_HP} height={7} tone="#c94bff" label="The dragon's health" />
            </span>
          </span>
        </button>
      )}
      {!newChapter && !fightOn && chapters.length > 0 && (
        <button
          type="button"
          onClick={() => navigate(`/kid/story/${chapters.filter((c) => c.chapter !== 'dragon').pop().chapter}`)}
          className="card w-full mb-3 p-3 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
        >
          <span className="text-xl shrink-0" aria-hidden="true">📖</span>
          <span className="flex-1 min-w-0 text-sm">Your story so far</span>
          <span className="text-xs text-muted">Watch again ▶</span>
        </button>
      )}

      {school && (
        <button
          type="button"
          onClick={() => navigate('/kid/school')}
          className="card w-full mb-3 p-3 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
        >
          <span className="text-2xl shrink-0" aria-hidden="true">{school.stars?.some((s) => s.you) ? '🌟' : '🏫'}</span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-sm truncate">{school.name}</span>
            <span className="block text-xs text-muted">
              {school.stars?.some((s) => s.you)
                ? 'You are a School Star!'
                : school.ranked && school.district_rank
                  ? `#${school.district_rank} in the district. Your chores count!`
                  : 'Your chores count for your school.'}
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>
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
          value={active.length + waiting.length ? `${waiting.length}/${active.length + waiting.length}` : '—'}
          label="Weekly goal"
          tone="var(--accent-2)"
        />
        {/* The design's third card is what you are saving towards. A
            number you cannot spend is a worse thing to look at than the
            reward you are three chores away from. */}
        <Stat
          icon="🎁"
          value={nextReward ? `${theme.currency.icon} ${nextReward.cost}` : '—'}
          label={nextReward ? nextReward.name : 'No rewards set'}
        />
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

      {state.familyGoal && (
        <Card className="mb-3">
          <SectionTitle>Family goal</SectionTitle>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold">{state.familyGoal.name}</span>
            <span className="text-muted">
              {formatXp(familyGoalProgress(state))} / {formatXp(state.familyGoal.targetXp)} XP
            </span>
          </div>
          <ProgressBar value={familyGoalProgress(state)} max={state.familyGoal.targetXp} height={9} label="Family goal progress" />
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
