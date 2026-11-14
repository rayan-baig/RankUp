import { useEffect, useState } from 'react'
import { useApp, useKid } from '../../state/AppContext.jsx'
import { guildsEnabled } from '../../lib/guilds.js'
import { guildsAllowedByPlan } from '../../state/reducer.js'
import { leaderboards, cachedMe } from '../../lib/leaderboards.js'
import {
  BOARDS, BOARD_MAP, PERIODS, SCOPES, MODES, boardsFor, scopesFor, resetWords, boardError, localFamilyBoard,
} from '../../data/leaderboards.js'
import { MINIGAMES } from '../../data/minigames.js'
import { countryFlag, countryName } from '../../data/countries.js'
import { formatXp, levelFromXp } from '../../lib/xp.js'
import { Screen, Card, Banner, PageTitle, Segmented } from '../../components/ui.jsx'
import ModeBadge from '../../components/ModeBadge.jsx'
import { navigate } from '../../lib/router.js'

/**
 * The leaderboards, for a child.
 *
 * Adventure (where every child starts): the family board, and the guild's if
 * they are in one, among people their family already approved. Arena (a
 * parent's yes): the worldwide and country boards too, where they are their
 * nickname and a flag. The numbers are the server's, ranked every ten
 * minutes (supabase/leaderboards.sql).
 */
