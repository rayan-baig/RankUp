import { useState } from 'react'
import { useApp, useSync } from '../state/AppContext.jsx'
import { transport, getSession, setSession } from '../lib/sync/transport.js'
import SignIn from '../screens/SignIn.jsx'
import { SYNC_STATUS } from '../lib/sync/syncEngine.js'

/**
 * A one-line answer to "is what I'm looking at up to date?"
 *
 * Worth the space because the failure it warns about is silent otherwise: a
 * parent approving chores on a train sees everything work perfectly, and has no
 * way to know none of it has left the phone. Saying "3 waiting to send" turns a
 * mystery into a fact.
 */
export default function SyncBadge({ className = '' }) {
  const { status, pending, error, syncNow, configured } = useSync()
  const { state, dispatch } = useApp()
  const notice = state.syncNotice
  const [signingIn, setSigningIn] = useState(false)
  const [wrongAccount, setWrongAccount] = useState(false)
  const needsSignIn = /sign in again/i.test(error || '')

  /*
   * Signing in again, in place.
   *
   * The sign-in screen used to be reachable only while setting up, so a
   * parent whose sign-in had expired had no way back short of wiping the
   * phone, which wiped the changes waiting to be sent with it. This keeps
   * everything: only the sign-in is replaced, and it must be the same
   * account, or this family's changes would be sent as somebody else.
   */
  if (signingIn) {
    const before = getSession()
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)' }}>
        {wrongAccount && (
          <p className="text-center text-sm px-5 pt-6" role="alert" style={{ color: 'var(--bad)' }}>
            That is a different account. Sign in with the one this family uses.
          </p>
        )}
        <SignIn
          startWith="signin"
          onBack={() => setSigningIn(false)}
          onDone={(session) => {
            if (before?.user?.id && session?.user?.id !== before.user.id) {
              setSession(before)
              setWrongAccount(true)
              return
            }
            setWrongAccount(false)
            setSigningIn(false)
            syncNow()
          }}
        />
      </div>
    )
  }

  if (!configured) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] ${className}`}
        style={{ color: 'var(--ink-muted)' }}
        title="No sync service is configured, so this device keeps its own data."
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ink-muted)' }} aria-hidden="true" />
        This device only
      </span>
    )
  }

  /*
   * Short, and true to the outbox (lib/sync/outbox.js): a change is saved on
   * this phone the moment it is made and sent, in order, whenever RankUp is
   * open and can reach the server. With no signal it waits, for as long as
   * it takes; nothing is dropped for being offline. A server that is having
   * trouble is tried again by itself, so there is nothing for anyone to do.
   */
  const saved = `${pending} saved on this phone`
  const look = {
    [SYNC_STATUS.IDLE]: { dot: 'var(--good)', text: pending ? `${pending} waiting to send` : 'Up to date' },
    [SYNC_STATUS.SYNCING]: { dot: 'var(--accent)', text: 'Syncing…' },
    [SYNC_STATUS.OFFLINE]: {
      dot: 'var(--warn)',
      text: pending ? `No internet · ${saved}` : 'No internet',
      hint: 'Everything is saved on this phone. It sends next time RankUp is open with internet.',
    },
    [SYNC_STATUS.ERROR]: {
      dot: 'var(--bad)',
      text: /sign in again/i.test(error || '')
        ? 'Sign in again to sync'
        : pending ? `Can’t sync yet · ${saved}` : 'Can’t sync yet',
      hint: /sign in again/i.test(error || '') ? null : 'Nothing is lost. RankUp keeps trying by itself.',
    },
  }[status] || { dot: 'var(--ink-muted)', text: '' }

  // Something already shown as done was turned down by the server. Say what,
  // once; tapping it clears it.
  if (notice) {
    return (
      <button
        type="button"
        onClick={() => dispatch({ type: 'CLEAR_SYNC_NOTICE' })}
        className={`inline-flex items-center gap-1.5 text-[11px] text-left ${className}`}
        style={{ color: 'var(--ink)' }}
        title="Tap to dismiss"
        role="status"
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--warn)' }} aria-hidden="true" />
        {notice.message}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={needsSignIn && state.device?.role !== 'kid' && transport.isConfigured() ? () => setSigningIn(true) : syncNow}
      className={`inline-flex items-center gap-1.5 text-[11px] ${className}`}
      style={{ color: 'var(--ink-muted)' }}
      title={look.hint || error || 'Tap to sync now'}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === SYNC_STATUS.SYNCING ? 'anim-pulse' : ''}`}
        style={{ background: look.dot }}
        aria-hidden="true"
      />
      {look.text}
    </button>
  )
}
