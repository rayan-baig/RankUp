import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { navigate } from '../lib/router.js'
import { transport } from '../lib/sync/transport.js'
import {
  schools, schoolError, dollars, demoReport, groupWord, longDate, districtLabel, SCHOOL_YEAR_MONTHS, SCHOOL_MIN_STUDENTS, SCHOOL_DAILY_CHORES,
} from '../lib/schools.js'
import { CATEGORY_MAP } from '../data/questTemplates.js'
import { PRODUCT_OF } from '../data/legalText.js'
import { SUPPORT_EMAIL } from '../lib/support.js'
import { Screen, Card, Button, Banner, DemoTag } from '../components/ui.jsx'

/**
 * The pilot report (#/school/report): one page a school's admin can print
 * and hand to whoever decides, any time during or after the school's pilot
 * or trial.
 *
 * Totals only, worked out by the database (school_pilot_report): for the
 * whole school and each house or class, students taking part, the share who
 * did a chore, chores done and the average per student; for the school, the
 * busiest week and the kinds of chore done most. Never a child's name,
 * nickname or anything typed, and no numbers for a group of fewer than
 * school_min_students(). It ends with what the school would pay and how.
 *
 * There is no "what families said" part: RankUp asks families for no rating,
 * and a child's own words are never shown to a school.
 */

/** "2026-11-09" → "the week of 9 November". Dates from the database are UTC days. */
const weekOf = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' })

function Stat({ value, label, testId }) {
  return (
    <div className="card-flat p-2 text-center report-tile" data-testid={testId}>
      <div className="font-display font-extrabold text-xl">{value}</div>
      <div className="text-[11px] text-muted leading-tight">{label}</div>
    </div>
  )
}

