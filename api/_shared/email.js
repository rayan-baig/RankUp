/**
 * Sending an email, and the words of the ones RankUp's own code sends.
 *
 * Most of RankUp's email is not sent from here: sign-up confirmations and
 * password resets are Supabase's, and receipts and payment problems are
 * Stripe's. Both are set up in those dashboards (docs/EMAILS.md). Five kinds
 * are sent from this code: the free trial's two reminders
 * (api/send-trial-emails.js), a school's month (api/settle-schools.js), the
 * error report to whoever runs RankUp (api/_shared/errorReport.js), and a
 * gift's two emails, the buyer's receipt with the code and the gift to the
 * person it is for (api/_shared/gifts.js, from the Stripe webhook).
 *
 * Sent through the email provider's HTTP API, because a Cloudflare Worker
 * cannot speak SMTP. Written for Resend's API (POST /emails): one call, a
 * from, a to, a subject, an HTML part and a plain-text part, and an
 * idempotency key so a retried send is never a second email. EMAIL_API_BASE
 * points it elsewhere (the tests' stand-in).
 *
 * Every email: short, plain, in the same words as the app, with a plain-text
 * part, how to get help, and "RankUp is a product of MTRX Horizyn." at the
 * foot. No child's name in it, ever: an email can be forwarded, and the
 * reminder is about the family's plan, not about anybody in it.
 */
import { TIERS } from '../../src/state/initialState.js'
import { PRODUCT_OF } from '../../src/data/legalText.js'
import { scrubErrorText } from './job.js'
import { GIFT_MONTHS, GIFT_RECIPIENT_DAYS, giftCardLink } from '../../src/lib/giftRules.js'

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => escapeMap[c])

/** Read when asked, not at load: on Cloudflare the settings arrive with the first request. */
export function emailSettings() {
  return {
    apiKey: process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || '',
    // The support address: EMAIL_REPLY_TO, or SUPPORT_EMAIL (the one the
    // app shows under Help & about) when that is all that is set.
    replyTo: process.env.EMAIL_REPLY_TO || process.env.SUPPORT_EMAIL || '',
    base: (process.env.EMAIL_API_BASE || 'https://api.resend.com').replace(/\/+$/, ''),
  }
}

/** Is email set up on this deployment? */
export const emailConfigured = (s = emailSettings()) => Boolean(s.apiKey && s.from)

/**
 * One email. Resolves { ok: true } or { ok: false, status, error }; never
 * throws. Twenty seconds at most: a provider that hangs must not hold the job.
 */
