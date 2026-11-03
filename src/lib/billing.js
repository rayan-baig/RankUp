/**
 * Billing, from the app's side.
 *
 * The app never decides what a family has paid for. It asks the server, and the
 * server only knows what Stripe's webhook told it. That is why there is no
 * "setTier" here: the only way to Elite is through a real payment.
 *
 * With Stripe unconfigured the app falls back to a local tier switch so both
 * tiers can be exercised in development. That switch is clearly labelled in the
 * interface as not being a purchase.
 */

import { transport, freshAccessToken } from './sync/transport.js'

const CHECKOUT_URL = import.meta.env?.VITE_CHECKOUT_URL || '/api/create-checkout'
const PORTAL_URL = import.meta.env?.VITE_PORTAL_URL || '/api/billing-portal'
const SCHOOL_CHECKOUT_URL = import.meta.env?.VITE_SCHOOL_CHECKOUT_URL || '/api/school-checkout'
const STRIPE_ENABLED = String(import.meta.env?.VITE_STRIPE_ENABLED || '') === 'true'

/** Is real billing switched on? */
export function billingLive() {
  return STRIPE_ENABLED && transport.isConfigured()
}

async function post(url, body) {
  const token = await freshAccessToken()
  if (!token) return { ok: false, reason: 'signed_out' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, origin: window.location.origin }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, reason: data.error || `http_${res.status}` }
    return { ok: true, ...data }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/**
 * Send the parent to Stripe's hosted checkout.
 *
 * `cycle` is passed through rather than decided here: the price ids live on the
 * server, so this only ever names which one it wants. Anything that is not
 * 'year' is a month, so an older phone that knows nothing about annual billing
 * keeps working exactly as it did.
 */
export async function startCheckout(tier, cycle = 'month') {
  const result = await post(CHECKOUT_URL, { tier, cycle: cycle === 'year' ? 'year' : 'month' })
  if (result.ok && result.url) window.location.href = result.url
  return result
}

/**
 * Flash Tickets: a one-off purchase, not a subscription.
 *
 * A ticket claims one skin from the Sunday Market without spending the child's
 * currency, so a child who did not save enough that week is not shut out of it.
 *
 * Bought by a PARENT, in Parent Mode, behind the PIN. A child can spend a
 * ticket and can see how many are left; a child can never buy one. That is not
 * a nicety — an in-app purchase a child can complete on their own is both an
 * app-store rejection and, in the US, specifically actionable.
 *
 * Tickets are credited by Stripe's webhook, never by this browser claiming the
 * payment worked. See supabase/billing.sql.
 */
/**
 * The packs, and why there is more than one.
 *
 * Stripe takes a percentage plus a flat thirty cents. On a $2.99 sale that flat
 * part alone is ten percent of the price; on a $14.99 one it is two. Selling
 * the same tickets in bigger packs therefore keeps materially more of the same
 * money — and the per-ticket price falls at the same time, so the bundle is
 * genuinely better for the family too rather than just for the operator.
 */
export const FLASH_TICKET_PACKS = [
  { id: 'flash_2', tickets: 2, price: 2.99, note: 'A common skin, or half of a legendary' },
  { id: 'flash_5', tickets: 5, price: 5.99, best: true, note: 'A legendary and a common, with one over' },
  { id: 'flash_12', tickets: 12, price: 11.99, note: 'Every skin in the shop, with one spare' },
]

export const DEFAULT_FLASH_PACK = FLASH_TICKET_PACKS[1]

/*
 * Sized against the shop, not against a round number. The whole set costs
 * eleven tickets, so twelve is "everything" and anything larger would be
 * selling a family something they cannot spend.
 */

/** What one ticket costs in this pack, for the "save 30%" line. */
export function perTicket(pack) {
  return pack.price / pack.tickets
}

export function packSaving(pack) {
  const base = perTicket(FLASH_TICKET_PACKS[0])
  return Math.round((1 - perTicket(pack) / base) * 100)
}

export async function buyFlashTickets(packId = DEFAULT_FLASH_PACK.id) {
  const result = await post(CHECKOUT_URL, { product: packId })
  if (result.ok && result.url) window.location.href = result.url
  return result
}

/**
 * A school's plan. The size band, and so the price, is decided on the server
 * from the school's own record; this only says monthly or yearly.
 */
export async function startSchoolCheckout(cycle = 'month') {
  const result = await post(SCHOOL_CHECKOUT_URL, { cycle: cycle === 'year' ? 'year' : 'month' })
  if (result.ok && result.url) window.location.href = result.url
  return result
}

/** The school's card, invoices and cancelling, on Stripe's own pages. */
export async function openSchoolBillingPortal() {
  const result = await post(PORTAL_URL, { for: 'school' })
  if (result.ok && result.url) window.location.href = result.url
  return result
}

/** Send them to Stripe's portal to cancel, change card or get invoices. */
export async function openBillingPortal() {
  const result = await post(PORTAL_URL, {})
  if (result.ok && result.url) window.location.href = result.url
  return result
}

/** What the server says this family currently has. */
export async function fetchBillingStatus() {
  if (!transport.isConfigured()) return null
  try {
    return await transport.rpc('billing_status', {})
  } catch {
    return null
  }
}

