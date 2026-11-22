import { useState } from 'react'
import { picture } from '../data/art.js'
import { tiersFor } from '../lib/avatarTiers.js'
import { KID_THEMES, resolveKidTheme, extraThemes } from '../data/kidThemes.js'
import Avatar from './Avatar.jsx'
import { Card } from './ui.jsx'

/** How many worlds the short picker shows before "See all". */
const SHORT_LIST = 6

/** A world's first-form picture, for its card: see data/art.js. */
function portraitFor(theme) {
  return picture(`avatar-${theme.id}-${tiersFor(theme)[0]}`, `avatar-${theme.id}`)?.url || null
}

/**
 * The 15-theme chooser.
 *
 * Each card previews the theme's own colours, so a kid picks by looking rather
 * than by reading. The level slider lets you see how a theme evolves without
 * having to actually reach level 100 first.
 */
export default function ThemePicker({ value, onChange, previewLevel = 1, showEvolutionPreview = true, kidId = null, onMake = null, short = false }) {
  const [level, setLevel] = useState(previewLevel)
  const selected = resolveKidTheme(value, level)
  /*
   * Short (sign-up, 0.29.0): no big card repeating the world that is already
   * lit in the grid, and six worlds with "See all 15" under them, so the
   * step is not three phone screens of cards. The world picked is always
   * among those showing.
   */
  const [all, setAll] = useState(!short)
  const firstSix = KID_THEMES.slice(0, SHORT_LIST)
  const worlds = all ? KID_THEMES
    : firstSix.some((t) => t.id === value) ? firstSix
      : [...KID_THEMES.slice(0, SHORT_LIST - 1), KID_THEMES.find((t) => t.id === value)].filter(Boolean)
  /*
   * Beside the fifteen: this Season's official themes, for everybody, and
   * the child's own finished themes from Theme Genesis, for them alone (a
   * brother's are his). Neither is offered where there is no child yet.
   */
  const extra = kidId
    ? extraThemes().filter((t) => t.season || (t.ownerKidId === kidId && t.status === 'ready'))
    : []

  return (
    <div>
      {!short && (
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

        {/*
          The preview only goes as far as the child has been. Sliding to
          level 320 used to show every world in every theme, names and all,
          and worlds are meant to be secrets until they are reached.
        */}
        {showEvolutionPreview && previewLevel > 1 && (
          <label className="block mt-3">
            <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: selected.colors.inkMuted }}>
              Preview at level {level}
            </span>
            <input
              type="range"
              min="1"
              max={previewLevel}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="Preview level"
            />
          </label>
        )}
      </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {extra.map((theme) => {
          const isSelected = theme.id === value
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id)}
              aria-pressed={isSelected}
              data-testid={theme.season ? 'season-theme' : 'own-theme'}
              className="text-left p-2.5 relative overflow-hidden transition-transform active:scale-[0.97]"
              style={{
                background: theme.colors.surface,
                border: `2px solid ${isSelected ? theme.colors.accent : theme.colors.line}`,
                borderRadius: 'var(--radius)',
                color: theme.colors.ink,
              }}
            >
              <div className="h-16 mb-2 rounded-md relative overflow-hidden grid place-items-center" style={{ background: theme.colors.bg }}>
                <span className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 30% 40%, ${theme.colors.accent}55, transparent 60%), radial-gradient(circle at 75% 70%, ${theme.colors.accent2}55, transparent 55%)` }} />
                <span className="relative text-4xl" aria-hidden="true">{theme.avatar.emoji}</span>
              </div>
              <div className="font-display font-bold text-[13px] leading-tight truncate">{theme.name}</div>
              <div className="text-[10px] truncate" style={{ color: theme.colors.inkMuted }}>{theme.inspiredBy}</div>
              <div className="text-[11px] mt-1 truncate" style={{ color: theme.colors.accent }}>
                {theme.currency.icon} {theme.currency.name}
              </div>
              <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: theme.colors.accent2, color: theme.colors.bg }}>
                {theme.season ? `SEASON ${theme.season}` : 'YOURS'}
              </span>
            </button>
          )
        })}
        {worlds.map((theme) => {
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
                className="h-16 mb-2 rounded-md relative overflow-hidden grid place-items-center"
                style={{ background: theme.colors.bg }}
              >
                <span className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 30% 40%, ${theme.colors.accent}55, transparent 60%), radial-gradient(circle at 75% 70%, ${theme.colors.accent2}55, transparent 55%)` }} />
                {/*
                  The theme's own character, where one has been drawn. This
                  is the question the picker is actually answering — a child
                  chooses a theme because of who they get to be, not because
                  of two colours in a swatch. It is the child's first form:
                  the owner's picture where there is one (Block Craft's
                  level 1), else RankUp's own drawing of the world.
                */}
                {portraitFor(theme) && (
                  <img
                    src={portraitFor(theme)}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-contain"
                    data-testid="world-picture"
                  />
                )}
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
              {/* With no big card above, the world picked says so itself. */}
              {short && isSelected && <span className="pick-tick" aria-hidden="true">✓</span>}
            </button>
          )
        })}
        {!all && (
          <button type="button" onClick={() => setAll(true)} data-testid="see-all-worlds"
            className="btn btn-soft col-span-2 text-sm">
            See all {KID_THEMES.length} worlds
          </button>
        )}
        {onMake && (
          <button type="button" onClick={onMake} data-testid="make-own-theme"
                  className="p-2.5 grid place-items-center text-center transition-transform active:scale-[0.97]"
                  style={{ border: '2px dashed var(--accent)', borderRadius: 'var(--radius)', background: 'var(--surface)', minHeight: 120 }}>
            <span>
              <span className="block text-3xl" aria-hidden="true">✨</span>
              <span className="block font-display font-bold text-[13px]">Make your own theme</span>
              <span className="block text-[10px] text-muted">Theme Genesis</span>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