export async function sendEmail({ to, subject, text, html, idempotencyKey }, s = emailSettings()) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(`${s.base}/emails`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.apiKey}`,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: s.from,
        to: [to],
        subject,
        text,
        html,
        ...(s.replyTo ? { reply_to: s.replyTo } : {}),
      }),
    })
    if (res.ok) return { ok: true }
    return { ok: false, status: res.status, error: (await res.text().catch(() => '')).slice(0, 200) }
  } catch (err) {
    return { ok: false, status: 0, error: err?.name === 'AbortError' ? 'timeout' : String(err?.message || err) }
  } finally {
    clearTimeout(timer)
  }
}

/** The help line, the same in every email. */
function helpLine(replyTo) {
  return `Need help? Open RankUp, then Settings, Help & about, Help.${replyTo ? ` Or write to ${replyTo}; a person reads it.` : ''}`
}

/** The same email as HTML, built from the plain-text lines, escaped. */
function toHtml(paragraphs, link, help, foot) {
  const p = (t) => `<p style="margin:0 0 14px">${esc(t)}</p>`
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff;color:#111111;font:16px/1.5 -apple-system,system-ui,sans-serif">
<div style="max-width:520px;margin:0 auto">
${paragraphs.map(p).join('\n')}
${link ? `<p style="margin:0 0 18px"><a href="${esc(link.url)}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${esc(link.label)}</a></p>` : ''}
${p(help)}
<hr style="border:0;border-top:1px solid #e5e5e5;margin:20px 0">
${foot.map((t) => `<p style="margin:0 0 6px;font-size:13px;color:#666666">${esc(t)}</p>`).join('\n')}
</div></body></html>`
}

/**
 * The trial reminder. `kind` is 'three_days' or 'last_day'; `daysLeft` is how
 * many days are left where the family lives. The words follow the app's own:
 * the trial banner ("3 days left of Elite Pass, free", "Last day of your free
 * trial"), the plan screen ("After that you are on Starter unless you choose
 * a plan") and Help ("Nothing is charged by itself").
 */
export function trialEmail({ kind, trialTier, paidTier, endsLocal, daysLeft = 3, site, replyTo }) {
  const trial = (TIERS[trialTier] || TIERS.elite).name
  const paid = TIERS[paidTier] || TIERS.starter
  const after = paid.price === 0 ? `${paid.name}, which is free` : `${paid.name}, the plan you pay for`
  const last = kind === 'last_day'
  const days = Math.max(1, Math.round(Number(daysLeft) || 3))
  const subject = last
    ? 'Last day of your free trial'
    : days === 1 ? `Your free trial of ${trial} ends tomorrow` : `${days} days left of ${trial}, free`
  const planUrl = site ? `${site.replace(/\/+$/, '')}/#/parent/plan` : ''

  const paragraphs = [
    'Hello,',
    last
      // Sent late the evening before for a trial that ends just after
      // midnight their time (due_trial_reminders): "today" would be wrong.
      ? `Your free trial of ${trial} ends ${Number(daysLeft) >= 1 ? 'tonight' : 'today'}.`
      // Without the date (the database always gives it; a blank must never
      // read "on undefined"), the sentence stops at the days.
      : `Your free trial of ${trial} ends ${days === 1 ? 'tomorrow' : `in ${days} days`}${endsLocal ? `, on ${endsLocal}` : ''}.`,
    `After that you are on ${after}, unless you choose a plan. Nothing is charged by itself.`,
    'Everything your children have earned stays exactly where it is.',
    `To keep ${trial}, open RankUp and go to Settings, then Your plan.`,
  ]
  const help = helpLine(replyTo)
  const foot = [
    PRODUCT_OF,
    last
      ? 'You get this because your family started a free trial. This is the last email about it.'
      : 'You get this because your family started a free trial. There is one more email about it, on the day it ends.',
  ]
  const link = planUrl ? { url: planUrl, label: 'See your plan' } : null

  const text = [
    ...paragraphs,
    ...(link ? [`See your plan: ${link.url}`] : []),
    help,
    '--',
    ...foot,
  ].join('\n\n')

  return { subject, text, html: toHtml(paragraphs, link, help, foot) }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-10" as "October 2026". */
export function monthName(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number)
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : String(monthKey || '')
}

/** A day, written out, in UTC: "14 November 2026". */
function dayName(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Minor units as money: 4900 USD is "$49.00". */
export function money(minor, currency = 'USD') {
  const amount = (Number(minor) || 0) / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase() }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${String(currency || '').toUpperCase()}`
  }
}

const ordinal = (n) => {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`
}

/**
 * The month, to a school's admin, after settlement (api/settle-schools.js):
 * the league result, what the school paid that month, and what happens next
 * with its plan. `m` is what school_month_summary (supabase/schools.sql)
 * returns. Short and plain, in the School League's own words; no child is
 * named (the School Stars are on the school's page, behind the admin's
 * check). A plain-text part, help, and the MTRX Horizyn footer.
 */
