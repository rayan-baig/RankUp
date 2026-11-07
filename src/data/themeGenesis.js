/**
 * Theme Genesis: the pieces a child makes a theme from, and the rules.
 *
 * A child's own theme is a LOOK and some NAMES laid over the structure of a
 * built-in theme. It borrows that theme's levels outright: the same five
 * forms at levels 1, 10, 25, 50 and 100 and the same four worlds arriving
 * at 10, 25, 50 and 100. XP, coins, streaks, rewards, the arcade, the
 * badges and every unlock are worked out exactly as they are for everyone
 * else, because nothing here touches them. A theme can never change a rule.
 *
 * What a theme is, as it is stored (kid_themes.design, about 250 bytes):
 *
 *   { v: 1, vibe, base, bg, a, a2, pat, mascot, cur, worlds: [4 names] }
 *
 * with the theme's name beside it. Colours are three hex values; everything
 * else a screen needs (cards, lines, the text colour) is worked out from them
 * by readablePalette(), which keeps every word readable whatever was picked.
 *
 * The same lists are held by the database (kid_theme_design_ok in
 * supabase/sync.sql) so a changed app cannot store anything else, and
 * tests/genesiswords.mjs fails if the two disagree.
 */

import { KID_THEME_MAP } from './kidThemes.js'
import { wordsOk, plainName } from '../lib/kidWords.js'

/** How many themes one child may keep, drafts included. */
export const MAX_KID_THEMES = 5
export const NAME_MAX = 24
export const WORLD_MAX = 20
export const CURRENCY_MAX = 16
/** The credit line a parent may add when a theme goes to RankUp: a first name or a nickname. */
export const CREDIT_MAX = 20
/** The longest a stored design may be, as JSON. The database holds the same line. */
export const DESIGN_MAX = 700

/** The built-in themes a child's theme may take its structure from: the five-form ones. */
export const BASES = ['matrixblocks', 'aura', 'campfire', 'sugarrush', 'cybergrid', 'pegasus']

/** Curated starting points. Each fills in everything, so a child can go straight to Launch. */
export const VIBES = [
  {
    id: 'space', label: 'Space', icon: '🚀', base: 'matrixblocks', palette: 'galaxy', pattern: 'stars', mascot: '🚀',
    currency: { name: 'Star Bits', icon: '⭐' }, names: ['Star Voyage', 'Rocket Crew', 'Cosmic Quest'],
    worlds: ['Moon Base', 'Asteroid Belt', 'Ring Planet', 'Edge of Space'],
  },
  {
    id: 'ocean', label: 'Ocean', icon: '🐬', base: 'aura', palette: 'lagoon', pattern: 'waves', mascot: '🐬',
    currency: { name: 'Pearls', icon: '🐚' }, names: ['Deep Blue', 'Wave Riders', 'Reef Quest'],
    worlds: ['Coral Reef', 'Kelp Forest', 'Shipwreck Bay', 'The Deep'],
  },
  {
    id: 'jungle', label: 'Jungle', icon: '🐒', base: 'campfire', palette: 'canopy', pattern: 'leaves', mascot: '🐒',
    currency: { name: 'Bananas', icon: '🍌' }, names: ['Jungle Run', 'Wild Trail', 'Vine Swing'],
    worlds: ['Jungle Floor', 'River Rapids', 'Lost Temple', 'Sky Canopy'],
  },
  {
    id: 'candy', label: 'Candy', icon: '🍭', base: 'sugarrush', palette: 'bubblegum', pattern: 'dots', mascot: '🍭',
    currency: { name: 'Gumdrops', icon: '🍬' }, names: ['Sweet Land', 'Candy Craze', 'Sugar Quest'],
    worlds: ['Lollipop Lane', 'Choc Falls', 'Candy Castle', 'Sugar Peak'],
  },
  {
    id: 'robots', label: 'Robots', icon: '🤖', base: 'cybergrid', palette: 'circuit', pattern: 'circuits', mascot: '🤖',
    currency: { name: 'Bolts', icon: '🔩' }, names: ['Robo Squad', 'Gear Up', 'Mega Bots'],
    worlds: ['Workshop', 'Gear Works', 'Mega Factory', 'Robot City'],
  },
  {
    id: 'new', label: 'Something new', icon: '✨', base: 'pegasus', palette: 'sunset', pattern: 'confetti', mascot: '🦄',
    currency: { name: 'Sparks', icon: '✨' }, names: ['My World', 'Dream Land', 'Big Adventure'],
    worlds: ['First Land', 'Second Land', 'Third Land', 'Final Land'],
  },
]
export const VIBE_MAP = Object.fromEntries(VIBES.map((v) => [v.id, v]))

