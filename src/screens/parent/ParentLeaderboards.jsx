import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { leaderboards, forgetMe } from '../../lib/leaderboards.js'
import { MODES, boardError } from '../../data/leaderboards.js'
import { countryOptions, countryFlag, countryName } from '../../data/countries.js'
import { Screen, Card, Button, Banner, Select, Field, Modal } from '../../components/ui.jsx'
import ModeBadge from '../../components/ModeBadge.jsx'
import { navigate } from '../../lib/router.js'

/**
 * Adventure or Arena, for each child: the parent's switch.
 *
 * Every child starts in Adventure: on no public leaderboard. Arena puts a
 * child on the worldwide and country boards, where strangers see a nickname,
 * a flag and numbers, and nothing else. Only a parent switches it on, here,
 * after reading what it shows; switching back is instant, here or on the
 * child's own phone.
 */
export default function ParentLeaderboards() {
  const { state } = useApp()
  const [data, setData] = useState({ loading: true })
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = useMemo(() => countryOptions(), [])

  const load = useCallback(async () => {
    const res = await leaderboards.familySettings()
    setData({ loading: false, ...res })
  }, [])
  useEffect(() => { load() }, [load])

  const setMode = async (kidId, mode) => {
    setBusy(true); setError('')
    const res = await leaderboards.setMode(kidId, mode)
    setBusy(false)
    setConfirm(null)
    if (!res.ok) setError(boardError(res.reason))
    forgetMe(kidId)
    load()
  }

  const setCountry = async (code) => {
    setBusy(true); setError('')
    const res = await leaderboards.setCountry(code)
    setBusy(false)
    if (!res.ok) setError(boardError(res.reason))
    load()
  }

  const kids = data.ok ? data.kids || [] : []

  return (
    <Screen>
      <button type="button" onClick={() => navigate('/parent/settings')} className="text-sm text-muted mb-2">← Settings</button>
      <h1 className="font-display text-2xl font-extrabold mb-1">Leaderboards</h1>
      <p className="text-sm text-muted mb-3">
        Each child plays in one of two modes. You choose; your child can always step back to Adventure.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {[MODES.adventure, MODES.arena].map((m) => (
          <Card key={m.id} className="p-3" style={{ borderColor: m.color }}>
            <div className="text-2xl" aria-hidden="true">{m.icon}</div>
            <div className="font-display font-bold" style={{ color: m.color }}>{m.name}</div>
            <p className="text-[11px] text-muted mt-1">
              {m.id === 'adventure'
                ? 'The default. Your child plays at their own pace. Family and guild boards only: people you already approved.'
                : 'Your child also races on the worldwide and country boards, where children in other families can see them.'}
            </p>
          </Card>
        ))}
      </div>

      <Banner tone="info" icon="🔒" title="What Arena shows to strangers" className="mb-3">
        <span data-testid="arena-explainer">
          Only a nickname your child builds from our word lists (like SwiftComet42), your country&apos;s flag, and
          numbers: chores done, XP, level, streaks, badges and arcade scores. Never their name, photo, your family
          name, school, town, or anything typed. RankUp has no location: the country is the one you pick below.
          Switching back to Adventure takes them off every public board straight away.
        </span>
      </Banner>

      {!leaderboards.available() && (
        <Banner tone="warn" icon="🔌" title="Leaderboards need the sync service">
          Worldwide boards need RankUp&apos;s server. On this phone your children see their family board only.
        </Banner>
      )}
      {error && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}
      {data.loading && leaderboards.available() && <Card><p className="text-sm text-muted">Loading…</p></Card>}

      {kids.map((k) => (
        <Card key={k.kid_id} className="mb-2" data-testid={`arena-kid-${k.name}`}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{k.name}</div>
              <div className="text-xs text-muted truncate">Nickname: <strong>{k.nickname}</strong></div>
            </div>
            <ModeBadge mode={k.mode} />
          </div>
          <div className="mt-3">
            {k.mode === 'arena' ? (
              <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setMode(k.kid_id, 'adventure')}
                data-testid="switch-adventure">
                🧭 Switch {k.name} back to Adventure
              </Button>
            ) : (
              <Button className="w-full" disabled={busy} onClick={() => setConfirm(k)} data-testid="switch-arena"
                style={{ background: MODES.arena.color }}>
                ⚔️ Switch on Arena for {k.name}
              </Button>
            )}
          </div>
        </Card>
      ))}

      {data.ok && (
        <Card className="mt-3">
          <Field label="Your country, for the “My country” boards"
            hint="Picked from the list, never worked out from where your phone is. Only the flag and name show.">
            <Select value={data.country || ''} disabled={busy} onChange={(e) => setCountry(e.target.value)} data-testid="country-picker">
              <option value="">No country (worldwide only)</option>
              {options.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </Select>
          </Field>
          {data.country && <p className="text-xs text-muted mt-1">Showing as {countryFlag(data.country)} {countryName(data.country)}.</p>}
        </Card>
      )}

      <p className="text-xs text-muted mt-3">
        Read more in the <button type="button" className="underline" onClick={() => navigate('/legal/privacy')}>privacy policy</button>.
        {state.kids.length > 0 && ' Deleting a child removes them from every board at once.'}
      </p>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm ? `Arena for ${confirm.name}?` : ''}
        footer={confirm && (
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>Not now</Button>
            <Button className="flex-1" disabled={busy} onClick={() => setMode(confirm.kid_id, 'arena')} data-testid="confirm-arena">
              Switch on Arena
            </Button>
          </>
        )}>
        {confirm && (
          <div className="text-sm space-y-2">
            <p>{confirm.name} will appear on the worldwide{data.country ? ' and country' : ''} leaderboards, where children in other families can see them as:</p>
            <p className="font-display font-extrabold text-lg text-center" style={{ color: MODES.arena.color }}>
              {data.country ? `${countryFlag(data.country)} ` : ''}{confirm.nickname}
            </p>
            <p className="text-muted text-xs">With their numbers only. Not their name or anything else about your family. They can go back to Adventure at any time, and so can you.</p>
          </div>
        )}
      </Modal>
    </Screen>
  )
}