export function schoolMonthEmail(m, { site, replyTo } = {}) {
  const month = monthName(m.month_key)
  const school = String(m.name || 'Your school')
  const subject = `${school}: your School League month, ${month}`
  const score = Number(m.score)

  const league = []
  if (m.champion) {
    league.push(`${school} was District Champion in ${m.district} for ${month}, with ${score.toFixed(1)} points per student.`)
    league.push(m.free_month_given
      ? 'Your free month for winning has been given: it comes off your next bill (or adds a month to your trial).'
      : 'Your free month for winning comes off your next bill (or adds a month to your trial).')
  } else if (m.ranked && m.rank) {
    const place = m.ranked_schools > 1
      ? `${ordinal(m.rank)} of ${m.ranked_schools} schools in ${m.district}`
      : `the only ranked school in ${m.district} this month, so no Champion there`
    league.push(`${school} scored ${score.toFixed(1)} points per student in ${month}, with ${m.students} taking part: ${place}.`)
  } else {
    const why = !m.verified
      ? 'we have not finished checking the school yet'
      : `a school needs at least ${m.min_students} students taking part, and ${m.students} ${m.students === 1 ? 'was' : 'were'}`
    league.push(`${school} was not ranked in ${month}: ${why}. Its score was ${Number.isFinite(score) ? score.toFixed(1) : '0.0'} points per student.`)
  }
  for (const r of m.rivalries || []) {
    league.push(r.result === 'draw' ? `Against ${r.rival}: a draw.` : `Against ${r.rival}: you ${r.result}.`)
  }

  const paid = (m.paid || []).filter((p) => Number(p.minor) > 0)
  const paidLine = paid.length
    ? `In ${month} you paid ${paid.map((p) => money(p.minor, p.currency)).join(' and ')}.`
    : m.status === 'trial'
      ? `Nothing was charged in ${month}: you are on your free trial.`
      : `Nothing was charged in ${month}.`

  let next
  if (m.renews_at) next = `Your plan renews on ${dayName(m.renews_at)}.`
  else if (m.ends_at) next = `Your plan ends on ${dayName(m.ends_at)}, as you asked. Nothing more will be charged.`
  else if (m.trial_ends_at) next = `Your free trial ends on ${dayName(m.trial_ends_at)}. Nothing is charged by itself: choose a plan on the school page to keep playing.`
  else next = 'Your plan has ended, so your school sits the league out until it starts again, from the school page.'

  const paragraphs = ['Hello,', ...league, paidLine, next]
  const base = site ? site.replace(/\/+$/, '') : ''
  const link = base ? { url: `${base}/#/school`, label: 'Open the school page' } : null
  const help = `Need help? ${base ? `The school help page is ${base}/#/school/help.` : 'The school page has a Help link.'}${replyTo ? ` Or write to ${replyTo}; a person reads it.` : ''}`
  const foot = [
    PRODUCT_OF,
    `You get this because you run ${school}'s School League account. One email a month.`,
  ]
  const text = [
    ...paragraphs,
    ...(link ? [`${link.label}: ${link.url}`] : []),
    help,
    '--',
    ...foot,
  ].join('\n\n')
  return { subject, text, html: toHtml(paragraphs, link, help, foot) }
}

const times = (n) => (Number(n) === 1 ? 'once' : Number(n) === 2 ? 'twice' : `${Number(n) || 0} times`)

/**
 * The error report, to ERRORS_EMAIL: what went wrong since the last one
 * (claim_error_report, supabase/crashes.sql). For whoever runs RankUp, not a
 * family. Each line says where (a screen on a phone, or a server function),
 * how often, and the message, which the database has already stripped of
 * names, emails, ids and tokens; it is scrubbed again here all the same,
 * because this is the one email whose words come from outside the code.
 */
export function errorReportEmail(report, { site } = {}) {
  const kinds = report?.kinds || []
  const fresh = kinds.filter((k) => k.new).length
  const more = Number(report?.more) || 0
  const subject = `RankUp: ${kinds.length} ${kinds.length === 1 ? 'error' : 'errors'} to look at${fresh ? `, ${fresh} new` : ''}`
  const lines = kinds.map((k) => {
    const where = scrubErrorText(k.where).slice(0, 80)
    const what = scrubErrorText(k.message).slice(0, 300)
    const place = k.source === 'app' ? `On a phone, on ${where}` : `In the server function ${where}`
    return `${k.new ? 'New. ' : ''}${place}, ${times(k.count)}: ${what}`
  })
  const paragraphs = [
    'Hello,',
    `RankUp recorded ${kinds.length === 1 ? 'one kind of error' : `${kinds.length} kinds of error`} since the last report${more ? `, and ${more} more that will be in the next one` : ''}.`,
    ...lines,
    'No family is named in this email: names, emails, ids and tokens are taken out before it is written.',
  ]
  const base = site ? site.replace(/\/+$/, '') : ''
  const help = `What to do about each: docs/IF-SOMETHING-BREAKS.md in RankUp's code. Every crash and error is in the crash_reports and server_errors tables in Supabase${base ? `, and ${base}/api/health with the scheduler's key counts them` : ''}.`
  const foot = [
    PRODUCT_OF,
    'You get this because ERRORS_EMAIL is set to this address. Each error at most once an hour, and at most 20 of these a day.',
  ]
  const text = [...paragraphs, help, '--', ...foot].join('\n\n')
  return { subject, text, html: toHtml(paragraphs, null, help, foot) }
}

