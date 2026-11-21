/**
 * Pilot's knowledge pack for RankUp: what Pilot knows about the app, and an
 * honest "why RankUp" list.
 *
 * Written from the real app and its docs, and every number in it is read
 * from the code that does the thing, never typed: the prices from the plan
 * list (TIERS), the trial from TRIAL_DAYS, Flash Tickets from
 * FLASH_TICKET_PACKS, the pairing code from lib/pairing.js, XP from
 * lib/xp.js, the deals' rules from lib/deals.js. The parent help page's own
 * answers (data/parentHelp.js) are part of it word for word, so Pilot and
 * the help page say the same thing. tests/prices.mjs reads this file like
 * the rest of src/, and tests/pilottools.mjs checks the main facts are here.
 *
 * Nothing about any family is in it: it is the same for everyone.
 */
import { TIERS, TIER_LADDER, TRIAL_DAYS, PLAN_COMPARISON, ELITE_PARENT_PERKS } from '../state/initialState.js'
import { FLASH_TICKET_PACKS, PAUSE_MONTHS } from '../lib/billing.js'
import { CODE_LENGTH, CODE_TTL_MS, MAX_ATTEMPTS } from '../lib/pairing.js'
import { DIFFICULTY_LIST, ELITE_XP_MULTIPLIER } from '../lib/xp.js'
import { RECURRENCES } from '../lib/recurrence.js'
import { CURRENCIES } from '../lib/money.js'
import { MARKET_OPENS_HOUR, MARKET_CLOSES_HOUR, FULL_SET_TICKETS, MARKET_SKINS } from '../data/marketSkins.js'
import { GIFT_MONTHS, GIFT_CODE_YEARS, GIFT_PLANS } from '../lib/giftRules.js'
import { FOUNDING_DEFAULT_LIMIT, SEASON_DEAL_DAYS, SWITCH_AFTER_MONTHS, GIFT_A_YEAR_AFTER_DAYS } from '../lib/deals.js'
import { FOUNDING_SEASON_CHORES } from '../data/badges.js'
import { KID_THEMES } from '../data/kidThemes.js'
import { PARENT_THEMES } from '../data/parentThemes.js'
import { priceWords, annualSaving } from '../lib/plans.js'
import { parentHelp } from '../data/parentHelp.js'

const usd = (n) => `$${Number(n).toFixed(2)}`
const hour = (h) => (h % 24 === 0 ? 'midnight' : h === 12 ? 'noon' : h > 12 ? `${h - 12}pm` : `${h}am`)

function planSection() {
  const lines = TIER_LADDER.map((t) => {
    if (!t.price) return `- **${t.name}**: free, for good. One child, and the whole loop: assign, "I did it!", accept, XP, levels, themes, streaks, rewards, the arcade.`
    const saving = annualSaving(t)
    return `- **${t.name}**: ${priceWords(t)}, or ${priceWords(t, 'year')}${saving ? ` (a year saves ${saving.percent}%)` : ''}.`
  })
  // Guilds are switched off, so the plan screen leaves their line out too.
  const rows = PLAN_COMPARISON.filter((row) => !row.needs).map((row) => {
    const cell = (t) => { const v = row.value(t); return v === true ? 'yes' : v === false ? 'no' : String(v) }
    return `- ${row.label}: ${TIER_LADDER.map((t) => `${t.name} ${cell(t)}`).join(' · ')}`
  })
  return `## Plans
${lines.join('\n')}
- Every new family gets ${TRIAL_DAYS} days of ${TIERS.elite.name} free, with no card. When it ends the family is on ${TIERS.starter.name} unless they chose a plan; nothing is charged by itself.
- ${TIERS.starter.name} covers one child; ${TIERS.standard.name} and ${TIERS.elite.name} cover as many as the family has. ${TIERS.elite.name} adds ${ELITE_XP_MULTIPLIER}× XP, the Overdrive look, profile frames, and the parent tools: ${ELITE_PARENT_PERKS.map((p) => p.title).join(', ')}.
- When a paid plan ends, the family moves to ${TIERS.starter.name}. Children keep every level, XP point, coin and item; nothing is taken away.
- A monthly plan can be paused for ${PAUSE_MONTHS.slice(0, -1).join(', ')} or ${PAUSE_MONTHS[PAUSE_MONTHS.length - 1]} months instead of cancelled, from "Cancel my plan" on the plan screen.
- The plan screen is in Settings (Plan and extras), and the dashboard links to it. Pilot can't change a plan or buy anything: the parent does that on the plan screen, and payments go through Stripe.

What each plan gives, line by line (from the plan screen's own table):
${rows.join('\n')}`
}

