import { useMemo, useState } from 'react'
import { useApp, useKid, useKidTheme, useElite } from '../../state/AppContext.jsx'
import { levelFromXp, formatXp } from '../../lib/xp.js'
import { KID_THEME_MAP, nextEvolution } from '../../data/kidThemes.js'
import { PROFILE_FRAMES, DROP_SELECTORS } from '../../state/initialState.js'
import Avatar, { avatarTier, TIER_THRESHOLDS } from '../../components/Avatar.jsx'
import ThemePicker from '../../components/ThemePicker.jsx'
import { Screen, Card, Button, SectionTitle, Stat, Modal, TextInput, Banner, Chip, DemoTag } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

export default function KidProfile() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const elite = useElite()
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [themeUnlocked, setThemeUnlocked] = useState(false)
  const [draftTheme, setDraftTheme] = useState(kid?.themeId)

  const stats = useMemo(() => {
    const mine = state.events.filter((e) => e.kidId === kid?.id)
    const approved = mine.filter((e) => e.type === 'quest_approved')
    const rejected = mine.filter((e) => e.type === 'quest_rejected')
    return {
      approved: approved.length,
      rejected: rejected.length,
      levelUps: mine.filter((e) => e.type === 'level_up').length,
    }
  }, [state.events, kid?.id])

  if (!kid) return null
  const { level } = levelFromXp(kid.xp)
  const tier = avatarTier(level)
  const evolution = nextEvolution(kid.themeId, level)

  const tryUnlock = () => {
    if (pin === state.family.pin) {
      setThemeUnlocked(true)
      setPinOpen(false)
      setPin('')
      setPinError('')
    } else {
      setPinError('That PIN is not right.')
    }
  }

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-3">Your profile</h1>

      <Card className="mb-3 text-center">
        <div className="flex justify-center mb-2">
          <Avatar theme={theme} level={level} size={128} companion={Boolean(theme.evolution?.companion)} frame={elite ? kid.profileFrame : 'none'} />
        </div>
        <h2 className="font-display text-xl font-extrabold">{kid.name}</h2>
        <p className="text-sm text-muted">
          Level {level} · Form {tier} of 5 · {formatXp(kid.xp)} lifetime XP
        </p>
        {theme.evolution && (
          <Chip tone="var(--accent-2)" className="mt-2">✦ {theme.evolution.label} unlocked</Chip>
        )}
      </Card>

      <div className="flex gap-2 mb-3">
        <Stat icon="✅" value={stats.approved} label="Quests approved" tone="var(--good)" />
        <Stat icon="↩️" value={stats.rejected} label="Sent back" tone="var(--warn)" />
        <Stat icon="🔥" value={kid.streak.count} label="Day streak" />
      </div>

      <SectionTitle>Avatar forms</SectionTitle>
      <Card className="mb-3">
        <div className="flex justify-between gap-1">
          {TIER_THRESHOLDS.map((t) => (
            <div key={t} className="text-center flex-1 min-w-0">
              <div style={{ opacity: level >= t ? 1 : 0.3 }}>
                <Avatar theme={theme} level={t} size={48} interactive={false} />
              </div>
              <div className="text-[10px] text-muted mt-1">Lv {t}</div>
              {level >= t ? (
                <div className="text-[10px]" style={{ color: 'var(--good)' }}>Unlocked</div>
              ) : (
                <div className="text-[10px] text-muted">🔒</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {evolution && (
        <Card className="mb-3" style={{ borderColor: 'var(--accent-2)' }}>
          <SectionTitle>Secret evolution ahead</SectionTitle>
          <p className="text-sm">
            Reach level {evolution.level} and {KID_THEME_MAP[kid.themeId].name} changes into{' '}
            <strong style={{ color: 'var(--accent-2)' }}>{evolution.label}</strong>
            {evolution.companion ? ' — and something joins you.' : '.'}
          </p>
        </Card>
      )}

      <SectionTitle>Profile customisation</SectionTitle>
      <Card className="mb-3">
        {!elite && (
          <Banner tone="warn" icon="🔮" title="Elite Pass only">
            Animated frames and rare drop selectors are part of Elite. Standard accounts keep the plain card.
          </Banner>
        )}
        <div className={`mt-3 ${elite ? '' : 'opacity-50 pointer-events-none'}`}>
          <span className="label">Card frame</span>
          <div className="flex flex-wrap gap-2 mb-3">
            {PROFILE_FRAMES.map((f) => (
              <button
                key={f.id}
                type="button"
                className="chip"
                style={kid.profileFrame === f.id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                onClick={() => dispatch({ type: 'SET_KID_COSMETIC', kidId: kid.id, profileFrame: f.id })}
              >
                {f.name}
              </button>
            ))}
          </div>
          <span className="label">Rare drop selector</span>
          <div className="flex flex-wrap gap-2">
            {DROP_SELECTORS.map((d) => (
              <button
                key={d.id}
                type="button"
                className="chip"
                style={kid.dropSelector === d.id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                onClick={() => dispatch({ type: 'SET_KID_COSMETIC', kidId: kid.id, dropSelector: d.id })}
              >
                {d.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-2 flex items-center gap-2">
            <DemoTag>Cosmetic only</DemoTag> Drop selectors change the look of reward pop-ups, not the odds.
          </p>
        </div>
      </Card>

      <SectionTitle>Theme</SectionTitle>
      <Card className="mb-3">
        <p className="text-sm mb-2">
          You are playing <strong>{KID_THEME_MAP[kid.themeId]?.name}</strong>. Themes are locked once chosen —
          a parent has to enter the PIN to change it.
        </p>
        {!themeUnlocked ? (
          <Button variant="soft" className="w-full" onClick={() => setPinOpen(true)}>
            🔒 Ask a parent to change the theme
          </Button>
        ) : (
          <div className="mt-3">
            <ThemePicker value={draftTheme} onChange={setDraftTheme} previewLevel={level} />
            <div className="flex gap-2 mt-3">
              <Button variant="ghost" className="flex-1" onClick={() => { setThemeUnlocked(false); setDraftTheme(kid.themeId) }}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  dispatch({ type: 'SET_KID_THEME', kidId: kid.id, themeId: draftTheme })
                  setThemeUnlocked(false)
                }}
              >
                Save theme
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Button variant="ghost" className="w-full" onClick={() => navigate('/switch')}>
        Switch profile
      </Button>

      <Modal
        open={pinOpen}
        onClose={() => { setPinOpen(false); setPinError('') }}
        title="Parent PIN required"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setPinOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={tryUnlock}>Unlock</Button>
          </>
        }
      >
        <p className="text-sm text-muted mb-3">Changing a theme resets the look of the whole app for this kid.</p>
        <TextInput
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          type="password"
          placeholder="Parent PIN"
          autoFocus
        />
        {pinError && <p className="text-xs mt-2" style={{ color: 'var(--bad)' }}>{pinError}</p>}
      </Modal>
    </Screen>
  )
}