/** Kid-friendly colour sets: a background and two bright accents. */
export const PALETTES = [
  { id: 'galaxy', name: 'Galaxy', bg: '#0b0f2e', a: '#7cc4ff', a2: '#ffd166' },
  { id: 'lagoon', name: 'Lagoon', bg: '#052a3a', a: '#3ee0d0', a2: '#ffb3c1' },
  { id: 'canopy', name: 'Canopy', bg: '#0c2a17', a: '#7ee081', a2: '#ffd23f' },
  { id: 'bubblegum', name: 'Bubblegum', bg: '#fff0f7', a: '#d6337f', a2: '#2a7fc9' },
  { id: 'circuit', name: 'Circuit', bg: '#0d1117', a: '#39ff9f', a2: '#ff8a3d' },
  { id: 'sunset', name: 'Sunset', bg: '#2a0f2e', a: '#ff8a5c', a2: '#ffd166' },
  { id: 'lemonade', name: 'Lemonade', bg: '#fffbe6', a: '#b45309', a2: '#0e7c5a' },
  { id: 'grape', name: 'Grape', bg: '#1d0b33', a: '#c084fc', a2: '#5eead4' },
  { id: 'ice', name: 'Ice', bg: '#eef6ff', a: '#2563eb', a2: '#c0266d' },
  { id: 'lava', name: 'Lava', bg: '#1f0a07', a: '#ff6b35', a2: '#ffd23f' },
]
export const PALETTE_MAP = Object.fromEntries(PALETTES.map((p) => [p.id, p]))

/** The background patterns, drawn in SVG by src/components/ThemeBackground.jsx (scene `pat-<id>`). */
export const PATTERNS = [
  { id: 'stars', name: 'Stars' },
  { id: 'waves', name: 'Waves' },
  { id: 'leaves', name: 'Leaves' },
  { id: 'dots', name: 'Dots' },
  { id: 'circuits', name: 'Circuits' },
  { id: 'confetti', name: 'Confetti' },
  { id: 'zigzag', name: 'Zigzag' },
  { id: 'bubbles', name: 'Bubbles' },
]
export const PATTERN_IDS = PATTERNS.map((p) => p.id)

/** The mascots: one emoji each, from this set only. */
export const MASCOTS = [
  '🚀', '🐬', '🐒', '🍭', '🤖', '🦄', '🦖', '🐉', '🐱', '🐶', '🦊', '🐼',
  '🐸', '🐙', '🦈', '🦁', '🐧', '👾', '⚡', '🌈', '⭐', '🍩', '🎮', '🏰',
]

/* ---------- colour, worked out so text stays readable ---------- */