const giftPlanName = (plan) => (TIERS[plan] || TIERS.elite).name
const redeemHow = 'To redeem it, a parent opens RankUp (or sets it up, free), goes into Parent Mode, then Settings, Redeem a gift, and types the code.'

/**
 * The buyer's receipt, from the Stripe webhook once the gift is paid for
 * (api/_shared/gifts.js). The code, the plan, how it is redeemed, the date
 * it must be used by, and the printable card. Stripe sends its own receipt
 * for the payment as well. `o` is what fulfil_gift_order returns, with the
 * code, the site and the support address.
 */
export function giftReceiptEmail(o) {
  const plan = giftPlanName(o.plan)
  const by = o.expires_at ? dayName(o.expires_at) : ''
  const subject = `Your RankUp gift: a year of ${plan}`
  const to = o.to_name ? o.to_name : 'them'
  const paragraphs = [
    'Hello,',
    `Thank you for giving a year of RankUp. Here is the gift code for ${plan}, for 1 year:`,
    `Gift code: ${o.code}`,
    o.delivery === 'email' && o.to_email
      ? `We have emailed the gift to ${to} at ${o.to_email}, with the code and how to use it.`
      : 'You said you would give it yourself: print the gift card, or pass the code on however you like.',
    `${redeemHow} Their family then has ${plan} free for ${GIFT_MONTHS} months from that day.`,
    `${by ? `The code can be used until ${by}, once.` : 'The code can be used once.'} If the family already pays for RankUp, the gift year starts when their paid plan ends, so they never pay twice.`,
    `${o.amount_minor ? `You paid ${money(o.amount_minor, o.currency || 'USD')}, once.` : 'You paid once.'} Nothing renews and nothing more is charged. Stripe sends its own receipt for the payment.`,
  ]
  const url = giftCardLink(o.site, { code: o.code, plan: o.plan, toName: o.to_name, fromName: o.from_name, message: o.message, by: o.expires_at })
  const link = url ? { url, label: 'Print the gift card' } : null
  const help = helpLine(o.replyTo)
  const foot = [
    PRODUCT_OF,
    'You get this because you bought a RankUp gift. We keep your email for this receipt and for help with the gift until the code runs out.',
  ]
  const text = [...paragraphs, ...(link ? [`${link.label}: ${link.url}`] : []), help, '--', ...foot].join('\n\n')
  return { subject, text, html: toHtml(paragraphs, link, help, foot) }
}

/**
 * The gift, to the person it is for, when the buyer asked us to email it.
 * Who it is from by the name the buyer gave (never their email address,
 * which this does not even read), their message if they wrote one, the code
 * and how to redeem it.
 */
export function giftEmail(o) {
  const plan = giftPlanName(o.plan)
  const from = String(o.from_name || '').trim() || 'Someone'
  const by = o.expires_at ? dayName(o.expires_at) : ''
  const base = String(o.site || '').replace(/\/+$/, '')
  const subject = `${from} gave your family a year of RankUp`
  const paragraphs = [
    o.to_name ? `Hello ${o.to_name},` : 'Hello,',
    `${from} gave your family a year of RankUp ${plan}: your kids' chores become quests, and they earn XP and level up when you accept them.`,
    ...(o.message ? [`${from} wrote: “${o.message}”`] : []),
    `Your gift code: ${o.code}`,
    `${redeemHow} Your family then has ${plan} free for ${GIFT_MONTHS} months from that day. No card is needed and nothing is charged.`,
    `${by ? `Use it by ${by}. ` : ''}If you already pay for RankUp, your gift year starts when your paid plan ends.`,
  ]
  const link = base ? { url: `${base}/`, label: 'Open RankUp' } : null
  const help = helpLine(o.replyTo)
  const foot = [
    PRODUCT_OF,
    `You get this because somebody bought you a RankUp gift and asked us to email it. Your name and email are used only to send it, and deleted within ${GIFT_RECIPIENT_DAYS} days.`,
  ]
  const text = [...paragraphs, ...(link ? [`${link.label}: ${link.url}`] : []), help, '--', ...foot].join('\n\n')
  return { subject, text, html: toHtml(paragraphs, link, help, foot) }
}
