import { useState } from 'react'
import { MODES } from '../data/leaderboards.js'
import { leaderboards, forgetMe } from '../lib/leaderboards.js'
import { navigate } from '../lib/router.js'
import ModeBadge, { useLeaderboardMe } from './ModeBadge.jsx'
import NicknameBuilder from './NicknameBuilder.jsx'
import { Card, Button, SectionTitle } from './ui.jsx'

/**
 * On the child's Profile: Adventure or Arena, the nickname and its builder.
 * A child in Arena can step back to Adventure themselves, at once: the safer
 * mode never needs asking. Into Arena only a grown-up can switch them.
 */
export default function LeaderboardCard({ kid, demo = false }) {
  const [me, setMe] = useLeaderboardMe(kid, demo)
  const [building, setBuilding] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!kid || !me) return null
  const mode = MODES[me.mode] || MODES.adventure

  const toAdventure = async () => {
    setBusy(true)
    const res = await leaderboards.setMode(kid.id, 'adventure')
    setBusy(false)
    if (res.ok) { forgetMe(kid.id); setMe({ ...me, mode: 'adventure', arena_since: null }) }
  }

  return (
    <>
      <SectionTitle>Leaderboards</SectionTitle>
      <Card className="mb-3" data-testid="leaderboard-card" style={{ borderColor: mode.color }}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl" aria-hidden="true">{mode.icon}</span>
          <div className="min-w-0 flex-1">
            <ModeBadge mode={mode.id} size="lg" />
            <p className="text-xs text-muted mt-1">{mode.line}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 py-2" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted">Your nickname</div>
            <div className="font-display font-extrabold truncate" data-testid="my-nickname">{me.nickname}</div>
          </div>
          <Button variant="soft" className="px-3 py-2 min-h-0 text-xs" onClick={() => setBuilding(true)} data-testid="open-nickname">
            Change
          </Button>
        </div>
        <div className="flex gap-2 mt-1">
          <Button variant="soft" className="flex-1 text-sm" onClick={() => navigate('/kid/leaderboards')}>🏆 Leaderboards</Button>
          {me.mode === 'arena' && (
            <Button variant="ghost" className="flex-1 text-sm" disabled={busy} onClick={toAdventure} data-testid="to-adventure">
              🧭 Back to Adventure
            </Button>
          )}
        </div>
        {me.mode === 'adventure' && (
          <p className="text-[11px] text-muted mt-2">Want to race kids around the world? Ask a grown-up to switch on Arena.</p>
        )}
      </Card>
      {building && (
        <NicknameBuilder open kidId={kid.id} current={me.nickname} canRename={me.can_rename} renameAt={me.rename_at}
          onClose={() => setBuilding(false)}
          onSaved={(nickname) => setMe({ ...me, nickname, can_rename: false })} />
      )}
    </>
  )
}
