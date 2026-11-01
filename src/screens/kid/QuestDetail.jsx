import { useEffect, useMemo, useState } from 'react'
import { STICKER_MAP } from '../../data/stickers.js'
import { useApp, useKid, useKidTheme, useElite } from '../../state/AppContext.jsx'
import { DIFFICULTY, calcReward, liveStreak } from '../../lib/xp.js'
import { CATEGORY_MAP } from '../../data/questTemplates.js'
import { formatDuration } from '../../lib/dates.js'
import { Screen, Card, Button, Banner, Chip, TextInput, Field, SectionTitle } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

/*
 * RankUp never takes, keeps or sends photos.
 *
 * When a parent wants to see proof, the child uses the phone's own camera app
 * and sends the picture to the parent the way they already message each
 * other. The parent looks, then taps Accept here. Nothing about the picture
 * passes through RankUp, so there is no photo of a child's room, face or
 * homework on our servers to protect, keep or delete.
 */

export default function QuestDetail({ questId }) {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const elite = useElite()

  const quest = state.quests.find((q) => q.id === questId)

  const [mode, setMode] = useState('detail') // detail | review
  const [note, setNote] = useState('')
  const [score, setScore] = useState('')
  const [timerStart, setTimerStart] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!timerStart) return undefined
    const t = setInterval(() => setElapsed(Date.now() - timerStart), 200)
    return () => clearInterval(t)
  }, [timerStart])

  /**
   * The parent's reaction to this piece of work.
   *
   * The most recent approved submission, because a repeating chore has one per
   * time it was done and the sticker that matters is the one from today.
   */
  const approval = useMemo(
    () =>
      state.submissions
        .filter((s) => s.questId === questId && s.status === 'approved')
        .sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0))[0] || null,
    [state.submissions, questId],
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
  // Only 'assigned' and 'redo' quests can be worked on. Anything else is either
  // sitting with the parent or already paid out.
  const isOpen = quest.status === 'assigned' || quest.status === 'redo'
  const onTime = quest.timerSeconds ? elapsed > 0 && elapsed <= quest.timerSeconds * 1000 : true
  const preview = calcReward(quest, { elite, streak: liveStreak(kid.streak), onTime })

  const submit = () => {
    dispatch({
      type: 'SUBMIT_QUEST',
      submission: {
        questId: quest.id,
        kidId: kid.id,
        note: note.trim(),
        testScore: quest.testScore ? Math.min(100, Number(score) || 0) : null,
        elapsedMs: quest.timerSeconds ? elapsed : null,
        onTime,
        captureSource: 'none',
      },
    })
    navigate('/kid/quests')
  }

  // A test-score chore needs a score, and a score is a percentage.
  const scoreMissing = Boolean(quest.testScore) && score === ''
  const scoreTooHigh = Boolean(quest.testScore) && Number(score) > 100

  /* ---------- review before sending ---------- */
  if (mode === 'review' && isOpen) {
    return (
      <Screen>
        <h1 className="font-display text-xl font-extrabold mb-3">Ready to send?</h1>

        {quest.requiresPhoto && <ShowYourParent />}

        {quest.testScore && (
          <Field label="Your score (%)" hint={scoreTooHigh ? 'A score is 0 to 100.' : '80% or higher earns a bonus.'}>
            <TextInput value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="e.g. 86" />
          </Field>
        )}

        <Field label="Add a note (optional)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Also did the windowsill" />
        </Field>

        <div className="flex gap-2 mt-2">
          <Button variant="soft" className="flex-1" onClick={() => setMode('detail')}>
            Back
          </Button>
          <Button className="flex-1" onClick={submit} disabled={scoreMissing || scoreTooHigh}>Send to parent</Button>
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

      {quest.timerSeconds > 0 && isOpen && (
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

      {isOpen ? (
        <>
          {quest.requiresPhoto && <ShowYourParent />}
          <Button className="w-full" onClick={() => setMode('review')}>✅ I did it!</Button>
          <p className="text-xs text-muted text-center mt-2">Your parent accepts it before XP is awarded.</p>
        </>
      ) : quest.status === 'submitted' ? (
        <Banner tone="info" icon="⏳" title="Sent to your parent">
          You have already sent this one in. You will get your XP when they approve it — there is
          nothing else to do here.
        </Banner>
      ) : (
        <>
          <Banner tone="good" icon="✅" title="Done and approved">
            This quest is finished and the XP is already in your total.
          </Banner>
          {STICKER_MAP[approval?.sticker] && (
            <div
              className="card-flat p-3 mt-2.5 flex items-center gap-3"
              style={{ borderColor: 'var(--accent)' }}
            >
              <span className="text-3xl leading-none" aria-hidden="true">
                {STICKER_MAP[approval.sticker].emoji}
              </span>
              <div className="min-w-0">
                <p className="font-display font-extrabold text-sm" style={{ color: 'var(--accent)' }}>
                  {STICKER_MAP[approval.sticker].label}
                </p>
                <p className="text-xs text-muted">From your parent.</p>
              </div>
            </div>
          )}
          {approval?.parentNote && (
            <p className="text-sm mt-2.5 italic text-center">“{approval.parentNote}”</p>
          )}
        </>
      )}
    </Screen>
  )
}

/** What to do when a parent wants to see the result. */
function ShowYourParent() {
  return (
    <Card flat className="mb-3">
      <SectionTitle>📷 Show your parent</SectionTitle>
      <p className="text-sm">
        Take a photo with your phone&apos;s camera app and send it to your parent. They look at it,
        then tap Accept in RankUp.
      </p>
      <p className="text-xs text-muted mt-1">RankUp never takes or keeps photos.</p>
    </Card>
  )
}
