/**
 * The 15 kid themes.
 *
 * Every theme controls three things and nothing else:
 *   1. an animated background scene (rendered by src/components/ThemeBackground.jsx)
 *   2. the name + icon of the in-app currency
 *   3. the 5-tier avatar that visually evolves as the kid levels up
 *
 * Cards, buttons, spacing and font sizes stay identical across all themes so the
 * app feels like one product. Colours are handed to CSS as custom properties by
 * src/lib/applyTheme.js.
 */

const FONT_DISPLAY = 'Outfit'
const FONT_BODY = 'Inter'
const FONT_MONO = 'JetBrains Mono'

/** Shared defaults so each theme below only lists what makes it different. */
const base = {
  mode: 'dark',
  fonts: { display: FONT_DISPLAY, body: FONT_BODY, mono: FONT_BODY },
  radius: '18px',
  shadow: '0 10px 30px -12px rgb(0 0 0 / 0.55)',
  good: '#1baf7a',
  warn: '#eda100',
  bad: '#e34948',
}

export const KID_THEMES = [
  {
    id: 'matrixblocks',
    name: 'MatrixBlocks',
    inspiredBy: 'Tetris style',
    blurb: 'Midnight blue fields and glowing cyber tetrominoes.',
    currency: { name: 'Matrix Clears', icon: '🧱' },
    scene: 'tetrominoes',
    ...base,
    fonts: { display: FONT_MONO, body: FONT_MONO, mono: FONT_MONO },
    radius: '4px',
    colors: {
      bg: '#070c22', surface: '#101a3d', surface2: '#16234f', line: '#2b3f7d',
      ink: '#e8f0ff', inkMuted: '#93a7d8', accent: '#3fe0ff', accent2: '#b46bff',
    },
    avatar: { motif: 'block', hues: ['#3fe0ff', '#5ad1ff', '#8ab4ff', '#b46bff', '#ff7ae0'] },
  },
  {
    id: 'blockcraft',
    name: 'Block Craft',
    inspiredBy: 'Minecraft style',
    blurb: 'Pixelated soil panels and blocky voxel borders.',
    currency: { name: 'Emeralds', icon: '💎' },
    scene: 'voxel',
    ...base,
    radius: '0px',
    shadow: '4px 4px 0 0 rgb(0 0 0 / 0.45)',
    colors: {
      bg: '#1d1710', surface: '#3a2c1e', surface2: '#4c3a27', line: '#6b5133',
      ink: '#f2e9d8', inkMuted: '#bda887', accent: '#3ddc84', accent2: '#8bd450',
    },
    avatar: { motif: 'block', hues: ['#8bd450', '#3ddc84', '#2fb36a', '#26d0c8', '#7ef0ff'] },
    /**
     * Block Craft is the one theme with level-gated evolutions. Each entry
     * overrides the colours / scene from that level upward.
     */
    evolutions: [
      {
        level: 51, label: 'Volcanic Crimson', scene: 'voxel-volcanic',
        companion: 'boarling',
        colors: { bg: '#1c0705', surface: '#3d100b', surface2: '#571610', line: '#8c2a1c', ink: '#ffe9e2', inkMuted: '#d59d8f', accent: '#ff6a3d', accent2: '#ffb302' },
      },
      {
        level: 101, label: 'Pale Cream', scene: 'voxel-cream', mode: 'light',
        companion: 'boarling',
        colors: { bg: '#E5E3A7', surface: '#f2f0c8', surface2: '#dedca0', line: '#a89fd0', ink: '#2c2350', inkMuted: '#5f5590', accent: '#6d28d9', accent2: '#8b5cf6' },
        shadow: '5px 5px 0 0 rgb(109 40 217 / 0.35)',
      },
      {
        level: 200, label: 'Nether', scene: 'voxel-nether', glitchIntro: true,
        companion: 'boarling',
        colors: { bg: '#170305', surface: '#3a0710', surface2: '#500b17', line: '#7d1226', ink: '#ffd9d9', inkMuted: '#c98a8a', accent: '#ff3b5c', accent2: '#ff9d00' },
      },
      {
        level: 300, label: 'End Void', scene: 'voxel-end', glitchIntro: true,
        companion: 'boarling',
        colors: { bg: '#0a0713', surface: '#1b1230', surface2: '#261844', line: '#4a2f7a', ink: '#efe6ff', inkMuted: '#a794cc', accent: '#d6b4ff', accent2: '#7cf5d8' },
      },
    ],
  },
  {
    id: 'tactical',
    name: 'Tactical Override',
    inspiredBy: 'R6 style',
    blurb: 'Matte grey panels with a sharp neon-orange tactical HUD.',
    currency: { name: 'Renown', icon: '🪙' },
    scene: 'hud',
    ...base,
    radius: '2px',
    fonts: { display: FONT_MONO, body: FONT_BODY, mono: FONT_MONO },
    colors: {
      bg: '#141618', surface: '#1e2225', surface2: '#282d31', line: '#3d4449',
      ink: '#eceff1', inkMuted: '#98a3ab', accent: '#ff7a18', accent2: '#5fd0ff',
    },
    avatar: { motif: 'visor', hues: ['#8b959b', '#ff7a18', '#ffa34d', '#5fd0ff', '#ffffff'] },
  },
  {
    id: 'apex',
    name: 'Apex Royale',
    inspiredBy: 'Fortnite style',
    blurb: 'Slanted high-contrast grids and bright battle-pass tracks.',
    currency: { name: 'V-Coins', icon: '🪙' },
    scene: 'slant',
    ...base,
    radius: '10px',
    colors: {
      bg: '#120b2e', surface: '#1e1350', surface2: '#2a1a69', line: '#4a2fa8',
      ink: '#f4f0ff', inkMuted: '#b2a2e6', accent: '#00e5ff', accent2: '#ffd400',
    },
    avatar: { motif: 'chevron', hues: ['#8b7bd8', '#00e5ff', '#ffd400', '#ff5ea8', '#7CFFB2'] },
  },
  {
    id: 'aura',
    name: 'Aura Awakening',
    inspiredBy: 'Anime style',
    blurb: 'Manga framing with explosive golden energy meters.',
    currency: { name: 'Power Levels', icon: '💥' },
    scene: 'aura',
    ...base,
    radius: '14px',
    colors: {
      bg: '#12080f', surface: '#241221', surface2: '#33192e', line: '#5c2a4f',
      ink: '#fff4e8', inkMuted: '#d0a9bd', accent: '#ffc22e', accent2: '#ff4d6d',
    },
    avatar: { motif: 'flame', hues: ['#ff4d6d', '#ff8a3d', '#ffc22e', '#fff07a', '#ffffff'] },
  },
  {
    id: 'coquette',
    name: 'Coquette Circuit',
    inspiredBy: 'Sanrio style',
    blurb: 'Soft pastel pink fields with retro pixel bows and stars.',
    currency: { name: 'Pink Crystals', icon: '💎' },
    scene: 'bows',
    ...base,
    mode: 'light',
    radius: '22px',
    shadow: '0 10px 24px -12px rgb(214 108 160 / 0.55)',
    colors: {
      bg: '#fff1f6', surface: '#ffffff', surface2: '#ffe4ef', line: '#f3c2d8',
      ink: '#4a2338', inkMuted: '#96637e', accent: '#e0518f', accent2: '#8f6ce0',
    },
    avatar: { motif: 'bow', hues: ['#f7b5cf', '#f38bb4', '#e0518f', '#c33b8e', '#8f6ce0'] },
  },
  {
    id: 'poparena',
    name: 'Pop Arena',
    inspiredBy: 'Taylor Swift style',
    blurb: 'Dark stadium fields lit by neon-purple stage rigs.',
    currency: { name: 'VIP Tickets', icon: '🎟️' },
    scene: 'stage',
    ...base,
    radius: '16px',
    colors: {
      bg: '#0d0518', surface: '#1c0e35', surface2: '#2a1550', line: '#4d2a86',
      ink: '#f6efff', inkMuted: '#b39ddb', accent: '#c04bff', accent2: '#4ce0d3',
    },
    avatar: { motif: 'star', hues: ['#b39ddb', '#c04bff', '#ff7ad9', '#4ce0d3', '#ffe27a'] },
  },
  {
    id: 'pegasus',
    name: 'Pegasus Horizon',
    inspiredBy: 'My Little Pony style',
    blurb: 'Lavender and sky-blue gradients trailing sparkling star dust.',
    currency: { name: 'Star Shards', icon: '✨' },
    scene: 'stardust',
    ...base,
    mode: 'light',
    radius: '24px',
    shadow: '0 12px 26px -14px rgb(124 92 214 / 0.6)',
    colors: {
      bg: '#f2ecff', surface: '#ffffff', surface2: '#e8e0ff', line: '#cfc2f5',
      ink: '#33235e', inkMuted: '#7a6aa8', accent: '#7c5cd6', accent2: '#3ba9e8',
    },
    avatar: { motif: 'wing', hues: ['#c9b8f5', '#a98cf0', '#7c5cd6', '#3ba9e8', '#ffd166'] },
  },
  {
    id: 'sugarrush',
    name: 'Sugar Rush',
    inspiredBy: 'Baking game style',
    blurb: 'Pastel mint counters, dripping icing borders, sprinkle dividers.',
    currency: { name: 'Sugar Orbs', icon: '🔮' },
    scene: 'sprinkles',
    ...base,
    mode: 'light',
    radius: '20px',
    shadow: '0 10px 24px -12px rgb(0 0 0 / 0.25)',
    colors: {
      bg: '#e6fbf3', surface: '#ffffff', surface2: '#d5f6ea', line: '#a8e6d1',
      ink: '#2a4a41', inkMuted: '#5f8b7e', accent: '#ff6fae', accent2: '#00b894',
    },
    avatar: { motif: 'cupcake', hues: ['#ffd0e3', '#ff9ec7', '#ff6fae', '#c2529a', '#00b894'] },
  },
  {
    id: 'glam',
    name: 'Glam Protocol',
    inspiredBy: 'Barbie style',
    blurb: 'Hot-pink vanity columns, mirror lines and diamond particles.',
    currency: { name: 'Glow Points', icon: '✨' },
    scene: 'vanity',
    ...base,
    radius: '18px',
    colors: {
      bg: '#25041a', surface: '#3f0a2c', surface2: '#54103b', line: '#8b1f63',
      ink: '#ffeaf6', inkMuted: '#dba3c6', accent: '#ff2d8f', accent2: '#ffd9f0',
    },
    avatar: { motif: 'diamond', hues: ['#ff9ecb', '#ff5ea8', '#ff2d8f', '#c4187a', '#ffe9f6'] },
  },
  {
    id: 'campfire',
    name: 'Campfire Cozy',
    inspiredBy: 'Animal Crossing style',
    blurb: 'Warm wood panels, calm pastel-green buttons, leaf-thin lines.',
    currency: { name: 'Berberries', icon: '🍒' },
    scene: 'leaves',
    ...base,
    mode: 'light',
    radius: '20px',
    shadow: '0 8px 20px -12px rgb(90 62 33 / 0.5)',
    colors: {
      bg: '#fbf3e4', surface: '#fffaf0', surface2: '#f0e2c8', line: '#d9c39b',
      ink: '#48331c', inkMuted: '#8a7350', accent: '#4e9c52', accent2: '#e0813f',
    },
    avatar: { motif: 'leaf', hues: ['#a7d3a1', '#7bbd78', '#4e9c52', '#e0813f', '#f3c969'] },
  },
  {
    id: 'cybergrid',
    name: 'Cyber Grid',
    inspiredBy: 'Cyberpunk style',
    blurb: 'Electric purple grids and neon-cyan wireframe boxes.',
    currency: { name: 'Credits', icon: '💎' },
    scene: 'grid',
    ...base,
    radius: '6px',
    fonts: { display: FONT_MONO, body: FONT_BODY, mono: FONT_MONO },
    colors: {
      bg: '#0b0416', surface: '#1a0a33', surface2: '#251047', line: '#5522a8',
      ink: '#eae2ff', inkMuted: '#a98fd8', accent: '#25f4ee', accent2: '#c026d3',
    },
    avatar: { motif: 'wire', hues: ['#8b5cf6', '#c026d3', '#25f4ee', '#7cffb2', '#ffffff'] },
  },
  {
    id: 'plumber',
    name: 'Plumber Kingdom',
    inspiredBy: 'Super Mario style',
    blurb: 'Bright sky-blue boards with classic castle brick dividers.',
    currency: { name: 'Star Coins', icon: '⭐' },
    scene: 'bricks',
    ...base,
    mode: 'light',
    radius: '12px',
    shadow: '0 8px 0 0 rgb(0 0 0 / 0.18)',
    colors: {
      bg: '#bfe6ff', surface: '#ffffff', surface2: '#e6f4ff', line: '#8cc7ef',
      ink: '#1e3a5f', inkMuted: '#4f7a9c', accent: '#e5342b', accent2: '#f7c948',
    },
    avatar: { motif: 'cap', hues: ['#f7c948', '#5cb85c', '#3b82f6', '#e5342b', '#ffffff'] },
  },
  {
    id: 'neonpulse',
    name: 'Neon Pulse',
    inspiredBy: 'Geometry Dash style',
    blurb: 'Pitch-black space cut by razor-sharp neon triangle drifts.',
    currency: { name: 'Mana Orbs', icon: '🔮' },
    scene: 'triangles',
    ...base,
    radius: '4px',
    colors: {
      bg: '#000000', surface: '#0e0e14', surface2: '#16161f', line: '#2c2c3d',
      ink: '#f2f2ff', inkMuted: '#9a9ab5', accent: '#00ffa3', accent2: '#ff2eb5',
    },
    avatar: { motif: 'triangle', hues: ['#00ffa3', '#31d0ff', '#7b5cff', '#ff2eb5', '#ffffff'] },
  },
  {
    id: 'monstertamer',
    name: 'Monster Tamer',
    inspiredBy: 'Pokémon style',
    blurb: 'Handheld-yellow casing with a live elemental companion readout.',
    currency: { name: 'Pocket Coins', icon: '🪙' },
    scene: 'handheld',
    ...base,
    mode: 'light',
    radius: '14px',
    shadow: '0 8px 18px -10px rgb(120 90 0 / 0.55)',
    colors: {
      bg: '#ffe066', surface: '#fff8dc', surface2: '#ffefa8', line: '#e0b800',
      ink: '#2f2a0a', inkMuted: '#7a6b1f', accent: '#e04a2f', accent2: '#2f7de0',
    },
    avatar: { motif: 'monster', hues: ['#7ec86b', '#2f7de0', '#e04a2f', '#b06fe0', '#ffd166'] },
  },
]

export const KID_THEME_MAP = Object.fromEntries(KID_THEMES.map((t) => [t.id, t]))

export const DEFAULT_KID_THEME = 'matrixblocks'

/**
 * Resolve a theme for a given level, applying Block Craft's level-gated
 * evolutions (and any future theme that gains them).
 */
export function resolveKidTheme(themeId, level = 1) {
  const theme = KID_THEME_MAP[themeId] || KID_THEME_MAP[DEFAULT_KID_THEME]
  if (!theme.evolutions?.length) return { ...theme, evolution: null }

  const unlocked = theme.evolutions.filter((e) => level >= e.level)
  if (!unlocked.length) return { ...theme, evolution: null }

  const active = unlocked[unlocked.length - 1]
  return {
    ...theme,
    ...active,
    colors: { ...theme.colors, ...active.colors },
    name: theme.name,
    currency: theme.currency,
    evolution: active,
  }
}

/** The next locked evolution, so the kid can see what they are climbing toward. */
export function nextEvolution(themeId, level = 1) {
  const theme = KID_THEME_MAP[themeId]
  if (!theme?.evolutions?.length) return null
  return theme.evolutions.find((e) => level < e.level) || null
}
