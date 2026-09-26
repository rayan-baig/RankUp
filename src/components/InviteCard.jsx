import { useEffect, useState } from 'react'
import { referrals, referralError, shareText, normalizeCode } from '../lib/referrals.js'
import { Card, Button, TextInput, Banner } from './ui.jsx'

/**
 * Both halves of a referral in one card: the code to give away, and the box to
 * type somebody else's into.
 *
 * They are together on purpose. Split across two screens, the second half is
 * never found — the moment a parent has a friend's code in their hand is
 * exactly the moment they are looking at the first half.
 *
 * The number shown is deliberately the one that has actually paid out, not the
 * number of people who typed the code in. Saying "3 friends joined" while the
 * reward says 1 month is how a growth feature starts feeling like a trick.
 */
export default function InviteCard() {
  const [info, setInfo] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    referrals.mine().then((r) => { if (alive) setInfo(r) })
    return () => { alive = false }
  }, [])

  // Nothing to offer without a backend, and a code nobody can claim is worse
  // than no card at all.
  if (!info?.code) return null

  const days = info.days || 30
  const qualified = Number(info.qualified || 0)

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
    <Card className="mb-4">
      <h2 className="font-display font-extrabold text-base mb-1">
        Give a friend {days} days
      </h2>
      <p className="text-sm text-muted mb-3">
        They get {days} days free. You get {days} days free too — the day their
        child finishes their first chore.
      </p>

      <div className="flex items-center gap-2 mb-2">
        <code className="font-display text-2xl font-extrabold tracking-[0.2em] flex-1">
          {info.code}
        </code>
        <Button onClick={share}>{copied ? 'Copied' : 'Share'}</Button>
      </div>

      {qualified > 0 && (
        <p className="text-sm text-muted mb-1">
          {qualified === 1
            ? '1 family you invited has earned you a free month.'
            : `${qualified} families you invited have earned you free months.`}
        </p>
      )}

      {!info.referred && (
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
