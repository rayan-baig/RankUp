import { useCallback, useEffect, useState } from 'react'
import { Card, Button, SectionTitle, Banner, Field, TextInput, Chip } from '../components/ui.jsx'
import ThemePreview from '../components/ThemePreview.jsx'
import { buildTheme, creditLine } from '../data/themeGenesis.js'

/**
 * The operator's inbox of themes children made and parents sent for a
 * Season, grouped by the month they came in. Each one is shown as it would
 * look (a live preview of a child's home screen in it), with its credit
 * line, and three things to do: pick it for the next Season, decline it,
 * or remove it. Seasons are made here too: a number, a name and the day it
 * starts, which is the day every family's theme picker shows its themes.
 *
 * Every decision is made by api/operator-themes.js, which checks the
 * operator key on each request. Nothing here names a family or a child.
 */

const URL = '/api/operator-themes'

async function call(key, body) {
  try {
    const res = await fetch(URL, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, status: res.status, error: data.error }
    return data
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/** What the database's refusals mean, for the operator. */
const REFUSED = {
  no_submission: 'That submission is not there any more.',
  no_season: 'That Season is not there any more.',
  season_started: 'That Season has already started. Pick for one that has not.',
  already_picked: 'It is already picked.',
  season_exists: 'There is already a Season with that number.',
  bad_season: 'A Season needs a number from 1 to 999, a name and a start day.',
}

const monthName = (key) => {
  const d = new Date(`${key}-01T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function OperatorThemes({ operatorKey }) {
  const [inbox, setInbox] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [season, setSeason] = useState({ number: '', name: '', starts_on: '' })

  const load = useCallback(async () => {
    const res = await call(operatorKey)
    if (!res.ok) { setError(res.status === 401 ? 'That key is not right.' : 'Could not load the theme submissions.'); return }
    setError('')
    setInbox(res)
  }, [operatorKey])
  useEffect(() => { load() }, [load])

  const act = async (body, label) => {
    setBusy(label)
    const res = await call(operatorKey, body)
    setBusy('')
    if (!res.ok) { setError(REFUSED[res.error] || 'That did not go through.'); return }
    setError('')
    setInbox(res)
  }

  if (!inbox) {
    return error
      ? <Banner tone="warn" icon="⚠️" title="Not right now">{error}</Banner>
      : <Card><p className="text-sm text-muted">Loading…</p></Card>
  }

  const upcoming = (inbox.seasons || []).filter((s) => !s.live).sort((a, b) => a.number - b.number)
  const next = upcoming[0] || null
  const byMonth = new Map()
  for (const s of inbox.submissions || []) {
    if (!byMonth.has(s.month)) byMonth.set(s.month, [])
    byMonth.get(s.month).push(s)
  }
  const nextNumber = Math.max(0, ...(inbox.seasons || []).map((s) => s.number)) + 1

  return (
    <div data-testid="operator-themes">
      {error && <Banner tone="warn" icon="⚠️" title="Not right now" className="mb-3">{error}</Banner>}

      <SectionTitle>Seasons</SectionTitle>
      <Card className="mb-3">
        {(inbox.seasons || []).length === 0 && <p className="text-sm text-muted mb-2">No Seasons yet.</p>}
        {(inbox.seasons || []).map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 py-1.5" style={{ borderTop: '1px solid var(--line)' }}>
            <span className="text-sm min-w-0 truncate"><strong>Season {s.number}</strong> · {s.name}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <Chip tone={s.live ? 'var(--good)' : 'var(--accent)'}>{s.live ? 'Live' : `Starts ${s.starts_on}`}</Chip>
              <span className="text-xs text-muted">{s.themes} theme{s.themes === 1 ? '' : 's'}</span>
            </span>
          </div>
        ))}
        <details className="mt-2" data-testid="new-season">
          <summary className="text-sm font-semibold cursor-pointer">+ Make the next Season</summary>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Field label="Number"><TextInput inputMode="numeric" value={season.number} placeholder={String(nextNumber)}
                   onChange={(e) => setSeason({ ...season, number: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Field>
            <div className="col-span-2"><Field label="Name"><TextInput value={season.name} maxLength={40} placeholder="Frost Fest"
                   onChange={(e) => setSeason({ ...season, name: e.target.value })} /></Field></div>
          </div>
          <Field label="Starts on (every family sees its themes from this day, UTC)">
            <TextInput type="date" value={season.starts_on} onChange={(e) => setSeason({ ...season, starts_on: e.target.value })} />
          </Field>
          <Button variant="soft" className="w-full" disabled={Boolean(busy) || !season.name || !season.starts_on}
                  onClick={() => act({ action: 'season', number: Number(season.number || nextNumber), name: season.name, starts_on: season.starts_on }, 'season')}>
            Make Season {season.number || nextNumber}
          </Button>
        </details>
      </Card>

      <SectionTitle>Theme submissions ({(inbox.submissions || []).length})</SectionTitle>
      <Card flat className="mb-3">
        <p className="text-xs text-muted">
          Each theme was made by a child and sent by their parent. What is here is the theme and the credit line the
          parent chose, nothing else. Picked themes join {next ? `Season ${next.number} (${next.name}), starting ${next.starts_on}` : 'the next Season (make one first)'};
          declined and unpicked ones are deleted after 90 days.
        </p>
      </Card>
      {byMonth.size === 0 && <p className="text-sm text-muted">Nothing sent yet.</p>}
      {[...byMonth.entries()].map(([month, subs]) => (
        <section key={month} className="mb-4">
          <h3 className="font-display font-bold mb-2">{monthName(month)} <span className="text-muted font-normal text-sm">· {subs.length}</span></h3>
          {subs.map((s) => {
            const theme = buildTheme({ id: `inbox-${s.id}`, name: s.name, design: s.design })
            return (
              <Card key={s.id} className="mb-3" data-testid="theme-submission">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{theme.name}</p>
                    <p className="text-xs text-muted">{creditLine(s.credit)} · {theme.design.worlds.join(' · ')}</p>
                  </div>
                  <Chip tone={s.status === 'picked' ? 'var(--good)' : s.status === 'declined' ? 'var(--warn)' : 'var(--accent)'}>
                    {s.status === 'picked' ? `Season ${s.season}` : s.status === 'declined' ? 'Declined' : 'New'}
                  </Chip>
                </div>
                <ThemePreview theme={{ ...theme, evolution: null }} level={12} kidName="Player" height={372} testId="submission-preview" />
                <div className="flex gap-2 mt-3">
                  {s.status !== 'picked' && (
                    <Button className="flex-1 !min-h-0 py-2 text-sm" disabled={Boolean(busy) || !next}
                            onClick={() => act({ action: 'pick', submission_id: s.id, season_id: next.id }, s.id)}>
                      {next ? `Pick for Season ${next.number}` : 'Pick for next Season'}
                    </Button>
                  )}
                  {s.status === 'new' && (
                    <Button variant="ghost" className="flex-1 !min-h-0 py-2 text-sm" disabled={Boolean(busy)}
                            onClick={() => act({ action: 'decline', submission_id: s.id }, s.id)}>Decline</Button>
                  )}
                  <Button variant="danger" className="flex-1 !min-h-0 py-2 text-sm" disabled={Boolean(busy)}
                          onClick={() => act({ action: 'remove', submission_id: s.id }, s.id)}>Remove</Button>
                </div>
              </Card>
            )
          })}
        </section>
      ))}
    </div>
  )
}
