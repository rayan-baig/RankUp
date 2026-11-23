import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp, useElite, pendingSubmissions } from '../../state/AppContext.jsx'
import { levelFromXp, formatXp } from '../../lib/xp.js'
import { lastSevenDays, relativeTime } from '../../lib/dates.js'
import { resolveKidTheme } from '../../data/kidThemes.js'
import { storyProgress } from '../../lib/dragonFight.js'
import { activeLockout, familyGoalProgress } from '../../state/reducer.js'
import { TIERS } from '../../state/initialState.js'
import { priceTag } from '../../lib/plans.js'
import { guildsEnabled } from '../../lib/guilds.js'
import Avatar from '../../components/Avatar.jsx'
import { Screen, Card, Button, SectionTitle, Stat, ProgressBar, Banner, Chip } from '../../components/ui.jsx'
import SyncBadge from '../../components/SyncBadge.jsx'
import { navigate, navigateThen } from '../../lib/router.js'
import TrialBanner from '../../components/TrialBanner.jsx'
import { activityFeed } from '../../lib/activity.js'
import CharityWeek from '../../components/CharityWeek.jsx'
import InstallPrompt from '../../components/InstallPrompt.jsx'
import { dashboardBillingNotice } from '../../lib/billing.js'
import { giftNotice } from '../../lib/giftRules.js'
import { PickedNotice } from '../../components/KidThemesParent.jsx'
import { ReferralRewardNotice } from '../../components/InviteCard.jsx'
import HowItWorks from '../../components/HowItWorks.jsx'
import FirstWeek from '../../components/FirstWeek.jsx'
import ThisWeek from '../../components/ThisWeek.jsx'
import DemoTour from '../../components/DemoTour.jsx'
import UpgradeNudge from '../../components/UpgradeNudge.jsx'
import { useDeals, GiftSaleBanner, GiftAYearCard } from '../../components/DealCards.jsx'
import EmptyNext from '../../components/EmptyNext.jsx'
import { EMPTY_STATES } from '../../data/emptyStates.js'
import { STARTER_REWARDS, newFamily, showFirstWeek, showHowItWorks } from '../../lib/firstWeek.js'
import { weekCompare } from '../../lib/thisWeek.js'
import { describeEvent } from '../../lib/eventWords.js'
import { useMedia, useRootFlag } from '../../lib/useMedia.js'
// The desktop layouts (two columns here), fetched with this screen.
import '../../styles/desk.css'

/** The shorter column under this share of the longer, as drawn: one column on a computer too. */
export const ONE_COLUMN_BELOW = 0.72