export default function SchoolReport() {
  const { state } = useApp()
  const demo = Boolean(state.demo)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (demo) { setReport(demoReport()); return }
    if (!transport.isConfigured() || !transport.currentUserId()) {
      setError('Sign in as your school’s admin to see its report.')
      return
    }
    schools.report().then((res) => {
      if (res.ok) setReport(res)
      else setError(schoolError(res.reason))
    })
  }, [demo])

  const back = (
    <button type="button" className="text-xs underline text-muted mt-1 shrink-0 print-hidden" onClick={() => navigate('/school')}>
      ← The school’s page
    </button>
  )

  if (!report) {
    return (
      <Screen>
        <header className="mb-3 flex items-start justify-between gap-2">
          <h1 className="font-display text-2xl font-extrabold">Pilot report</h1>
          {back}
        </header>
        {error
          ? <Banner tone="warn" icon="⚠️" title="Not right now">{error}</Banner>
          : <Card><p className="text-sm text-muted">Loading…</p></Card>}
      </Screen>
    )
  }

  const t = report.totals || {}
  const groups = report.groups?.groups || []
  const kind = report.groups?.kind || 'house'
  const min = report.min_students || SCHOOL_MIN_STUDENTS
  const price = report.price?.ok !== false ? report.price : null
  const what = report.kind === 'pilot' ? 'pilot' : 'free trial'
  const email = SUPPORT_EMAIL || null

  return (
    <Screen className="print-page">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted">RankUp School League · {report.kind === 'pilot' ? 'Pilot' : 'Trial'} report</p>
          <h1 className="font-display text-2xl font-extrabold leading-tight">{report.school.name}</h1>
          <p className="text-xs text-muted">
            {[report.school.city, report.school.district && districtLabel(report.school.district)].filter(Boolean).join(' · ')}
          </p>
          <p className="text-xs text-muted" data-testid="report-period">
            {longDate(report.from)} to {longDate(report.to)}
            {report.over ? `, the whole ${what}` : `, so far. The ${what} ends on ${longDate(report.ends_at)}`}.
            {demo && <> <DemoTag /></>}
          </p>
        </div>
        {back}
      </header>

      <Card className="mb-3 report-card" data-testid="report-school">
        <p className="font-semibold text-sm mb-2">The whole school</p>
        {t.shown ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat value={t.students} label="students taking part" testId="report-students" />
              <Stat value={`${t.share_pct}%`} label="did at least one chore" testId="report-share" />
              <Stat value={Number(t.chores).toLocaleString()} label="chores done" testId="report-chores" />
              <Stat value={Number(t.average).toFixed(1)} label="chores per student, on average" testId="report-average" />
            </div>
            {report.busiest_week && (
              <p className="text-sm mt-3" data-testid="report-week">
                <strong>Busiest week:</strong> the week of {weekOf(report.busiest_week.starts)},
                with {Number(report.busiest_week.chores).toLocaleString()} chores.
              </p>
            )}
            {report.kinds?.length > 0 && (
              <p className="text-sm mt-1" data-testid="report-kinds">
                <strong>Most popular kinds of chore:</strong>{' '}
                {report.kinds.map((k) => `${CATEGORY_MAP[k.kind]?.label || k.kind} (${k.share_pct}%)`).join(', ')}.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm" data-testid="report-too-few">
            {t.students} {t.students === 1 ? 'student has' : 'students have'} joined so far. Numbers show once {min} or more
            take part, so that no total is ever one child’s.
          </p>
        )}
        <p className="text-xs text-muted mt-2">
          A chore counts once a parent has said it is done, at most {SCHOOL_DAILY_CHORES} a day for each student, as in the league.
        </p>
      </Card>

      {groups.length > 0 && (
        <Card className="mb-3 report-card" data-testid="report-groups">
          <p className="font-semibold text-sm mb-2">By {groupWord(kind, { lower: true })}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-muted text-left">
                  <th className="font-normal py-1 pr-2">{groupWord(kind)}</th>
                  <th className="font-normal py-1 px-1 text-right">Students</th>
                  <th className="font-normal py-1 px-1 text-right">Did a chore</th>
                  <th className="font-normal py-1 px-1 text-right">Chores</th>
                  <th className="font-normal py-1 pl-1 text-right">Average</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-t border-line">
                    <td className="py-1.5 pr-2 font-semibold">{g.name}</td>
                    {g.shown ? (
                      <>
                        <td className="py-1.5 px-1 text-right">{g.students}</td>
                        <td className="py-1.5 px-1 text-right">{g.share_pct}%</td>
                        <td className="py-1.5 px-1 text-right">{Number(g.chores).toLocaleString()}</td>
                        <td className="py-1.5 pl-1 text-right">{Number(g.average).toFixed(1)}</td>
                      </>
                    ) : (
                      <td className="py-1.5 pl-1 text-right text-muted" colSpan={4}>Too few to show</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card flat className="mb-3 report-card">
        <p className="font-semibold text-sm mb-1">What this report never shows</p>
        <p className="text-xs text-muted">
          No child’s name, nickname or anything a child typed, and no numbers at all for a group of fewer than {min}{' '}
          students. Families put their own children in the school and choose their {groupWord(kind, { plural: true, lower: true })};
          the school sees totals only.
        </p>
      </Card>

      {price && (
        <Card className="mb-3 report-card" data-testid="report-price">
          <p className="font-semibold text-sm mb-1">What {report.school.name} would pay</p>
          <p className="text-sm">
            {price.label}, priced for {Number(report.school.student_count).toLocaleString()} students:{' '}
            <strong>{dollars(price.monthly_cents)} a month</strong>, or <strong>{dollars(price.yearly_cents)} a year</strong>{' '}
            ({12 - SCHOOL_YEAR_MONTHS} months free).
          </p>
          <p className="text-sm mt-2"><strong>How to buy</strong></p>
          <ul className="text-sm list-disc pl-5 grid gap-1">
            <li><strong>By card:</strong> the school’s admin opens the school’s page in RankUp, then Plan, and pays monthly or yearly on Stripe’s own page.</li>
            <li><strong>By invoice:</strong> on the same page, “a year, by invoice”. Stripe emails a yearly invoice your office can pay by card or bank transfer.</li>
          </ul>
          <p className="text-xs text-muted mt-2">
            {report.paid
              ? 'Your school already has a plan.'
              : `Nothing is charged by itself. When the ${what} ends, the school sits out the league until it chooses a plan, and keeps its points.`}
          </p>
        </Card>
      )}

      <p className="text-[11px] text-muted mb-3">
        {PRODUCT_OF}{email ? ` Questions: ${email}.` : ''} Made on {longDate(report.to)}.
      </p>

      <div className="grid grid-cols-2 gap-2 print-hidden">
        <Button variant="soft" onClick={() => navigate('/school')}>Back</Button>
        <Button onClick={() => window.print()}>Print this page</Button>
      </div>
    </Screen>
  )
}
