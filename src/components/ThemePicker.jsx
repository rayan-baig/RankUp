import { useState } from 'react'
import { KID_THEMES, resolveKidTheme } from '../data/kidThemes.js'
import Avatar from './Avatar.jsx'
import { Card } from './ui.jsx'

/**
 * The 15-theme chooser.
 *
 * Each card previews the theme's own colours, so a kid picks by looking rather
 * than by reading. The level slider lets you see how a theme evolves without
 * having to actually reach level 100 first.
 */
export default function ThemePicker({ value, onChange, previewLevel = 1, showEvolutionPreview = true }) {
  const [level, setLevel] = useState(previewLevel)
  const selected = resolveKidTheme(value, level)

  return (
    <div>
      <Card className="mb-3 relative overflow-hidden" style={{ background: selected.colors.surface, borderColor: selected.colors.line }}>
        <div className="flex items-center gap-4">
          <Avatar theme={selected} level={level} size={86} companion={Boolean(selected.evolution?.companion)} />
          <div className="min-w-0">
            <h3 className="font-display font-extrabold text-lg leading-tight" style={{ color: selected.colors.ink }}>
              {selected.name}
            </h3>
            <p className="text-xs mb-1.5" style={{ color: selected.colors.inkMuted }}>{selected.blurb}</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="chip" style={{ background: selected.colors.surface2, borderColor: selected.colors.line, color: selected.colors.accent }}>
                {selected.currency.icon} {selected.currency.name}
              </span>
              {selected.evolution && (
                <span className="chip" style={{ background: selected.colors.surface2, borderColor: selected.colors.accent2, color: selected.colors.accent2 }}>
                  ✦ {selected.evolution.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {showEvolutionPreview && (
          <label className="block mt-3">
            <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: selected.colors.inkMuted }}>
              Preview at level {level}
            </span>
            <input
              type="range"
              min="1"
              max="320"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="Preview level"
            />
          </label>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2.5">
        {KID_THEMES.map((theme) => {
          const isSelected = theme.id === value
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id)}
              aria-pressed={isSelected}
              className="text-left p-2.5 relative overflow-hidden transition-transform active:scale-[0.97]"
              style={{
                background: theme.colors.surface,
                border: `2px solid ${isSelected ? theme.colors.accent : theme.colors.line}`,
                borderRadius: theme.radius === '0px' ? '4px' : 'var(--radius)',
                color: theme.colors.ink,
              }}
            >
              <div
                className="h-10 mb-2 rounded-md relative overflow-hidden"
                style={{ background: theme.colors.bg }}
              >
                <span className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 30% 40%, ${theme.colors.accent}55, transparent 60%), radial-gradient(circle at 75% 70%, ${theme.colors.accent2}55, transparent 55%)` }} />
              </div>
              <div className="font-display font-bold text-[13px] leading-tight truncate">{theme.name}</div>
              <div className="text-[10px] truncate" style={{ color: theme.colors.inkMuted }}>{theme.inspiredBy}</div>
              <div className="text-[11px] mt-1 truncate" style={{ color: theme.colors.accent }}>
                {theme.currency.icon} {theme.currency.name}
              </div>
              {theme.evolutions && (
                <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: theme.colors.accent2, color: theme.colors.bg }}>
                  EVOLVES
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
