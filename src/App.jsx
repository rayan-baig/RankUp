import { useEffect, useMemo } from 'react'
import { useApp, pendingSubmissions } from './state/AppContext.jsx'
import { activeLockout } from './state/reducer.js'
import { useRoute, navigate } from './lib/router.js'
import { applyTheme } from './lib/applyTheme.js'
import { resolveKidTheme } from './data/kidThemes.js'
import { resolveParentTheme } from './data/parentThemes.js'
import { levelFromXp } from './lib/xp.js'

import ThemeBackground from './components/ThemeBackground.jsx'
import ParentBackground from './components/ParentBackground.jsx'
import NavBar from './components/NavBar.jsx'
import LevelUpOverlay from './components/LevelUpOverlay.jsx'

import Onboarding from './screens/Onboarding.jsx'
import RoleSwitch from './screens/RoleSwitch.jsx'
import LockoutScreen from './screens/kid/LockoutScreen.jsx'
import KidHome from './screens/kid/KidHome.jsx'
import KidQuests from './screens/kid/KidQuests.jsx'
import QuestDetail from './screens/kid/QuestDetail.jsx'
import KidGuild from './screens/kid/KidGuild.jsx'
import KidShop from './screens/kid/KidShop.jsx'
import KidProfile from './screens/kid/KidProfile.jsx'
import ParentDashboard from './screens/parent/ParentDashboard.jsx'
import ParentApprovals from './screens/parent/ParentApprovals.jsx'
import ParentAssign from './screens/parent/ParentAssign.jsx'
import ParentKids from './screens/parent/ParentKids.jsx'
import ParentBlueprint from './screens/parent/ParentBlueprint.jsx'
import ParentOverride from './screens/parent/ParentOverride.jsx'
import ParentAlliance from './screens/parent/ParentAlliance.jsx'
import ParentPlan from './screens/parent/ParentPlan.jsx'
import ParentSettings from './screens/parent/ParentSettings.jsx'

const KID_NAV = [
  { to: '/kid', icon: '🏠', label: 'Home', exact: true },
  { to: '/kid/quests', icon: '⚔️', label: 'Quests', alsoMatches: ['/kid/quest/'] },
  { to: '/kid/guild', icon: '🛡️', label: 'Guild' },
  { to: '/kid/shop', icon: '🎁', label: 'Rewards' },
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

export default function App() {
  const { state, dispatch } = useApp()
  const { path } = useRoute()
  const route = path.split('?')[0]

  const isParentArea = route.startsWith('/parent')
  const isKidArea = route.startsWith('/kid')

  const activeKid = state.kids.find((k) => k.id === state.session.kidId) || state.kids[0] || null
  const kidTheme = useMemo(
    () => (activeKid ? resolveKidTheme(activeKid.themeId, levelFromXp(activeKid.xp).level) : null),
    [activeKid],
  )
  const parentTheme = useMemo(() => resolveParentTheme(state.family.parentThemeId), [state.family.parentThemeId])
  const theme = isParentArea ? parentTheme : kidTheme || parentTheme

  // Push the active theme's colours into CSS variables.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = state.settings.reduceMotion ? 'true' : 'false'
  }, [state.settings.reduceMotion])

  // Dimension Lockouts end on a timer. Sweep them on load and every 30s so a kid
  // is let back in promptly and the override history stops saying "Active".
  useEffect(() => {
    dispatch({ type: 'EXPIRE_LOCKOUTS' })
    const t = setInterval(() => dispatch({ type: 'EXPIRE_LOCKOUTS' }), 30000)
    return () => clearInterval(t)
  }, [dispatch])

  // Route guards.
  useEffect(() => {
    if (!state.onboarded && route !== '/welcome') {
      navigate('/welcome')
      return
    }
    if (state.onboarded && route === '/welcome') {
      // Straight into Parent Mode — setup finishes with the parent holding the phone.
      navigate(state.session.parentUnlocked ? '/parent' : '/switch')
      return
    }
    if (state.onboarded && route === '/') {
      navigate('/switch')
      return
    }
    // Parent Mode always needs the PIN gate, even on a direct link.
    if (state.onboarded && isParentArea && !state.session.parentUnlocked) {
      navigate('/switch')
    }
  }, [state.onboarded, state.session.parentUnlocked, route, isParentArea])

  if (!state.onboarded) return <Onboarding />

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
  const glitch = Boolean(kidTheme?.evolution?.glitchIntro)

  return (
    <>
      {isParentArea ? <ParentBackground theme={parentTheme} /> : <ThemeBackground theme={kidTheme} glitch={glitch} />}

      {renderRoute(route, path, activeKid)}

      {isKidArea && <NavBar items={KID_NAV} path={route} />}
      {isParentArea && <NavBar items={PARENT_NAV} path={route} badges={{ '/parent/approvals': pending }} />}

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

function renderRoute(route, fullPath, activeKid) {
  if (route === '/switch' || route === '/') return <RoleSwitch />

  if (route === '/kid') return <KidHome />
  if (route === '/kid/quests') return <KidQuests />
  if (route.startsWith('/kid/quest/')) return <QuestDetail questId={route.replace('/kid/quest/', '')} />
  if (route === '/kid/guild') return <KidGuild />
  if (route === '/kid/shop') return <KidShop />
  if (route === '/kid/profile') return <KidProfile />

  if (route === '/parent') return <ParentDashboard />
  if (route === '/parent/approvals') return <ParentApprovals />
  if (route === '/parent/assign') return <ParentAssign initialKidId={queryParam(fullPath, 'kid') || activeKid?.id} />
  if (route === '/parent/kids') return <ParentKids />
  if (route === '/parent/blueprint') return <ParentBlueprint initialKidId={queryParam(fullPath, 'kid') || activeKid?.id} />
  if (route === '/parent/override') return <ParentOverride />
  if (route === '/parent/alliance') return <ParentAlliance />
  if (route === '/parent/plan') return <ParentPlan />
  if (route === '/parent/settings') return <ParentSettings />

  return <RoleSwitch />
}
