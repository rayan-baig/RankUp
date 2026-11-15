/**
 * The Elite nudge and the "Switch to yearly" offer: when each is shown, to
 * whom, how often, and what it says (src/lib/upgradeNudge.js).
 *
 *   - only in Parent Mode, on a parent's phone, in a real family: never on a
 *     child's phone, in a child's turn on a shared phone or the look-around
 *   - only for a family on Standard: not Starter, not Elite, not on a gift,
 *     not paused, not behind on a payment
 *   - when a Standard limit was hit (an Elite tool opened, a guild full) or
 *     after a great week, and not otherwise
 *   - at most once every 14 days, counting from when it was shown or
 *     dismissed
 *   - every number in its words from the plan list
 *   - yearly only to a parent paying monthly, live, not paused, not ending,
 *     with the real saving
 *
 * tests/pauseplan.mjs shows the same on the screen. Needs nothing running.
 */
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.window = globalThis.window || { location: { search: '', hash: '' }, addEventListener() {}, removeEventListener() {} }

const { createInitialState, TIERS } = await import('../src/state/initialState.js')
const { nudgeDue, nudgeReason, nudgeWords, yearlyOffer, choresAcceptedThisWeek, NUDGE_EVERY_DAYS, GREAT_WEEK_CHORES } = await import('../src/lib/upgradeNudge.js')
const { annualSaving } = await import('../src/lib/plans.js')

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const DAY = 86400000
const NOW = Date.now()

/** A family on Standard, in Parent Mode on the parent's phone, `accepted` chores this week. */
function family({ tier = 'standard', accepted = 0, seen = {}, patch = {} } = {}) {
  const s = createInitialState()
  s.onboarded = true
  s.device = { ...s.device, role: 'parent' }
  s.session = { role: 'parent', kidId: null, parentUnlocked: true }
  s.family = { ...s.family, tier, trialTier: null, trialEndsAt: null, subscriptionStatus: 'active', billingCycle: 'month', ...patch }
  s.kids = [{ id: 'kid_a', name: 'Ava' }]
  s.submissions = Array.from({ length: accepted }, (_, i) => ({ id: `s${i}`, kidId: 'kid_a', status: 'approved', decidedAt: NOW - (i % 6) * DAY - 1000 }))
  s.settings = { ...s.settings, upgradeNudge: seen }
  return s
}

console.log('\n=== A great week ===')
ok(`${GREAT_WEEK_CHORES} chores accepted this week is a great week`, nudgeReason(family({ accepted: GREAT_WEEK_CHORES }), NOW)?.kind === 'week')
ok('one fewer is not', nudgeReason(family({ accepted: GREAT_WEEK_CHORES - 1 }), NOW) === null)
{
  const s = family({ accepted: GREAT_WEEK_CHORES })
  s.submissions = s.submissions.map((x) => ({ ...x, decidedAt: NOW - 8 * DAY }))
  ok('chores from last week do not count', choresAcceptedThisWeek(s, NOW) === 0 && nudgeReason(s, NOW) === null)
  s.submissions = s.submissions.map((x) => ({ ...x, status: 'pending', decidedAt: NOW }))
  ok('nor chores waiting to be accepted', choresAcceptedThisWeek(s, NOW) === 0)
}
const week = nudgeWords(nudgeReason(family({ accepted: 12 }), NOW))
ok(`the words: "${week.title}" / "${week.body}"`, week.title === 'Great week: 12 chores accepted'
  && week.body.includes(`${TIERS.elite.name} gives ${TIERS.elite.xpMultiplier}× XP`))
ok(`the button names the plan list's price: "${week.button}"`, week.button.includes(TIERS.elite.name) && week.button.includes(`$${TIERS.elite.price}`))

console.log('\n=== A Standard limit ===')
{
  const tool = family({ seen: { limitAt: NOW - DAY, limitWhat: 'tool' } })
  ok('an Elite tool opened in the last fortnight', nudgeReason(tool, NOW)?.what === 'tool')
  ok('says what Elite adds, and the XP', /Elite Pass tool/.test(nudgeWords(nudgeReason(tool, NOW)).title)
    && nudgeWords(nudgeReason(tool, NOW)).body.includes(`${TIERS.elite.xpMultiplier}× XP`))
  ok('one opened longer ago than that does not count', nudgeReason(family({ seen: { limitAt: NOW - 15 * DAY, limitWhat: 'tool' } }), NOW) === null)
  const guild = family({ seen: { limitAt: NOW - DAY, limitWhat: 'guild' } })
  const words = nudgeWords(nudgeReason(guild, NOW))
  ok(`a guild full at Standard's size: "${words.title}"`, words.title === `Your guild is full at ${TIERS.standard.guildSize}`
    && words.body.includes(`${TIERS.elite.guildSize}`))
  const local = family()
  local.guild = { ...local.guild, invitedMates: Array.from({ length: TIERS.standard.guildSize - 1 }, (_, i) => ({ id: `m${i}` })) }
  ok('a guild on this phone filled to Standard\'s size counts too', nudgeReason(local, NOW)?.what === 'guild')
  local.guild.invitedMates.pop()
  ok('one short of it does not', nudgeReason(local, NOW) === null)
}

