/**
 * Gift subscriptions: "a year of RankUp", the rules both sides share.
 *
 * Pure: no network, no storage. The Give page, the redeem screen, Settings,
 * the dashboard's reminder and the server functions (api/gift-checkout.js,
 * api/redeem-gift.js, api/_shared/gifts.js) all read these, so the numbers a
 * parent is shown are the numbers the database enforces. The database holds
 * the same rules again (supabase/billing.sql: start_gift_order,
 * redeem_gift_code, and run_retention for the days things are kept), and
 * supabase/test/55-gifts.sql checks them there.
 *
 * Nothing here is ever shown on a child's screen.
 */
import { TIERS } from '../state/initialState.js'
import { wordsOk } from './kidWords.js'

/** What a gift gives: this many months of the plan, from the day it is redeemed. */
export const GIFT_MONTHS = 12
/** How long a code can be redeemed, from the day it was bought. */
export const GIFT_CODE_YEARS = 2
/** The recipient's name and email and the message are deleted this long after the gift is paid for. */
export const GIFT_RECIPIENT_DAYS = 30
/** The parent is reminded in the app when this few days of the gift are left. */
export const GIFT_REMINDER_DAYS = 30
export const GIFT_MESSAGE_MAX = 200
export const GIFT_NAME_MAX = 60
/** The plans a gift can be. Starter is free, so there is nothing to give. */
export const GIFT_PLANS = ['standard', 'elite']

/*
 * A code is 12 characters from 31: capital letters and digits without the
 * ones that read as each other (0 and O, 1, I and L). About 59 bits, shown
 * as XXXX-XXXX-XXXX. The server makes it (api/_shared/gifts.js); this only
 * reads one back as typed.
 */
export const GIFT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const GIFT_CODE_LENGTH = 12

