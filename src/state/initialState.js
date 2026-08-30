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
  { label: 'Profile frames', value: (t) => t.id === 'elite' },
  { label: 'Consequence Engine', value: (t) => t.id === 'elite' },
  { label: 'Behaviour Blueprints', value: (t) => t.id === 'elite' },
  { label: 'Discount Tournament', value: (t) => t.id === 'elite' },
]

export const ELITE_KID_PERKS = [
  { icon: '👥', title: '10-Player Megacluster Guilds', body: 'Doubles the standard clan from 5 slots to 10, so a squad leader can invite more real-world classmates.' },
  { icon: '⚡', title: 'Permanent 1.5× XP Boost', body: 'A constant multiplier on every daily checklist and habit, so Elite kids level faster than Standard kids.' },
  { icon: '🔮', title: 'Exclusive Profile Customisation', body: 'Unlocks animated profile card frames and rare item drop selectors Standard users cannot access.' },
]

export const ELITE_PARENT_PERKS = [
  { icon: '🛡️', title: 'The Parental Consequence Engine', body: 'Unlocks the System Override Protocol: custom real-world consequences plus Currency Tax, Dimension Lockout and Red Security Lockdown.' },
  { icon: '📊', title: 'Advanced AI Behaviour Blueprints', body: 'Weekly chart breakdowns of focus patterns and chore-completion history, built by the Critique AI.' },
  { icon: '🏆', title: 'The 20% Discount Tournament', body: 'Form 10-player Parent Alliances and compete on a local leaderboard for an unpurchasable 20% group billing discount each month.' },
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

/**
 * Demo guild-mates and alliance parents.
 *
 * These are NOT real users. Real guilds need a shared server so two phones can
 * see the same roster — see docs/BACKEND.md. Everything seeded here carries
 * `demo: true` and the UI labels it as sample data so it never quietly reads
 * as a working multiplayer feature.
 */
const DEMO_GUILD_MATES = [
  { id: 'demo_g1', name: 'Priya', avatarHue: 280, weeklyXp: 410, level: 12, demo: true },
  { id: 'demo_g2', name: 'Marcus', avatarHue: 30, weeklyXp: 365, level: 11, demo: true },
  { id: 'demo_g3', name: 'Sofia', avatarHue: 160, weeklyXp: 290, level: 9, demo: true },
  { id: 'demo_g4', name: 'Ade', avatarHue: 200, weeklyXp: 240, level: 8, demo: true },
  { id: 'demo_g5', name: 'Lena', avatarHue: 340, weeklyXp: 180, level: 7, demo: true },
  { id: 'demo_g6', name: 'Yusuf', avatarHue: 100, weeklyXp: 150, level: 6, demo: true },
  { id: 'demo_g7', name: 'Nora', avatarHue: 15, weeklyXp: 120, level: 6, demo: true },
  { id: 'demo_g8', name: 'Kai', avatarHue: 220, weeklyXp: 95, level: 5, demo: true },
]

const DEMO_ALLIANCE_PARENTS = [
  { id: 'demo_p1', name: 'The Okafors', approvalRate: 96, questsApproved: 61, streakDays: 21, demo: true },
  { id: 'demo_p2', name: 'The Hasans', approvalRate: 92, questsApproved: 54, streakDays: 18, demo: true },
  { id: 'demo_p3', name: 'The Bergs', approvalRate: 90, questsApproved: 49, streakDays: 15, demo: true },
  { id: 'demo_p4', name: 'The Silvas', approvalRate: 88, questsApproved: 44, streakDays: 12, demo: true },
  { id: 'demo_p5', name: 'The Chens', approvalRate: 85, questsApproved: 38, streakDays: 10, demo: true },
  { id: 'demo_p6', name: 'The Novaks', approvalRate: 81, questsApproved: 31, streakDays: 8, demo: true },
  { id: 'demo_p7', name: 'The Duponts', approvalRate: 77, questsApproved: 27, streakDays: 6, demo: true },
  { id: 'demo_p8', name: 'The Marshes', approvalRate: 74, questsApproved: 22, streakDays: 4, demo: true },
  { id: 'demo_p9', name: 'The Ibrahims', approvalRate: 70, questsApproved: 18, streakDays: 3, demo: true },
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
      demoMates: DEMO_GUILD_MATES,
      invitedMates: [],
      chat: [],
    },
    alliance: {
      id: uid('all'),
      name: '',
      joined: false,
      monthKey: monthKey(),
      demoMembers: DEMO_ALLIANCE_PARENTS,
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
      soundOn: true,
      today: dayKey(),
    },
  }
}