export default function KidLeaderboards() {
  const { state } = useApp()
  const kid = useKid()
  const guildsOn = guildsEnabled() && guildsAllowedByPlan(state)
  const online = leaderboards.available() && !state.demo
  const [me, setMe] = useState(null)
  const [board, setBoard] = useState('chores')
  const [period, setPeriod] = useState('week')
  const [scope, setScope] = useState('family')
  const [game, setGame] = useState(MINIGAMES[0]?.id || 'stack')
  const [result, setResult] = useState({ loading: true })

  const mode = me?.mode || 'adventure'
  const def = BOARD_MAP[board] || BOARDS[0]
  const scopes = scopesFor(board, { mode, guildsOn })
  const periods = def.periods

  useEffect(() => {
    if (!kid || !online) return
    let live = true
    cachedMe(kid.id, { fresh: true }).then((res) => {
      if (!live || !res.ok) return
      setMe(res)
      // An Arena child opens on the worldwide race.
      if (res.mode === 'arena') setScope('world')
    })
    return () => { live = false }
  }, [kid?.id, online])

  // Keep the period and scope ones this board has.
  useEffect(() => {
    if (!periods.includes(period)) setPeriod(periods[0])
    if (!scopes.includes(scope) && scopes.length) setScope(scopes[0])
  }, [board, mode, guildsOn])

  useEffect(() => {
    if (!kid) return undefined
    if (!periods.includes(period) || !scopes.includes(scope)) return undefined
    let live = true
    setResult((r) => ({ ...r, loading: true }))
    const get = online
      ? leaderboards.board(kid.id, board, period, scope, board === 'arcade' ? game : '')
      : Promise.resolve(localFamilyBoard(state, kid.id, board, period))
    get.then((res) => { if (live) setResult({ loading: false, ...res }) })
    return () => { live = false }
  }, [kid?.id, board, period, scope, game, online, mode])

  if (!kid) return null

  const rows = result.ok ? result.rows || [] : []
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)
  const youShown = rows.some((r) => r.you)
  const unit = def.unit
  const reset = resetWords(period)

  return (
    <Screen>
      <button type="button" onClick={() => navigate('/kid')} className="text-sm text-muted mb-2">← Home</button>
      <PageTitle sub="Race your family, your guild, or the world." right={<ModeBadge mode={mode} />}>
        <span data-testid="boards-title">Leaderboards</span>
      </PageTitle>

      {/* Every board, one tap away. */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1" role="group" aria-label="Board" data-testid="board-picker">
        {boardsFor({ guildsOn }).map((b) => {
          const on = b.id === board
          return (
            <button key={b.id} type="button" aria-pressed={on} onClick={() => setBoard(b.id)}
              className="shrink-0 rounded-2xl px-3 py-2 text-left transition-transform active:scale-95"
              style={{
                minWidth: 92,
                background: on ? 'linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent-2) 60%, var(--accent)))' : 'var(--surface-2)',
                color: on ? 'var(--bg)' : 'var(--ink)',
                border: `1px solid ${on ? 'transparent' : 'var(--line)'}`,
                boxShadow: on ? '0 8px 24px -12px var(--accent)' : 'none',
              }}>
              <span className="block text-xl leading-none" aria-hidden="true">{b.icon}</span>
              <span className="block text-[11px] font-bold mt-1 whitespace-nowrap">{b.title}</span>
            </button>
          )
        })}
      </div>

      {board === 'arcade' && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" role="group" aria-label="Game">
          {MINIGAMES.map((g) => (
            <button key={g.id} type="button" aria-pressed={g.id === game} onClick={() => setGame(g.id)}
              className="chip whitespace-nowrap shrink-0"
              style={g.id === game ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
              {g.icon} {g.name}
            </button>
          ))}
        </div>
      )}

      <Segmented label="Where" value={scope} onChange={setScope}
        options={scopes.map((s) => ({ id: s, name: SCOPES[s].label, icon: SCOPES[s].icon }))} />
      {periods.length > 1 && (
        <Segmented label="When" value={period} onChange={setPeriod}
          options={periods.map((p) => ({ id: p, name: PERIODS[p].label }))} />
      )}
      <p className="text-[11px] text-muted -mt-1 mb-3" data-testid="board-when">
        {def.periodLabel || PERIODS[period]?.label}
        {reset ? ` · ${reset} (midnight UTC)` : ''}
        {scope === 'country' && result.country ? ` · ${countryFlag(result.country)} ${countryName(result.country)}` : ''}
      </p>
      <p className="text-xs text-muted -mt-2 mb-3" data-testid="board-explain">{def.icon} {def.explain}</p>

      {mode === 'adventure' && (
        <Card className="mb-3 flex items-start gap-3" data-testid="adventure-note"
          style={{ borderColor: MODES.adventure.color }}>
          <span className="text-2xl" aria-hidden="true">{MODES.adventure.icon}</span>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm">You are in Adventure</div>
            <p className="text-xs text-muted">
              {MODES.adventure.line} Worldwide boards are in Arena, which a grown-up can switch on.
            </p>
          </div>
        </Card>
      )}

      {!online && (
        <Banner tone="info" icon="🏠" title="Family board on this phone" className="mb-3">
          Worldwide and guild boards need the sync service. This is your family, worked out here.
        </Banner>
      )}

      {result.loading && !rows.length && <Card><p className="text-sm text-muted">Loading the board…</p></Card>}
      {!result.loading && !result.ok && (
        <Card><p className="text-sm text-muted" role="alert">{boardError(result.reason)}</p></Card>
      )}
      {!result.loading && result.ok && rows.length === 0 && (
        <Card className="text-center py-6">
          <div className="text-3xl mb-1" aria-hidden="true">🏁</div>
          <p className="font-display font-bold">Nobody on this board yet</p>
          <p className="text-xs text-muted">{period === 'all' ? 'Be the first!' : `${reset || 'It is fresh'}: be the first this time.`}</p>
        </Card>
      )}

      {podium.length > 0 && <Podium rows={podium} unit={unit} board={board} />}

      {rest.length > 0 && (
        <Card className="p-0 overflow-hidden mb-3" data-testid="board-list">
          {rest.map((r, i) => <BoardRow key={`${r.rank}-${r.name}-${i}`} row={r} unit={unit} board={board} last={i === rest.length - 1} />)}
        </Card>
      )}

      {result.ok && result.me && (
        <YourPlace me={result.me} shown={youShown} total={result.total} unit={unit} board={board} scope={scope} />
      )}

      <p className="text-[11px] text-muted mt-3 text-center">
        {SCOPES[scope]?.public
          ? 'Everyone here is a nickname and a flag. No names, ever.'
          : scope === 'guild' ? 'Only your guild sees this board.' : 'Only your family sees this board.'}
        {result.computed_at ? ' Updated every few minutes.' : ''}
      </p>
    </Screen>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']
const MEDAL_TONES = ['#f5c542', '#c9d1db', '#d98b4e']

function scoreText(row, unit, board) {
  // The level board is ranked by the XP behind the level; the level is worked
  // out here, by the app's one curve.
  if (board === 'level') return `Lv ${levelFromXp(row.score || 0).level}`
  const n = formatXp(row.score || 0)
  return `${n} ${unit}`
}

function nameOf(row) {
  return row.name
}

/** A nickname that may wrap between its pieces: Lively·Turtle·72, never Turtle7 / 2. */
function wrappable(name) {
  const parts = String(name || '').match(/[A-Z][a-z]+|\d+|[^A-Z\d]+/g) || [name]
  return parts.map((p, i) => (i ? [<wbr key={i} />, p] : p))
}

/** The top three, on blocks: second, first, third. */
function Podium({ rows, unit, board }) {
  const order = [rows[1], rows[0], rows[2]]
  const heights = [74, 100, 58]
  return (
    <div className="flex items-end gap-2 mb-3" data-testid="podium">
      {order.map((r, i) => {
        if (!r) return <div key={i} className="flex-1" />
        const place = Math.min(3, r.rank) - 1
        return (
          <div key={i} className="flex-1 min-w-0 text-center">
            <div className="text-3xl leading-none mb-1 anim-pop" aria-hidden="true">{MEDALS[place]}</div>
            <div className="text-[11px] font-bold px-0.5 leading-tight" style={r.you ? { color: 'var(--accent)' } : undefined}>
              {r.country ? `${countryFlag(r.country)} ` : ''}{wrappable(nameOf(r))}
            </div>
            {r.you && <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>You</div>}
            <div className="text-[11px] text-muted mb-1">{scoreText(r, unit, board)}</div>
            <div className="rounded-t-xl flex items-start justify-center pt-2 font-display font-extrabold text-xl"
              style={{
                height: heights[i],
                color: 'var(--bg)',
                background: `linear-gradient(180deg, ${MEDAL_TONES[place]}, color-mix(in srgb, ${MEDAL_TONES[place]} 55%, var(--surface)))`,
                boxShadow: r.you ? `0 0 0 3px var(--accent), 0 10px 30px -12px ${MEDAL_TONES[place]}` : `0 10px 30px -14px ${MEDAL_TONES[place]}`,
              }}>
              {r.rank}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Change({ row }) {
  if (row.change > 0) return <span className="text-[10px] font-bold" style={{ color: 'var(--good)' }} aria-label={`up ${row.change}`}>▲{row.change}</span>
  if (row.change < 0) return <span className="text-[10px] font-bold" style={{ color: 'var(--bad)' }} aria-label={`down ${-row.change}`}>▼{-row.change}</span>
  if (row.is_new) return <span className="text-[10px] font-bold" style={{ color: 'var(--accent-2)' }}>new</span>
  return <span className="text-[10px] text-muted">–</span>
}

function BoardRow({ row, unit, board, last }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5" data-you={row.you ? 'true' : undefined}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--line)',
        background: row.you ? 'color-mix(in srgb, var(--accent) 16%, var(--surface-2))' : 'transparent',
        boxShadow: row.you ? 'inset 3px 0 0 var(--accent)' : 'none',
      }}>
      <span className="w-8 text-center font-display font-extrabold text-sm">{row.rank}</span>
      <span className="w-7 text-center"><Change row={row} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate">
          {row.country ? `${countryFlag(row.country)} ` : ''}{nameOf(row)}
        </span>
        <span className="block text-[10px] text-muted">
          {row.you && <strong style={{ color: 'var(--accent)' }}>YOU{row.xp != null && board !== 'level' && !row.guild ? ' · ' : ''}</strong>}
          {row.xp != null && board !== 'level' && !row.guild ? `Level ${levelFromXp(row.xp).level}` : ''}
        </span>
        {row.guild && row.detail && <span className="block text-[10px] text-muted">{row.detail.members} members · {formatXp(row.detail.total)} XP this week</span>}
      </span>
      <span className="font-display font-bold text-sm shrink-0">{scoreText(row, unit, board)}</span>
    </div>
  )
}

/** Where you are, even a long way down. */
function YourPlace({ me, shown, total, unit, board, scope }) {
  const onBoard = Boolean(me.rank)
  return (
    <Card className="mb-3" data-testid="your-place"
      style={{
        position: 'sticky', bottom: 96, zIndex: 5,
        borderColor: 'var(--accent)',
        background: 'color-mix(in srgb, var(--surface) 92%, var(--accent) 8%)',
        boxShadow: '0 0 0 1px var(--accent), 0 12px 30px -10px rgba(0,0,0,0.6)',
      }}>
      <div className="flex items-center gap-3">
        <span className="font-display font-extrabold text-2xl w-14 text-center" style={{ color: 'var(--accent)' }}>
          {onBoard ? `#${me.rank}` : '—'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted">{board === 'guilds' ? 'Your guild' : 'Your place'}</div>
          <div className="font-semibold text-sm truncate">{me.name || 'You'}</div>
          {onBoard && total ? <div className="text-[11px] text-muted">{`#${me.rank} of ${formatXp(total)}`}</div> : null}
          {!onBoard && (
            <div className="text-[11px] text-muted">
              {board === 'guilds' && !me.in_guild ? 'Join a guild to race as a team.'
                : SCOPES[scope]?.public ? 'Do a chore to get on this board. New places show within a few minutes.'
                  : 'Do a chore to get on this board.'}
            </div>
          )}
          {onBoard && !shown && <div className="text-[11px] text-muted">Keep going to reach the top 50!</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-bold">{scoreText({ score: me.score }, unit, board)}</div>
          {typeof me.change === 'number' && me.change !== 0 && (
            <div className="text-[11px] font-bold" style={{ color: me.change > 0 ? 'var(--good)' : 'var(--bad)' }}>
              {me.change > 0 ? `▲ ${me.change} today` : `▼ ${-me.change} today`}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

