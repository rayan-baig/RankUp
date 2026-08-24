import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, useKid, useKidTheme, useElite } from '../../state/AppContext.jsx'
import { DIFFICULTY, calcReward } from '../../lib/xp.js'
import { CATEGORY_MAP } from '../../data/questTemplates.js'
import { formatDuration } from '../../lib/dates.js'
import { verifyPhoto, VERDICT, VERDICT_META } from '../../lib/aiVerify.js'
import { putPhoto } from '../../lib/storage.js'
import { uid } from '../../lib/id.js'
import CameraCapture from '../../components/CameraCapture.jsx'
import { Screen, Card, Button, Banner, Chip, TextInput, Field, SectionTitle } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

export default function QuestDetail({ questId }) {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const elite = useElite()

  const quest = state.quests.find((q) => q.id === questId)
  const openedAt = useRef(Date.now())

  const [mode, setMode] = useState('detail') // detail | camera | checking | review
  const [photo, setPhoto] = useState(null)
  const [report, setReport] = useState(null)
  const [note, setNote] = useState('')
  const [score, setScore] = useState('')
  const [timerStart, setTimerStart] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!timerStart) return undefined
    const t = setInterval(() => setElapsed(Date.now() - timerStart), 200)
    return () => clearInterval(t)
  }, [timerStart])

  const previousHashes = useMemo(
    () =>
      state.submissions
        .filter((s) => s.kidId === kid?.id && s.hash)
        .map((s) => ({ hash: s.hash, submissionId: s.id })),
    [state.submissions, kid?.id],
  )

  if (!quest || !kid) {
    return (
      <Screen>
        <p className="text-muted">That quest no longer exists.</p>
        <Button className="mt-3" onClick={() => navigate('/kid/quests')}>Back to quests</Button>
      </Screen>
    )
  }

  const diff = DIFFICULTY[quest.difficulty] || DIFFICULTY.medium
  const cat = CATEGORY_MAP[quest.category]
  const onTime = quest.timerSeconds ? elapsed > 0 && elapsed <= quest.timerSeconds * 1000 : true
  const preview = calcReward(quest, { elite, streak: kid.streak.count, onTime })

  const runCheck = async (captured) => {
    setPhoto(captured)
    setMode('checking')
    setError('')
    try {
      const result = await verifyPhoto(captured.dataUrl, {
        quest,
        context: {
          captureSource: captured.source,
          previousHashes,
          secondsSinceQuestOpened: Math.round((Date.now() - openedAt.current) / 1000),
        },
      })
      setReport(result)
    } catch (err) {
      setError(err.message || 'The photo check could not run. You can still submit.')
      setReport(null)
    }
    setMode('review')
  }

  const submit = () => {
    const photoId = photo ? uid('photo') : null
    if (photo && photoId) putPhoto(photoId, photo.dataUrl)
    dispatch({
      type: 'SUBMIT_QUEST',
      submission: {
        questId: quest.id,
        kidId: kid.id,
        photoId,
        hash: report?.hash || null,
        report,
        note: note.trim(),
        testScore: quest.testScore ? Number(score) || 0 : null,
        elapsedMs: quest.timerSeconds ? elapsed : null,
        onTime,
        captureSource: photo?.source || 'none',
      },
    })
    navigate('/kid/quests')
  }

  /* ---------- camera ---------- */
  if (mode === 'camera') {
    return (
      <Screen>
        <h1 className="font-display text-xl font-extrabold mb-1">Photograph your work</h1>
        <p className="text-sm text-muted mb-3">{quest.doneMeans || 'Show the finished result.'}</p>
        <CameraCapture onCapture={runCheck} onCancel={() => setMode('detail')} />
      </Screen>
    )
  }

  /* ---------- checking ---------- */
  if (mode === 'checking') {
    return (
      <Screen>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-3">
          <div className="w-14 h-14 rounded-full border-4 border-transparent" style={{ borderTopColor: 'var(--accent)', animation: 'rankup-spin 0.9s linear infinite' }} />
          <h2 className="font-display font-bold text-lg">Checking your photo…</h2>
          <p className="text-sm text-muted max-w-xs">
            Looking for the things that mean a photo isn't real proof — a screenshot, a re-used
            picture, or a photo of a screen.
          </p>
        </div>
      </Screen>
    )
  }

  /* ---------- review before sending ---------- */
  if (mode === 'review') {
    const meta = report ? VERDICT_META[report.verdict] : null
    return (
      <Screen>
        <h1 className="font-display text-xl font-extrabold mb-3">Ready to send?</h1>
        {photo && (
          <img src={photo.dataUrl} alt="Your proof" className="w-full mb-3" style={{ borderRadius: 'var(--radius)' }} />
        )}

        {error && <Banner tone="warn" icon="⚠️" title="Check didn't run">{error}</Banner>}

        {report && (
          <Card
            className="mb-3"
            style={{ borderColor: report.verdict === VERDICT.SUSPICIOUS ? 'var(--bad)' : report.verdict === VERDICT.NEEDS_REVIEW ? 'var(--warn)' : 'var(--good)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg" aria-hidden="true">{meta.icon}</span>
              <span className="font-display font-bold">{meta.label}</span>
              <span className="ml-auto chip">{report.score}/100</span>
            </div>
            <p className="text-xs text-muted">
              This is only a hint for your parent. They decide — the app never rejects your work on its own.
            </p>
            {report.flags.length > 0 && (
              <ul className="mt-2 space-y-1">
                {report.flags.map((f, i) => (
                  <li key={i} className="text-xs text-muted">• {f.label}</li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {quest.testScore && (
          <Field label="Your score (%)" hint="80% or higher earns a bonus.">
            <TextInput value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="e.g. 86" />
          </Field>
        )}

        <Field label="Add a note (optional)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Also did the windowsill" />
        </Field>

        <div className="flex gap-2 mt-2">
          <Button variant="soft" className="flex-1" onClick={() => { setPhoto(null); setReport(null); setMode('camera') }}>
            Retake
          </Button>
          <Button className="flex-1" onClick={submit}>Send to parent</Button>
        </div>
      </Screen>
    )
  }

  /* ---------- detail ---------- */
  return (
    <Screen>
      <button type="button" onClick={() => navigate('/kid/quests')} className="text-sm text-muted mb-2">← Quests</button>

      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl" aria-hidden="true">{cat?.icon || '✅'}</span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold leading-tight">{quest.title}</h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Chip tone={diff.color}>{diff.label}</Chip>
            {quest.adaptive && <Chip tone="var(--accent-2)">♿ Adaptive</Chip>}
            {quest.doubleXp && <Chip tone="var(--warn)">⚡ 2× XP</Chip>}
          </div>
        </div>
      </div>

      {quest.status === 'redo' && (
        <Banner tone="warn" icon="↩️" title="Sent back to you">
          {quest.redoNote || 'Your parent asked you to do this one again.'}
        </Banner>
      )}

      {quest.description && <p className="text-sm mt-3">{quest.description}</p>}

      <Card className="my-3">
        <SectionTitle>What counts as done</SectionTitle>
        <p className="text-sm">{quest.doneMeans || 'Finish the task and show the result.'}</p>
        {quest.adaptive && quest.supports?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {quest.supports.map((s) => <Chip key={s} tone="var(--accent-2)">{s}</Chip>)}
          </div>
        )}
        {quest.adaptive && (
          <p className="text-xs text-muted mt-2">
            This quest is built around you. Partial counts if that's what the plan says.
          </p>
        )}
      </Card>

      {quest.why && (
        <Card flat className="mb-3">
          <SectionTitle>Why this matters</SectionTitle>
          <p className="text-sm text-muted">{quest.why}</p>
        </Card>
      )}

      <Card className="mb-3">
        <SectionTitle>What you'll earn</SectionTitle>
        <ul className="space-y-1">
          {preview.lines.map((l, i) => (
            <li key={i} className="flex justify-between text-sm">
              <span className="text-muted">{l.label}</span>
              <span className="font-semibold">+{l.value}</span>
            </li>
          ))}
          <li className="flex justify-between text-sm pt-1.5 mt-1.5 border-t" style={{ borderColor: 'var(--line)' }}>
            <span className="font-semibold">Total</span>
            <span className="font-display font-extrabold" style={{ color: 'var(--accent)' }}>
              {preview.xp} XP · {theme.currency.icon} {preview.coins}
            </span>
          </li>
        </ul>
      </Card>

      {quest.timerSeconds > 0 && (
        <Card className="mb-3 text-center">
          <SectionTitle>Race the clock</SectionTitle>
          <div className="font-display text-3xl font-extrabold" style={{ color: onTime ? 'var(--good)' : 'var(--bad)' }}>
            {formatDuration(elapsed)}
          </div>
          <p className="text-xs text-muted mt-1">
            Target {formatDuration(quest.timerSeconds * 1000)}
            {kid.bestTimes[quest.title] ? ` · Your best ${formatDuration(kid.bestTimes[quest.title] * 1000)}` : ''}
          </p>
          <Button
            variant={timerStart ? 'soft' : 'primary'}
            className="w-full mt-3"
            onClick={() => (timerStart ? setTimerStart(null) : setTimerStart(Date.now()))}
          >
            {timerStart ? 'Stop timer' : 'Start timer'}
          </Button>
        </Card>
      )}

      {quest.requiresPhoto ? (
        <Button className="w-full" onClick={() => setMode('camera')}>📷 Take photo proof</Button>
      ) : (
        <Button className="w-full" onClick={() => setMode('review')}>Mark as done</Button>
      )}
      <p className="text-xs text-muted text-center mt-2">Your parent approves it before XP is awarded.</p>
    </Screen>
  )
}
