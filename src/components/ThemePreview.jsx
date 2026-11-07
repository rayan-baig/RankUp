import ThemeBackground from './ThemeBackground.jsx'
import Avatar from './Avatar.jsx'
import { Card, Chip, ProgressBar } from './ui.jsx'
import { buildTheme } from '../data/themeGenesis.js'

/**
 * A theme's colours as the CSS variables every component reads, for one box
 * on the page. Everything inside re-skins without knowing why, which is how
 * a child sees their own theme before wearing it, inside a parent's screen.
 */
export function themeVars(theme) {
  const c = theme.colors
  return {
    '--bg': c.bg, '--surface': c.surface, '--surface-2': c.surface2, '--line': c.line,
    '--ink': c.ink, '--ink-muted': c.inkMuted, '--accent': c.accent, '--accent-2': c.accent2,
    '--radius': theme.radius || '18px', colorScheme: theme.mode === 'light' ? 'light' : 'dark',
    color: c.ink,
  }
}

/** A stored design (or a built theme) as a theme, at a level, with its world applied. */
function asTheme({ theme, name, design, level }) {
  if (theme) return theme
  const built = buildTheme({ id: 'preview', name, design })
  if (!level || level < built.evolutions[0].level) return { ...built, evolution: null }
  const world = [...built.evolutions].reverse().find((e) => level >= e.level)
  return { ...built, ...world, colors: { ...built.colors, ...world.colors }, name: built.name, currency: built.currency, evolution: world }
}

/**
 * The child's home screen, in a theme, in a box: the bar, the avatar with
 * the level and the XP bar, a chore, the coins. Live, with the theme's own
 * moving background. Nothing in it is anybody's real progress.
 */
export default function ThemePreview({ theme: given, name, design, level = 12, kidName = 'You', height = 400, testId = 'theme-preview' }) {
  const theme = asTheme({ theme: given, name, design, level })
  const firstWorld = theme.evolutions?.[0]
  return (
    <div
      className="relative overflow-hidden"
      style={{ ...themeVars(theme), height, background: theme.colors.bg, borderRadius: 22, border: `1px solid ${theme.colors.line}` }}
      data-testid={testId}
    >
      <ThemeBackground theme={theme} contained />
      <div className="relative p-3 flex flex-col gap-2.5" style={{ height: '100%' }}>
        <div className="flex items-center justify-between">
          <span className="font-display font-extrabold text-[15px]">RankUp</span>
          <span className="chip" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            {theme.currency.icon} {theme.name}
          </span>
        </div>
        <Card className="!p-3">
          <div className="flex items-center gap-3">
            <Avatar theme={theme} level={level} size={66} interactive={false} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-extrabold truncate">{kidName}</p>
              <p className="text-xs truncate" style={{ color: 'var(--ink-muted)' }}>Level {level} · 1,240 XP</p>
              <div className="mt-1.5"><ProgressBar value={0.62} max={1} height={8} label="Level progress" /></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <Chip tone="var(--accent)">Form 2 / 5</Chip>
            {theme.evolution
              ? <Chip tone="var(--accent-2)">✦ {theme.evolution.label}</Chip>
              : firstWorld && <Chip tone="var(--accent-2)">✦ {firstWorld.label} at level {firstWorld.level}</Chip>}
          </div>
        </Card>
        <Card className="!p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Your next quest</p>
              <p className="font-semibold truncate">Make your bed</p>
            </div>
            <span className="chip shrink-0" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>+30 XP</span>
          </div>
          <button type="button" tabIndex={-1} className="btn btn-primary w-full mt-2.5 !min-h-0 !py-2 text-sm pointer-events-none">I did it!</button>
        </Card>
        <div className="flex gap-2">
          <Card className="!p-2.5 flex-1 text-center">
            <div className="text-lg leading-none">{theme.currency.icon}</div>
            <div className="font-display font-extrabold">48</div>
            <div className="text-[10px] truncate" style={{ color: 'var(--ink-muted)' }}>{theme.currency.name}</div>
          </Card>
          <Card className="!p-2.5 flex-1 text-center">
            <div className="text-lg leading-none">🔥</div>
            <div className="font-display font-extrabold">6</div>
            <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>Day streak</div>
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * A theme as a small tile: its background colour and accents, its mascot,
 * its name. For lists (Settings, the Review queue, the operator's inbox).
 */
export function ThemeSwatch({ theme: given, name, design, size = 52 }) {
  const theme = given || buildTheme({ id: 'swatch', name, design })
  const c = theme.colors
  return (
    <span
      className="relative inline-grid place-items-center shrink-0 overflow-hidden"
      style={{ width: size, height: size, borderRadius: 14, background: c.bg, border: `2px solid ${c.line}` }}
      aria-hidden="true"
    >
      <span className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 30%, ${c.accent}66, transparent 60%), radial-gradient(circle at 75% 75%, ${c.accent2}66, transparent 55%)` }} />
      <span className="relative" style={{ fontSize: size * 0.48 }}>{theme.avatar?.emoji || theme.currency?.icon}</span>
    </span>
  )
}
