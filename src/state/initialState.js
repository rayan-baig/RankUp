import { uid } from '../lib/id.js'
import { dayKey } from '../lib/dates.js'
import { DEFAULT_KID_THEME } from '../data/kidThemes.js'
import { DEFAULT_PARENT_THEME } from '../data/parentThemes.js'

/**
 * The three plans, cheapest first.
 *
 * `limits` is the machine-readable half — what the app actually enforces — and
 * `features` is the human half shown on the plan screen. They must agree: a
 * feature line that nothing enforces is a promise the app does not keep.
 *
 * All three are billed monthly. There is no annual option and no trial charge.
 */
export const TIERS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 4.99,
    order: 0,
    guildSize: 0,
    xpMultiplier: 1,
    limits: { maxKids: 1, aiPhotoCheck: false, guilds: false },
    features: [
      'One child',
      'Unlimited quests and rewards',
      'Photo proof, reviewed by you',
      'All 15 kid themes and 10 parent themes',
    ],
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    price: 9.99,
    order: 1,
    guildSize: 5,
    xpMultiplier: 1,
    limits: { maxKids: Infinity, aiPhotoCheck: true, guilds: true },
    features: [
      'Unlimited children',
      'AI photo verification on every proof',
      '5-player guilds',
      'Everything in Starter',
    ],
  },
  elite: {
    id: 'elite',
    name: 'Elite Pass',
    price: 15.99,
    order: 2,
    guildSize: 10,
    xpMultiplier: 1.5,
    limits: { maxKids: Infinity, aiPhotoCheck: true, guilds: true },
    features: [
      'Everything in Standard',
      'Permanent 1.5× XP boost',
      'Overdrive — the richer look, on every theme',
      '10-player Megacluster guilds',
      'Exclusive profile customisation',
      'The Parental Consequence Engine',
      'Advanced AI Behaviour Blueprints',
      'The 20% Discount Tournament',
    ],
  },
}

/** Cheapest first, for the plan screen. */
export const TIER_LADDER = Object.values(TIERS).sort((a, b) => a.order - b.order)

/**
 * The comparison table on the plan screen.
 *
 * One row per thing a parent might pay more for. `value` returns what that tier
 * actually gives, so the table can never drift away from what the app enforces.
 */
export const PLAN_COMPARISON = [
  { label: 'Children', value: (t) => (t.limits.maxKids === Infinity ? 'Unlimited' : String(t.limits.maxKids)) },
  { label: 'Quests & rewards', value: () => 'Unlimited' },
  { label: 'Photo proof', value: () => true },
  { label: 'AI photo check', value: (t) => t.limits.aiPhotoCheck },
  { label: 'All 25 themes', value: () => true },
  { label: 'Guilds', value: (t) => (t.guildSize ? `${t.guildSize}-player` : false) },
  { label: 'XP rate', value: (t) => (t.xpMultiplier > 1 ? `${t.xpMultiplier}×` : 'Normal') },
  { label: 'Sunday Market', value: () => true },
  { label: 'Overdrive visuals', value: (t) => t.id === 'elite' },
  { label: 'Profile frames', value: (t) => t.id === 'elite' },
  { label: 'Consequence Engine', value: (t) => t.id === 'elite' },
  { label: 'Behaviour Blueprints', value: (t) => t.id === 'elite' },
  { label: 'Discount Tournament', value: (t) => t.id === 'elite' },
]

export const ELITE_KID_PERKS = [
  { id: 'overdrive', icon: '✨', title: 'Overdrive', body: 'A slow aurora behind every screen in your own theme\u2019s colours, light coming off the buttons, a highlight running along the XP bar, a turning ring around your avatar, and a proper burst when you level up.' },
  { id: 'guilds', icon: '👥', title: '10-Player Megacluster Guilds', body: 'Doubles the standard clan from 5 slots to 10, so a squad leader can invite more real-world classmates.' },
  { id: 'xp', icon: '⚡', title: 'Permanent 1.5× XP Boost', body: 'A constant multiplier on every daily checklist and habit, so Elite kids level faster than Standard kids.' },
  { id: 'frames', icon: '🔮', title: 'Exclusive Profile Customisation', body: 'Unlocks animated profile card frames and rare item drop selectors Standard users cannot access.' },
]