function dealsSection() {
  return `## Deals and Seasons (new in 0.23.0)
Deals are only ever shown to parents (Parent Mode, the Give page, email), never on a child's phone, and never with a countdown or made-up scarcity. Each discount's percent comes from RankUp's settings and is shown on the plan screen or the Give page when it is on; if no deal is shown there, none is on.
- **Founding Families**: the first families on a yearly plan (${FOUNDING_DEFAULT_LIMIT} unless the setting says otherwise) get their first year at a founding price. The plan screen says the percent, how many places are left (counted for real) and the real end date. One per family.
- **The holiday gift sale**: gift codes a percentage off between two dates; shown on the dashboard and the Give page with its end date.
- **Switching to yearly, keeping what you paid**: after ${SWITCH_AFTER_MONTHS} paid months, "Switch to yearly" takes what's left of the month off the year, shown before anything is charged.
- **"Gift a year"**: after ${GIFT_A_YEAR_AFTER_DAYS} days a family's dashboard asks once whether they know a family who'd like a year of RankUp; "Not now" hides it for good.
- **Seasons**: every 4 months a new Season starts by itself, with new themes and an event. Season 1 is the Founding Season. Children earn the **Founding Season badge** by doing ${FOUNDING_SEASON_CHORES} chores during Season 1 (never bought; kept for good). On the day, the children's app shows "New Season!".
- **The Season's deal**: for the first ${SEASON_DEAL_DAYS} days of each Season, the yearly plan (or gift codes) a percentage off. Parents only.`
}

function giftsSection() {
  const plans = GIFT_PLANS.map((id) => TIERS[id]).filter(Boolean)
  return `## Gifts
- Anyone can give a family a year of RankUp (${GIFT_MONTHS} months of ${plans.map((t) => `${t.name}, ${priceWords(t, 'year')}`).join(', or ')}) from the Give page (the "Give a year" link on the front door, or #/gift). No account needed to buy one.
- The giver gets a printable gift card. The code works for ${GIFT_CODE_YEARS} years.
- The family redeems it in Parent Mode: Settings → Redeem a gift, or on the plan screen. Settings then says "Gift plan: … until <date>", and the dashboard reminds them 30 days before it ends.
- Children never see buying or redeeming a gift.`
}

function marketSection() {
  const packs = FLASH_TICKET_PACKS.map((p) => `${p.tickets} for ${usd(p.price)}`).join(', ')
  return `## The Sunday Market and Flash Tickets (for parents to understand)
- The Sunday Market is a shop in the child's Rewards tab that opens on Sunday evenings, ${hour(MARKET_OPENS_HOUR)} to ${hour(MARKET_CLOSES_HOUR)} on the phone's own clock. It sells ${MARKET_SKINS.length} cosmetic skins (a coloured ring round the child's avatar) for the coins they earned from chores.
- Skins are looks only. They never change what a child earns: a child who never visits the market is never behind.
- No countdown is shown to the child: the market is open or shut, and a shut market says when it opens next.
- **Flash Tickets** let a skin be claimed with a ticket instead of coins (a common skin 1 ticket, rare 2, legendary 3; the whole set ${FULL_SET_TICKETS}). Only a parent can buy them, in Parent Mode, as an occasional treat: ${packs}. A child's phone never shows what a ticket costs; it says "Want a Flash Ticket? Ask a grown-up."
- Pilot never buys Flash Tickets or anything else.`
}

function helpSection() {
  return `## The parent help page, as it answers
${parentHelp().map((topic) => `### ${topic.title}\n${topic.questions.map((q) => `**${q.q}** ${q.a.join(' ')}`).join('\n')}`).join('\n')}`
}

