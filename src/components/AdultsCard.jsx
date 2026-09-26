import { useEffect, useState } from 'react'
import { adults, adultError, inviteText } from '../lib/coparents.js'
import { Card, Button, Banner } from './ui.jsx'

/**
 * Who else is in this family, and how to add one.
 *
 * Deliberately shows the whole picture at once — the people who are in, and
 * the invitations still out. An invitation you cannot see is an invitation you
 * cannot cancel, and "I sent it to the wrong number" is the single most likely
 * thing to go wrong here.
 *
 * Remove only appears for the owner, and never against themselves. Both rules
 * are enforced in the database as well; this is only so nobody is offered a
 * button that is going to refuse them.
 */
export default function AdultsCard() {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const refresh = () => adults.list().then(setInfo)
  useEffect(() => {
    let alive = true
    adults.list().then((r) => { if (alive) setInfo(r) })
    return () => { alive = false }
  }, [])

  if (!info?.adults) return null

  const me = (info.adults || []).find((a) => a.isMe)
  const iAmOwner = Boolean(me?.isOwner)
  const used = (info.adults?.length || 0) + (info.invites?.length || 0)
  const full = used >= (info.max || 6)

  const act = async (fn) => {
    setBusy(true)
    setError('')
    const res = await fn()
    setBusy(false)
    if (!res?.ok) setError(adultError(res?.reason))
    await refresh()
    return res
  }

  const share = async (code) => {
    const text = inviteText(code)
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
      setCopied(code)
      setTimeout(() => setCopied(''), 2500)
    } catch {
      setCopied('')
    }
  }

  return (
    <Card className="mb-4">
      <h2 className="font-display font-extrabold text-base mb-1">Grown-ups</h2>
      <p className="text-sm text-muted mb-3">
        Another parent can approve chores and see everything from their own
        phone. It costs nothing extra.
      </p>

      <ul className="mb-3">
        {info.adults.map((a) => (
          <li key={a.id} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-sm">{a.name}</span>
              {a.isMe && <span className="text-xs text-muted"> · you</span>}
              {a.isOwner && <span className="text-xs text-muted"> · set this up</span>}
            </span>
            {iAmOwner && !a.isOwner && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => act(() => adults.remove(a.id))}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>

      {(info.invites || []).map((i) => (
        <div key={i.code} className="flex items-center gap-2 py-1.5">
          <code className="font-display font-extrabold tracking-[0.2em] flex-1">{i.code}</code>
          <Button variant="soft" onClick={() => share(i.code)}>
            {copied === i.code ? 'Copied' : 'Send'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => act(() => adults.revoke(i.code))}>
            Cancel
          </Button>
        </div>
      ))}

      {!full && (
        <Button
          className="w-full mt-2"
          disabled={busy}
          onClick={() => act(() => adults.invite())}
        >
          {busy ? '…' : 'Invite another grown-up'}
        </Button>
      )}

      {full && (
        <p className="text-sm text-muted mt-2">
          That is as many grown-ups as one family can hold.
        </p>
      )}

      {error && (
        <Banner tone="bad" icon="⚠️" title="That did not work" className="mt-3">
          {error}
        </Banner>
      )}
    </Card>
  )
}
