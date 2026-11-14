import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, useKid, useElite } from '../../state/AppContext.jsx'
import { guilds, guildError } from '../../lib/guilds.js'
import { levelFromXp, formatXp } from '../../lib/xp.js'
import { relativeTime } from '../../lib/dates.js'
import { Screen, Card, Button, SectionTitle, ProgressBar, Banner, TextInput, Chip, EmptyState } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'
import QuickChat from '../../components/QuickChat.jsx'
import { quickChatText, isQuickEmoji } from '../../data/quickChat.js'

/*
 * Children muted on this phone: their messages are not shown here. Per child,
 * on this phone only; a parent still sees anything reported.
 */
const muteKey = (kidId) => `rankup:guild-muted:${kidId}`
function readMuted(kidId) {
  try { const v = JSON.parse(localStorage.getItem(muteKey(kidId)) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function writeMuted(kidId, list) {
  try { localStorage.setItem(muteKey(kidId), JSON.stringify(list)) } catch { /* private window */ }
}

/**
 * The guild, for real.
 *
 * Everyone here is a genuine child in another family, which is why joining is
 * a request rather than an action: it does not take effect until a parent on
 * each side has agreed. Until then this screen says so plainly rather than
 * showing a roster that is not yet real.
 *
 * Chat is quick chat only: a child taps a ready-made message and its id is
 * sent, never words (src/data/quickChat.js, post_quick_chat). There is no
 * text box anywhere in a child's guild, so no child types to a child in
 * another family. Report and Mute stay on every message.
 */
export default function KidGuild() {
  const { dispatch } = useApp()
  const kid = useKid()
  const elite = useElite()
  const [state, setState] = useState({ loading: true })
  const [code, setCode] = useState('')
  const [muted, setMuted] = useState(() => (kid ? readMuted(kid.id) : []))
  const chatBox = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!kid) return
    if (!guilds.available()) {
      setState({ loading: false, unavailable: true })
      return
    }
    const mine = await guilds.mine(kid.id)
    if (!mine.ok || !mine.guild) {
      setState({ loading: false, guild: null })
      return
    }
    if (mine.status === 'invited') {
      setState({ loading: false, guild: mine.guild, pending: true })
      return
    }
    const [roster, chat] = await Promise.all([
      guilds.roster(mine.guild.id, kid.id),
      guilds.messages(mine.guild.id, kid.id),
    ])
    setState({
      loading: false,
      guild: roster.ok ? roster.guild : mine.guild,
      members: roster.members || [],
      messages: chat.messages || [],
    })
  }, [kid])

  // The newest message in view, as in any chat.
  const newest = state.messages?.[state.messages.length - 1]?.id
  useEffect(() => {
    if (chatBox.current) chatBox.current.scrollTop = chatBox.current.scrollHeight
  }, [newest])

  useEffect(() => {
    load()
    const t = setInterval(load, 12000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', load)
    }
  }, [load])

  if (!kid) return null

  const act = async (fn) => {
    setBusy(true)
    setError('')
    const result = await fn()
    setBusy(false)
    if (!result.ok) setError(guildError(result.reason))
    else await load()
    return result
  }

  /* ---------- no backend ---------- */
  if (state.unavailable) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-3">Guild</h1>
        <Banner tone="warn" icon="🔌" title="Guilds need the sync service">
          A guild connects you to kids in other families, so it cannot work on one device alone.
          Ask a grown-up to connect this phone.
        </Banner>
      </Screen>
    )
  }

  if (state.loading) {
    return <Screen><p className="text-muted py-10 text-center">Loading your guild…</p></Screen>
  }

  /* ---------- waiting on parents ---------- */
  if (state.pending) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-1">{state.guild.crest} {state.guild.name}</h1>
        <p className="text-sm text-muted mb-4">You asked to join.</p>
        <Card style={{ borderColor: 'var(--warn)' }}>
          <div className="text-center py-4">
            <div className="text-4xl mb-2" aria-hidden="true">⏳</div>
            <h2 className="font-display font-bold mb-1">Waiting for two grown-ups</h2>
            <p className="text-sm text-muted">
              Your grown-up has to say yes, and so does the grown-up who runs the guild. You will
              see everyone once they both do.
            </p>
          </div>
        </Card>
        <Button variant="ghost" className="w-full mt-3" disabled={busy}
                onClick={() => act(() => guilds.leave(state.guild.id, kid.id))}>
          Cancel my request
        </Button>
      </Screen>
    )
  }

  /* ---------- not in a guild ---------- */
  if (!state.guild) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-1">Guild</h1>
        <p className="text-sm text-muted mb-4">
          Team up with friends so chores count toward something together.
        </p>

        <Card className="mb-3">
          <SectionTitle>Join with a code</SectionTitle>
          <p className="text-xs text-muted mb-3">
            Six letters and numbers from a friend. Your grown-up and theirs both have to say yes.
          </p>
          <TextInput
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setError('') }}
            placeholder="e.g. K7M2QP"
            className="font-mono tracking-[0.2em] text-center"
            autoCapitalize="characters"
          />
          {error && <p className="text-sm mt-2" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}
          <Button className="w-full mt-3" disabled={code.length < 6 || busy}
                  onClick={() => act(async () => {
                    const result = await guilds.requestJoin(kid.id, code)
                    // The parents on both sides have to say yes: tell them.
                    if (result.ok) {
                      dispatch({ type: 'GUILD_JOIN_REQUESTED', kidId: kid.id, guildId: result.guild_id, guildName: result.guild_name })
                    }
                    return result
                  })}>
            {busy ? 'Asking…' : 'Ask to join'}
          </Button>
        </Card>

        <EmptyState
          icon="🛡️"
          title="Want to start one?"
          body="A grown-up has to create a guild. Ask them to do it in Parent Mode."
        />
      </Screen>
    )
  }

  /* ---------- a real guild ---------- */
  const visible = (state.messages || []).filter((m) => !muted.includes(m.kid_id))
  const weeklyXp = (state.members || []).reduce((sum, m) => sum + (m.weekly_xp || 0), 0)
  const goal = state.guild.weekly_goal_xp || 1500
  const capacity = state.guild.capacity || 5

  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">Guild</p>
        <h1 className="font-display text-2xl font-extrabold">{state.guild.crest} {state.guild.name}</h1>
      </header>

      <Card className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>Weekly guild goal</SectionTitle>
          <span className="text-xs text-muted">{formatXp(weeklyXp)} / {formatXp(goal)} XP</span>
        </div>
        <ProgressBar value={weeklyXp} max={goal} height={12} label="Guild weekly goal" />
        <p className="text-xs text-muted mt-2">Everyone's approved quests add to the same bar.</p>
      </Card>

      {state.guild.invite_code && (
        <Card className="mb-3" style={{ borderColor: 'var(--accent)' }}>
          <SectionTitle>Invite code</SectionTitle>
          <div className="font-mono font-extrabold text-2xl tracking-[0.2em] text-center py-2 select-all"
               style={{ color: 'var(--accent)' }}>
            {state.guild.invite_code}
          </div>
          <p className="text-xs text-muted text-center">
            Share this with a friend. Both grown-ups still have to say yes.
          </p>
        </Card>
      )}

      <SectionTitle action={<span className="text-xs text-muted">{state.members.length}/{capacity}</span>}>
        Roster
      </SectionTitle>
      <Card className="mb-3 p-0 overflow-hidden">
        {[...state.members].sort((a, b) => b.weekly_xp - a.weekly_xp).map((m, i, all) => (
          <div key={m.kid_id} className="flex items-center gap-3 px-3.5 py-3"
               style={{ borderBottom: i < all.length - 1 ? '1px solid var(--line)' : 'none',
                        background: m.is_you ? 'var(--surface-2)' : 'transparent' }}>
            <span className="w-6 text-center font-display font-extrabold text-sm text-muted">{i + 1}</span>
            <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-bold text-sm"
                  style={{ background: 'var(--surface-2)', color: 'var(--accent)' }} aria-hidden="true">
              {m.name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm truncate">{m.name}</span>
                {m.is_you && <Chip tone="var(--accent)">You</Chip>}
              </div>
              <div className="text-xs text-muted">Level {levelFromXp(m.xp).level}</div>
            </div>
            <span className="font-display font-bold text-sm shrink-0">{formatXp(m.weekly_xp)} XP</span>
          </div>
        ))}
      </Card>

      {state.members.length >= capacity && !elite && (
        <Card className="mb-3" style={{ borderColor: 'var(--accent-2)' }}>
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">👥</span>
            <div className="min-w-0">
              <div className="font-display font-bold text-sm">10-Player Megacluster Guilds</div>
              <p className="text-xs text-muted mb-2">
                Elite Pass doubles the clan from 5 slots to 10.
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
        <Banner tone="info" icon="🛡️" title="Tap-to-send chat">
          Pick a message to cheer your team on. Nobody can type here, so nobody can ask where you
          live. Tap Report on anything that feels wrong and a grown-up will see it.
        </Banner>

        <div ref={chatBox} className="max-h-60 overflow-y-auto my-3 space-y-2" data-testid="guild-messages">
          {visible.length === 0 && <p className="text-sm text-muted">No messages yet. Say hello!</p>}
          {visible.map((m) => (
            <div key={m.id} className="card-flat p-2.5" data-quick-id={m.quick_id}
                 style={m.mine ? { borderColor: 'color-mix(in srgb, var(--accent) 50%, var(--line))' } : undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                  {m.mine ? 'You' : m.author}
                </span>
                <span className="text-[10px] text-muted">{relativeTime(Date.parse(m.at))}</span>
              </div>
              <p className={isQuickEmoji(m.quick_id) ? 'text-3xl leading-tight' : 'text-sm font-semibold'}>
                {quickChatText(m.quick_id)}
              </p>
              {!m.mine && (
                <div className="flex gap-3 mt-1">
                  <button type="button" className="text-[10px] underline text-muted disabled:opacity-50"
                          disabled={busy} onClick={() => act(() => guilds.report(m.id, kid.id))}>
                    Report
                  </button>
                  <button type="button" className="text-[10px] underline text-muted"
                          onClick={() => { const next = [...new Set([...muted, m.kid_id])]; setMuted(next); writeMuted(kid.id, next) }}>
                    Mute {m.author}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {muted.length > 0 && (
          <button type="button" className="text-[11px] underline text-muted mb-2"
                  onClick={() => { setMuted([]); writeMuted(kid.id, []) }}>
            {muted.length === 1 ? '1 guild-mate muted on this phone' : `${muted.length} guild-mates muted on this phone`} · Unmute
          </button>
        )}

        {error && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}
        <QuickChat kidId={kid.id} disabled={busy}
          onSend={async (quickId) => {
            setError('')
            const result = await guilds.postQuick(state.guild.id, kid.id, quickId)
            if (!result.ok) { setError(guildError(result.reason)); return false }
            await load()
            return true
          }} />
      </Card>

      <Button variant="ghost" className="w-full" disabled={busy}
              onClick={() => act(() => guilds.leave(state.guild.id, kid.id))}>
        Leave guild
      </Button>
    </Screen>
  )
}
