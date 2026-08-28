import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { guilds, guildError } from '../../lib/guilds.js'
import { relativeTime } from '../../lib/dates.js'
import { Screen, Card, Button, SectionTitle, Banner, TextInput, Select, Field, Chip, EmptyState } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

/**
 * The parent's side of guilds.
 *
 * This screen exists because of one rule: no child joins a guild until a parent
 * on each side has agreed. That makes a parent's inbox a required part of the
 * feature rather than a nicety — without somewhere to say yes, nobody can join
 * at all.
 */
export default function ParentGuilds() {
  const { state } = useApp()
  const [requests, setRequests] = useState([])
  const [reported, setReported] = useState([])
  const [kidId, setKidId] = useState(state.kids[0]?.id || '')
  const [name, setName] = useState('')
  const [created, setCreated] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [r, m] = await Promise.all([guilds.pendingRequests(), guilds.reportedMessages()])
    setRequests(r)
    setReported(m)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 20000)
    // Coming back to the tab is the moment a parent most expects to see a new
    // request, so refresh then too rather than waiting out the interval.
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', load)
    }
  }, [load])

  if (!guilds.available()) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-3">Guilds</h1>
        <Banner tone="warn" icon="🔌" title="Guilds need the sync service">
          A guild spans families, so it cannot work on one device. Connect a backend first —
          see docs/SYNC.md.
        </Banner>
        <Button variant="ghost" className="w-full mt-3" onClick={() => navigate('/parent/settings')}>
          Back to settings
        </Button>
      </Screen>
    )
  }

  const create = async () => {
    setBusy(true); setError('')
    const result = await guilds.create(kidId, name.trim())
    setBusy(false)
    if (!result.ok) { setError(guildError(result.reason)); return }
    setCreated(result)
    setName('')
    load()
  }

  const approve = async (req) => {
    setBusy(true); setError('')
    const result = await guilds.approveMember(req.guild_id, req.kid_id)
    setBusy(false)
    if (!result.ok) setError(guildError(result.reason))
    load()
  }

  const decline = async (req) => {
    setBusy(true)
    await guilds.leave(req.guild_id, req.kid_id)
    setBusy(false)
    load()
  }

  return (
    <Screen>
      <button type="button" onClick={() => navigate('/parent/settings')} className="text-sm text-muted mb-2">
        ← Settings
      </button>
      <h1 className="font-display text-2xl font-extrabold mb-1">Guilds</h1>
      <p className="text-sm text-muted mb-4">
        Guilds put your kid in touch with children in other families, so nothing happens without
        you.
      </p>

      <Banner tone="info" icon="🛡️" title="Both sides have to agree">
        A child joins only once their own parent and the guild owner's parent have both approved.
        Either of you can remove them at any time.
      </Banner>

      {error && <p className="text-sm mt-3" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}

      <div className="mt-4">
        <SectionTitle>Waiting for you</SectionTitle>
        {requests.length === 0 ? (
          <Card><p className="text-sm text-muted">Nothing to approve.</p></Card>
        ) : (
          requests.map((req) => {
            const mineDone = req.is_our_kid ? req.approved_by_own_parent : req.approved_by_owner
            return (
              <Card key={`${req.guild_id}-${req.kid_id}`} className="mb-2.5" style={{ borderColor: 'var(--warn)' }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">
                      {req.kid_name} → {req.guild_name}
                    </div>
                    <div className="text-xs text-muted">
                      {req.is_our_kid
                        ? 'Your kid wants to join this guild.'
                        : 'This child wants to join your kid\'s guild.'}
                      {' · '}{relativeTime(Date.parse(req.requested_at))}
                    </div>
                  </div>
                  {mineDone && <Chip tone="var(--good)">You approved</Chip>}
                </div>

                <p className="text-xs text-muted mb-3">
                  {req.approved_by_own_parent && req.approved_by_owner
                    ? 'Both parents have agreed.'
                    : mineDone
                      ? 'Waiting for the other parent.'
                      : 'Waiting for you and the other parent.'}
                </p>

                {!mineDone && (
                  <div className="flex gap-2">
                    <Button variant="soft" className="flex-1 py-2 min-h-0 text-sm" disabled={busy}
                            onClick={() => decline(req)}>
                      Decline
                    </Button>
                    <Button className="flex-1 py-2 min-h-0 text-sm" disabled={busy} onClick={() => approve(req)}>
                      Approve
                    </Button>
                  </div>
                )}
              </Card>
            )
          })
        )}
      </div>

      <div className="mt-4">
        <SectionTitle>Reported messages</SectionTitle>
        {reported.length === 0 ? (
          <Card><p className="text-sm text-muted">Nothing has been reported.</p></Card>
        ) : (
          reported.map((m) => (
            <Card key={m.id} flat className="mb-2" style={{ borderColor: 'var(--bad)' }}>
              <div className="text-xs text-muted mb-1">
                {m.author} in {m.guild_name} · reported {relativeTime(Date.parse(m.reported_at))}
              </div>
              <p className="text-sm">“{m.body}”</p>
            </Card>
          ))
        )}
        <p className="text-xs text-muted mt-1">
          Reported messages are hidden from the children immediately and shown only here.
        </p>
      </div>

      <div className="mt-4">
        <SectionTitle>Start a guild</SectionTitle>
        {created ? (
          <Card style={{ borderColor: 'var(--good)' }}>
            <p className="text-sm mb-2">Created. Share this code with the other family:</p>
            <div className="font-mono font-extrabold text-2xl tracking-[0.2em] text-center py-2 select-all"
                 style={{ color: 'var(--accent)' }}>
              {created.invite_code}
            </div>
            <Button variant="soft" className="w-full mt-2" onClick={() => setCreated(null)}>Done</Button>
          </Card>
        ) : state.kids.length === 0 ? (
          <EmptyState icon="👶" title="Add a kid first" />
        ) : (
          <Card>
            <Field label="For which kid">
              <Select value={kidId} onChange={(e) => setKidId(e.target.value)}>
                {state.kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </Select>
            </Field>
            <Field label="Guild name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Bookworms" />
            </Field>
            <Button className="w-full" disabled={!name.trim() || !kidId || busy} onClick={create}>
              {busy ? 'Creating…' : 'Create guild'}
            </Button>
          </Card>
        )}
      </div>
    </Screen>
  )
}
