import { Suspense, useEffect, useMemo } from 'react'
import { useApp, pendingSubmissions } from './state/AppContext.jsx'
import { activeLockout, guildsAllowedByPlan, overdriveActive } from './state/reducer.js'
import { useRoute, navigate } from './lib/router.js'
import { applyTheme } from './lib/applyTheme.js'
import { resolveKidTheme } from './data/kidThemes.js'
import { storyProgress } from './lib/dragonFight.js'
import { resolveParentTheme } from './data/parentThemes.js'
import { levelFromXp } from './lib/xp.js'

import ThemeBackground from './components/ThemeBackground.jsx'
import Atmosphere from './components/Atmosphere.jsx'
import ParentBackground from './components/ParentBackground.jsx'
import NavBar from './components/NavBar.jsx'
import LevelUpOverlay from './components/LevelUpOverlay.jsx'
import BadgeToast from './components/BadgeToast.jsx'

import RoleSwitch from './screens/RoleSwitch.jsx'
import LockoutScreen from './screens/kid/LockoutScreen.jsx'
import { guildsEnabled } from './lib/guilds.js'
import ScreenBoundary from './components/ScreenBoundary.jsx'
import DemoBanner from './components/DemoBanner.jsx'
import { buildDemoFamily } from './lib/demoFamily.js'
import { lazyLoad } from './lib/lazy.js'
import { Loading } from './components/ui.jsx'

/*
 * Every screen downloads when it is first opened, so a phone opening the app
 * fetches the shared core and the one screen it lands on — the front door, the
 * parent dashboard or the kid home — and nothing else. The front door is only
 * ever seen once, so after setup it is never downloaded again at all. See
 * lib/lazy.js.
 */
const Onboarding = lazyLoad(() => import('./screens/Onboarding.jsx'))
const KidPairing = lazyLoad(() => import('./screens/kid/KidPairing.jsx'))
const KidHome = lazyLoad(() => import('./screens/kid/KidHome.jsx'))
const ParentDashboard = lazyLoad(() => import('./screens/parent/ParentDashboard.jsx'))
const KidQuests = lazyLoad(() => import('./screens/kid/KidQuests.jsx'))
const QuestDetail = lazyLoad(() => import('./screens/kid/QuestDetail.jsx'))
const KidGuild = lazyLoad(() => import('./screens/kid/KidGuild.jsx'))
const KidShop = lazyLoad(() => import('./screens/kid/KidShop.jsx'))
const KidMarket = lazyLoad(() => import('./screens/kid/KidMarket.jsx'))
const KidArcade = lazyLoad(() => import('./screens/kid/KidArcade.jsx'))
const KidProfile = lazyLoad(() => import('./screens/kid/KidProfile.jsx'))
const KidStory = lazyLoad(() => import('./screens/kid/KidStory.jsx'))
const KidDragon = lazyLoad(() => import('./screens/kid/KidDragon.jsx'))
const KidSchool = lazyLoad(() => import('./screens/kid/KidSchool.jsx'))
const ParentApprovals = lazyLoad(() => import('./screens/parent/ParentApprovals.jsx'))
const ParentAssign = lazyLoad(() => import('./screens/parent/ParentAssign.jsx'))
const ParentKids = lazyLoad(() => import('./screens/parent/ParentKids.jsx'))
const ParentBlueprint = lazyLoad(() => import('./screens/parent/ParentBlueprint.jsx'))
const ParentOverride = lazyLoad(() => import('./screens/parent/ParentOverride.jsx'))
const ParentAlliance = lazyLoad(() => import('./screens/parent/ParentAlliance.jsx'))
const ParentSchool = lazyLoad(() => import('./screens/parent/ParentSchool.jsx'))
const SchoolPortal = lazyLoad(() => import('./screens/SchoolPortal.jsx'))
const OperatorSchools = lazyLoad(() => import('./screens/OperatorSchools.jsx'))
const LegalDoc = lazyLoad(() => import('./screens/LegalDoc.jsx'))
const ParentGuilds = lazyLoad(() => import('./screens/parent/ParentGuilds.jsx'))
const ParentPairKid = lazyLoad(() => import('./screens/parent/ParentPairKid.jsx'))
const ParentPlan = lazyLoad(() => import('./screens/parent/ParentPlan.jsx'))
const ParentSettings = lazyLoad(() => import('./screens/parent/ParentSettings.jsx'))