export default function ParentDashboard() {
  const { state, dispatch } = useApp()
  const deals = useDeals()
  const elite = useElite()
  // Two columns from 1100px (styles/desk.css): some cards move across.
  // While Pilot's chat is docked at the right (0.33.0, styles/index.css), two
  // columns only where there is still room for them (1400px and up).
  const wide = useMedia('(min-width: 1100px)')
  const roomy = useMedia('(min-width: 1400px)')
  const pilotOpen = useRootFlag('pilotOpen')
  const desk = wide && (!pilotOpen || roomy)
  // One column or two on a computer, for the layout it was measured for.
  const [oneCol, setOneCol] = useState({ key: null, one: false })
  const mainCol = useRef(null)
  const sideCol = useRef(null)
  const pending = pendingSubmissions(state)
  // Rewards a child has spent their currency on and is waiting to be given.
  // These were only listed inside the collapsed rewards panel in Settings, so
  // a parent had no way of knowing a child was waiting.
  const owed = (state.redemptions || []).filter((r) => r.status === 'requested')

  // Chores come from the synced submissions, so a co-parent's approvals and a
  // child's "I did it!" from their own phone are here too, not only what was
  // tapped on this phone.
  const feed = useMemo(() => activityFeed(state), [state.events, state.submissions, state.quests])

  const weekXp = useMemo(() => {
    const week = new Set(lastSevenDays())
    const per = {}
    feed.forEach((e) => {
      if (e.type === 'quest_approved' && week.has(e.day)) per[e.kidId] = (per[e.kidId] || 0) + (e.meta?.xp || 0)
    })
    return per
  }, [feed])

  const totalWeekXp = Object.values(weekXp).reduce((a, b) => a + b, 0)

  // A paid plan that stopped because of a payment, said where a parent looks
  // every day. A plan they cancelled themselves is not news, so not here.
  const stopped = dashboardBillingNotice(state.family, { demo: state.demo })
  // A gift plan with 30 days or fewer left, and nothing paid lined up after it.
  const giftEnding = giftNotice(state.family, { demo: state.demo })

  // On a phone the family shares: out of Parent Mode, locked behind them.
  const handOver = () => {
    if (state.kids.length === 1) {
      navigateThen('/kid', () => dispatch({ type: 'SET_ROLE', role: 'kid', kidId: state.kids[0].id }))
    } else {
      navigateThen('/switch', () => dispatch({ type: 'LOCK_PARENT' }))
    }
  }

  const stats = (
    <div className="flex gap-2 mb-3">
      <Stat icon="📥" value={pending.length} label="To review" tone={pending.length ? 'var(--warn)' : undefined} />
      <Stat icon="👧" value={state.kids.length} label="Kid profiles" />
      <Stat icon="⭐" value={formatXp(totalWeekXp)} label="XP this week" />
    </div>
  )

  /*
   * The cards that may sit in either column on a computer (0.30.0). Each
   * goes, in this order, to whichever column is shorter so far, by a rough
   * height for what it holds, so the two columns end near each other
   * whatever the family: one child and no checklist (once a big empty space
   * under a single card), two, four or more. On a phone they all follow the
   * numbers, in this order, as before.
   */
  const feedRows = Math.min(8, feed.length)
  const floating = [
    // This week, with its boost line and Share button (0.32.0).
    desk && { id: 'week', h: weekCompare(state).any ? 215 : 0, el: <ThisWeek /> },
    state.familyGoal && {
      id: 'goal',
      h: 110,
      el: (
        <>
          <SectionTitle>Family goal</SectionTitle>
          <Card className="mb-3">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-semibold">{state.familyGoal.name}</span>
              <span className="text-muted">
                {formatXp(familyGoalProgress(state))} / {formatXp(state.familyGoal.targetXp)} XP
              </span>
            </div>
            <ProgressBar
              value={familyGoalProgress(state)}
              max={state.familyGoal.targetXp}
              height={12}
              label="Family goal progress"
            />
          </Card>
        </>
      ),
    },
    {
      id: 'activity',
      h: 88 + (feedRows ? feedRows * 29 : 30),
      el: (
        <>
          <div className="flex items-baseline justify-between">
            <SectionTitle>Recent activity</SectionTitle>
            {state.submissions.length > 0 && (
              <button type="button" className="tap-link text-xs underline text-muted" onClick={() => navigate('/parent/history')}>
                Chore history
              </button>
            )}
          </div>
          <Card className="mb-3">
            {feed.length === 0 ? (
              <div data-testid="empty-activity">
                <p className="text-sm font-semibold">{EMPTY_STATES.activity.title}</p>
                <p className="text-xs text-muted">{EMPTY_STATES.activity.body}</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {[...feed].reverse().slice(0, 8).map((e) => {
                  const kid = state.kids.find((k) => k.id === e.kidId)
                  return (
                    <li key={e.id} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate" data-pilot-private="">{describeEvent(e, kid)}</span>
                      <span className="text-[11px] text-muted shrink-0">{relativeTime(e.at)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      ),
    },
    {
      id: 'tools',
      h: newFamily(state) ? 72 : 150,
      /* For a new family, one row that opens: the steps and their child come
         first. Once the family is going, the three tiles as before. */
      el: newFamily(state) ? (
        <EliteToolsFold elite={elite} />
      ) : (
        <>
          <SectionTitle>Elite tools</SectionTitle>
          <div className="mb-3"><EliteTools elite={elite} /></div>
        </>
      ),
    },
    {
      id: 'school',
      h: 96,
      /* Not an Elite tool: the school pays for the league, so every family
         whose school plays can join it, on any plan. */
      el: (
        <button
          type="button"
          onClick={() => navigate('/parent/school')}
          className="card w-full mb-3 p-3 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
        >
          <span className="text-2xl shrink-0" aria-hidden="true">🏫</span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-sm">School League</span>
            <span className="block text-xs text-muted">Chores count for your child’s school. Best school in the district wins.</span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>
      ),
    },
    !elite && {
      id: 'elite',
      h: 110,
      el: (
        <Banner tone="info" icon="⚡" title={`${TIERS.elite.name} — ${priceTag(TIERS.elite)}`} action={<Button className="px-3 py-2 min-h-0 text-xs shrink-0" onClick={() => navigate('/parent/plan')}>See it</Button>}>
          {elitePitch()}
        </Banner>
      ),
    },
  ].filter(Boolean)
  const left = []
  const right = []
  // What is already in each column, roughly, in pixels.
  let leftH = 44 + Math.max(1, state.kids.length) * 140
    + (state.demo ? 300 : 0)
    + (showFirstWeek(state) ? 380 : 0)
    + (pending.length ? 92 : 0)
    + (owed.length ? 50 + owed.length * 44 : 0)
    + (state.kids.length > 0 && (state.rewards || []).length === 0 ? 170 : 0)
  let rightH = 80 + (showHowItWorks(state) ? 200 : 0)
  /*
   * One column on a computer when the two cannot be balanced (0.32.0): with
   * one child and the "Getting started" list, the left column ran on past
   * the screen while the right one ended half way down, a big empty space
   * at the bottom right. The columns are measured as drawn (the layout
   * effect below, before the screen is painted); when the shorter is under
   * ONE_COLUMN_BELOW of the longer, every card goes in one column, in the
   * phone's order, as wide as a card reads well. Measured again only when
   * what the dashboard holds changes.
   */
  const layoutKey = [desk, state.kids.length, showFirstWeek(state), pending.length > 0, owed.length, feedRows,
    (state.rewards || []).length === 0, showHowItWorks(state), newFamily(state), elite, Boolean(state.familyGoal),
    weekCompare(state).any, Boolean(state.demo)].join('|')
  const measured = oneCol.key === layoutKey
  const twoCols = desk && !(measured && oneCol.one)
  if (twoCols) {
    for (const c of floating) {
      if (rightH <= leftH) { right.push(c); rightH += c.h } else { left.push(c); leftH += c.h }
    }
  } else {
    right.push(...floating.filter((c) => c.id !== 'week'))
  }

  useLayoutEffect(() => {
    if (!desk || measured) return
    const a = mainCol.current?.getBoundingClientRect().height || 0
    const b = sideCol.current?.getBoundingClientRect().height || 0
    setOneCol({ key: layoutKey, one: a > 0 && b > 0 && Math.min(a, b) / Math.max(a, b) < ONE_COLUMN_BELOW })
  }, [desk, measured, layoutKey])

  /*
   * On a phone, one column. On a wide screen (1100px and up, styles/desk.css)
   * two: what needs the parent (getting started, Review, the kids) on the
   * left, and how the family is doing (the three numbers, the family goal,
   * the activity, the tools) on the right. So that the two columns come out
   * about the same length (0.29.0), two cards that sit high on a phone move
   * to the head of the right-hand column on a computer: the three numbers
   * and "How RankUp works". Each is drawn in one place only.
   */
  return (
    <Screen className={`dash-wide${desk && !twoCols ? ' dash-one' : ''}`}>
      <TrialBanner />
      {stopped && (
        <Banner className="mb-3" tone={stopped.tone} icon={stopped.icon} title={stopped.title}>
          {stopped.body}{' '}
          <button type="button" className="underline font-semibold" onClick={() => navigate('/parent/plan')}>See your plan</button>
        </Banner>
      )}
      {giftEnding && (
        <div data-testid="gift-ending-notice">
          <Banner className="mb-3" tone={giftEnding.tone} icon={giftEnding.icon} title={giftEnding.title}>
            {giftEnding.body}{' '}
            <button type="button" className="underline font-semibold" onClick={() => navigate('/parent/plan')}>See plans</button>
          </Banner>
        </div>
      )}
      <CharityWeek />
      <PickedNotice who="parent" />
      <ReferralRewardNotice />
      <header className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-muted">Parent dashboard</p>
          <h1 className="font-display text-2xl font-extrabold truncate">{state.family.name || 'Your family'}</h1>
          <SyncBadge className="mt-0.5" />
        </div>
        {/*
          * On a phone the family shares, the child's side is one tap away.
          * There was no way out of Parent Mode at all: a parent who wanted to
          * hand the phone over had nothing to tap.
          */}
        {state.kids.length > 0 && (
          <Button
            variant="soft"
            className="shrink-0 px-3 py-2 min-h-0 text-xs mt-1"
            style={{ maxWidth: 150 }}
            data-pilot-primary=""
            onClick={handOver}
          >
            <span className="truncate">👋 {state.kids.length === 1 ? `Hand to ${state.kids[0].name}` : 'Hand to a kid'}</span>
          </Button>
        )}
      </header>

      <div className="dash-cols" data-cols={twoCols ? '2' : '1'}>
      <div className="dash-main" ref={mainCol}>
      <DemoTour />
      {!twoCols && <HowItWorks />}
      <FirstWeek />
      {/* Elite, offered at a moment it is true; once a fortnight at most. */}
      <UpgradeNudge />
      {/* After the first accepted chore, once, where it is seen on the first
          screen; never on a child's phone. */}
      <InstallPrompt />
      {/* The deals (0.23.0): the holiday gift sale while it is on, and "Gift a
          year" a month in. Parent Mode only. */}
      <GiftSaleBanner sale={deals?.gift_sale || null} />
      {!deals?.gift_sale && <GiftAYearCard />}

      {!twoCols && stats}

      {pending.length > 0 && (
        <Card className="mb-3" style={{ borderColor: 'var(--warn)' }} data-pilot-primary="" data-testid="waiting-card">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">✅</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                {pending.length} {pending.length === 1 ? 'chore' : 'chores'} waiting for you
              </div>
              <div className="text-xs text-muted">
                Accept {pending.length === 1 ? 'it' : 'them'}, or send back with a note
              </div>
            </div>
            <Button className="px-3 py-2 min-h-0 text-sm" onClick={() => navigate('/parent/approvals')}>Review</Button>
          </div>
        </Card>
      )}

      {owed.length > 0 && (
        <Card className="mb-3" style={{ borderColor: 'var(--accent-2)' }}>
          <div className="font-semibold text-sm mb-1">
            🎁 {owed.length === 1 ? '1 reward' : `${owed.length} rewards`} to hand over
          </div>
          {owed.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1.5">
              <span className="flex-1 min-w-0 text-sm truncate">
                <span data-pilot-private="">{state.kids.find((k) => k.id === r.kidId)?.name || 'Your kid'}</span>: {r.name}
              </span>
              <Button
                className="px-3 py-1.5 min-h-0 text-xs shrink-0"
                onClick={() => dispatch({ type: 'FULFIL_REDEMPTION', redemptionId: r.id })}
              >
                Mark given
              </Button>
            </div>
          ))}
        </Card>
      )}

      <SectionTitle action={<button type="button" className="tap-link text-xs text-muted underline" onClick={() => navigate('/parent/kids')}>Manage</button>}>
        Kids
      </SectionTitle>

      {state.kids.length === 0 ? (
        <EmptyNext which="noKids" />
      ) : (
        state.kids.map((kid) => {
          const { level, progress } = levelFromXp(kid.xp)
          const theme = resolveKidTheme(kid.themeId, level, storyProgress(state, kid))
          const lock = activeLockout(kid)
          const kidPending = pending.filter((s) => s.kidId === kid.id).length
          const active = state.quests.filter((q) => q.kidId === kid.id && (q.status === 'assigned' || q.status === 'redo')).length
          return (
            <Card key={kid.id} className="mb-2.5">
              <div className="flex items-center gap-3">
                <Avatar theme={theme} level={level} size={54} interactive={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold truncate" data-pilot-private="">{kid.name}</span>
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

      {/* Nothing for a child to save up for yet: three to start, one tap. */}
      {state.kids.length > 0 && (state.rewards || []).length === 0 && <StarterRewards />}

      {left.map((c) => <Fragment key={c.id}>{c.el}</Fragment>)}
      </div>

      <div className="dash-side" ref={sideCol}>
      {twoCols && (
        <>
          {stats}
          <HowItWorks />
        </>
      )}
      {!twoCols && <ThisWeek />}
      {right.map((c) => <Fragment key={c.id}>{c.el}</Fragment>)}
      </div>
      </div>
    </Screen>
  )
}

const ELITE_TOOLS = [
  { icon: '⏸️', label: 'Pause and limits', to: '/parent/override' },
  { icon: '📊', label: 'Blueprints', to: '/parent/blueprint' },
  { icon: '🏆', label: 'Alliance', to: '/parent/alliance' },
]

/**
 * A new family's Elite tools: one row, "Elite tools" and their names, that
 * opens to the three tiles. A button rather than <details>, so a closed row
 * holds nothing on the page at all.
 */
function EliteToolsFold({ elite }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card-flat mb-3" data-testid="elite-tools-fold" data-open={open ? '' : undefined}>
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-lg shrink-0" aria-hidden="true">⚡</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sm">Elite tools{elite ? '' : ' 🔒'}</span>
          <span className="block text-xs text-muted truncate">{ELITE_TOOLS.map((t) => t.label).join(' · ')}</span>
        </span>
        <span className={`text-muted shrink-0 transition-transform${open ? ' rotate-90' : ''}`} aria-hidden="true">›</span>
      </button>
      {open && <div className="px-3 pb-3"><EliteTools elite={elite} /></div>}
    </div>
  )
}

/** The three Elite tools as tiles, dimmed and locked without Elite. */
function EliteTools({ elite }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ELITE_TOOLS.map((t) => (
        <button
          key={t.to}
          type="button"
          onClick={() => navigate(t.to)}
          className={`card-flat p-3 text-center relative${elite ? '' : ' opacity-[0.65]'}`}
        >
          <div className="text-xl mb-1" aria-hidden="true">{t.icon}</div>
          <div className="text-[11px] font-semibold">{t.label}</div>
          {!elite && <span className="absolute top-1 right-1.5 text-[10px]">🔒</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * "No rewards yet", on the dashboard, with the three starter rewards one tap
 * away. Rewards used to live only in a closed section of Settings, so a new
 * family's child opened Rewards to "Ask your parent" and the parent had no
 * idea where to go.
 */
function StarterRewards() {
  const { dispatch } = useApp()
  const e = EMPTY_STATES.rewards
  return (
    <Card className="mb-3" data-testid="empty-rewards">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0" aria-hidden="true">{e.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">{e.title}</div>
          <p className="text-xs text-muted">{e.body}</p>
          <p className="text-xs text-muted mt-1">{STARTER_REWARDS.map((r) => `${r.icon} ${r.name}`).join(' · ')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <Button className="min-h-[44px] text-sm" data-testid="starter-rewards"
          onClick={() => STARTER_REWARDS.forEach((reward) => dispatch({ type: 'ADD_REWARD', reward: { ...reward } }))}>
          {e.action.label}
        </Button>
        <button type="button" className="tap-link text-xs underline text-muted" onClick={() => navigate(e.action.to)}>
          Make my own
        </button>
      </div>
    </Card>
  )
}

/**
 * What Elite adds, for the banner, from the plan list: the guild size and the
 * XP rate are its numbers, and guilds are only mentioned when they are on.
 */
function elitePitch() {
  const parts = ['Pause and limits', 'Behaviour Blueprints', 'Parent Alliances']
  if (guildsEnabled()) parts.push(`${TIERS.elite.guildSize}-player guilds`)
  return `Adds ${parts.join(', ')} and a permanent ${TIERS.elite.xpMultiplier}× XP boost for kids.`
}

