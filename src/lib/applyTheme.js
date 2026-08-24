/**
 * Pushes a theme's colours into CSS custom properties on <html>.
 * Tailwind classes like `bg-surface` or `text-accent` read those variables, so
 * the whole UI re-skins in one step without any component knowing about themes.
 */

export function applyTheme(theme) {
  if (!theme) return
  const root = document.documentElement
  const c = theme.colors
  const set = (k, v) => root.style.setProperty(k, v)

  set('--bg', c.bg)
  set('--surface', c.surface)
  set('--surface-2', c.surface2)
  set('--line', c.line)
  set('--ink', c.ink)
  set('--ink-muted', c.inkMuted)
  set('--accent', c.accent)
  set('--accent-2', c.accent2)
  set('--good', theme.good || '#1baf7a')
  set('--warn', theme.warn || '#eda100')
  set('--bad', theme.bad || '#e34948')
  set('--radius', theme.radius || '16px')
  set('--shadow', theme.shadow || '0 10px 30px -12px rgb(0 0 0 / 0.5)')
  set('--font-display', theme.fonts?.display || 'Outfit')
  set('--font-body', theme.fonts?.body || 'Inter')
  set('--font-mono', theme.fonts?.mono || 'JetBrains Mono')

  root.dataset.mode = theme.mode || 'dark'
  root.style.colorScheme = theme.mode === 'light' ? 'light' : 'dark'

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', c.bg)
}
