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

import { transport, getSession } from './sync/transport.js'

const CHECKOUT_URL = import.meta.env?.VITE_CHECKOUT_URL || '/api/create-checkout'
const PORTAL_URL = import.meta.env?.VITE_PORTAL_URL || '/api/billing-portal'
const STRIPE_ENABLED = String(import.meta.env?.VITE_STRIPE_ENABLED || '') === 'true'

/** Is real billing switched on? */
export function billingLive() {
  return STRIPE_ENABLED && transport.isConfigured()
}

async function post(url, body) {
  const token = getSession()?.access_token
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

/** Send the parent to Stripe's hosted checkout. */
export async function startCheckout(tier) {
  const result = await post(CHECKOUT_URL, { tier })
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
export const FLASH_TICKET_PRICE = 2.99
export const FLASH_TICKET_PACK_SIZE = 3

export async function buyFlashTickets() {
  const result = await post(CHECKOUT_URL, { product: 'flash_tickets' })
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
}

export function billingError(reason) {
  return BILLING_ERRORS[reason] || 'Something went wrong. Please try again.'
}
