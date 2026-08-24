import { useMemo, useState } from 'react'
import { useApp, useKid, useElite, guildCapacity } from '../../state/AppContext.jsx'
import { levelFromXp, formatXp } from '../../lib/xp.js'
import { lastSevenDays, relativeTime } from '../../lib/dates.js'
import { Screen, Card, Button, SectionTitle, ProgressBar, DemoTag, Banner, TextInput, Modal, Chip } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

/**
 * The guild.
 *
 * Real guilds — where your kid and their actual classmate on another phone see
 * the same roster and the same leaderboard — need a shared database. That does
 * not exist yet, so everyone outside this family is labelled sample data and
 * invites are recorded locally rather than sent. See docs/BACKEND.md.
 */
export default function KidGuild() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const elite = useElite()
  const capacity = guildCapacity(state)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [message, setMessage] = useState('')

  const weeklyXp = useMemo(() => {
    const week = new Set(lastSevenDays())
    const perKid = {}
    state.events.forEach((e) => {
      if (e.type === 'quest_approved' && week.has(e.day)) {
        perKid[e.kidId] = (perKid[e.kidId] || 0) + (e.meta?.xp || 0)
      }
    })
    return perKid
  }, [state.events])

  if (!kid) return null

  const realMembers = state.kids.map((k) => ({
    id: k.id,
    name: k.name,
    level: levelFromXp(k.xp).level,
    weeklyXp: weeklyXp[k.id] || 0,
    demo: false,
    isYou: k.id === kid.id,
  }))

  const invited = state.guild.invitedMates.map((m) => ({ ...m, level: 1, weeklyXp: 0 }))
  const filledSlots = realMembers.length + invited.length
  const demoFill = state.guild.demoMates.slice(0, Math.max(0, capacity - filledSlots))
  const roster = [...realMembers, ...invited, ...demoFill].sort((a, b) => b.weeklyXp - a.weeklyXp)
  // The goal bar counts only real family members. Letting sample guild-mates fill
  // it would make a fake number look like progress.
  const guildXp = realMembers.reduce((sum, m) => sum + m.weeklyXp, 0)

  const send = () => {
    if (!message.trim()) return
    dispatch({ type: 'POST_GUILD_MESSAGE', message: { author: kid.name, kidId: kid.id, text: message.trim() } })
    setMessage('')
  }

  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">Guild</p>
        <h1 className="font-display text-2xl font-extrabold">{state.guild.crest} {state.guild.name || 'Your Guild'}</h1>
      </header>

      <Card className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>Weekly guild goal</SectionTitle>
          <span className="text-xs text-muted">{formatXp(guildXp)} / {formatXp(state.guild.weeklyGoalXp)} XP</span>
        </div>
        <ProgressBar value={guildXp} max={state.guild.weeklyGoalXp} height={12} label="Guild weekly goal" />
        <p className="text-xs text-muted mt-2">
          Every approved quest from a real guild member adds to the same bar. Sample guild-mates
          below do not count toward it.
        </p>
      </Card>

      <SectionTitle
        action={
          <span className="text-xs text-muted">
            {filledSlots}/{capacity} real slots
          </span>
        }
      >
        Roster
      </SectionTitle>

      <Card className="mb-3 p-0 overflow-hidden">
        {roster.map((m, i) => (
          <div
            key={m.id}
            className="flex items-center gap-3 px-3.5 py-3"
            style={{ borderBottom: i < roster.length - 1 ? '1px solid var(--line)' : 'none', background: m.isYou ? 'var(--surface-2)' : 'transparent' }}
          >
            <span className="w-6 text-center font-display font-extrabold text-sm text-muted">{i + 1}</span>
            <span
              className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-bold text-sm"
              style={{ background: `hsl(${m.avatarHue ?? 200} 60% 45%)`, color: '#fff' }}
              aria-hidden="true"
            >
              {m.name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm truncate">{m.name}</span>
                {m.isYou && <Chip tone="var(--accent)">You</Chip>}
                {m.demo && <DemoTag>Sample</DemoTag>}
                {m.status === 'invited' && <Chip tone="var(--warn)">Invite pending</Chip>}
              </div>
              <div className="text-xs text-muted">Level {m.level}</div>
            </div>
            <span className="font-display font-bold text-sm shrink-0">{formatXp(m.weeklyXp)} XP</span>
          </div>
        ))}
      </Card>

      {filledSlots < capacity ? (
        <Button variant="soft" className="w-full mb-3" onClick={() => setInviteOpen(true)}>
          + Invite a classmate ({capacity - filledSlots} slots left)
        </Button>
      ) : (
        <Banner tone="warn" icon="👥" title="Guild is full">
          {elite
            ? 'All 10 Megacluster slots are taken.'
            : 'Standard guilds hold 5. Elite Pass doubles it to a 10-Player Megacluster Guild.'}
        </Banner>
      )}

      {!elite && (
        <Card className="mb-3" style={{ borderColor: 'var(--accent-2)' }}>
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">👥</span>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm">10-Player Megacluster Guilds</div>
              <p className="text-xs text-muted mb-2">
                Elite Pass doubles the clan from 5 slots to 10, so a squad leader can invite more real-world classmates.
              </p>
              <Button variant="soft" className="px-3 py-2 min-h-0 text-xs" onClick={() => navigate('/parent/plan')}>
                See Elite Pass
              </Button>
            </div>
          </div>
        </Card>
      )}

      <SectionTitle>Guild chat</SectionTitle>
      <Card className="mb-3">
        <Banner tone="warn" icon="ℹ️" title="Only on this device">
          Messages stay on this phone. Real chat between two kids needs a shared server.
        </Banner>
        <div className="max-h-56 overflow-y-auto my-3 space-y-2">
          {state.guild.chat.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
          {state.guild.chat.map((m) => (
            <div key={m.id} className="card-flat p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{m.author}</span>
                <span className="text-[10px] text-muted">{relativeTime(m.at)}</span>
              </div>
              <p className="text-sm">{m.text}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <TextInput value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say something…" onKeyDown={(e) => e.key === 'Enter' && send()} />
          <Button className="px-4" onClick={send}>Send</Button>
        </div>
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a classmate"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={!inviteName.trim()}
              onClick={() => {
                dispatch({ type: 'INVITE_MATE', name: inviteName.trim() })
                setInviteName('')
                setInviteOpen(false)
              }}
            >
              Save invite
            </Button>
          </>
        }
      >
        <Banner tone="warn" icon="⚠️" title="Nothing is sent yet">
          Invites are stored on this device only. Sending a real invite to another family needs
          accounts and a shared server — and, for a kids' app, verified parental consent first.
        </Banner>
        <div className="mt-3">
          <TextInput value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Classmate's first name" />
        </div>
      </Modal>
    </Screen>
  )
}