const KID_NAV = [
  { to: '/kid', icon: '🏠', label: 'Home', exact: true },
  { to: '/kid/quests', icon: '⚔️', label: 'Quests', alsoMatches: ['/kid/quest/'] },
  // Only shown when guilds are switched on — a tab leading to "this is off" is
  // worse than no tab.
  ...(guildsEnabled() ? [{ to: '/kid/guild', icon: '🛡️', label: 'Guild', plan: 'guilds' }] : []),
  { to: '/kid/arcade', icon: '🎮', label: 'Arcade' },
  { to: '/kid/shop', icon: '🎁', label: 'Rewards', alsoMatches: ['/kid/market'] },
  { to: '/kid/profile', icon: '🙂', label: 'You' },
]

const PARENT_NAV = [
  { to: '/parent', icon: '📊', label: 'Home', exact: true },
  { to: '/parent/approvals', icon: '📥', label: 'Review' },
  { to: '/parent/assign', icon: '➕', label: 'Assign' },
  { to: '/parent/kids', icon: '👧', label: 'Kids' },
  { to: '/parent/settings', icon: '⚙️', label: 'Settings' },
]

/** Read `?kid=xyz` out of a hash route like `#/parent/assign?kid=xyz`. */
function queryParam(path, key) {
  const q = path.split('?')[1]
  if (!q) return null
  return new URLSearchParams(q).get(key)
}

/*
 * Set only for the shareable preview. Never in a real deployment, where the
 * front door is the whole point.
 */
const DEMO_ON_BOOT = String(import.meta.env?.VITE_DEMO_ON_BOOT || '') === 'true'

/**
 * Loads the look-around family and gets out of the way.
 *
 * An effect rather than a dispatch during render, because dispatching while
 * rendering is how React ends up warning about updating one component from
 * inside another. One frame of nothing is invisible; the alternative is a
 * console full of warnings on the one build strangers will open.
 */
function DemoBoot() {
  const { dispatch } = useApp()
  useEffect(() => {
    dispatch({ type: 'START_DEMO', state: buildDemoFamily() })
    navigate('/parent')
  }, [dispatch])
  return null
}