export const BILLING_ERRORS = {
  not_configured: 'Payments are not set up on this deployment yet.',
  signed_out: 'Sign in first.',
  no_subscription: 'You do not have a subscription to manage yet.',
  no_customer: 'No billing account found for this family.',
  checkout_failed: 'Stripe could not start the checkout. Please try again.',
  portal_failed: 'Could not open the billing portal. Please try again.',
  stripe_unavailable: 'Stripe, who look after billing, is not answering right now. Nothing about your plan has changed. Try again in a few minutes.',
  not_school_admin: 'Only the school’s admin can manage its plan.',
  suspended: 'This school is suspended. Contact us to sort it out.',
  already_subscribed: 'You already have a plan. Change it from “Manage billing, cancel, or update card”, where Stripe swaps it over without charging you twice.',
  already_paying: 'Your school is already paying. Use “Card, invoices and cancelling” to change the plan.',
}

export function billingError(reason) {
  if (BILLING_ERRORS[reason]) return BILLING_ERRORS[reason]
  // The host answering for a function that did not (a 502 or 504 from the
  // platform, or no connection at all) is Stripe's side being down as far as
  // a parent can tell, and saying "something went wrong" told them nothing.
  if (/^http_5\d\d$/.test(String(reason || '')) || /fetch|network/i.test(String(reason || ''))) {
    return BILLING_ERRORS.stripe_unavailable
  }
  return 'Something went wrong. Please try again.'
}

const PLAN_NAMES = { standard: 'Standard', elite: 'Elite' }

/** A date on a plan notice, in words: "15 November 2026", not "11/15/2026". */
export const planDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * What a parent is told when their plan has stopped, and why.
 *
 * The webhook moves the family the moment Stripe says a payment failed or was
 * handed back, and the app simply showed fewer features: no reason, nothing
 * to do about it. Only past_due had a banner, and it said "Elite" to a family
 * that paid for Standard. `status` is billing_status()'s answer, or the
 * synced family's subscription status as { status }. Null when there is
 * nothing to say.
 */
export function billingNotice(status) {
  const state = status?.status
  const kept = 'Nothing your kids have earned has been touched.'
  const until = status?.ends_at ? new Date(status.ends_at) : null
  const plan = PLAN_NAMES[status?.paid_tier] || 'paid'
  switch (state) {
    case 'past_due':
      return {
        tone: 'bad', icon: '⚠️', title: 'A payment failed',
        body: `Your card was declined when your ${plan} plan renewed, so you are on Starter until it goes through. Update your card in “Manage billing” and Stripe will try again. ${kept}`,
      }
    case 'unpaid':
    case 'incomplete_expired':
      return {
        tone: 'bad', icon: '⚠️', title: 'Your plan has stopped',
        body: `Stripe could not take the payment for your ${plan} plan after several tries, so you are on Starter now. Choose a plan below to start again. ${kept}`,
      }
    case 'incomplete':
      return {
        tone: 'bad', icon: '⚠️', title: 'Your payment has not gone through yet',
        body: `Your bank has not confirmed the first payment, so the ${plan} plan has not started. Finish it in “Manage billing”, or choose a plan below to try again. ${kept}`,
      }
    case 'paused':
      return {
        tone: 'info', icon: '⏸️', title: 'Your plan is paused',
        body: `Your free trial ended with no card saved, so you are on Starter. Add a card in “Manage billing” to carry on. ${kept}`,
      }
    case 'refunded':
      return {
        tone: 'info', icon: '↩️', title: 'Your payment was refunded',
        body: `Your last payment was handed back in full, so that period is not paid for and you are on Starter. Choose a plan below whenever you want it back. ${kept}`,
      }
    case 'canceled':
      // Stripe says "canceled" once the plan has ended, and the family is on
      // Starter from that moment. This used to say "It runs until" the end
      // of the period for a plan cancelled at once, to a family already on
      // Starter.
      return {
        tone: 'info', icon: 'ℹ️', title: 'Your plan has ended',
        body: `Your ${plan} plan has ended, so you are on Starter now. Choose a plan below to start again. ${kept}`,
      }
    case 'active':
    case 'trialing':
      // Cancelled in the portal and still running: nothing has changed yet,
      // and the parent should not find out on the day.
      if (until && until.getTime() > Date.now()) {
        return {
          tone: 'info', icon: '📅', title: 'Your plan is ending',
          body: `You cancelled, so your ${PLAN_NAMES[status?.tier] || plan} plan stops on ${planDate(until)}. Nothing changes until then. Changed your mind? Use “Manage billing”.`,
        }
      }
      return null
    default:
      return null
  }
}

/** The statuses that mean a payment stopped the plan, which the dashboard shows. */
const PAYMENT_STOPPED = ['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'refunded']

/**
 * The notice on the parent dashboard, from the synced family row: only a
 * plan a payment stopped. A plan they cancelled themselves, or one ending on
 * a date they chose, is not news there; the plan screen says it.
 */
export function dashboardBillingNotice(family, { demo = false } = {}) {
  if (demo || !PAYMENT_STOPPED.includes(family?.subscriptionStatus)) return null
  return billingNotice({ status: family.subscriptionStatus, paid_tier: family.lastPaidTier })
}
