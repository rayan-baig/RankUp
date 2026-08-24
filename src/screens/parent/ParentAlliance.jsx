import { useMemo, useState } from 'react'
import { useApp, useElite } from '../../state/AppContext.jsx'
import { lastSevenDays } from '../../lib/dates.js'
import { TIERS } from '../../state/initialState.js'
import { Screen, Card, Button, SectionTitle, Banner, DemoTag, Chip, TextInput, Modal, ProgressBar } from '../../components/ui.jsx'
import EliteGate from '../../components/EliteGate.jsx'

/**
 * The 20% Discount Tournament.
 *
 * Parents form 10-player alliances and compete on a monthly leaderboard for a
 * 20% group billing discount that cannot be bought.
 *
 * The other nine alliance members are sample data. A real tournament needs a
 * shared server, real accounts, and — because the prize is money off a real
 * subscription — a billing system that can actually apply the discount. All
 * three are still to build; see docs/BACKEND.md and docs/PAYMENTS.md.
 */
export default function ParentAlliance() {
  const { state, dispatch } = useApp()
  const elite = useElite()
  const [joinOpen, setJoinOpen] = useState(false)
  const [name, setName] = useState('')

  const myScore = useMemo(() => {
    const week = new Set(lastSevenDays())
    const events = state.events.filter((e) => week.has(e.day))
    const approved = events.filter((e) => e.type === 'quest_approved').length
    const rejected = events.filter((e) => e.type === 'quest_rejected').length
    const decided = approved + rejected
    const approvalRate = decided ? Math.round((approved / decided) * 100) : 0
    const streakDays = Math.max(0, ...state.kids.map((k) => k.streak.count))
    return { questsApproved: approved, approvalRate, streakDays }
  }, [state.events, state.kids])

  if (!elite) {
    return (
      <EliteGate
        icon="🏆"
        title="The 20% Discount Tournament"
        body="Form 10-player Parent Alliances and compete on a local leaderboard for an unpurchasable 20% Group Billing Discount, awarded at the end of each month."
      />
    )
  }

  const me = {
    id: 'me',
    name: state.family.name || 'Your family',
    ...myScore,
    demo: false,
  }
  const members = [me, ...state.alliance.demoMembers]
  const ranked = [...members].sort(
    (a, b) => b.questsApproved - a.questsApproved || b.approvalRate - a.approvalRate,
  )
  const myRank = ranked.findIndex((m) => m.id === 'me') + 1
  const leader = ranked[0]
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })
  const discounted = (TIERS.elite.price * 0.8).toFixed(2)

  if (!state.alliance.joined) {
    return (
      <Screen>
        <header className="mb-3">
          <p className="text-xs uppercase tracking-widest text-muted">Elite · Tournament</p>
          <h1 className="font-display text-2xl font-extrabold">Parent Alliances</h1>
        </header>

        <Card className="mb-3 text-center">
          <div className="text-4xl mb-2" aria-hidden="true">🏆</div>
          <h2 className="font-display font-bold text-lg mb-1">Win 20% off, permanently earned</h2>
          <p className="text-sm text-muted">
            Ten parent accounts form an alliance. At the end of each month the top-ranked alliance
            member's whole group gets a 20% Group Billing Discount — ${discounted}/mo instead of
            ${TIERS.elite.price}. It cannot be bought, only won.
          </p>
        </Card>

        <Banner tone="warn" icon="⚠️" title="Not a working competition yet">
          Other members are sample data and no discount is actually applied to any bill — there is no
          billing system connected. This screen shows the design, not a live tournament.
        </Banner>

        <Button className="w-full mt-3" onClick={() => setJoinOpen(true)}>Create an alliance</Button>

        <Modal
          open={joinOpen}
          onClose={() => setJoinOpen(false)}
          title="Name your alliance"
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setJoinOpen(false)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={!name.trim()}
                onClick={() => {
                  dispatch({ type: 'JOIN_ALLIANCE', name: name.trim() })
                  setJoinOpen(false)
                }}
              >
                Create
              </Button>
            </>
          }
        >
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Northside Ten" autoFocus />
        </Modal>
      </Screen>
    )
  }

  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">Elite · {monthName} tournament</p>
        <h1 className="font-display text-2xl font-extrabold">{state.alliance.name}</h1>
        <p className="text-sm text-muted">{members.length} of 10 parents · you are #{myRank}</p>
      </header>

      <Card className="mb-3">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold">Race to first place</span>
          <span className="text-muted">
            {me.questsApproved} / {leader.questsApproved || 1} approved quests
          </span>
        </div>
        <ProgressBar value={me.questsApproved} max={Math.max(1, leader.questsApproved)} height={12} label="Tournament progress" />
        <p className="text-xs text-muted mt-2">
          {myRank === 1
            ? `You are leading. Hold it to the end of ${monthName} to win the group discount.`
            : `${leader.questsApproved - me.questsApproved} more approved quests would take the lead.`}
        </p>
      </Card>

      <Banner tone="warn" icon="⚠️" title="Sample opponents">
        The nine other families below are sample data, and no discount is applied to any real bill.
      </Banner>

      <SectionTitle>Leaderboard</SectionTitle>
      <Card className="p-0 overflow-hidden mb-3">
        {ranked.map((m, i) => (
          <div
            key={m.id}
            className="flex items-center gap-3 px-3.5 py-3"
            style={{
              borderBottom: i < ranked.length - 1 ? '1px solid var(--line)' : 'none',
              background: m.id === 'me' ? 'var(--surface-2)' : 'transparent',
            }}
          >
            <span className="w-6 text-center font-display font-extrabold text-sm" style={{ color: i === 0 ? 'var(--accent)' : 'var(--ink-muted)' }}>
              {i === 0 ? '🥇' : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm truncate">{m.name}</span>
                {m.id === 'me' && <Chip tone="var(--accent)">You</Chip>}
                {m.demo && <DemoTag>Sample</DemoTag>}
              </div>
              <div className="text-xs text-muted">
                {m.approvalRate}% approval · {m.streakDays}-day best streak
              </div>
            </div>
            <span className="font-display font-bold text-sm shrink-0">{m.questsApproved}</span>
          </div>
        ))}
      </Card>

      <Card className="mb-3">
        <SectionTitle>Grand prize</SectionTitle>
        <p className="text-sm">
          20% Group Billing Discount for every member of the winning alliance — ${discounted}/mo
          instead of ${TIERS.elite.price}, for the following month. Unpurchasable by design.
        </p>
      </Card>

      <Button variant="ghost" className="w-full" onClick={() => dispatch({ type: 'LEAVE_ALLIANCE' })}>
        Leave alliance
      </Button>
    </Screen>
  )
}
