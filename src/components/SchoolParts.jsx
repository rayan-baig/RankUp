import { Card, Chip, SectionTitle, ProgressBar, DemoTag } from './ui.jsx'
import { monthLabel, districtLabel } from '../lib/schools.js'

/*
 * The pieces of the School League that the staff page, the parent page and
 * the child's page all show the same way: the district table, the rivalries
 * and the School Stars. Every number in them came from the database.
 */

const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1)

/** The headline: where the school stands this month. */
export function SchoolHeadline({ school, demo = false }) {
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })
  return (
    <Card className="mb-3">
      <div className="flex items-start gap-3">
        <div className="text-3xl shrink-0" aria-hidden="true">🏫</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display font-bold text-lg leading-tight">{school.name}</h2>
            {demo && <DemoTag />}
          </div>
          <p className="text-xs text-muted">
            {[school.city, districtLabel(school.district)].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="card-flat p-2">
          <div className="font-display font-extrabold text-xl">
            {school.ranked && school.district_rank ? `#${school.district_rank}` : '—'}
          </div>
          <div className="text-[10px] text-muted">in the district</div>
        </div>
        <div className="card-flat p-2">
          <div className="font-display font-extrabold text-xl">{Number(school.score).toFixed(1)}</div>
          <div className="text-[10px] text-muted">points per student</div>
        </div>
        <div className="card-flat p-2">
          <div className="font-display font-extrabold text-xl">{school.students}</div>
          <div className="text-[10px] text-muted">students playing</div>
        </div>
      </div>

      {!school.verified && (
        <p className="text-xs text-muted mt-3">
          We are checking this school is real. Until then it is not in the district league and
          no student names are shown to anyone.
        </p>
      )}
      {school.verified && !school.ranked && (
        <p className="text-xs text-muted mt-3">
          Ranked once {school.min_students} students have joined. {school.students} so far.
        </p>
      )}
      {school.verified && school.live === false && (
        <p className="text-xs mt-3" style={{ color: 'var(--warn)' }}>
          The school’s plan has ended, so it is sitting this month out.
        </p>
      )}
      {school.ranked && (
        <p className="text-xs text-muted mt-3">
          {monthName} so far: approved chores, at most eight a day per student, averaged across
          the school. Bigger schools do not win for being bigger.
        </p>
      )}

      {school.titles?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {school.titles.map((t) => (
            <Chip key={t.month} tone="var(--accent)">🏆 District Champion · {monthLabel(t.month)}</Chip>
          ))}
        </div>
      )}
    </Card>
  )
}