console.log('\n=== Only for a Standard family, in Parent Mode ===')
const due = (s) => nudgeDue(s, NOW) !== null
ok('(a Standard family after a great week: shown)', due(family({ accepted: 12 })))
ok('not for Elite (it has it)', !due(family({ tier: 'elite', accepted: 12 })))
ok('not for Starter (its next step is Standard)', !due(family({ tier: 'starter', accepted: 12 })))
ok('not on an Elite trial', !due(family({ accepted: 12, patch: { trialTier: 'elite', trialEndsAt: NOW + 5 * DAY } })))
ok('not on a gift', !due(family({ tier: 'starter', accepted: 12, patch: { giftTier: 'standard', giftStartsAt: NOW - DAY, giftUntil: NOW + 300 * DAY } })))
ok('not while paused', !due(family({ accepted: 12, patch: { pausedUntil: NOW + 20 * DAY } })))
ok('not behind on a payment', !due(family({ accepted: 12, patch: { subscriptionStatus: 'past_due' } })))
{
  const kidPhone = family({ accepted: 12 })
  kidPhone.device = { ...kidPhone.device, role: 'kid' }
  ok('never on a child\'s own phone', !due(kidPhone))
  const kidTurn = family({ accepted: 12 })
  kidTurn.session = { role: 'kid', kidId: 'kid_a', parentUnlocked: false }
  ok('never in a child\'s turn on a shared phone', !due(kidTurn))
  const locked = family({ accepted: 12 })
  locked.session = { role: 'parent', kidId: null, parentUnlocked: false }
  ok('never before the parent PIN', !due(locked))
  const demo = family({ accepted: 12 })
  demo.demo = true
  ok('never in the look-around', !due(demo))
}

console.log(`\n=== At most once every ${NUDGE_EVERY_DAYS} days ===`)
ok('shown yesterday: not again', !due(family({ accepted: 12, seen: { shownAt: NOW - DAY } })))
ok(`shown ${NUDGE_EVERY_DAYS - 1} days ago: not yet`, !due(family({ accepted: 12, seen: { shownAt: NOW - (NUDGE_EVERY_DAYS - 1) * DAY } })))
ok(`shown ${NUDGE_EVERY_DAYS} days ago: again`, due(family({ accepted: 12, seen: { shownAt: NOW - NUDGE_EVERY_DAYS * DAY } })))
ok('dismissed yesterday: not again', !due(family({ accepted: 12, seen: { shownAt: NOW - 20 * DAY, dismissedAt: NOW - DAY } })))
ok(`dismissed ${NUDGE_EVERY_DAYS} days ago, with a reason: again`, due(family({ accepted: 12, seen: { dismissedAt: NOW - NUDGE_EVERY_DAYS * DAY } })))

console.log('\n=== "Switch to yearly", in Settings ===')
{
  const s = family()
  const offer = yearlyOffer(s, { live: true })
  const saving = annualSaving(TIERS.standard)
  ok(`a parent paying monthly is offered it: "${offer?.title}"`, offer?.title === `Switch to yearly — save about ${saving.percent}%`)
  ok('the saving is the plan list\'s real difference', offer.body.includes(`$${saving.saved}`) && offer.body.includes(`$${TIERS.standard.yearPrice}`))
  ok(`about 30% on Standard (${saving.percent}%)`, saving.percent >= 29 && saving.percent <= 31)
  ok('the same for Elite, with its own saving', yearlyOffer(family({ tier: 'elite' }), { live: true })?.title.includes(`${annualSaving(TIERS.elite).percent}%`))
  ok('not when payments are off', yearlyOffer(s, { live: false }) === null)
  ok('not to a yearly payer', yearlyOffer(family({ patch: { billingCycle: 'year' } }), { live: true }) === null)
  ok('not on Starter', yearlyOffer(family({ tier: 'starter' }), { live: true }) === null)
  ok('not while paused', yearlyOffer(family({ patch: { pausedUntil: NOW + DAY } }), { live: true }) === null)
  ok('not to a plan ending', yearlyOffer(family({ patch: { subscriptionEndsAt: new Date(NOW + 9 * DAY).toISOString() } }), { live: true }) === null)
  ok('not behind on a payment', yearlyOffer(family({ patch: { subscriptionStatus: 'past_due' } }), { live: true }) === null)
  const kid = family()
  kid.device = { ...kid.device, role: 'kid' }
  ok('never on a child\'s phone', yearlyOffer(kid, { live: true }) === null)
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
