import { useApp } from '../state/AppContext.jsx'
import { navigate } from '../lib/router.js'
import { seasonToCelebrate, buildTheme, seasonThemeId, creditLine } from '../data/themeGenesis.js'
import { ThemeSwatch } from './ThemePreview.jsx'
import { Button } from './ui.jsx'

/**
 * "New Season!": once, on a child's home screen, the first time this phone
 * sees a Season that has just started. Its themes were made by children in
 * other families and picked by RankUp; each is shown with its credit line,
 * which is a first name or nickname a parent chose, or "by a RankUp family".
 */
export default function SeasonMoment() {
  const { state, dispatch } = useApp()
  const season = seasonToCelebrate(state)
  if (!season) return null
  const seen = () => dispatch({ type: 'SEE_MOMENT', key: `season:${season.number}` })
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center px-5" role="dialog" aria-modal="true" aria-label="New Season" data-testid="season-moment">
      <div className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(4px)' }} />
      <div className="relative w-full max-w-sm card p-5 text-center anim-pop">
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold" style={{ color: 'var(--accent-2)' }}>Season {season.number}</p>
        <h2 className="font-display text-3xl font-extrabold leading-tight mt-1">New Season!</h2>
        <p className="text-sm text-muted mb-3">{season.name}</p>
        <div className="text-left mb-4">
          {season.themes.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--line)' }}>
              <ThemeSwatch theme={buildTheme({ id: seasonThemeId(t.id), name: t.name, design: t.design })} size={44} />
              <div className="min-w-0">
                <p className="font-semibold truncate">{t.name}</p>
                <p className="text-xs text-muted truncate">{creditLine(t.credit)}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mb-3">New themes, made by RankUp players. Find them in your theme picker on the You tab.</p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={seen}>Later</Button>
          <Button className="flex-1" onClick={() => { seen(); navigate('/kid/profile') }}>See them</Button>
        </div>
      </div>
    </div>
  )
}
