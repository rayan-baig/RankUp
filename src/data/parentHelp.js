import { TIERS, TIER_LADDER, TRIAL_DAYS } from '../state/initialState.js'
import { FLASH_TICKET_PACKS } from '../lib/billing.js'
import { CODE_TTL_MS, MAX_ATTEMPTS } from '../lib/pairing.js'
import { MAX_TRIES as PIN_TRIES, LOCK_MINUTES as PIN_LOCK_MINUTES } from '../lib/pinReset.js'
import { DIFFICULTY_LIST, xpToNext, streakMultiplier, ELITE_XP_MULTIPLIER } from '../lib/xp.js'
import { MAX_TOKENS, DAILY_COIN_CAP } from '../data/minigames.js'

/**
 * The parent help page (Settings → Help), as data.
 *
 * Every answer here was checked against the code that does the thing, and
 * every number in one is read from that code rather than typed: the prices
 * from the plan list, the trial from TRIAL_DAYS, the pairing code's life from
 * lib/pairing.js, the XP from lib/xp.js. Change the code and the answer
 * changes with it. tests/help.mjs checks the prices against the plan list and
 * that each topic a parent asks about is answered.
 *
 * Each answer is plain text, a few short sentences. `to` adds a button that
 * opens the screen the answer talks about.
 */

/** Dollars as a price is written: 99.9 is "99.90". */
export function usd(amount) {
  return Number(amount).toFixed(2)
}

/** One line per plan, "<name>: free" or "<name>: $<month> a month, or $<year> a year", from the plan list. */
export function planPrices() {
  return TIER_LADDER.map((t) => (t.price === 0
    ? `${t.name}: free`
    : `${t.name}: $${usd(t.price)} a month, or $${usd(t.yearPrice)} a year`))
}

const MINUTES = CODE_TTL_MS / 60000
const STREAK_MAX = Math.round(streakMultiplier(999) * 100)
const STREAK_STEP = Math.round(streakMultiplier(3) * 100)
const MAX_LEVEL_XP = xpToNext(999)

