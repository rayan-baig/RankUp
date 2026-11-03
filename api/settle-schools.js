/**
 * Serverless function: close last month's School League.
 *
 * Run once a month, by a scheduler. The database scores every school, names
 * each district's Champion, records rivalry results and picks every school's
 * School Stars (settle_school_month). Then this gives each Champion its free
 * month.
 *
 * Safe to run twice. Settlement writes each month once, and the free months
 * are read back from the database as "still owed" (unapplied_school_awards)
 * rather than from this run's result, so a month whose reward failed to apply
 * is simply tried again next time, and one already given is never given again.
 *
 * Then each school's admin gets the month by email: the league result, what
 * the school paid, and when its plan renews (schoolMonthEmail,
 * api/_shared/email.js). Once per school per month: the database claims each
 * one before it is sent and marks it after (claim_school_month_emails,
 * supabase/schools.sql), a failed send gives the claim back for the next run,
 * and the email provider's idempotency key covers a run that died between
 * sending and marking. Needs EMAIL_API_KEY and EMAIL_FROM; without them the
 * month is still closed and the emails wait.
 */

import { recordRun, secretMatches, makeServiceRpc } from './_shared/job.js'
import { makeStripe } from './_shared/stripe.js'
import { championReward } from './_shared/schoolBilling.js'
import { emailSettings, emailConfigured, sendEmail, schoolMonthEmail } from './_shared/email.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || ''
const SITE = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '')

/** The first day of last month, in UTC. */
function lastMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Use POST or GET.' })
  }
  // Stripe is not required: a league with no paying schools yet still has to
  // close its months, and trial extensions need no Stripe at all.
  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
    return res.status(503).json({ error: 'not_configured' })
  }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secretMatches(given, CRON_SECRET)) return res.status(401).json({ error: 'no' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
  // A missed month may be named, so it can be closed late. Never a winner.
  const month = /^\d{4}-\d{2}-01$/.test(body?.month || '') ? body.month : lastMonth()

  const serviceRpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)
  let settled
  let owed
  try {
    settled = await serviceRpc('settle_school_month', { p_month: month })
    owed = await serviceRpc('unapplied_school_awards', {})
  } catch (err) {
    await recordRun(serviceRpc, 'settle-schools', false, err.message)
    return res.status(502).json({ error: 'settle_failed' })
  }

  const stripe = STRIPE_SECRET ? makeStripe(STRIPE_SECRET) : null
  const rewarded = []
  const waiting = []
  for (const award of owed || []) {
    const how = championReward(award)
    try {
      if (how === 'extend_trial') {
        await serviceRpc('mark_school_award_applied', {
          p_district_key: award.district_key, p_month_key: award.month_key, p_coupon: null,
        })
        rewarded.push({ school: award.name, month: award.month_key, as: 'trial_days' })
      } else if (how === 'coupon' && stripe && award.monthly_cents > 0) {
        /*
         * One month at the school's own price, as credit on its account.
         *
         * Credit rather than "100% off the next invoice": on a yearly plan the
         * next invoice is a year, and a month is what was won. It comes off
         * whatever the school is billed next, monthly or yearly.
         *
         * The idempotency key names the award, so if this run dies after
         * Stripe has the credit but before it is marked given, the next run's
         * attempt is the same request and Stripe gives it once.
         */
        const credit = await stripe.customers.createBalanceTransaction(
          award.stripe_customer_id,
          {
            amount: -award.monthly_cents,
            currency: 'usd',
            description: `District Champion, ${award.month_key}: one month free`,
            metadata: { district_key: award.district_key, month_key: award.month_key },
          },
          { idempotencyKey: `school-champion:${award.district_key}:${award.month_key}` },
        )
        await serviceRpc('mark_school_award_applied', {
          p_district_key: award.district_key, p_month_key: award.month_key, p_coupon: credit.id,
        })
        rewarded.push({ school: award.name, month: award.month_key, as: 'credit' })
      } else {
        waiting.push({ school: award.name, month: award.month_key, reason: stripe ? 'plan_not_active' : 'stripe_not_configured' })
      }
    } catch (err) {
      console.error('[settle-schools] free month not given:', award.month_key, err.message)
      waiting.push({ school: award.name, month: award.month_key, reason: 'stripe_error' })
    }
  }

  const emails = await sendMonthEmails(serviceRpc, month)

  // A Stripe error is a failed run: a free month decided and not given is what
  // somebody has to go and look at. A school whose plan has ended is not. An
  // email that did not go is too; it goes on the next run.
  const errored = waiting.filter((w) => w.reason !== 'plan_not_active')
  const problems = [
    errored.length ? `${errored.length} free month(s) not given` : null,
    emails.failed ? `${emails.failed} school email(s) not sent` : null,
  ].filter(Boolean)
  await recordRun(serviceRpc, 'settle-schools', problems.length === 0, problems.join('; ') || null)
  return res.status(200).json({
    ok: true, month: settled?.month, champions: settled?.champions || [], given: rewarded, waiting, emails,
  })
}

/**
 * Each school's month to its admin, in batches the database claims. Stops
 * starting batches after 20 seconds; what is left goes on the next run.
 */
async function sendMonthEmails(serviceRpc, month) {
  const settings = emailSettings()
  if (!emailConfigured(settings)) return { sent: 0, failed: 0, schools: 0, skipped: 'not_configured' }
  const started = Date.now()
  const out = { sent: 0, failed: 0, schools: 0 }
  while (Date.now() - started < 20000) {
    let batch
    try {
      batch = await serviceRpc('claim_school_month_emails', { p_month: month, p_limit: 25 })
    } catch (err) {
      console.error('[settle-schools] could not claim the month emails:', err.message)
      out.failed += 1
      break
    }
    const list = batch?.emails || []
    if (!list.length) break
    for (const m of list) {
      const email = schoolMonthEmail(m, { site: SITE, replyTo: settings.replyTo })
      // One email per admin, each to their own address.
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.all((m.recipients || []).map((to) => sendEmail({
        to,
        ...email,
        idempotencyKey: `school-month-${m.school_id}-${m.month_key}-${String(to).toLowerCase()}`,
      }, settings)))
      const done = results.length > 0 && results.every((r) => r.ok)
      try {
        // eslint-disable-next-line no-await-in-loop
        await serviceRpc('finish_school_month_email', { p_school: m.school_id, p_month_key: m.month_key, p_sent: done })
      } catch { /* the claim runs out in an hour and the idempotency key covers the retry */ }
      out.schools += 1
      out.sent += results.filter((r) => r.ok).length
      out.failed += results.filter((r) => !r.ok).length
    }
    // A school whose email failed was given back, and would be claimed again
    // at once: the provider is having trouble, so the next run tries.
    if (out.failed) break
  }
  return out
}