/** The district table. Names, towns and scores: nothing about any child. */
export function LeagueTable({ league, demo = false }) {
  const rows = league?.schools || []
  return (
    <>
      <SectionTitle action={demo ? <DemoTag /> : null}>{league?.district || 'District'} league</SectionTitle>
      <Card className="p-0 overflow-hidden mb-3">
        {rows.length === 0 && <p className="text-sm text-muted p-4">No schools to show yet.</p>}
        {rows.map((s, i) => (
          <div
            key={`${s.name}-${i}`}
            className="flex items-center gap-3 px-3.5 py-3"
            style={{
              borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none',
              background: s.you ? 'var(--surface-2)' : 'transparent',
            }}
          >
            <span className="w-6 text-center font-display font-extrabold text-sm"
                  style={{ color: i === 0 && s.ranked ? 'var(--accent)' : 'var(--ink-muted)' }}>
              {s.ranked ? medal(i) : '·'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm truncate">{s.name}</span>
                {s.you && <Chip tone="var(--accent)">Yours</Chip>}
              </div>
              <span className="block text-[11px] text-muted truncate">
                {s.city ? `${s.city} · ` : ''}{s.students} students{s.ranked ? '' : ' · not ranked yet'}
              </span>
            </div>
            <span className="font-display font-bold text-sm shrink-0">{Number(s.score).toFixed(1)}</span>
          </div>
        ))}
      </Card>
      {league?.champion && (
        <p className="text-xs text-muted -mt-1 mb-3">
          🏆 Last champion: <strong>{league.champion.name}</strong>, {monthLabel(league.champion.month)}.
          The best school each month is named District Champion and gets a month free.
        </p>
      )}
    </>
  )
}

/** Head-to-head rivalries. `actions` lets the staff page add its buttons. */
export function RivalryList({ rivalries = [], actions = null }) {
  if (!rivalries.length) return null
  return (
    <>
      <SectionTitle>Rivals</SectionTitle>
      {rivalries.map((r) => {
        const lead = Number(r.our_score) - Number(r.their_score)
        const max = Math.max(Number(r.our_score), Number(r.their_score), 1)
        return (
          <Card key={r.id} className="mb-2">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-semibold text-sm truncate">⚔️ vs {r.rival.name}</span>
              {r.status === 'pending'
                ? <Chip tone="var(--warn)">{r.asked_by_us ? 'Waiting for them' : 'Challenge in'}</Chip>
                : <span className="text-[11px] text-muted shrink-0">Won {r.won} · Lost {r.lost}{r.drawn ? ` · Drawn ${r.drawn}` : ''}</span>}
            </div>
            {r.status === 'active' && (
              <>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <span>
                    <span className="block mb-1">Us · {Number(r.our_score).toFixed(1)}</span>
                    <ProgressBar value={Number(r.our_score)} max={max} height={7} label="Our score" />
                  </span>
                  <span>
                    <span className="block mb-1">Them · {Number(r.their_score).toFixed(1)}</span>
                    <ProgressBar value={Number(r.their_score)} max={max} height={7} tone="var(--ink-muted)" label="Their score" />
                  </span>
                </div>
                <p className="text-xs text-muted mt-2">
                  {lead > 0 ? 'Ahead this month. Keep it up.' : lead < 0 ? 'Behind this month. Every chore closes the gap.' : 'Level this month.'}
                </p>
              </>
            )}
            {actions && actions(r)}
          </Card>
        )
      })}
    </>
  )
}

/** The School Stars: the top ten for a finished month. */
export function StarList({ stars = [], monthKey, staff = false, leaveOut = [], onToggle = null, onRemove = null }) {
  return (
    <>
      <SectionTitle>School Stars · {monthLabel(monthKey)}</SectionTitle>
      <Card className="p-0 overflow-hidden mb-3">
        {stars.length === 0 && (
          <p className="text-sm text-muted p-4">
            {staff
              ? 'Your first list appears once a month has finished.'
              : 'The school has not shared its Stars for this month yet.'}
          </p>
        )}
        {stars.map((s, i) => {
          const out = staff && (s.excluded || leaveOut.includes(s.rank))
          return (
            <div
              key={s.rank}
              className="flex items-center gap-3 px-3.5 py-2.5"
              style={{
                borderBottom: i < stars.length - 1 ? '1px solid var(--line)' : 'none',
                background: s.you || s.yours ? 'var(--surface-2)' : 'transparent',
                opacity: out ? 0.45 : 1,
              }}
            >
              <span className="w-6 text-center font-display font-extrabold text-sm">{medal(s.rank - 1)}</span>
              <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                {s.name}
                {s.you && <span className="ml-1.5"><Chip tone="var(--accent)">You!</Chip></span>}
                {!s.you && s.yours && <span className="ml-1.5"><Chip tone="var(--accent)">Yours</Chip></span>}
              </span>
              <span className="text-xs text-muted shrink-0">{s.score} pts</span>
              {staff && onToggle && !s.published && (
                <button type="button" className="text-[11px] underline text-muted shrink-0"
                        onClick={() => onToggle(s.rank)}>
                  {out ? 'Put back' : 'Leave out'}
                </button>
              )}
              {staff && onRemove && (
                <button type="button" className="text-[11px] underline shrink-0" style={{ color: 'var(--bad)' }}
                        aria-label={`Remove the student in place ${s.rank} from the school`}
                        onClick={() => onRemove(s)}>
                  Remove
                </button>
              )}
            </div>
          )
        })}
      </Card>
    </>
  )
}
