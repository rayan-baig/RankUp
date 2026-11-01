import { useState } from 'react'
import { useApp, pendingSubmissions } from '../../state/AppContext.jsx'
import { submissionReward, liveStreak } from '../../lib/xp.js'
import { relativeTime, formatDuration } from '../../lib/dates.js'
import { resolveKidTheme } from '../../data/kidThemes.js'
import { storyProgress } from '../../lib/dragonFight.js'
import { levelFromXp } from '../../lib/xp.js'
import { isElite } from '../../state/reducer.js'
import { Screen, Card, Button, SectionTitle, EmptyState, Banner, Chip, TextInput, Modal } from '../../components/ui.jsx'
import { STICKERS, STICKER_MAP } from '../../data/stickers.js'

/**
 * The approval queue.
 *
 * RankUp holds no photos. When a parent wants proof, the child sends a photo
 * from the phone's own camera app, the way the family already messages, and
 * the parent taps Accept here once they have looked. A person decides, always.
 */
export default function ParentApprovals() {
  const { state, dispatch } = useApp()
  const pending = pendingSubmissions(state)
  const [rejecting, setRejecting] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  /**
   * Which sticker is picked, per submission.
   *
   * Approving used to be a receipt — the XP landed and that was the whole
   * message, whether they scrubbed a bathroom or dropped one sock in a basket.
   * Optional, and never in the way: not choosing one approves exactly as before.
   */
  const [stickers, setStickers] = useState({})

  if (pending.length === 0) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-3">Review</h1>
        <EmptyState icon="✨" title="Nothing to review" body="Chores your kids finish land here for you to accept." />
      </Screen>
    )
  }

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Review</h1>
      <p className="text-sm text-muted mb-3">{pending.length} waiting for you to accept.</p>

      {pending.map((sub) => {
        const quest = state.quests.find((q) => q.id === sub.questId)
        const kid = state.kids.find((k) => k.id === sub.kidId)
        if (!quest || !kid) return null
        const theme = resolveKidTheme(kid.themeId, levelFromXp(kid.xp).level, storyProgress(state, kid))
        // What accepting actually pays, test-score bonus included.
        const reward = submissionReward(quest, sub, { elite: isElite(state), streak: liveStreak(kid.streak) })

        return (
          <Card key={sub.id} className="mb-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <h2 className="font-display font-bold leading-tight">{quest.title}</h2>
                <p className="text-xs text-muted">
                  {kid.name} · {relativeTime(sub.submittedAt)}
                  {sub.elapsedMs ? ` · took ${formatDuration(sub.elapsedMs)}` : ''}
                </p>
              </div>
              {quest.adaptive && <Chip tone="var(--accent-2)">♿ Adaptive</Chip>}
            </div>

            {quest.requiresPhoto && (
              <Banner tone="info" icon="📷" title="Want to see it first?">
                {kid.name} can send you a photo from their camera app. Look at it, then accept here.
              </Banner>
            )}

            {sub.note && <p className="text-sm mb-3">“{sub.note}”</p>}
            {quest.testScore && sub.testScore != null && (
              <Banner tone={sub.testScore >= 80 ? 'good' : 'warn'} icon="📊" title={`Reported score: ${sub.testScore}%`}>
                {sub.testScore >= 80 ? 'Earns the bonus.' : 'Below the 80% bonus line.'}
              </Banner>
            )}

            <div className="card-flat p-3 my-3">
              <SectionTitle>What "done" was meant to look like</SectionTitle>
              <p className="text-sm">{quest.doneMeans || 'No specific definition was set.'}</p>
              {quest.adaptive && quest.supports?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {quest.supports.map((s) => <Chip key={s} tone="var(--accent-2)">{s}</Chip>)}
                </div>
              )}
            </div>

            <div className="card-flat p-3 my-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted">If you accept</span>
                <span className="font-display font-extrabold" style={{ color: 'var(--good)' }}>
                  +{reward.xp} XP · {theme.currency.icon} {reward.coins}
                </span>
              </div>
            </div>

            <div className="mb-3">
              <span className="label">Say something (optional)</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {STICKERS.map((st) => {
                  const picked = stickers[sub.id] === st.id
                  return (
                    <button
                      key={st.id}
                      type="button"
                      aria-pressed={picked}
                      aria-label={st.label}
                      title={st.label}
                      className="chip text-base leading-none py-1.5 transition-transform active:scale-90"
                      style={picked
                        ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--surface-2)' }
                        : undefined}
                      onClick={() => setStickers((m) => ({ ...m, [sub.id]: picked ? null : st.id }))}
                    >
                      {st.emoji}
                    </button>
                  )
                })}
              </div>
              {stickers[sub.id] && (
                <p className="text-xs text-muted mt-1.5">
                  {STICKER_MAP[stickers[sub.id]].emoji} “{STICKER_MAP[stickers[sub.id]].label}” goes with it.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="soft" className="flex-1" onClick={() => { setRejecting(sub); setRejectNote('') }}>
                Send back
              </Button>
              <Button
                className="flex-1"
                onClick={() => dispatch({
                  type: 'APPROVE_SUBMISSION',
                  submissionId: sub.id,
                  sticker: stickers[sub.id] || null,
                })}
              >
                {stickers[sub.id] ? `Accept ${STICKER_MAP[stickers[sub.id]].emoji}` : 'Accept'}
              </Button>
            </div>
          </Card>
        )
      })}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Send this back to redo"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                dispatch({ type: 'REJECT_SUBMISSION', submissionId: rejecting.id, note: rejectNote.trim() })
                setRejecting(null)
              }}
            >
              Send back
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted mb-3">
          The quest goes straight back on their list. Say what needs to change — a reason turns a
          rejection into an instruction.
        </p>
        <TextInput
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          placeholder="e.g. The duvet is still bunched up"
          autoFocus
        />
      </Modal>
    </Screen>
  )
}