const HEX = /^#[0-9a-f]{6}$/

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`

/** a → b by t (0..1), in plain RGB. */
export function mix(a, b, t) {
  const x = toRgb(a)
  const y = toRgb(b)
  return toHex(x.map((v, i) => v + (y[i] - v) * t))
}

export function luminance(hex) {
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const [r, g, b] = toRgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** Nudge `fg` towards `toward` until it reads at `floor` on every one of `on`. */
function pushTo(fg, on, floor, toward) {
  let out = fg
  for (let i = 1; i <= 20 && on.some((bg) => contrast(out, bg) < floor); i += 1) out = mix(fg, toward, i / 20)
  return out
}

/** Rotate a colour's hue by `deg`, keeping its lightness and saturation. */
export function shiftHue(hex, deg) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return hex
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = ((h * 60 + deg) % 360 + 360) % 360 / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const chan = (t0) => {
    let t = t0
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return toHex([chan(h + 1 / 3), chan(h), chan(h - 1 / 3)].map((v) => v * 255))
}

/**
 * The eight colours a screen reads, from the three a child picked.
 *
 * Whatever was picked, the result meets the same floors as every built-in
 * theme (tests/themes.mjs): words at 4.5 to 1 on the background and on a
 * card, and the two accents at 3 to 1 on a card and on the background (a
 * button's label is the background colour on the accent).
 */
export function readablePalette({ bg, a, a2 }) {
  const picked = HEX.test(bg) ? bg : '#101425'
  const light = luminance(picked) > 0.45
  // A middling background (a mid blue, say) reads well with neither white
  // nor black words, so it is taken darker, or lighter, until one of them
  // does. The picker shows the result, so what a child sees is what they get.
  const base = light ? pushTo(picked, ['#000000'], 12, '#ffffff') : pushTo(picked, ['#ffffff'], 10, '#000000')
  const surface = light ? mix(base, '#ffffff', 0.65) : mix(base, '#ffffff', 0.07)
  const surface2 = light ? mix(base, '#000000', 0.05) : mix(base, '#ffffff', 0.13)
  const line = light ? mix(base, '#000000', 0.18) : mix(base, '#ffffff', 0.26)
  const ink = light ? mix(base, '#000000', 0.86) : mix(base, '#ffffff', 0.94)
  const inkMuted = pushTo(mix(ink, base, 0.38), [surface, base, surface2], 4.6, ink)
  const far = light ? '#000000' : '#ffffff'
  const accent = pushTo(HEX.test(a) ? a : (light ? '#2563eb' : '#7cc4ff'), [surface, base, surface2], 3.1, far)
  const accent2 = pushTo(HEX.test(a2) ? a2 : (light ? '#c0266d' : '#ffd166'), [surface, base, surface2], 3.1, far)
  return {
    mode: light ? 'light' : 'dark',
    colors: { bg: base, surface, surface2, line, ink: pushTo(ink, [surface, base, surface2], 7, far), inkMuted, accent, accent2 },
  }
}

/* ---------- a design: made, checked, and turned into a theme ---------- */

/** A new design from a vibe: everything filled in, so it can launch as it stands. */
export function designFromVibe(vibeId, name) {
  const vibe = VIBE_MAP[vibeId] || VIBE_MAP.space
  const p = PALETTE_MAP[vibe.palette]
  return {
    name: name ?? vibe.names[0],
    design: {
      v: 1, vibe: vibe.id, base: vibe.base, bg: p.bg, a: p.a, a2: p.a2,
      pat: vibe.pattern, mascot: vibe.mascot, cur: vibe.currency.name, worlds: [...vibe.worlds],
    },
  }
}

/**
 * A design held to the lists: anything unknown is replaced, every name made
 * plain and cut to length. What goes into storage always comes out of here.
 */
export function cleanDesign(design) {
  const d = design && typeof design === 'object' ? design : {}
  const vibe = VIBE_MAP[d.vibe] || VIBE_MAP.new
  const pal = PALETTE_MAP[vibe.palette]
  const hex = (v, fallback) => (typeof v === 'string' && HEX.test(v.toLowerCase()) ? v.toLowerCase() : fallback)
  const worlds = Array.from({ length: 4 }, (_, i) => plainName(d.worlds?.[i], WORLD_MAX) || vibe.worlds[i])
  return {
    v: 1,
    vibe: vibe.id,
    base: BASES.includes(d.base) ? d.base : vibe.base,
    bg: hex(d.bg, pal.bg),
    a: hex(d.a, pal.a),
    a2: hex(d.a2, pal.a2),
    pat: PATTERN_IDS.includes(d.pat) ? d.pat : vibe.pattern,
    mascot: MASCOTS.includes(d.mascot) ? d.mascot : vibe.mascot,
    cur: plainName(d.cur, CURRENCY_MAX) || vibe.currency.name,
    worlds,
  }
}

/**
 * What is wrong with a theme, if anything, as one sentence for a child.
 * Null when it can be saved.
 */
export function themeProblem(name, design) {
  const n = plainName(name, NAME_MAX)
  if (!n) return 'Give your theme a name.'
  if (!wordsOk(n)) return 'That name has a word RankUp does not allow. Try another one.'
  const d = cleanDesign(design)
  if (!wordsOk(d.cur)) return 'The coin name has a word RankUp does not allow.'
  const bad = d.worlds.findIndex((w) => !wordsOk(w))
  if (bad >= 0) return `World ${bad + 1} has a word RankUp does not allow.`
  if (JSON.stringify(d).length > DESIGN_MAX) return 'Those names are too long. Make them a little shorter.'
  return null
}

/** The id a theme is known by in kids.theme_id: one of the child's own. */
export const customThemeId = (rowId) => `custom-${rowId}`
/** The id of an official Season theme. */
export const seasonThemeId = (rowId) => `season-${rowId}`
export const isOwnThemeId = (id) => typeof id === 'string' && id.startsWith('custom-')
export const isSeasonThemeId = (id) => typeof id === 'string' && id.startsWith('season-')

/** The world colours: the same palette, the light shifting a little further each world. */
function worldColours(d, i) {
  const light = luminance(d.bg) > 0.45
  const bg = mix(d.bg, light ? '#000000' : d.a, light ? 0.03 * (i + 1) : 0.05 * (i + 1))
  return readablePalette({ bg, a: shiftHue(d.a, 22 * (i + 1)), a2: shiftHue(d.a2, -18 * (i + 1)) }).colors
}

/**
 * A theme object, in the same shape as the built-in ones, from a stored
 * design. `id` is the theme id (custom-… or season-…); `extra` adds what a
 * Season theme carries (its number and credit line).
 */
export function buildTheme({ id, name, design, extra = {} }) {
  const d = cleanDesign(design)
  const base = KID_THEME_MAP[d.base] || KID_THEME_MAP[BASES[0]]
  const vibe = VIBE_MAP[d.vibe] || VIBE_MAP.new
  const { mode, colors } = readablePalette(d)
  const hues = [0, 0.25, 0.5, 0.75, 1].map((t) => mix(colors.accent, colors.accent2, t))
  return {
    id,
    name: plainName(name, NAME_MAX) || vibe.names[0],
    inspiredBy: extra.inspiredBy || 'Made in Theme Genesis',
    blurb: extra.blurb || `${vibe.label} vibes, with ${PATTERNS.find((p) => p.id === d.pat)?.name.toLowerCase() || 'a pattern'} and a ${d.mascot}.`,
    story: '',
    currency: { name: d.cur, icon: vibe.currency.icon },
    scene: `pat-${d.pat}`,
    mode,
    fonts: { display: 'Outfit', body: 'Inter', mono: 'Inter' },
    radius: '18px',
    shadow: '0 10px 30px -12px rgb(0 0 0 / 0.55)',
    good: '#1baf7a',
    warn: '#eda100',
    bad: '#e34948',
    colors,
    avatar: { motif: 'block', emoji: d.mascot, hues },
    // The structure is the base theme's: its form ladder and its world levels.
    tiers: base.tiers,
    evolutions: (base.evolutions || []).slice(0, 4).map((e, i) => ({
      level: e.level,
      label: d.worlds[i],
      story: '',
      sky: e.sky,
      colors: worldColours(d, i),
    })),
    custom: true,
    design: d,
    ...extra,
  }
}

/** Bytes a design takes as stored (JSON), for the size checks. */
export const designBytes = (name, design) => JSON.stringify({ name, design: cleanDesign(design) }).length

/* ---------- the themes this phone knows, and the Seasons ---------- */

/** How often the app asks whether a new Season has started. */
export const SEASON_CHECK_MS = 60 * 60 * 1000

/** "by Sam", or "by a RankUp family" when no credit was given. */
export const creditLine = (credit) => (credit ? `by ${credit}` : 'by a RankUp family')

/**
 * The Seasons as the server sent them (live_seasons), held to what the app
 * reads: a number, a name, a start day, and each theme's name, design and
 * credit. Anything else in the answer is dropped before it is kept.
 */
export function cleanSeasons(seasons) {
  return (Array.isArray(seasons) ? seasons : [])
    .filter((s) => Number.isInteger(Number(s?.number)))
    .map((s) => ({
      number: Number(s.number),
      name: plainName(s.name, 40),
      startsOn: String(s.starts_on ?? s.startsOn ?? '').slice(0, 10),
      themes: (Array.isArray(s.themes) ? s.themes : []).filter((t) => t?.id).map((t) => ({
        id: String(t.id),
        name: plainName(t.name, NAME_MAX),
        design: cleanDesign(t.design),
        credit: plainName(t.credit, CREDIT_MAX) || null,
      })),
    }))
    .sort((a, b) => a.number - b.number)
}

/** Every data theme for a state: the Season themes, then each child's own. */
export function themesFromState(state) {
  const season = (state?.seasons || []).flatMap((s) => (s.themes || []).map((t) => buildTheme({
    id: seasonThemeId(t.id),
    name: t.name,
    design: t.design,
    extra: { season: s.number, seasonName: s.name, credit: t.credit, inspiredBy: `Season ${s.number} · ${creditLine(t.credit)}` },
  })))
  const own = (state?.kidThemes || []).map((t) => buildTheme({
    id: customThemeId(t.id),
    name: t.name,
    design: t.design,
    extra: { ownerKidId: t.kidId, rowId: t.id, status: t.status },
  }))
  return [...season, ...own]
}

/** How long after it starts a Season is still news on a phone that has not shown it. */
export const SEASON_NEWS_DAYS = 14

/**
 * The Season to celebrate on this phone, if any: the newest one with themes
 * that started in the last fortnight and has not been shown here yet. A
 * family who joins halfway through a Season sees its themes in the picker
 * without being told something is new that is not.
 */
export function seasonToCelebrate(state, now = Date.now()) {
  const fresh = (state?.seasons || []).filter((s) => {
    const start = Date.parse(`${s.startsOn}T00:00:00Z`)
    return s.themes?.length && !state.seen?.[`season:${s.number}`]
      && Number.isFinite(start) && start <= now && now - start <= SEASON_NEWS_DAYS * 86400000
  })
  return fresh[fresh.length - 1] || null
}