/** A code as typed, without spaces, dashes or case: "abcd efgh-jkmn" is "ABCDEFGHJKMN". */
export function normalizeGiftCode(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** "ABCDEFGHJKMN" as "ABCD-EFGH-JKMN". */
export function formatGiftCode(text) {
  const code = normalizeGiftCode(text).slice(0, GIFT_CODE_LENGTH)
  return code.match(/.{1,4}/g)?.join('-') || ''
}

/** Could this be a code? Twelve characters, all from the alphabet. */
export function looksLikeGiftCode(text) {
  const code = normalizeGiftCode(text)
  return code.length === GIFT_CODE_LENGTH && [...code].every((c) => GIFT_CODE_ALPHABET.includes(c))
}

const EMAIL = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/
const LINK = /(https?:|www\.|:\/\/|[^\s@]+@[^\s@]+\.[a-z]{2,}|\b[a-z0-9-]+\.(com|net|org|io|co|uk|ru|xyz|info|biz|app|link)\b)/i

/** An email address that looks real, at most 254 characters. */
export const emailOk = (text) => {
  const value = String(text || '').trim()
  return value.length <= 254 && EMAIL.test(value)
}

/**
 * Check what the buyer typed on the Give page. The same rules as
 * start_gift_order in the database, which checks them again.
 *
 * Returns { ok, errors } where errors maps a field to a sentence, and
 * `clean`, the form trimmed, for sending.
 */
export function checkGiftForm(form = {}) {
  const errors = {}
  const clean = {
    plan: form.plan,
    delivery: form.delivery,
    buyerEmail: String(form.buyerEmail || '').trim(),
    fromName: String(form.fromName || '').trim(),
    toName: String(form.toName || '').trim(),
    toEmail: String(form.toEmail || '').trim(),
    message: String(form.message || '').trim(),
  }
  if (!GIFT_PLANS.includes(clean.plan)) errors.plan = 'Choose Standard or Elite Pass.'
  if (!['email', 'self'].includes(clean.delivery)) errors.delivery = 'Choose how the gift is given.'
  if (!emailOk(clean.buyerEmail)) errors.buyerEmail = 'Your email, for the receipt and the code.'
  if (clean.delivery === 'email' && !clean.toEmail) errors.toEmail = 'Their email, so we can send it to them.'
  else if (clean.toEmail && !emailOk(clean.toEmail)) errors.toEmail = 'That does not look like an email address.'
  for (const [field, label] of [['fromName', 'Your name'], ['toName', 'Their name']]) {
    if (clean[field].length > GIFT_NAME_MAX) errors[field] = `${label} can be up to ${GIFT_NAME_MAX} characters.`
  }
  if (clean.message.length > GIFT_MESSAGE_MAX) errors.message = `Up to ${GIFT_MESSAGE_MAX} characters.`
  for (const field of ['fromName', 'toName', 'message']) {
    if (errors[field] || !clean[field]) continue
    if (!wordsOk(clean[field])) errors[field] = 'Please choose different words.'
    else if (LINK.test(clean[field])) errors[field] = 'No links or email addresses here, please.'
  }
  return { ok: Object.keys(errors).length === 0, errors, clean }
}

/** The plan's name and its yearly price, from the plan list. */
export function giftPlan(planId) {
  const tier = TIERS[planId] || TIERS.elite
  return { id: tier.id, name: tier.name, yearPrice: tier.yearPrice }
}

const DAY = 86400000
const time = (value) => {
  if (value == null) return NaN
  return typeof value === 'number' ? value : Date.parse(value)
}

/**
 * The family's gift, from the synced family row (giftTier, giftStartsAt,
 * giftUntil) or billing_status (gift_tier, gift_starts_at, gift_until).
 * Null when there is none, or it has ended.
 *
 *   active   running now
 *   pending  redeemed while a paid plan runs to its end; starts then
 *   daysLeft whole days until it ends (at least 1 while it runs)
 */
export function giftState(family, now = Date.now()) {
  let tier = family?.giftTier ?? family?.gift_tier
  let until = time(family?.giftUntil ?? family?.gift_until)
  let starts = time(family?.giftStartsAt ?? family?.gift_starts_at)
  // Two gifts of different plans run one after the other (the better
  // first): once the first has ended, the second is the gift.
  const thenTier = family?.giftThenTier ?? family?.gift_then_tier
  const thenUntil = time(family?.giftThenUntil ?? family?.gift_then_until)
  let then = TIERS[thenTier] && Number.isFinite(thenUntil) && Number.isFinite(until) && thenUntil > until
    ? { tier: thenTier, name: TIERS[thenTier].name, until: thenUntil } : null
  if (then && until <= now) {
    starts = until
    tier = then.tier
    until = then.until
    then = null
  }
  if (!TIERS[tier] || !Number.isFinite(until) || until <= now) return null
  const pending = Number.isFinite(starts) && starts > now
  const lastUntil = then ? then.until : until
  return {
    tier,
    name: TIERS[tier].name,
    until,
    startsAt: Number.isFinite(starts) ? starts : null,
    active: !pending,
    pending,
    // The gift after this one, if any, and when the last of them ends.
    then,
    lastUntil,
    daysLeft: Math.max(1, Math.ceil((lastUntil - now) / DAY)),
  }
}

/** "14 November 2027". */
export const giftDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/** The line in Settings: "Gift plan: Elite Pass until 14 November 2027". Null without a gift. */
export function giftLine(family, now = Date.now()) {
  const gift = giftState(family, now)
  if (!gift) return null
  const then = gift.then ? `, then ${gift.then.name} until ${giftDate(gift.then.until)}` : ''
  return gift.pending
    ? `Gift plan: ${gift.name} from ${giftDate(gift.startsAt)} until ${giftDate(gift.until)}${then}`
    : `Gift plan: ${gift.name} until ${giftDate(gift.until)}${then}`
}

/**
 * The reminder, in the parent's half of the app only, once the gift has
 * GIFT_REMINDER_DAYS days or fewer left and nothing paid is lined up to
 * follow it. No email, and never on a child's screen. Null otherwise.
 */
export function giftNotice(family, { now = Date.now(), demo = false } = {}) {
  if (demo) return null
  const gift = giftState(family, now)
  if (!gift || !gift.active || gift.daysLeft > GIFT_REMINDER_DAYS) return null
  const paid = TIERS[family?.tier] ? family.tier : 'starter'
  // A paid plan of at least the same size, starting when the gift ends.
  const rank = { starter: 0, standard: 1, elite: 2 }
  if (rank[paid] >= rank[gift.tier]) return null
  const days = gift.daysLeft === 1 ? '1 day' : `${gift.daysLeft} days`
  return {
    tone: 'info',
    icon: '🎁',
    title: `Your gift of ${gift.name} ends in ${days}`,
    body: `It runs until ${giftDate(gift.until)}. After that you are on ${TIERS[paid].name}. To keep ${gift.name}, choose a plan: the first payment is taken the day the gift ends, never before. Everything your kids have earned stays.`,
  }
}

/**
 * The printable gift card's address, with what goes on the card. All of it
 * after the #, which a browser never sends to a server: the code reaches
 * nobody but whoever holds the link (the buyer's receipt).
 */
export function giftCardLink(site, { code, plan, toName, fromName, message, by } = {}) {
  const base = String(site || '').replace(/\/+$/, '')
  if (!base || !code) return ''
  const q = new URLSearchParams({ code: formatGiftCode(code), plan: GIFT_PLANS.includes(plan) ? plan : 'elite' })
  if (toName) q.set('to', toName)
  if (fromName) q.set('from', fromName)
  if (message) q.set('msg', message)
  if (by) q.set('by', String(by).slice(0, 10))
  return `${base}/#/gift/card?${q.toString()}`
}

/** What the card shows, read back from its address. Only what the card can print; anything odd is dropped. */
export function readGiftCard(query) {
  let q
  try { q = new URLSearchParams(String(query || '')) } catch { q = new URLSearchParams() }
  // Characters below a space (tabs, line breaks, control codes) and markup become spaces.
  const cut = (v, n) => [...String(v || '')].map((c) => (c < ' ' || c === '<' || c === '>' ? ' ' : c)).join('').trim().slice(0, n)
  const by = /^\d{4}-\d{2}-\d{2}$/.test(q.get('by') || '') ? q.get('by') : ''
  return {
    code: looksLikeGiftCode(q.get('code')) ? formatGiftCode(q.get('code')) : '',
    plan: GIFT_PLANS.includes(q.get('plan')) ? q.get('plan') : 'elite',
    toName: cut(q.get('to'), GIFT_NAME_MAX),
    fromName: cut(q.get('from'), GIFT_NAME_MAX),
    message: cut(q.get('msg'), GIFT_MESSAGE_MAX),
    by,
  }
}

/** What the redeem endpoint's refusals mean, in words for a parent. */
export const GIFT_ERRORS = {
  bad_code: 'That code does not match a gift. Check each letter and try again.',
  used: 'That code has already been used. Each gift works once.',
  expired: `That code has expired. A gift code works for ${GIFT_CODE_YEARS} years from when it was bought.`,
  refunded: 'That gift was refunded, so the code no longer works.',
  too_many_tries: 'Too many codes that did not work. Wait an hour and try again.',
  subscription_renews: 'You pay for a plan that renews. Turn renewal off first with “Cancel my plan” on the plan screen (your plan runs to the end of what you paid for). Then redeem the code: your gift year starts the day your paid plan ends, so you never pay for the same time twice.',
  no_family: 'Only a parent of the family can redeem a gift.',
  not_configured: 'Gifts are not set up on this copy of RankUp yet.',
  signed_out: 'Sign in first.',
  bad_request: 'Type the 12-character code from the gift.',
}

/** What the gift checkout's refusals mean, for the buyer. */
export const GIFT_CHECKOUT_ERRORS = {
  demo: 'This is the demo, so nothing can be bought here. Leave the demo to buy a gift.',
  bad_plan: 'Choose Standard or Elite Pass.',
  bad_delivery: 'Choose how the gift is given.',
  bad_email: 'Your email, for the receipt and the code.',
  no_recipient_email: 'Their email, so we can send it to them.',
  bad_recipient_email: 'Their email does not look like an email address.',
  name_too_long: `Names can be up to ${GIFT_NAME_MAX} characters.`,
  message_too_long: `The message can be up to ${GIFT_MESSAGE_MAX} characters.`,
  rude_words: 'Please choose different words.',
  no_links: 'No links or email addresses in the names or the message, please.',
  busy: 'Lots of people are giving RankUp right now. Try again in a few minutes.',
  too_many_gifts: 'Lots of gifts have been started from here in the last hour. Try again in an hour, or write to us from the help page.',
  not_configured: 'Gifts cannot be bought on this copy of RankUp yet.',
  stripe_unavailable: 'Stripe, who take the payment, is not answering right now. Nothing was charged. Try again in a few minutes.',
  checkout_failed: 'Stripe could not start the payment. Nothing was charged. Please try again.',
}

export function giftError(reason, table = GIFT_ERRORS) {
  return table[reason] || 'Something went wrong. Please try again.'
}
