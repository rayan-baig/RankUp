import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { referrals, referralError, shareText, normalizeCode, inviteSummary, rewardNotice } from '../lib/referrals.js'
import { Card, Button, TextInput, Banner } from './ui.jsx'

/**
 * "Invite a family, get a free month": the code to give away, what it has
 * come to, and the box to type somebody else's into.
 *
 * They are together on purpose. Split across two screens, the second half is
 * never found — the moment a parent has a friend's code in their hand is
 * exactly the moment they are looking at the first half.
 *
 * What it shows about other families is counts and nothing else: how many
 * joined with the code and how many pay. Never a name, an email or which
 * family; the database does not hand this phone any of that
 * (my_referrals, supabase/referrals.sql).
 *
 * A parent's screen only. A child's phone never shows it: the database answers
 * a child with nothing, and the card is only in Parent Mode.
 *
 * `compact` is the plan screen's copy: the code and the free months, without
 * the box for someone else's code.
 */
export default function InviteCard({ compact = false }) {
  const { state } = useApp()
  const [info, setInfo] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const kidPhone = state.device?.role === 'kid'

  useEffect(() => {
    if (kidPhone || state.demo) return undefined
    let alive = true
    referrals.mine().then((r) => { if (alive) setInfo(r) })
    return () => { alive = false }
  }, [kidPhone, state.demo])

  // Nothing to offer without a backend, and a code nobody can claim is worse
  // than no card at all.
  if (kidPhone || !info?.code) return null

  const days = info.days || 30
  const { joined, rewards } = inviteSummary(info)

  const share = async () => {
    const text = shareText(info.code, days)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'RankUp', text })
        return
      }
    } catch {
      // A cancelled share sheet lands here. Fall through to the clipboard.
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  const claim = async () => {
    setBusy(true)
    const res = await referrals.claim(code)
    setBusy(false)
    setResult(res)
    if (res.ok) {
      setCode('')
      referrals.mine().then(setInfo)
    }
  }

  return (
    <Card className="mb-4" data-testid={compact ? 'invite-card-plan' : 'invite-card'}>
      <h2 className="font-display font-extrabold text-base mb-1">
        Invite a family, get a free month
      </h2>
      <p className="text-sm text-muted mb-3">
        When a family you invite starts paying, a month of your plan is free. They get {days} days
        free once their child finishes a first chore.
      </p>

      <div className="flex items-center gap-2 mb-2">
        <code className="font-display text-2xl font-extrabold tracking-[0.2em] flex-1" data-testid="invite-code">
          {info.code}
        </code>
        <Button onClick={share}>{copied ? 'Copied' : 'Share'}</Button>
      </div>

      <div data-testid="invite-counts">
        <p className="text-sm mb-1">
          {joined || 'No families have joined with your code yet.'}
        </p>
        {rewards.map((r) => (
          <p key={r.id} className="text-sm text-muted mb-1" data-testid={`invite-${r.id}`}>{r.text}</p>
        ))}
      </div>

      {!compact && (
        <p className="text-xs text-muted mt-2">
          One free month for each family that pays, up to {info.cap || 12} a year. Not for a second family of your own.
          If their first payment is refunded within {info.refund_days || 14} days, an unused free month is taken back.
        </p>
      )}

      {!compact && !info.referred && (
        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
          <p className="text-sm font-semibold mb-2">Got a code from someone?</p>
          <div className="flex items-center gap-2">
            <TextInput
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="HJ4K2P"
              aria-label="Invite code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="field tracking-[0.2em] uppercase"
            />
            <Button variant="soft" onClick={claim} disabled={busy || code.length < 6}>
              {busy ? '…' : 'Use it'}
            </Button>
          </div>
          {result && !result.ok && (
            <p className="text-sm mt-2" style={{ color: 'var(--bad)' }}>
              {referralError(result.reason)}
            </p>
          )}
        </div>
      )}

      {result?.ok && (
        <Banner tone="good" icon="🎁" title={`${days} days on the way`} className="mt-3">
          It starts the day your child finishes their first chore — so go and set
          one.
        </Banner>
      )}
    </Card>
  )
}

/**
 * "You earned a free month", once, on the parent's dashboard. Seen on one
 * phone is seen for the family (see_referral_rewards). Never on a child's
 * phone, never in the look-around, and never by email.
 */
export function ReferralRewardNotice() {
  const { state } = useApp()
  const [info, setInfo] = useState(null)
  const kidPhone = state.device?.role === 'kid'

  useEffect(() => {
    if (kidPhone || state.demo) return undefined
    let alive = true
    referrals.mine().then((r) => { if (alive) setInfo(r) })
    return () => { alive = false }
  }, [kidPhone, state.demo])

  const notice = kidPhone ? null : rewardNotice(info)
  if (!notice) return null
  const dismiss = () => {
    setInfo({ ...info, unseen: 0 })
    referrals.seen()
  }
  return (
    <Banner tone="good" icon="🎁" title={notice.title} className="mb-3"
            action={<button type="button" className="text-xs underline" onClick={dismiss}>OK</button>}>
      <span data-testid="referral-reward-notice">{notice.body}</span>
    </Banner>
  )
}