export default function App() {
  const { state, dispatch } = useApp()
  const { path } = useRoute()
  const route = path.split('?')[0]

  const isParentArea = route.startsWith('/parent')
  const isKidArea = route.startsWith('/kid')

  const activeKid = state.kids.find((k) => k.id === state.session.kidId) || state.kids[0] || null
  const kidTheme = useMemo(
    () => (activeKid
      ? resolveKidTheme(activeKid.themeId, levelFromXp(activeKid.xp).level, storyProgress(state, activeKid))
      : null),
    [activeKid, state.submissions, state.quests],
  )
  const parentTheme = useMemo(() => resolveParentTheme(state.family.parentThemeId), [state.family.parentThemeId])
  const pendingTheme = state.pendingPairing
    ? resolveKidTheme(state.pendingPairing.themeId, 1)
    : null
  const theme = isParentArea ? parentTheme : pendingTheme || kidTheme || parentTheme

  // Push the active theme's colours into CSS variables.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = state.settings.reduceMotion ? 'true' : 'false'
  }, [state.settings.reduceMotion])

  // One attribute switches the whole Elite visual tier on. Every effect lives
  // in the stylesheet under [data-overdrive='true'], so no screen has to know.
  useEffect(() => {
    document.documentElement.dataset.overdrive = overdriveActive(state) ? 'true' : 'false'
  }, [state])

  // Dimension Lockouts end on a timer. Sweep them on load and every 30s so a kid
  // is let back in promptly and the override history stops saying "Active".
  useEffect(() => {
    dispatch({ type: 'EXPIRE_LOCKOUTS' })
    const t = setInterval(() => dispatch({ type: 'EXPIRE_LOCKOUTS' }), 30000)
    return () => clearInterval(t)
  }, [dispatch])

  // Route guards.
  useEffect(() => {
    if (route.startsWith('/legal/') || route === '/school' || route === '/operator') return
    if (!state.onboarded && route !== '/welcome') {
      navigate('/welcome')
      return
    }
    if (state.onboarded && route === '/welcome') {
      // A kid's device goes to their own home. A parent's finishes setup holding
      // the phone, so it goes straight into Parent Mode.
      if (state.device?.role === 'kid') navigate('/kid')
      else navigate(state.session.parentUnlocked ? '/parent' : '/switch')
      return
    }
    if (state.onboarded && route === '/') {
      navigate(state.device?.role === 'kid' ? '/kid' : '/switch')
      return
    }
    // A kid's own device has no parent side at all — not behind a PIN, not at
    // all. The parent's tools live on the parent's phone. It has no profile
    // switcher either: there is exactly one profile on it.
    if (state.onboarded && state.device?.role === 'kid' && (isParentArea || route === '/switch')) {
      navigate('/kid')
      return
    }
    // Parent Mode always needs the PIN gate, even on a direct link.
    if (state.onboarded && isParentArea && !state.session.parentUnlocked) {
      navigate('/switch')
    }
  }, [state.onboarded, state.session.parentUnlocked, state.device?.role, route, isParentArea])

  // The privacy policy and terms are readable without an account — a parent
  // deciding whether to sign up should not have to sign up to read them.
  if (route.startsWith('/legal/')) {
    return (
      <>
        <ParentBackground theme={parentTheme} />
        <ScreenBoundary key={route} route={route}>
          <Suspense fallback={<Loading />}>
            <LegalDoc which={route.endsWith('terms') ? 'terms' : 'privacy'} />
          </Suspense>
        </ScreenBoundary>
      </>
    )
  }

  // The School League's door for teachers and principals. No family needed:
  // a principal should never be walked through setting up a household.
  // Whoever runs RankUp, checking schools are real. Not linked from the app;
  // the page asks for the operator key and the server checks it every time.
  if (route === '/operator') {
    return (
      <>
        <ParentBackground theme={parentTheme} />
        <ScreenBoundary key={route} route={route}>
          <Suspense fallback={<Loading />}>
            <OperatorSchools />
          </Suspense>
        </ScreenBoundary>
      </>
    )
  }

  if (route === '/school') {
    return (
      <>
        <ParentBackground theme={parentTheme} />
        <DemoBanner />
        <ScreenBoundary key={route} route={route}>
          <Suspense fallback={<Loading />}>
            <SchoolPortal />
          </Suspense>
        </ScreenBoundary>
      </>
    )
  }

  if (!state.onboarded) {
    /*
     * A preview build walks straight in.
     *
     * Built with VITE_DEMO_ON_BOOT, the app skips the front door and opens
     * inside the look-around family. That build exists for one job — somebody
     * following a link to see what this is — and every screen between them
     * and the product is a place they leave instead.
     *
     * The door matters in the real app and is untouched there. In a preview
     * it was a choice between three things, two of which are dead ends for a
     * visitor: "I'm a kid" asks for a connection code only a parent's phone
     * can give, and "I'm a parent" asks for an email address. They were
     * being asked to prove they belonged to a household that does not exist.
     */
    if (DEMO_ON_BOOT && !state.pendingPairing) {
      return <DemoBoot />
    }

    // A kid's device that has already generated a code goes straight back to it
    // on reload, rather than making them start setup over.
    if (state.pendingPairing) {
      // Use the theme the kid just chose — it is the first thing they picked and
      // seeing it immediately is half the point of picking it.
      const chosen = resolveKidTheme(state.pendingPairing.themeId, 1)
      return (
        <>
          <ThemeBackground theme={chosen} />
          <Suspense fallback={<Loading />}>
            <KidPairing
              name={state.pendingPairing.kidName}
              themeId={state.pendingPairing.themeId}
              onCancel={() => dispatch({ type: 'CANCEL_PAIRING' })}
            />
          </Suspense>
        </>
      )
    }
    return (
      <Suspense fallback={<Loading />}>
        <Onboarding />
      </Suspense>
    )
  }

  /* A locked-out kid sees nothing but the lockout screen. */
  const lock = isKidArea && activeKid ? activeLockout(activeKid) : null
  if (lock) {
    return (
      <>
        <ThemeBackground theme={kidTheme} />
        <LockoutScreen lockout={lock} kidName={activeKid.name} />
        <div className="fixed bottom-4 left-0 right-0 text-center">
          <button type="button" className="text-xs underline text-muted" onClick={() => navigate('/switch')}>
            Switch profile
          </button>
        </div>
      </>
    )
  }

  const pending = pendingSubmissions(state).length
  // The arrival glitch keeps tearing the screen until the child has watched
  // the chapter that explains it.
  const glitch = Boolean(kidTheme?.evolution?.glitchIntro && !activeKid?.storySeen?.[kidTheme.evolution.chapter])

  return (
    <>
      {isParentArea ? <ParentBackground theme={parentTheme} /> : <ThemeBackground theme={kidTheme} glitch={glitch} />}
      {!isParentArea && <Atmosphere theme={kidTheme} />}

      {/* Outside the boundary: if a screen crashes, the way out of the demo
          must still be on screen. */}
      <DemoBanner />

      {/*
        Keyed on the route, so a screen that crashed gets a clean mount when you
        come back to it — which is usually the actual fix. The boundary is
        INSIDE the chrome on purpose: the nav bar below survives, so one broken
        screen leaves the rest of the app usable instead of taking it all down.
      */}
      <ScreenBoundary key={route} route={route}>
        <Suspense fallback={<Loading />}>
          {renderRoute(route, path, activeKid, state)}
        </Suspense>
      </ScreenBoundary>

      {isKidArea && (
        <NavBar
          items={KID_NAV.filter((i) => i.plan !== 'guilds' || guildsAllowedByPlan(state))}
          path={route}
        />
      )}
      {isParentArea && <NavBar items={PARENT_NAV} path={route} badges={{ '/parent/approvals': pending }} />}

      {/* Only in the child's half of the app. A parent does not need to be told
          their child crossed a threshold by a toast in the corner of a review
          screen — that is what the weekly digest is for. */}
      {isKidArea && activeKid && <BadgeToast state={state} kid={activeKid} />}

      {state.pendingLevelUp && activeKid && kidTheme && (
        <LevelUpOverlay
          levelUp={state.pendingLevelUp}
          kid={state.kids.find((k) => k.id === state.pendingLevelUp.kidId) || activeKid}
          theme={resolveKidTheme(
            (state.kids.find((k) => k.id === state.pendingLevelUp.kidId) || activeKid).themeId,
            state.pendingLevelUp.to,
          )}
          onClose={() => dispatch({ type: 'CLEAR_LEVEL_UP' })}
        />
      )}
    </>
  )
}