/** The guide Pilot answers from. */
export function knowledge() {
  return `## RankUp
RankUp turns a family's chores into a game. A parent assigns chores (called quests); the child does one and taps "I did it!"; the parent accepts it; the child earns XP and coins and levels up in a world (theme) they picked. RankUp is a product of MTRX Horizyn. It runs in the browser on any phone, tablet or computer and can be added to the home screen. There are ${KID_THEMES.length} kid themes and ${PARENT_THEMES.length} parent dashboard themes.

## Who uses which part
- **Parent Mode** is the parent's side, behind a 4 to 8 digit PIN on the parent's phone: Home (the dashboard), Review, Assign, Kids, Settings. Pilot lives here.
- **The child's side** is their quests, the arcade, Rewards and their profile, on their own linked phone or on a shared phone after "Hand to <child>". A child's own phone has no Parent Mode at all. Pilot is never shown on the child's side.
- A second grown-up can join the same family on their own phone and sets their own PIN.

## Chores, accepting, XP and levels
- Add a chore in Assign: pick the child, write a title (or pick a ready-made quest pack), a difficulty and how often it repeats (${RECURRENCES.map((r) => r.label.toLowerCase()).join(', ')}). Usual XP: ${DIFFICULTY_LIST.map((d) => `${d.label} ${d.xp}`).join(', ')}. A chore can also pay pocket money.
- The child taps "I did it!" and it lands in **Review** (📥) with what it will pay. **Accept** pays the XP and coins; **Send back** (with a note) puts it back on their list to redo. Nothing is paid until a parent accepts.
- No photos: RankUp never takes, sends or keeps a photo. A child who wants to show the job can send a picture by message with their own camera app.
- A brand-new family's dashboard has "Getting started": add a child, link their phone, add a first chore (three starter chores in one tap), accept a finished one.
- Streaks: chores accepted on days in a row build a streak, which adds a bonus to XP. Missing a day can use a streak freeze.

## Coins, rewards, pocket money and currency
- Every accepted chore also pays coins (each world gives them its own name, like Gems). Children spend coins on the family's **rewards** (made in Settings → Rewards catalogue, each with a cost and an optional "each child can take it" limit per week). A bought reward waits on the dashboard until the parent gives it and taps "Mark given". Starter rewards can be added in one tap.
- **Pocket money**: a chore can pay real money as well. RankUp never holds money: it keeps a plain list of what each child earned and what was handed over. In Pocket money, tap "Paid" and "Record it" when you hand money over.
- The money sign: ${CURRENCIES.map((c) => `${c.label} (${c.symbol})`).join(', ')}. A family starts in the money of the phone's region (US dollars otherwise) and can change it in Settings → Parent account → "Pocket money is shown in". Only the sign changes; nothing is converted.
- Coins and XP have no money value and cannot be bought.

## Linking a child's phone (pairing with a code)
- In Parent Mode: Settings → Family sync → Link a kid's device, tap "Code for <child>". The parent's phone shows ${CODE_LENGTH} digits.
- On the child's phone: open RankUp, tap "I'm a kid", type the digits. The phone joins the profile and world the parent chose.
- A code lasts ${CODE_TTL_MS / 60000} minutes, works once and stops after ${MAX_ATTEMPTS} wrong tries. Families sharing one phone can skip linking ("We share one phone") and use "Hand to <child>".
- Unlinking a phone is in Settings; the child's profile and progress stay. Pilot never links or unlinks phones.

## Pause and limits (${TIERS.elite.name})
- The parent's own house rules in one place, in their words, and a way to give the app a rest when needed: "Take back some coins", "A short break" (opens again by itself) or "Pause until I lift it". Each asks for a reason, which the child sees. XP, levels and streaks are never taken away.
- Pilot never sets, changes or lifts a pause or limit, and never takes coins: the parent does it under "Elite tools" → Pause and limits on the dashboard.

${planSection()}

${dealsSection()}

${giftsSection()}

${marketSection()}

## Other parts of RankUp
- **The arcade**: each accepted chore gives one play token; games pay a few coins, capped each day, so chores always earn more than games.
- **Leaderboards**: children start in Adventure (off public boards). A parent can switch a child into Arena, where other families see only a made-up nickname, the country's flag and the numbers.
- **The School League**: a school can join so its students' accepted chores count for their school. Parents choose whether to add a child. Teachers and principals have their own pages (#/school).
- **Theme Genesis**: a child can design their own theme; a parent approves using it, and can send it to RankUp for a Season.
- **Parent Alliances** (${TIERS.elite.name}): a friendly monthly contest with up to ten families.
- **Behaviour Blueprints** (${TIERS.elite.name}): weekly charts of what actually happened.
- It works offline once opened; changes are sent in order when the phone is back online.

## Privacy and children
- RankUp collects a child's **first name only**: no surname, birthday, email, address or photo. It takes no photos at all.
- Parents can download everything (Settings → Your data → Download my data) or delete it all at once (Delete my account).
- Children never see prices, deals or anything to buy, and are never asked for an email, password or phone number.
- **Pilot** runs on the parent's own AI key, from their browser, only in Parent Mode and on the public pages. The key stays in that browser. RankUp's server never sees the key or the conversation. Nothing about a child goes to the AI unless the parent types it or approves a tool; even then only first names and chore titles, never ages, photos or phone details. Children's names on screen are left out of "Explain this screen".

${helpSection()}`
}

/** Why RankUp, from real features only. No rival named, no invented numbers. */
export const STRENGTHS = Object.freeze([
  'The parent stays in charge: nothing is paid until a parent accepts the chore, and a child\'s phone has no Parent Mode at all.',
  'Built for children\'s privacy: first names only, no photos ever (RankUp never takes, sends or keeps one), and no advertising to children.',
  `A free plan that runs the whole loop for one child (assign, "I did it!", accept, XP, themes, streaks, rewards, the arcade), and ${TRIAL_DAYS} days of the top plan free with no card.`,
  'Children never see prices, deals or anything to buy; Flash Tickets can only be bought by a parent, and skins never change what a child earns.',
  'Real pocket money tracking as a plain list both sides can read, in the family\'s own currency, without RankUp ever holding money.',
  'A game children want to come back to: their own world, levels, streaks, badges, Seasons and an arcade that never out-earns chores.',
  'Linking a child\'s phone takes a six-digit code from the parent\'s phone: no account, email or password for the child.',
  'Works offline and on any phone, tablet or computer, from the browser.',
  'Everything a family holds can be downloaded or deleted at once from Settings.',
  'Pause instead of cancel, and when a paid plan ends children keep every level, XP point and coin.',
])
