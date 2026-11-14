import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { resolveKidTheme } from '../../data/kidThemes.js'
import { STICKER_MAP } from '../../data/stickers.js'
import { adults as familyAdults } from '../../lib/coparents.js'
import { choreHistory, historyTotals, byDay, OUTCOMES, HISTORY_NOTE_MAX } from '../../lib/choreHistory.js'
import { Screen, Card, Button, EmptyState, Modal, TextInput } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'
import { KEEP_DAYS } from '../../lib/prune.js'

/**
 * Chore history: every chore each child has sent in, in one place.
 *
 * Who did it, when, whether it was accepted or sent back (and by which adult,
 * and why), and what it paid; for one child or all of them, and for one
 * outcome or all. The dashboard's "Recent activity" is the last eight lines
 * of the same thing and links here.
 *
 * Read only, apart from a note. A past chore's XP is not editable on purpose:
 * it was paid the moment it was accepted, and since then it has been spent in
 * the shop, counted towards levels, streaks, badges, the family goal, the
 * School League and the Alliance. Taking it back afterwards cannot undo those,
 * and nothing in RankUp reverses an approval, so an "edit" would be a second
 * decision the child never sees made. A parent can add a note to any line
 * instead (set_history_note), which changes nothing else.
 */
export default function ParentHistory({ initialKidId = null }) {
  const { state, dispatch } = useApp()
  const [kidId, setKidId] = useState(state.kids.some((k) => k.id === initialKidId) ? initialKidId : null)
  const [outcome, setOutcome] = useState('all')
  const [adults, setAdults] = useState([])
  const [noting, setNoting] = useState(null)
  const [note, setNote] = useState('')

  // Which adult decided each one, when this phone can ask. A family of one
  // parent loses nothing without it.
  useEffect(() => {
    let alive = true
    familyAdults.list().then((r) => { if (alive && r?.adults) setAdults(r.adults) })
    return () => { alive = false }
  }, [])

  const entries = useMemo(() => choreHistory(state, { kidId, outcome, adults }),
    [state.submissions, state.quests, state.kids, kidId, outcome, adults])
  const totals = historyTotals(entries)
  const showWho = adults.length > 1
  const currencyFor = (id) => resolveKidTheme(state.kids.find((k) => k.id === id)?.themeId, 1).currency.icon

  const openNote = (e) => { setNoting(e); setNote(e.note) }
  const saveNote = () => {
    dispatch({ type: 'SET_HISTORY_NOTE', submissionId: noting.id, note })
    setNoting(null)
  }

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Chore history</h1>
      <p className="text-sm text-muted mb-3">Every chore sent in, who did it, and what happened.</p>

      {state.kids.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Which child">
          {[{ id: null, name: 'Everyone' }, ...state.kids].map((k) => (
            <FilterChip key={k.id || 'all'} on={kidId === k.id} onClick={() => setKidId(k.id)}>{k.name}</FilterChip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="What happened">
        {OUTCOMES.map((o) => (
          <FilterChip key={o.id} on={outcome === o.id} onClick={() => setOutcome(o.id)}>{o.label}</FilterChip>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon="📜" title="Nothing here yet"
                    body={state.submissions.length ? 'Nothing matches. Try another child, or All.' : 'When a child taps “I did it!”, it is listed here.'} />
      ) : (
        <>
          <Card flat className="mb-3 p-3">
            <p className="text-sm">
              <strong>{totals.accepted}</strong> accepted · <strong>{totals.sentBack}</strong> sent back
              {totals.waiting > 0 && <> · <strong>{totals.waiting}</strong> waiting</>}
            </p>
            <p className="text-xs text-muted mt-0.5">{totals.xp.toLocaleString()} XP earned from these.</p>
            {Object.keys(state.historyTally || {}).length > 0 && (
              <p className="text-xs text-muted mt-0.5" data-testid="history-kept">
                This phone keeps the last {KEEP_DAYS} days in full, to save space. Every chore is still on the
                server: Settings → Download my data has them all.
              </p>
            )}
          </Card>

          {byDay(entries).map((day) => (
            <section key={day.key} className="mb-3">
              <h2 className="text-xs uppercase tracking-wider text-muted mb-1.5">
                {new Date(day.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </h2>
              <Card className="p-0">
                <ul>
                  {day.entries.map((e, i) => (
                    <li key={e.id} className="px-3 py-2.5" style={i ? { borderTop: '1px solid var(--line)' } : undefined}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-sm min-w-0 truncate">{e.title}</span>
                        {e.status === 'approved' && (
                          <span className="text-xs font-display font-bold shrink-0" style={{ color: 'var(--good)' }}>
                            +{e.xp} XP · {currencyFor(e.kidId)} {e.coins}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {e.kidName} · {outcomeWords(e, showWho)} · {new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        {e.sticker && STICKER_MAP[e.sticker] ? ` · ${STICKER_MAP[e.sticker].emoji}` : ''}
                      </p>
                      {e.reason && <p className="text-xs mt-0.5">“{e.reason}”</p>}
                      {e.note && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>📝 {e.note}</p>}
                      {e.status === 'pending' ? (
                        <button type="button" className="text-xs underline text-muted mt-0.5" onClick={() => navigate('/parent/approvals')}>
                          Check it now
                        </button>
                      ) : (
                        <button type="button" className="text-xs underline text-muted mt-0.5" onClick={() => openNote(e)}>
                          {e.note ? 'Change note' : 'Add a note'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </>
      )}

      <p className="text-xs text-muted mt-2">
        What a chore paid can’t be changed here. It was paid when it was accepted and has counted
        towards levels and streaks since. You can add a note to any chore.
        A chore you delete takes its history with it.
      </p>

      <Modal
        open={Boolean(noting)}
        onClose={() => setNoting(null)}
        title={noting ? `A note on “${noting.title}”` : ''}
        footer={(
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setNoting(null)}>Cancel</Button>
            <Button className="flex-1" onClick={saveNote}>Save note</Button>
          </>
        )}
      >
        <p className="text-sm text-muted mb-3">
          For your records, and {noting?.kidName || 'your child'} can see it too. It changes nothing else.
        </p>
        <TextInput
          value={note}
          maxLength={HISTORY_NOTE_MAX}
          onChange={(ev) => setNote(ev.target.value)}
          placeholder="e.g. Did it without being asked"
          aria-label="Note"
          autoFocus
        />
      </Modal>
    </Screen>
  )
}

function outcomeWords(e, showWho) {
  const by = showWho && e.decidedBy ? ` by ${e.decidedBy}` : ''
  if (e.status === 'approved') return `Accepted${by}`
  if (e.status === 'rejected') return `Sent back${by}`
  return 'Waiting for you'
}

function FilterChip({ on, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="chip text-xs py-1.5"
      style={on ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--surface-2)' } : undefined}
    >
      {children}
    </button>
  )
}