function renderRoute(route, fullPath, activeKid, state) {
  if (route === '/legal/terms') return <LegalDoc which="terms" />
  if (route === '/legal/privacy') return <LegalDoc which="privacy" />
  if (route === '/switch' || route === '/') return <RoleSwitch />

  if (route === '/kid') return <KidHome />
  if (route === '/kid/quests') return <KidQuests />
  if (route.startsWith('/kid/quest/')) return <QuestDetail questId={route.replace('/kid/quest/', '')} />
  if (route === '/kid/guild') {
    return guildsEnabled() && guildsAllowedByPlan(state) ? <KidGuild /> : <KidHome />
  }
  if (route === '/kid/shop') return <KidShop />
  if (route === '/kid/market') return <KidMarket />
  if (route === '/kid/arcade') return <KidArcade />
  if (route === '/kid/profile') return <KidProfile />
  if (route.startsWith('/kid/story/')) return <KidStory chapter={route.replace('/kid/story/', '')} />
  if (route === '/kid/dragon') return <KidDragon />
  if (route === '/kid/school') return <KidSchool />

  if (route === '/parent') return <ParentDashboard />
  if (route === '/parent/approvals') return <ParentApprovals />
  if (route === '/parent/assign') return <ParentAssign initialKidId={queryParam(fullPath, 'kid') || activeKid?.id} />
  if (route === '/parent/kids') return <ParentKids />
  if (route === '/parent/blueprint') return <ParentBlueprint initialKidId={queryParam(fullPath, 'kid') || activeKid?.id} />
  if (route === '/parent/override') return <ParentOverride />
  if (route === '/parent/alliance') return <ParentAlliance />
  if (route === '/parent/school') return <ParentSchool />
  if (route === '/parent/guilds') return guildsEnabled() ? <ParentGuilds /> : <ParentDashboard />
  if (route === '/parent/pair') return <ParentPairKid />
  if (route === '/parent/plan') return <ParentPlan />
  if (route === '/parent/settings') return <ParentSettings />

  return <RoleSwitch />
}
