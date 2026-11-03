/**
 * Sending an email, and the words of the ones RankUp's own code sends.
 *
 * Most of RankUp's email is not sent from here: sign-up confirmations and
 * password resets are Supabase's, and receipts and payment problems are
 * Stripe's. Both are set up in those dashboards (docs/EMAILS.md). The one
 * kind sent from this code is the free trial's two reminders
 * (api/send-trial-emails.js).
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

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => escapeMap[c])

/** Read when asked, not at load: on Cloudflare the settings arrive with the first request. */
export function emailSettings() {
  return {
    apiKey: process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || '',
    replyTo: process.env.EMAIL_REPLY_TO || '',
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
      ? `Your free trial of ${trial} ends today.`
      : `Your free trial of ${trial} ends ${days === 1 ? 'tomorrow' : `in ${days} days`}, on ${endsLocal}.`,
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
