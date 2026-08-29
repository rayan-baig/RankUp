/**
 * Notifications.
 *
 * Two mechanisms, because they solve different halves of the problem:
 *
 *   LOCAL — the page asks the service worker to show something. No server, no
 *           keys, no cost, works offline. But only while the app is running, so
 *           it covers "the other device just did something while I have RankUp
 *           open" and nothing else.
 *
 *   PUSH  — a real Web Push message, delivered with the app closed. This is the
 *           one that actually gets a parent to review a submission. It needs
 *           VAPID keys and a server able to send — see docs/NOTIFICATIONS.md.
 *
 * The app uses local where it can and push where it is configured, and says
 * which is in force rather than implying background delivery it cannot do.
 */

import { transport, getSession } from './sync/transport.js'

const VAPID_PUBLIC_KEY = import.meta.env?.VITE_VAPID_PUBLIC_KEY || ''
const PREF_KEY = 'rankup.notifications.v1'

export const SUPPORTED =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator

export function pushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY) && transport.isConfigured()
}

export function permission() {
  if (!SUPPORTED) return 'unsupported'
  return Notification.permission
}

/**
 * iOS only allows notifications once the app has been added to the home screen.
 * Asking for permission in Safari there does nothing, so it is worth saying so
 * instead of letting a parent tap a button that silently fails.
 */
export function iosNeedsInstall() {
  if (typeof navigator === 'undefined') return false
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone
  return isIos && !standalone
}

export function getPrefs() {
  try {
    return { enabled: false, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }
  } catch {
    return { enabled: false }
  }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch }
  localStorage.setItem(PREF_KEY, JSON.stringify(next))
  return next
}

let registration = null

export async function ensureServiceWorker() {
  if (!SUPPORTED) return null
  if (registration) return registration
  try {
    registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    return registration
  } catch (err) {
    console.warn('[RankUp] Service worker did not register:', err.message)
    return null
  }
}

/** Base64url (how VAPID keys are published) to the Uint8Array subscribe wants. */
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/**
 * Ask for permission and, if push is configured, register for background
 * delivery. Returns what actually happened rather than a bare boolean, because
 * "granted but local-only" is a genuinely different state from "granted and
 * pushing" and the interface has to say which.
 */
export async function enable() {
  if (!SUPPORTED) return { ok: false, reason: 'unsupported' }
  if (iosNeedsInstall()) return { ok: false, reason: 'ios_needs_install' }

  const result = await Notification.requestPermission()
  if (result !== 'granted') return { ok: false, reason: result }

  const reg = await ensureServiceWorker()
  if (!reg) return { ok: false, reason: 'no_service_worker' }

  setPrefs({ enabled: true })

  if (!pushConfigured()) return { ok: true, mode: 'local' }

  try {
    const existing = await reg.pushManager.getSubscription()
    const subscription =
      existing ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))

    await transport.rpc('save_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_keys: JSON.parse(JSON.stringify(subscription)).keys || {},
    })
    return { ok: true, mode: 'push' }
  } catch (err) {
    // A push service being unreachable should not cost the person their
    // in-app notifications, which still work.
    console.warn('[RankUp] Push subscription failed, staying local-only:', err.message)
    return { ok: true, mode: 'local', warning: err.message }
  }
}

export async function disable() {
  setPrefs({ enabled: false })
  const reg = await ensureServiceWorker()
  const subscription = await reg?.pushManager?.getSubscription?.()
  if (subscription) {
    try {
      await transport.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint })
    } catch { /* the local unsubscribe below is what matters */ }
    await subscription.unsubscribe().catch(() => {})
  }
}

/**
 * Show something now, on this device.
 *
 * Calls showNotification on the registration directly rather than messaging the
 * service worker. Messaging depends on the worker being `active`, which it is
 * not for a second or two after first install — so the very first notification
 * a person ever triggers would silently vanish. The worker keeps its message
 * handler for anything that does need to go through it.
 */
export async function notifyLocally(payload) {
  if (!SUPPORTED || Notification.permission !== 'granted' || !getPrefs().enabled) return false
  const reg = await ensureServiceWorker()
  if (!reg) return false
  try {
    await reg.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag || 'rankup',
      data: { url: payload.url || '/' },
    })
    return true
  } catch (err) {
    console.warn('[RankUp] Could not show a notification:', err.message)
    return false
  }
}

const SEND_URL = import.meta.env?.VITE_PUSH_SEND_URL || '/api/send-push'

/**
 * Ask the server to notify the family's OTHER devices.
 *
 * Falls back silently: if push is not configured the server says so, and the
 * app has already shown the notification locally where it can. There is no
 * point telling a parent their notification "failed" when the thing they cared
 * about — seeing it — already happened.
 */
export async function notifyRemote({ familyId, role, kidId, payload }) {
  if (!pushConfigured() || !familyId) return { ok: false, reason: 'not_configured' }
  const session = getSession()
  const token = session?.access_token
  if (!token) return { ok: false, reason: 'signed_out' }

  try {
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ familyId, role, kidId, payload }),
    })
    if (!res.ok) return { ok: false, reason: `http_${res.status}` }
    return { ok: true, ...(await res.json()) }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

/** The wording for each thing worth interrupting someone about. */
export const NOTICES = {
  submission: (kidName, questTitle) => ({
    title: `${kidName} finished a quest`,
    body: `"${questTitle}" is waiting for you to review.`,
    tag: 'submission',
    url: '/#/parent/approvals',
  }),
  approved: (questTitle, xp) => ({
    title: 'Approved! 🎉',
    body: `"${questTitle}" earned you ${xp} XP.`,
    tag: 'decision',
    url: '/#/kid',
  }),
  rejected: (questTitle) => ({
    title: 'Sent back to redo',
    body: `"${questTitle}" needs another go. Tap to see why.`,
    tag: 'decision',
    url: '/#/kid/quests',
  }),
  guildRequest: (kidName, guildName) => ({
    title: 'A guild request needs you',
    body: `${kidName} wants to join ${guildName}. Nobody joins without you.`,
    tag: 'guild',
    url: '/#/parent/guilds',
  }),
  reminder: (label) => ({
    title: 'RankUp',
    body: label,
    tag: 'reminder',
    url: '/#/kid/quests',
  }),
}
