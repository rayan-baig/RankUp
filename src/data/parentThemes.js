/**
 * The 10 parent dashboard themes.
 *
 * These are purely cosmetic — they change nothing about how the app behaves.
 * `mode` tells the charts in the AI Behaviour Blueprint which validated colour
 * steps to use (see src/components/charts/palette.js).
 */

export const PARENT_THEMES = [
  {
    id: 'executive',
    name: 'Executive Focus',
    icon: '📈',
    blurb: 'Deep navy blue, sharp white text grids.',
    mode: 'dark',
    pattern: 'grid',
    colors: {
      bg: '#0a1633', surface: '#122148', surface2: '#1a2c5c', line: '#2c4280',
      ink: '#f4f8ff', inkMuted: '#9fb3d9', accent: '#4c9aff', accent2: '#7cd4ff',
    },
  },
  {
    id: 'cozycafe',
    name: 'Cozy Café',
    icon: '☕',
    blurb: 'Warm latte browns and oak panel textures.',
    mode: 'light',
    pattern: 'wood',
    colors: {
      bg: '#f6ece0', surface: '#fffaf3', surface2: '#efe0cd', line: '#d8c1a4',
      ink: '#3f2b1a', inkMuted: '#836b52', accent: '#a05a2c', accent2: '#c98a4b',
    },
  },
  {
    id: 'zen',
    name: 'Zen Minimalist',
    icon: '🧘',
    blurb: 'Slate grey with calming sage-green containers.',
    mode: 'light',
    pattern: 'none',
    colors: {
      bg: '#eef1ef', surface: '#ffffff', surface2: '#e2e9e3', line: '#c6d2c8',
      ink: '#2c3733', inkMuted: '#6b7a74', accent: '#5b8f6f', accent2: '#8fae9b',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Admin',
    icon: '🌌',
    blurb: 'Charcoal black with silver-glowing night-time nodes.',
    mode: 'dark',
    pattern: 'nodes',
    colors: {
      bg: '#0e0e11', surface: '#18181d', surface2: '#212128', line: '#34343f',
      ink: '#f2f2f5', inkMuted: '#9c9cad', accent: '#c8ccd8', accent2: '#7f8cff',
    },
  },
  {
    id: 'botanical',
    name: 'Botanical Core',
    icon: '🌿',
    blurb: 'Soft linen over deep forest-green layouts.',
    mode: 'light',
    pattern: 'fronds',
    colors: {
      bg: '#f4f1e8', surface: '#ffffff', surface2: '#e7e6d6', line: '#c9cdb4',
      ink: '#1f3325', inkMuted: '#5e7263', accent: '#1f6b45', accent2: '#8aa86b',
    },
  },
  {
    id: 'velocity',
    name: 'Velocity Carbon',
    icon: '🏎️',
    blurb: 'Carbon-black fields cut with glowing crimson lines.',
    mode: 'dark',
    pattern: 'carbon',
    colors: {
      bg: '#0b0b0c', surface: '#151517', surface2: '#1d1d20', line: '#333338',
      ink: '#f5f5f7', inkMuted: '#98989f', accent: '#e01235', accent2: '#ff6a4d',
    },
  },
  {
    id: 'solstice',
    name: 'Solstice Clean',
    icon: '🌅',
    blurb: 'Soft amber glows over light peach gradients.',
    mode: 'light',
    pattern: 'sunrise',
    colors: {
      bg: '#fff3e8', surface: '#fffaf6', surface2: '#ffe6d2', line: '#f5c9a8',
      ink: '#4a2f1c', inkMuted: '#946a4c', accent: '#e08a2c', accent2: '#e8623c',
    },
  },
  {
    id: 'oceania',
    name: 'Oceania Slate',
    icon: '🐚',
    blurb: 'Deep teal containers with aquamarine type.',
    mode: 'dark',
    pattern: 'waves',
    colors: {
      bg: '#04222b', surface: '#0a3440', surface2: '#0e4353', line: '#186275',
      ink: '#e2fbff', inkMuted: '#8fc4d1', accent: '#4fe0c8', accent2: '#59b8ff',
    },
  },
  {
    id: 'blueprint',
    name: 'Architect Blueprint',
    icon: '📐',
    blurb: 'Dark blueprint blue with white wireframe vectors.',
    mode: 'dark',
    pattern: 'blueprint',
    colors: {
      bg: '#08203f', surface: '#0d2c55', surface2: '#123669', line: '#2a5591',
      ink: '#eaf3ff', inkMuted: '#93b4dd', accent: '#ffffff', accent2: '#7fd0ff',
    },
  },
  {
    id: 'sovereign',
    name: 'Sovereign Estate',
    icon: '🏛️',
    blurb: 'Obsidian panel cards edged with pulsing gold.',
    mode: 'dark',
    pattern: 'estate',
    colors: {
      bg: '#0c0b09', surface: '#17150f', surface2: '#201d14', line: '#5a4a22',
      ink: '#faf5e6', inkMuted: '#b6a883', accent: '#d4af37', accent2: '#f2dfa0',
    },
  },
]

export const PARENT_THEME_MAP = Object.fromEntries(PARENT_THEMES.map((t) => [t.id, t]))
export const DEFAULT_PARENT_THEME = 'executive'

export function resolveParentTheme(id) {
  return PARENT_THEME_MAP[id] || PARENT_THEME_MAP[DEFAULT_PARENT_THEME]
}