export const ELITE_PARENT_PERKS = [
  { id: 'override', icon: '🛡️', title: 'The Parental Consequence Engine', body: 'Unlocks the System Override Protocol: custom real-world consequences plus Currency Tax, Dimension Lockout and Red Security Lockdown.' },
  { id: 'blueprint', icon: '📊', title: 'Advanced AI Behaviour Blueprints', body: 'Weekly chart breakdowns of focus patterns and chore-completion history, built from what actually happened in the app.' },
  { id: 'alliance', icon: '🏆', title: 'The 20% Discount Tournament', body: 'Join a ten-family alliance and compete each month on quests approved. The winning family gets 20% off their next bill — earned, not bought.' },
]

/** Profile card frames — Elite only. */
export const PROFILE_FRAMES = [
  { id: 'none', name: 'No frame', elite: false },
  { id: 'pulse', name: 'Pulse Ring', elite: true },
  { id: 'aurora', name: 'Aurora Sweep', elite: true },
  { id: 'circuit', name: 'Circuit Trace', elite: true },
  { id: 'prism', name: 'Prism Shift', elite: true },
]

/** Rare drop selectors — cosmetic, Elite only. */
export const DROP_SELECTORS = [
  { id: 'standard', name: 'Standard drops', elite: false },
  { id: 'gilded', name: 'Gilded drops', elite: true },
  { id: 'glitched', name: 'Glitched drops', elite: true },
  { id: 'celestial', name: 'Celestial drops', elite: true },
]



export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`
}

export function makeKid({ name, themeId = DEFAULT_KID_THEME, accessibility = null }) {
  return {
    id: uid('kid'),
    name,
    themeId,
    themeChosenAt: Date.now(),
    avatarHue: Math.floor(Math.random() * 360),
    xp: 0,
    coins: 0,
    accessibility: accessibility || { hasNeeds: false, notes: '', supports: [] },
    streak: { count: 0, lastDay: null, freezeTokens: 1 },
    lockout: null,
    profileFrame: 'none',
    dropSelector: 'standard',
    skins: [],
    skinId: null,
    /* Arcade. A token is minted when a parent approves a chore. */
    playTokens: 0,
    gameDay: null,
    gameCoinsToday: 0,
    bestScores: {},
    lastLoginBonus: null,
    bestTimes: {},
    createdAt: Date.now(),
  }
}

export function createInitialState() {
  return {
    version: 1,
    createdAt: Date.now(),
    onboarded: false,
    /**
     * What this installation is.
     *
     *   role 'parent' — the family account: assigns quests, approves proof.
     *   role 'kid'    — a child's own phone, linked to a parent by a 6-digit
     *                   pairing code. Holds only that one child's profile.
     *   role null     — not set up yet.
     *
     * `pendingPairing` is the code a kid's device is currently showing while it
     * waits for a parent to type it in.
     */
    device: {
      role: null,
      linkedKidId: null,
      familyName: null,
      pairedAt: null,
    },
    pendingPairing: null,
    session: { role: null, kidId: null, parentUnlocked: false },
    family: {
      id: uid('fam'),
      name: '',
      parentName: '',
      parentEmail: '',
      parentThemeId: DEFAULT_PARENT_THEME,
      pin: '',
      tier: 'starter',
      subscription: { tier: 'starter', status: 'trial', startedAt: Date.now(), renewsAt: null },
      /* Flash Tickets the family has left. Only a parent can buy more. */
      flashTickets: 0,
    },
    kids: [],
    quests: [],
    submissions: [],
    guild: {
      id: uid('guild'),
      name: '',
      motto: '',
      crest: '🛡️',
      weeklyGoalXp: 1500,
      leaderKidId: null,
      invitedMates: [],
      chat: [],
    },
    overrides: [],
    rewards: [],
    redemptions: [],
    notes: [],
    events: [],
    familyGoal: null,
    settings: {
      reminders: [
        { id: uid('rem'), label: 'Morning quests', time: '07:30', on: true },
        { id: uid('rem'), label: 'After school', time: '16:00', on: true },
        { id: uid('rem'), label: 'Bedtime check', time: '19:30', on: false },
      ],
      reduceMotion: false,
      /* Overdrive: the Elite visual tier. On by default for anyone paying for
         it, but always theirs to switch off. */
      overdrive: true,
      soundOn: true,
      today: dayKey(),
    },
  }
}
