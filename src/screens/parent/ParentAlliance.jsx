import { useCallback, useEffect, useState } from 'react'
import { useElite } from '../../state/AppContext.jsx'
import { TIERS } from '../../state/initialState.js'
import { alliances, allianceError } from '../../lib/alliances.js'
import { Screen, Card, Button, SectionTitle, Banner, Chip, TextInput, Modal, ProgressBar } from '../../components/ui.jsx'
import EliteGate from '../../components/EliteGate.jsx'

/**
 * The 20% Discount Tournament.
 *
 * Up to ten FAMILIES form an alliance and compete on a monthly leaderboard. The
 * family that has the most quests approved that month gets 20% off their next
 * invoice. It cannot be bought, only won.
 *
 * Nothing on this screen is computed in the browser. The standings come from
 * alliance_standings(), which counts approved submissions server-side, because
 * a client that could report its own score could award itself a discount. What
 * crosses the family boundary is a name and a number — there is no chat here
 * and no way to reach another family's child.
 */
export default function ParentAlliance() {
  const elite = useElite()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await alliances.standings()
    if (!res.ok) setError(allianceError(res.reason))
    else { setError(''); setData(res) }
    setLoading(false)
  }, [])

  useEffect(() => { if (elite) refresh() }, [elite, refresh])

  const act = async (fn) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(allianceError(res.reason)); return false }
    setError('')
    setCreateOpen(false)
    setJoinOpen(false)
    await refresh()
    return true
  }

  if (!elite) {
    return (
      <EliteGate
        icon="🏆"
        title="The 20% Discount Tournament"
        body="Form a ten-family Parent Alliance and compete on a monthly leaderboard. The family with the most approved quests wins 20% off the following month — earned, not bought."
      />
    )
  }

  const discounted = (TIERS.elite.price * 0.8).toFixed(2)
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })
  const standings = data?.standings || []
  const alliance = data?.alliance || null
  const myIndex = standings.findIndex((m) => m.you)
  const leader = standings[0]
  const me = myIndex >= 0 ? standings[myIndex] : null

  // ---------------------------------------------------------------- not in one
  if (!loading && !alliance) {
    return (
      <Screen>
        <header className="mb-3">
          <p className="text-xs uppercase tracking-widest text-muted">Elite · Tournament</p>
          <h1 className="font-display text-2xl font-extrabold">Parent Alliances</h1>
        </header>

        <Card className="mb-3 text-center">
          <div className="text-4xl mb-2" aria-hidden="true">🏆</div>
          <h2 className="font-display font-bold text-lg mb-1">Win 20% off, earned not bought</h2>
          <p className="text-sm text-muted">
            Up to ten families form an alliance. Whoever has the most quests approved by the end of
            the month gets 20% off their next bill — ${discounted} instead of ${TIERS.elite.price}.
            No chat, no contact between families: a name and a score, nothing else.
          </p>
        </Card>

        {error && <Banner tone="warn" icon="⚠️" title="Not right now">{error}</Banner>}

        <Button className="w-full mt-3" disabled={busy} onClick={() => setCreateOpen(true)}>
          Start an alliance
        </Button>
        <Button variant="soft" className="w-full mt-2" disabled={busy} onClick={() => setJoinOpen(true)}>
          I have an invite code
        </Button>

        <Modal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Name your alliance"
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!name.trim() || busy}
                      onClick={() => act(() => alliances.create(name.trim()))}>
                Create
              </Button>
            </>
          }
        >
          <TextInput value={name} onChange={(e) => setName(e.target.value)}
                     placeholder="e.g. The Northside Ten" autoFocus />
          <p className="text-xs text-muted mt-2">
            You will get a six-letter code to pass to the other parents.
          </p>
        </Modal>

        <Modal
          open={joinOpen}
          onClose={() => setJoinOpen(false)}
          title="Join an alliance"
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setJoinOpen(false)}>Cancel</Button>
              <Button className="flex-1" disabled={code.trim().length !== 6 || busy}
                      onClick={() => act(() => alliances.join(code))}>
                Join
              </Button>
            </>
          }
        >
          <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                     placeholder="ABC234" maxLength={6} autoFocus
                     style={{ letterSpacing: '0.3em', textAlign: 'center', textTransform: 'uppercase' }} />
        </Modal>
      </Screen>
    )
  }

  // -------------------------------------------------------------------- in one
  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">Elite · {monthName} tournament</p>
        <h1 className="font-display text-2xl font-extrabold">{alliance?.name || 'Your alliance'}</h1>
        <p className="text-sm text-muted">
          {standings.length} of {alliance?.capacity || 10} families
          {myIndex >= 0 && ` · you are #${myIndex + 1}`}
        </p>
      </header>

      {loading && <Card className="mb-3"><p className="text-sm text-muted">Loading the standings…</p></Card>}
      {error && <Banner tone="warn" icon="⚠️" title="Not right now">{error}</Banner>}

      {me && leader && (
        <Card className="mb-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold">Race to first place</span>
            <span className="text-muted">{me.score} / {leader.score || 1} approved quests</span>
          </div>
          <ProgressBar value={me.score} max={Math.max(1, leader.score)} height={12}
                       label="Tournament progress" />
          <p className="text-xs text-muted mt-2">
            {myIndex === 0
              ? `You are leading. Hold it to the end of ${monthName} to win.`
              : `${leader.score - me.score} more approved quests would take the lead.`}
          </p>
        </Card>
      )}

      <SectionTitle>Leaderboard</SectionTitle>
      <Card className="p-0 overflow-hidden mb-3">
        {standings.map((m, i) => (
          <div
            key={`${m.name}-${i}`}
            className="flex items-center gap-3 px-3.5 py-3"
            style={{
              borderBottom: i < standings.length - 1 ? '1px solid var(--line)' : 'none',
              background: m.you ? 'var(--surface-2)' : 'transparent',
            }}
          >
            <span className="w-6 text-center font-display font-extrabold text-sm"
                  style={{ color: i === 0 ? 'var(--accent)' : 'var(--ink-muted)' }}>
              {i === 0 ? '🥇' : i + 1}
            </span>
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <span className="font-semibold text-sm truncate">{m.name}</span>
              {m.you && <Chip tone="var(--accent)">You</Chip>}
            </div>
            <span className="font-display font-bold text-sm shrink-0">{m.score}</span>
          </div>
        ))}
      </Card>

      {data?.last_award && (
        <Card className="mb-3">
          <SectionTitle>Last month</SectionTitle>
          <p className="text-sm">
            <strong>{data.last_award.name}</strong> won {data.last_award.month} with{' '}
            {data.last_award.score} approved quests.{' '}
            {data.last_award.applied
              ? 'The discount has been applied.'
              : 'The discount is queued and will appear on the next invoice.'}
          </p>
        </Card>
      )}

      <Card className="mb-3">
        <SectionTitle>Invite code</SectionTitle>
        <p className="font-mono text-2xl font-bold tracking-[0.3em] text-center py-2">
          {alliance?.invite_code}
        </p>
        <p className="text-xs text-muted text-center">
          Give this to another parent. Ten families maximum.
        </p>
      </Card>

      <Card className="mb-3">
        <SectionTitle>Grand prize</SectionTitle>
        <p className="text-sm">
          20% off the winning family's next month — ${discounted} instead of ${TIERS.elite.price}.
          Ranked on quests approved, not XP, so the plan with the bigger XP boost cannot buy the win.
        </p>
      </Card>

      <Button variant="ghost" className="w-full" disabled={busy}
              onClick={() => act(() => alliances.leave())}>
        Leave alliance
      </Button>
    </Screen>
  )
}