export function parentHelp() {
  const xpList = DIFFICULTY_LIST.map((d) => `${d.label} ${d.xp}`).join(', ')
  return [
    {
      id: 'start',
      title: 'Getting set up',
      icon: '🔗',
      questions: [
        {
          id: 'pairing',
          q: "How do I link my child's phone?",
          a: [
            "On your child's phone, open RankUp and tap “I'm a kid”. They pick a name and a world, and their phone shows a six-digit code.",
            "On your phone, go to Settings → Family sync → Link a kid's device and type the code.",
            `A code lasts ${MINUTES} minutes, works once, and stops after ${MAX_ATTEMPTS} wrong tries. If it runs out, your child taps “New code”.`,
          ],
          to: { path: '/parent/pair', label: "Link a kid's device" },
        },
        {
          id: 'pin',
          q: 'What is the parent PIN for?',
          a: [
            'It opens Parent Mode on your phone: where you accept chores, give out quests and manage your plan.',
            'It is 4 to 8 digits and belongs to your phone only. A second parent sets their own on their phone.',
            "Your child's own linked phone has no Parent Mode at all, PIN or not.",
          ],
        },
        {
          id: 'pin-forgot',
          q: 'I forgot my PIN. What now?',
          a: [
            'On the “Who\'s playing?” screen, tap “Forgot your PIN?”. Sign in again with the password of the account this phone uses, then choose a new PIN.',
            `After ${PIN_TRIES} wrong passwords it waits ${PIN_LOCK_MINUTES} minutes before you can try again.`,
            "A child's own phone has no Parent Mode, so there is no reset on it, and a child on your phone would need your password.",
            'While you are in Parent Mode you can change it any time in Settings → Parent account.',
          ],
        },
      ],
    },
    {
      id: 'chores',
      title: 'Chores, XP and rewards',
      icon: '✅',
      questions: [
        {
          id: 'accepting',
          q: 'How does a chore get accepted?',
          a: [
            'Your child does the chore, taps “I did it!” and sends it to you. It shows up in Review with what it will pay.',
            'Tap Accept and the XP and coins land. Tap Send back, with a note if you like, and it goes back on their list to do again.',
            'Nothing is paid until you accept.',
          ],
          to: { path: '/parent/approvals', label: 'Open Review' },
        },
        {
          id: 'photos',
          q: 'Can my child send a photo as proof?',
          a: [
            'Not through RankUp. RankUp never takes, sends or keeps a photo.',
            'If you want to see the job, your child can take a picture with their own camera app and send it to you by message. You look, then tap Accept in RankUp.',
          ],
        },
        {
          id: 'xp',
          q: 'How do XP and levels work?',
          a: [
            `Each chore pays the XP shown on it. The usual amounts are ${xpList}.`,
            `The first level-up takes ${xpToNext(1)} XP. Each level after that takes a little more, up to ${MAX_LEVEL_XP} XP a level.`,
            `A chore accepted three days in a row starts a streak, which adds ${STREAK_STEP}% for every three days, up to ${STREAK_MAX}%. ${TIERS.elite.name} gives ${ELITE_XP_MULTIPLIER}× XP on top.`,
          ],
        },
        {
          id: 'rewards',
          q: 'What are coins and rewards?',
          a: [
            'Every accepted chore also pays coins, about one for every 5 XP. Each world gives them its own name.',
            'You make the list of rewards in Settings → Rewards catalogue. Your child spends coins on one in Rewards.',
            'It then waits on your dashboard until you give it to them and tap “Mark given”.',
          ],
          to: { path: '/parent/settings', label: 'Open Settings' },
        },
        {
          id: 'arcade',
          q: 'How does the arcade work?',
          a: [
            `Every chore you accept gives your child one play token. They can hold up to ${MAX_TOKENS}.`,
            `Finishing a game uses a token and pays a few coins, never more than ${DAILY_COIN_CAP} a day, so chores always earn more than games.`,
          ],
        },
      ],
    },
    {
      id: 'plans',
      title: 'Plans and paying',
      icon: '💳',
      questions: [
        {
          id: 'prices',
          q: 'What do the plans cost?',
          a: [
            ...planPrices().map((line) => `${line}.`),
            `${TIERS.starter.name} covers one child. ${TIERS.standard.name} covers as many as you have. ${TIERS.elite.name} adds ${ELITE_XP_MULTIPLIER}× XP, the Overdrive look and the extra parent tools.`,
            `Flash Tickets for the Sunday Market are an optional one-off extra, from $${usd(FLASH_TICKET_PACKS[0].price)}.`,
          ],
          to: { path: '/parent/plan', label: 'See your plan' },
        },
        {
          id: 'trial',
          q: 'How does the free trial work?',
          a: [
            `A new family gets ${TRIAL_DAYS} days of ${TIERS.elite.name} free. No card is asked for.`,
            `When it ends you are on ${TIERS.starter.name}, which is free, unless you have chosen a plan. Nothing is charged by itself.`,
          ],
        },
        {
          id: 'cancel',
          q: 'How do I cancel?',
          a: [
            'Open your plan and tap “Manage billing, cancel, or update card”. That opens Stripe, who look after billing, where you can cancel.',
            'Deleting your account also cancels a paid plan, straight away.',
          ],
          to: { path: '/parent/plan', label: 'See your plan' },
        },
        {
          id: 'lapse',
          q: 'What happens when a paid plan ends?',
          a: [
            `You move to ${TIERS.starter.name}. Your kids keep every level, XP point and coin.`,
            `Every child you already have stays. On ${TIERS.starter.name} you just cannot add another one.`,
          ],
        },
      ],
    },
    {
      id: 'data',
      title: 'Your data',
      icon: '🗂️',
      questions: [
        {
          id: 'download',
          q: "How do I download my family's data?",
          a: [
            'Go to Settings → Your data → Download my data. You get two files: everything RankUp holds about your family, as JSON, and an easy-to-read summary of your children, chores, history and rewards that opens in any browser.',
            'Only your own family is in them, and only a parent can download them.',
          ],
          to: { path: '/parent/settings', label: 'Open Settings' },
        },
        {
          id: 'delete',
          q: "How do I delete my family's data?",
          a: [
            'Go to Settings → Your data → Delete my account and type DELETE. Your account, every child profile, every quest and all progress are deleted at once, and a paid plan is cancelled at the same moment. There is no undo.',
            'To clear just one phone and keep the account, use “Erase local data on this device only” at the bottom of Settings.',
          ],
        },
        {
          id: 'offline',
          q: 'Does RankUp work without internet?',
          a: [
            'Yes, once it has been opened with internet. What you do is saved on the phone straight away.',
            'It is sent, in order, the next time RankUp is open with internet. The line at the top of the home screen says how many are waiting.',
            'Arcade games marked “online” need internet to play.',
          ],
        },
      ],
    },
  ]
}
