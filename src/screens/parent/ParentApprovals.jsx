import { useState } from 'react'
import { useApp, pendingSubmissions } from '../../state/AppContext.jsx'
import { getPhoto } from '../../lib/storage.js'
import { VERDICT, VERDICT_META } from '../../lib/aiVerify.js'
import { calcReward } from '../../lib/xp.js'
import { relativeTime, formatDuration } from '../../lib/dates.js'
import { resolveKidTheme } from '../../data/kidThemes.js'
import { levelFromXp } from '../../lib/xp.js'
import { isElite } from '../../state/reducer.js'
import { Screen, Card, Button, SectionTitle, EmptyState, Banner, Chip, TextInput, Modal } from '../../components/ui.jsx'

/**
 * The approval queue.
 *
 * The AI report is displayed as evidence, never as a decision. There is no
 * "auto-approve everything clean" button and there deliberately never will be:
 * the whole product promise is that a person, not a model, decides whether a
 * child gets credit for their work.
 */
export default function ParentApprovals() {
  const { state, dispatch } = useApp()
  const pending = pendingSubmissions(state)
  const [rejecting, setRejecting] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [zoom, setZoom] = useState(null)

  if (pending.length === 0) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-3">Review</h1>
        <EmptyState icon="✨" title="Nothing to review" body="Submitted photo proof lands here." />
      </Screen>
    )
  }

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Review</h1>
      <p className="text-sm text-muted mb-3">{pending.length} waiting. You decide — the AI only advises.</p>

      {pending.map((sub) => {
        const quest = state.quests.find((q) => q.id === sub.questId)
        const kid = state.kids.find((k) => k.id === sub.kidId)
        if (!quest || !kid) return null
        const theme = resolveKidTheme(kid.themeId, levelFromXp(kid.xp).level)
        const reward = calcReward(quest, { elite: isElite(state), streak: kid.streak.count, onTime: sub.onTime !== false })
        const photo = sub.photoId ? getPhoto(sub.photoId) : null
        const report = sub.report

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

            {photo ? (
              <button type="button" onClick={() => setZoom(photo)} className="block w-full mb-3">
                <img src={photo} alt={`Proof for ${quest.title}`} className="w-full" style={{ borderRadius: 'var(--radius)' }} />
              </button>
            ) : (
              <Banner tone="info" icon="📝" title="No photo required">
                This quest was marked done without photo proof.
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

            <AiReport report={report} adaptive={quest.adaptive} />

            <div className="card-flat p-3 my-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted">If you approve</span>
                <span className="font-display font-extrabold" style={{ color: 'var(--good)' }}>
                  +{reward.xp} XP · {theme.currency.icon} {reward.coins}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="soft" className="flex-1" onClick={() => { setRejecting(sub); setRejectNote('') }}>
                Send back
              </Button>
              <Button className="flex-1" onClick={() => dispatch({ type: 'APPROVE_SUBMISSION', submissionId: sub.id })}>
                Approve
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
          placeholder="e.g. The duvet is still bunched up at the end"
          autoFocus
        />
      </Modal>

      <Modal open={Boolean(zoom)} onClose={() => setZoom(null)} title="Photo proof">
        {zoom && <img src={zoom} alt="Photo proof, enlarged" className="w-full" style={{ borderRadius: 'var(--radius)' }} />}
      </Modal>
    </Screen>
  )
}

function AiReport({ report, adaptive }) {
  const [open, setOpen] = useState(false)
  if (!report) {
    return (
      <Banner tone="warn" icon="🤖" title="No photo check available">
        The check did not run for this submission. Judge it on the photo alone.
      </Banner>
    )
  }

  const meta = VERDICT_META[report.verdict]
  const tone =
    report.verdict === VERDICT.SUSPICIOUS ? 'var(--bad)' : report.verdict === VERDICT.NEEDS_REVIEW ? 'var(--warn)' : 'var(--good)'

  return (
    <div className="card-flat p-3" style={{ borderColor: tone }}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true">{meta.icon}</span>
        <span className="font-semibold text-sm" style={{ color: tone }}>{meta.label}</span>
        <span className="ml-auto chip">{report.score}/100</span>
      </div>

      <p className="text-xs text-muted mt-1.5">
        Advice only. RankUp never approves or rejects on its own.
        {adaptive && ' Adaptive quests are scored more leniently on purpose.'}
      </p>

      {report.cloud?.summary && <p className="text-sm mt-2">{report.cloud.summary}</p>}

      {report.flags.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {report.flags.map((f, i) => (
            <li key={i} className="text-xs">
              <span
                className="font-semibold"
                style={{ color: f.severity === 'high' ? 'var(--bad)' : f.severity === 'medium' ? 'var(--warn)' : 'var(--ink-muted)' }}
              >
                {f.label}
              </span>
              {f.detail && <span className="text-muted"> — {f.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {!report.cloudConfigured && (
        <p className="text-[11px] text-muted mt-2">
          Only the on-device checks ran. Add an ANTHROPIC_API_KEY on the server to also have Claude
          look at whether the photo matches the chore — see docs/AI-CHECK.md.
        </p>
      )}
      {report.cloudError && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--warn)' }}>
          The AI check could not run: {report.cloudError}
        </p>
      )}

      <button type="button" className="text-[11px] underline text-muted mt-2" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide' : 'Show'} what was measured
      </button>
      {open && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
          {Object.entries(report.metrics || {}).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="truncate">{k}</dt>
              <dd className="font-mono">{String(v)}</dd>
            </div>
          ))}
          {report.cloud?.observations?.map((o, i) => (
            <div key={`obs${i}`} className="col-span-2">• {o}</div>
          ))}
        </dl>
      )}
    </div>
  )
}
