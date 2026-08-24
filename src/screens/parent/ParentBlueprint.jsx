import { useMemo, useState } from 'react'
import { useApp, useElite, useParentTheme } from '../../state/AppContext.jsx'
import { lastSevenDays, shortDayName, dayKey } from '../../lib/dates.js'
import { CATEGORY_MAP } from '../../data/questTemplates.js'
import { formatXp, levelFromXp } from '../../lib/xp.js'
import { DailyBars, StackedBars, HorizontalBars, StatTile } from '../../components/charts/Charts.jsx'
import { Screen, Card, SectionTitle, Select, Field, Banner, EmptyState, Chip } from '../../components/ui.jsx'
import EliteGate from '../../components/EliteGate.jsx'

const SLOTS = [
  { id: 'morning', label: 'Morning', from: 5, to: 12 },
  { id: 'afternoon', label: 'Afternoon', from: 12, to: 17 },
  { id: 'evening', label: 'Evening', from: 17, to: 21 },
  { id: 'night', label: 'Late night', from: 21, to: 29 },
]

function slotFor(hour) {
  const h = hour < 5 ? hour + 24 : hour
  return SLOTS.find((s) => h >= s.from && h < s.to) || SLOTS[0]
}

export default function ParentBlueprint({ initialKidId }) {
  const { state } = useApp()
  const elite = useElite()
  const parentTheme = useParentTheme()
  const [kidId, setKidId] = useState(initialKidId || state.kids[0]?.id || '')

  const days = useMemo(() => lastSevenDays(), [])
  const kid = state.kids.find((k) => k.id === kidId)

  const report = useMemo(() => {
    if (!kid) return null
    const window = new Set(days)
    const events = state.events.filter((e) => e.kidId === kid.id && window.has(e.day))
    const approved = events.filter((e) => e.type === 'quest_approved')
    const rejected = events.filter((e) => e.type === 'quest_rejected')
    const submitted = events.filter((e) => e.type === 'quest_submitted')

    const xpByDay = days.map((d) => ({
      label: shortDayName(d),
      day: d,
      value: approved.filter((e) => e.day === d).reduce((s, e) => s + (e.meta?.xp || 0), 0),
    }))

    const outcomeByDay = days.map((d) => ({
      label: shortDayName(d),
      approved: approved.filter((e) => e.day === d).length,
      sentBack: rejected.filter((e) => e.day === d).length,
      submitted: submitted.filter((e) => e.day === d).length,
    }))

    const bySlot = SLOTS.map((s) => ({
      label: s.label,
      value: approved.filter((e) => slotFor(new Date(e.at).getHours()).id === s.id).length,
    }))

    const catCounts = {}
    approved.forEach((e) => {
      const key = e.meta?.category || 'other'
      catCounts[key] = (catCounts[key] || 0) + 1
    })
    const byCategory = Object.entries(catCounts)
      .map(([k, v]) => ({ label: CATEGORY_MAP[k]?.label || 'Other', value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)

    const decided = approved.length + rejected.length
    const approvalRate = decided ? Math.round((approved.length / decided) * 100) : null

    const scores = state.submissions
      .filter((s) => s.kidId === kid.id && s.report && window.has(dayKey(new Date(s.submittedAt))))
      .map((s) => s.report.score)
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

    const adaptiveCount = approved.filter((e) => e.meta?.adaptive).length
    const activeDays = new Set(approved.map((e) => e.day)).size

    return {
      xpByDay,
      outcomeByDay,
      bySlot,
      byCategory,
      approvalRate,
      avgScore,
      adaptiveCount,
      activeDays,
      totalXp: xpByDay.reduce((s, d) => s + d.value, 0),
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      sampleSize: decided,
    }
  }, [state.events, state.submissions, kid, days])

  if (!elite) {
    return (
      <EliteGate
        icon="📊"
        title="Advanced AI Behaviour Blueprints"
        body="Weekly chart breakdowns tracking your child's focus patterns and chore-completion history, built from what actually happened in the app."
      />
    )
  }

  if (state.kids.length === 0) {
    return (
      <Screen>
        <h1 className="font-display text-2xl font-extrabold mb-3">Behaviour Blueprint</h1>
        <EmptyState icon="👶" title="No kids yet" />
      </Screen>
    )
  }

  const mode = parentTheme.mode

  return (
    <Screen>
      <header className="mb-3">
        <p className="text-xs uppercase tracking-widest text-muted">Elite · Critique AI</p>
        <h1 className="font-display text-2xl font-extrabold">Behaviour Blueprint</h1>
        <p className="text-sm text-muted">Last 7 days</p>
      </header>

      <Field label="Kid">
        <Select value={kidId} onChange={(e) => setKidId(e.target.value)}>
          {state.kids.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </Select>
      </Field>

      {report && (
        <>
          <div className="flex gap-2 mb-3">
            <StatTile mode={mode} label="XP earned" value={formatXp(report.totalXp)} />
            <StatTile mode={mode} label="Active days" value={`${report.activeDays}/7`} />
            <StatTile
              mode={mode}
              label="Approval"
              value={report.approvalRate == null ? '—' : `${report.approvalRate}%`}
              note={report.sampleSize ? `${report.sampleSize} decided` : 'no data'}
            />
          </div>

          <div className="space-y-3 mb-3">
            <DailyBars
              mode={mode}
              title="XP earned per day"
              subtitle="Only counts quests you approved"
              data={report.xpByDay}
            />

            <StackedBars
              mode={mode}
              title="What happened to each submission"
              subtitle="Approved, sent back, or still waiting on you"
              data={report.outcomeByDay}
              series={[
                { key: 'approved', label: 'Approved' },
                { key: 'sentBack', label: 'Sent back' },
                { key: 'submitted', label: 'Submitted' },
              ]}
            />

            <HorizontalBars
              mode={mode}
              title="Focus pattern by time of day"
              subtitle="When approved quests were actually finished"
              data={report.bySlot}
              seriesIndex={1}
            />

            {report.byCategory.length > 0 && (
              <HorizontalBars
                mode={mode}
                title="Chore mix"
                subtitle="Which kinds of chore are getting done"
                data={report.byCategory}
                seriesIndex={2}
              />
            )}
          </div>

          <SectionTitle>Read-out</SectionTitle>
          <Card className="mb-3">
            <ul className="space-y-2 text-sm">
              {buildReadout(report, kid).map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true">{line.icon}</span>
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
            {report.sampleSize < 5 && (
              <p className="text-xs text-muted mt-3">
                Based on only {report.sampleSize} decided {report.sampleSize === 1 ? 'quest' : 'quests'} — treat
                these as first impressions, not a pattern.
              </p>
            )}
          </Card>

          <Banner tone="info" icon="🤖" title="How this is built">
            The charts and the read-out are computed from this family's own activity log on this
            device. Nothing is sent anywhere. The photo check is the only part of RankUp that talks
            to an AI service, and only when you have configured a key.
          </Banner>

          <div className="flex flex-wrap gap-1.5 mt-3">
            <Chip>Level {levelFromXp(kid.xp).level}</Chip>
            <Chip>🔥 {kid.streak.count}-day streak</Chip>
            {report.adaptiveCount > 0 && <Chip tone="var(--accent-2)">♿ {report.adaptiveCount} adaptive completed</Chip>}
            {report.avgScore != null && <Chip>📷 Avg photo score {report.avgScore}/100</Chip>}
          </div>
        </>
      )}
    </Screen>
  )
}

/** Turns the week's numbers into plain sentences a parent can act on. */
function buildReadout(r, kid) {
  const out = []
  const best = [...r.xpByDay].sort((a, b) => b.value - a.value)[0]
  const peak = [...r.bySlot].sort((a, b) => b.value - a.value)[0]

  if (r.approvedCount === 0) {
    out.push({ icon: '🕳️', text: `No approved quests for ${kid.name} in the last 7 days. Either nothing was assigned, or submissions are still sitting in your review queue.` })
    return out
  }

  out.push({ icon: '⭐', text: `${kid.name} earned ${formatXp(r.totalXp)} XP across ${r.approvedCount} approved ${r.approvedCount === 1 ? 'quest' : 'quests'}.` })

  if (best?.value) out.push({ icon: '📈', text: `Strongest day was ${best.label} with ${best.value} XP.` })
  if (r.activeDays <= 2) out.push({ icon: '📉', text: `Activity is concentrated in ${r.activeDays} of 7 days. Short daily quests usually beat one big weekend push.` })
  if (r.activeDays >= 6) out.push({ icon: '🔁', text: 'Near-daily activity — this is now a habit rather than a one-off effort.' })

  if (peak?.value) out.push({ icon: '⏰', text: `Most work gets finished in the ${peak.label.toLowerCase()}. Assigning around that window is likely to reduce nagging.` })
  if (r.bySlot.find((s) => s.label === 'Late night')?.value >= 2) {
    out.push({ icon: '🌙', text: 'Several quests are being completed late at night. Worth checking whether that is genuine or a rush to beat a deadline.' })
  }

  if (r.approvalRate != null) {
    if (r.approvalRate === 100) out.push({ icon: '✅', text: 'You approved everything submitted this week.' })
    else if (r.approvalRate < 60) out.push({ icon: '↩️', text: `Only ${r.approvalRate}% of submissions were approved. That usually means the "what counts as done" wording needs to be more concrete, not that the kid is slacking.` })
  }

  if (r.avgScore != null && r.avgScore < 60) {
    out.push({ icon: '📷', text: `Photo checks are averaging ${r.avgScore}/100. Blurry or dark photos score low even when the chore is genuinely done — worth showing them how to frame a shot.` })
  }

  if (r.byCategory.length === 1) {
    out.push({ icon: '🎯', text: `Everything approved was ${r.byCategory[0].label.toLowerCase()}. Widening the mix keeps the game from getting stale.` })
  }

  if (r.adaptiveCount > 0) {
    out.push({ icon: '♿', text: `${r.adaptiveCount} adaptive ${r.adaptiveCount === 1 ? 'quest' : 'quests'} completed. Adaptive tasks are scored on effort and the plan you set, so compare them against last week rather than against a sibling.` })
  }

  return out
}
