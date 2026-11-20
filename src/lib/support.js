/* global __SUPPORT_EMAIL__ */
/**
 * Where a parent or a school writes for help.
 *
 * SUPPORT_EMAIL, if it is set on the host when the app is built (optional;
 * vite.config.js builds it in as __SUPPORT_EMAIL__, and only if it looks like
 * an address). Otherwise the company's contact email from legalText.js, once
 * it has been filled in. Otherwise none, and the app points only to Help.
 *
 * Shown under Settings, Help & about, and at the foot of both help pages.
 * The server's emails use the same setting (api/_shared/email.js).
 */
import { OPERATOR, UNFILLED } from '../data/legalText.js'

const built = typeof __SUPPORT_EMAIL__ === 'string' ? __SUPPORT_EMAIL__ : ''

export const SUPPORT_EMAIL = built || (UNFILLED.includes('email') ? '' : OPERATOR.email)

/**
 * Where "back" goes from the privacy policy and terms.
 *
 * Anybody can open these, signed in or not. The link used to say "Settings"
 * for everyone, and a visitor reading them from the front door was sent to a
 * Parent Mode they did not have. A phone that is not set up goes back to the
 * front door, a child's phone to its home, and a parent's to Settings.
 */
export function legalBack(state) {
  if (!state?.onboarded) return { to: '/welcome', label: '← Back' }
  if (state.device?.role === 'kid') return { to: '/kid', label: '← Back' }
  return { to: '/parent/settings', label: '← Settings' }
}
