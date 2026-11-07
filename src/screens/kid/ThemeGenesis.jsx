import { useMemo, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { uid } from '../../lib/id.js'
import { navigate } from '../../lib/router.js'
import { plainName } from '../../lib/kidWords.js'
import {
  VIBES, VIBE_MAP, PALETTES, PATTERNS, MASCOTS, MAX_KID_THEMES, NAME_MAX, WORLD_MAX, CURRENCY_MAX,
  designFromVibe, cleanDesign, themeProblem, readablePalette, buildTheme, customThemeId,
} from '../../data/themeGenesis.js'
import { SCENES } from '../../components/ThemeBackground.jsx'
import ThemePreview, { ThemeSwatch } from '../../components/ThemePreview.jsx'
import { Screen, Card, Button, Field, TextInput, Chip, Banner, Modal, ProgressBar } from '../../components/ui.jsx'

/**
 * Theme Genesis: a child makes a theme of their own.
 *
 * A small version of Genesis on the MTRX Horizyn site, where an idea goes
 * from Spark to Launch with a checklist. Here it is four short steps:
 *
 *   Spark   a name and a starting vibe
 *   Design  colours (a curated set, or their own, kept readable), a
 *           background pattern and a mascot
 *   Build   the names of the four worlds and of the coins, filled in already
 *   Launch  their home screen in the new theme, then "Use this theme"
 *
 * Every step starts filled in from the vibe, so a child can go from Spark to
 * Launch in four taps, and change as much as they like on the way. What they
 * make is a look and some names over a built-in theme's levels: XP, coins,
 * rewards and every unlock work exactly as before (src/data/themeGenesis.js).
 *
 * Reached from the theme picker on the You tab ("Make your own theme") and
 * from Settings on the parent side, for a chosen child.
 */

/** The four steps, each with its colour on the track: dawn, from the spark to the launch. */
const STEPS = [
  { key: 'spark', name: 'Spark', colour: '#ffb347' },
  { key: 'design', name: 'Design', colour: '#ff6fa8' },
  { key: 'build', name: 'Build', colour: '#6aa8ff' },
  { key: 'launch', name: 'Launch', colour: '#34e89e' },
]

/** What each step asks for, as a short checklist that ticks itself. */
function checklist(draft, seen) {
  const d = draft.design
  const name = plainName(draft.name, NAME_MAX)
  return {
    spark: [['A name', Boolean(name) && !themeProblem(name, d)], ['A vibe', Boolean(VIBE_MAP[d.vibe])]],
    design: [['Colours', Boolean(d.bg && d.a && d.a2)], ['A pattern', Boolean(d.pat)], ['A mascot', Boolean(d.mascot)]],
    build: [['Four worlds', d.worlds.every((w) => plainName(w, WORLD_MAX))], ['Coin name', Boolean(plainName(d.cur, CURRENCY_MAX))]],
    launch: [['Looked at it', seen.has('launch')], ['Saved', Boolean(draft.saved)]],
  }
}

/** One step's dot, name and how much of it is done. */
function Track({ step, setStep, list, seen }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5 mb-2" data-testid="genesis-track">
      {STEPS.map((s, i) => {
        const items = list[s.key]
        const done = items.filter(([, ok]) => ok).length
        const here = i === step
        const reachable = seen.has(s.key) || i <= step
        return (
          <li key={s.key}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => setStep(i)}
              aria-current={here ? 'step' : undefined}
              className="w-full text-left px-2 py-1.5 rounded-xl"
              style={{
                border: `2px solid ${here ? s.colour : 'var(--line)'}`,
                background: here ? `color-mix(in srgb, ${s.colour} 14%, var(--surface))` : 'var(--surface)',
                opacity: reachable ? 1 : 0.55,
              }}
            >
              <span className="flex items-center gap-1.5">
                <span className="inline-block rounded-full shrink-0" style={{ width: 8, height: 8, background: s.colour }} />
                <span className="text-[12px] font-bold truncate">{s.name}</span>
              </span>
              <span className="block text-[10px] text-muted">{done}/{items.length}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Checklist({ items, colour }) {
  return (
    <ul className="flex flex-wrap gap-1.5 mb-3" data-testid="genesis-checklist">
      {items.map(([label, ok]) => (
        <li key={label}>
          <span className="chip" style={ok ? { borderColor: colour, color: colour } : undefined}>
            {ok ? '✓' : '○'} {label}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A pattern, drawn small: the real scene, on the theme's colours. */
function PatternTile({ id, colors, picked, onPick, name }) {
  const Scene = SCENES[`pat-${id}`]
  return (
    <button type="button" onClick={onPick} aria-pressed={picked} className="text-left"
            style={{ border: `2px solid ${picked ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 14, padding: 3, background: 'var(--surface)' }}>
      <svg viewBox="8 8 46 46" className="w-full block" style={{ aspectRatio: '1 / 1', borderRadius: 10 }} aria-hidden="true">
        {Scene && <Scene c={colors} />}
      </svg>
      <span className="block text-[11px] font-semibold text-center mt-0.5">{name}</span>
    </button>
  )
}

/** The list of a child's themes: open one, wear it, or start another. */
function ThemeList({ kid, themes, area, onOpen, onNew, onDelete, wearing }) {
  const full = themes.length >= MAX_KID_THEMES
  return (
    <>
      <Card className="mb-3" data-testid="genesis-list">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="font-semibold text-sm">
            {area === 'parent' ? `${kid.name}'s themes` : 'Your themes'}
            <span className="text-muted font-normal"> · {themes.length} of {MAX_KID_THEMES}</span>
          </p>
        </div>
        {themes.length === 0 && <p className="text-sm text-muted">None yet. Every world starts as a spark.</p>}
        {themes.map((t) => {
          const built = buildTheme({ id: customThemeId(t.id), name: t.name, design: t.design })
          return (
            <div key={t.id} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--line)' }} data-testid="genesis-row">
              <ThemeSwatch theme={built} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{t.name}</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  <Chip>{t.status === 'ready' ? 'Finished' : 'Draft'}</Chip>
                  {wearing === customThemeId(t.id) && <Chip tone="var(--good)">Wearing</Chip>}
                  {t.useAsk && <Chip tone="var(--warn)">Asked to wear</Chip>}
                  {t.sendAsk && <Chip tone="var(--warn)">Waiting for a grown-up</Chip>}
                  {t.sentAt && !t.pickedSeason && <Chip tone="var(--accent-2)">Sent to RankUp</Chip>}
                  {t.pickedSeason && <Chip tone="var(--good)">Season {t.pickedSeason}!</Chip>}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" className="chip" onClick={() => onOpen(t)}>Edit</button>
                <button type="button" className="chip" style={{ color: 'var(--bad)' }} onClick={() => onDelete(t)}>Delete</button>
              </div>
            </div>
          )
        })}
      </Card>
      {full ? (
        <Banner tone="info" icon="🗂️" title={`${MAX_KID_THEMES} themes is the most`}>
          Delete one to make room for a new one.
        </Banner>
      ) : (
        <Button className="w-full" onClick={onNew}>✨ Start a new theme</Button>
      )}
    </>
  )
}

export default function ThemeGenesis({ kidId, editId = null, area = 'kid' }) {
  const { state, dispatch } = useApp()
  const kid = state.kids.find((k) => k.id === kidId) || state.kids.find((k) => k.id === state.session.kidId) || state.kids[0]
  const themes = useMemo(() => (state.kidThemes || []).filter((t) => t.kidId === kid?.id), [state.kidThemes, kid?.id])
  const editing = editId && themes.find((t) => t.id === editId)

  const [draft, setDraft] = useState(() => (editing
    ? { id: editing.id, name: editing.name, design: cleanDesign(editing.design), saved: true }
    : null))
  const [step, setStepRaw] = useState(0)
  const [seen, setSeen] = useState(() => new Set(editing ? STEPS.map((s) => s.key) : ['spark']))
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState('')
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [removing, setRemoving] = useState(null)
  const [credit, setCredit] = useState('')

  if (!kid) return null

  const setStep = (i) => {
    setStepRaw(i)
    setSeen((s) => new Set([...s, STEPS[i].key]))
    setProblem('')
    window.scrollTo?.(0, 0)
  }
  const back = () => navigate(area === 'parent' ? '/parent/settings' : '/kid/profile')

  /* ---------- the list ---------- */
  if (!draft) {
    return (
      <Screen>
        <Header area={area} onBack={back} />
        <ThemeList
          kid={kid}
          area={area}
          themes={themes}
          wearing={kid.themeId}
          onOpen={(t) => {
            setDraft({ id: t.id, name: t.name, design: cleanDesign(t.design), saved: true })
            setSeen(new Set(STEPS.map((s) => s.key)))
            setStepRaw(0)
          }}
          onNew={() => {
            setDraft({ id: uid('theme'), ...designFromVibe('space', ''), saved: false })
            setSeen(new Set(['spark']))
            setStepRaw(0)
          }}
          onDelete={(t) => setRemoving(t)}
        />
        <RemoveModal theme={removing} onClose={() => setRemoving(null)}
                     onConfirm={() => { dispatch({ type: 'DELETE_KID_THEME', id: removing.id }); setRemoving(null) }} />
      </Screen>
    )
  }

  const d = draft.design
  const list = checklist(draft, seen)
  const allItems = Object.values(list).flat()
  const progress = allItems.filter(([, ok]) => ok).length / allItems.length
  const stored = themes.find((t) => t.id === draft.id)
  const isNew = !stored
  const atLimit = isNew && themes.length >= MAX_KID_THEMES
  const preview = buildTheme({ id: customThemeId(draft.id), name: draft.name, design: d })
  const readable = readablePalette(d).colors
  const adjusted = readable.bg !== d.bg
  const setDesign = (patch) => setDraft((x) => ({ ...x, design: { ...x.design, ...patch }, saved: false }))
  const setName = (name) => setDraft((x) => ({ ...x, name: [...name].slice(0, NAME_MAX).join(''), saved: false }))
  const pickVibe = (id) => {
    const fresh = designFromVibe(id)
    setDraft((x) => {
      const wasSuggested = !plainName(x.name, NAME_MAX) || Object.values(VIBE_MAP).some((v) => v.names.includes(x.name))
      return { ...x, name: wasSuggested ? fresh.name : x.name, design: fresh.design, saved: false }
    })
  }

  /** Save what is there, as a draft or finished. False (with the reason shown) when it cannot be. */
  const save = (status) => {
    const why = themeProblem(draft.name, d)
    if (why) { setProblem(why); return false }
    if (atLimit) { setProblem(`${MAX_KID_THEMES} themes is the most one player can keep. Delete one first.`); return false }
    dispatch({ type: 'SAVE_KID_THEME', theme: { id: draft.id, kidId: kid.id, name: draft.name, design: d, status } })
    setDraft((x) => ({ ...x, saved: true }))
    setProblem('')
    return true
  }

  const wear = () => {
    dispatch({ type: 'SET_KID_THEME', kidId: kid.id, themeId: customThemeId(draft.id) })
    if (stored?.useAsk) dispatch({ type: 'ASK_KID_THEME', id: draft.id, ask: 'use', on: false })
    setDone(area === 'parent' ? `${kid.name} is now playing ${plainName(draft.name, NAME_MAX)}.` : `You are now playing ${plainName(draft.name, NAME_MAX)}!`)
  }

  /*
   * "Use this theme". Themes are locked once chosen (docs/GAME-DESIGN.md):
   * on the parent side it is a parent choosing; on a shared phone the PIN
   * opens it, as it does for any theme; on a child's own phone, which holds
   * no PIN, the child asks and a parent switches it on from theirs.
   */
  const useIt = () => {
    if (!save('ready')) return
    if (area === 'parent') { wear(); return }
    if (state.family.pin) { setPinOpen(true); return }
    dispatch({ type: 'ASK_KID_THEME', id: draft.id, ask: 'use', on: true })
    setDone('Saved! A grown-up can switch it on from their phone: it is waiting in their Review tab.')
  }

  const tryPin = () => {
    if (state.family.pin && pin === state.family.pin) {
      setPinOpen(false); setPin(''); setPinError('')
      wear()
    } else setPinError('That PIN is not right.')
  }

  const s = STEPS[step]
  return (
    <Screen>
      <Header area={area} onBack={() => setDraft(null)} backLabel="← Your themes" />
      <Track step={step} setStep={setStep} list={list} seen={seen} />
      <div className="mb-3"><ProgressBar value={progress} max={1} height={8} tone={`linear-gradient(90deg, ${STEPS[0].colour}, ${STEPS[3].colour})`} label="Theme progress" /></div>

      <p className="text-[11px] uppercase tracking-widest font-bold mb-0.5" style={{ color: s.colour }}>Step {step + 1} of 4 · {s.name}</p>
      {step === 0 && (
        <section data-testid="genesis-spark">
          <h2 className="font-display text-xl font-extrabold mb-1">Name it, and pick a vibe</h2>
          <Checklist items={list.spark} colour={s.colour} />
          <Field label={`Theme name (${[...draft.name].length}/${NAME_MAX})`}>
            <TextInput value={draft.name} onChange={(e) => setName(e.target.value)} placeholder="Name your world" maxLength={NAME_MAX * 2} data-testid="genesis-name" />
          </Field>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {VIBE_MAP[d.vibe].names.map((n) => (
              <button key={n} type="button" className="chip" onClick={() => setName(n)}>{n}</button>
            ))}
          </div>
          <span className="label">Starting idea</span>
          <div className="grid grid-cols-3 gap-2">
            {VIBES.map((v) => (
              <button key={v.id} type="button" onClick={() => pickVibe(v.id)} aria-pressed={d.vibe === v.id}
                      className="p-2.5 text-center" data-testid={`vibe-${v.id}`}
                      style={{ border: `2px solid ${d.vibe === v.id ? s.colour : 'var(--line)'}`, borderRadius: 14, background: 'var(--surface)' }}>
                <span className="block text-2xl leading-none mb-1" aria-hidden="true">{v.icon}</span>
                <span className="block text-[12px] font-semibold leading-tight">{v.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section data-testid="genesis-design">
          <h2 className="font-display text-xl font-extrabold mb-1">Colours, pattern, mascot</h2>
          <Checklist items={list.design} colour={s.colour} />
          <span className="label">Colours</span>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {PALETTES.map((p) => {
              const picked = d.bg === p.bg && d.a === p.a && d.a2 === p.a2
              return (
                <button key={p.id} type="button" onClick={() => setDesign({ bg: p.bg, a: p.a, a2: p.a2 })} aria-pressed={picked}
                        className="flex items-center gap-2 p-2 text-left" data-testid={`palette-${p.id}`}
                        style={{ border: `2px solid ${picked ? s.colour : 'var(--line)'}`, borderRadius: 14, background: 'var(--surface)' }}>
                  <span className="flex -space-x-1.5 shrink-0" aria-hidden="true">
                    {[p.bg, p.a, p.a2].map((c) => <span key={c} className="inline-block rounded-full" style={{ width: 18, height: 18, background: c, border: '2px solid var(--surface)' }} />)}
                  </span>
                  <span className="text-[13px] font-semibold truncate">{p.name}</span>
                </button>
              )
            })}
          </div>
          <details className="mb-4" data-testid="genesis-custom-colours">
            <summary className="text-sm font-semibold cursor-pointer py-1">🎨 Or mix your own</summary>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[['bg', 'Background'], ['a', 'Colour 1'], ['a2', 'Colour 2']].map(([key, label]) => (
                <label key={key} className="text-center text-[12px]">
                  <input type="color" value={d[key]} onChange={(e) => setDesign({ [key]: e.target.value.toLowerCase() })}
                         className="w-full h-11 rounded-lg cursor-pointer" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
                         aria-label={label} />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted mt-2">
              {adjusted
                ? 'We made the background a little darker or lighter so every word stays easy to read.'
                : 'Words always stay easy to read: RankUp picks the text colour for you.'}
            </p>
          </details>
          <span className="label">Background pattern</span>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {PATTERNS.map((p) => (
              <PatternTile key={p.id} id={p.id} name={p.name} colors={readable} picked={d.pat === p.id} onPick={() => setDesign({ pat: p.id })} />
            ))}
          </div>
          <span className="label">Mascot</span>
          <div className="grid grid-cols-6 gap-1.5">
            {MASCOTS.map((m) => (
              <button key={m} type="button" onClick={() => setDesign({ mascot: m })} aria-pressed={d.mascot === m}
                      className="text-2xl py-1.5" aria-label={`Mascot ${m}`}
                      style={{ border: `2px solid ${d.mascot === m ? s.colour : 'var(--line)'}`, borderRadius: 12, background: 'var(--surface)' }}>
                {m}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section data-testid="genesis-build">
          <h2 className="font-display text-xl font-extrabold mb-1">Name your worlds</h2>
          <Checklist items={list.build} colour={s.colour} />
          <p className="text-xs text-muted mb-3">
            Your theme gets the same levels as every theme: a new world at levels 10, 25, 50 and 100.
            It changes how the game looks and what things are called, never the rules or the rewards.
          </p>
          {preview.evolutions.map((e, i) => (
            <Field key={e.level} label={`World ${i + 1} · opens at level ${e.level}`}>
              <TextInput value={d.worlds[i]} maxLength={WORLD_MAX * 2} data-testid={`genesis-world-${i}`}
                         onChange={(ev) => setDesign({ worlds: d.worlds.map((w, j) => (j === i ? [...ev.target.value].slice(0, WORLD_MAX).join('') : w)) })} />
            </Field>
          ))}
          <Field label="Your coins are called">
            <TextInput value={d.cur} maxLength={CURRENCY_MAX * 2} data-testid="genesis-currency"
                       onChange={(e) => setDesign({ cur: [...e.target.value].slice(0, CURRENCY_MAX).join('') })} />
          </Field>
        </section>
      )}

      {step === 3 && (
        <section data-testid="genesis-launch">
          <h2 className="font-display text-xl font-extrabold mb-1">Here it is</h2>
          <Checklist items={list.launch} colour={s.colour} />
          <ThemePreview name={draft.name} design={d} kidName={kid.name} />
          {done && <Banner tone="good" icon="🚀" title="Launched" className="mt-3">{done}</Banner>}
          <div className="flex flex-col gap-2 mt-3">
            <Button onClick={useIt} data-testid="genesis-use">Use this theme</Button>
            <Button variant="soft" onClick={() => { if (save('ready')) setDone(done || 'Saved. You can find it on the You tab.') }}>
              Save it, finished
            </Button>
          </div>
          {stored?.status === 'ready' && (
            <SendToRankUp theme={stored} kid={kid} area={area} credit={credit} setCredit={setCredit} dispatch={dispatch} />
          )}
        </section>
      )}

      {problem && <Banner tone="warn" icon="✋" title="Not yet" className="mt-3">{problem}</Banner>}

      <div className="flex gap-2 mt-4">
        {step > 0
          ? <Button variant="ghost" className="flex-1" onClick={() => setStep(step - 1)}>← {STEPS[step - 1].name}</Button>
          : <Button variant="ghost" className="flex-1" onClick={() => { if (save(stored?.status || 'draft')) setDone('Saved as a draft.') }}>Save draft</Button>}
        {step < 3 && (
          <Button className="flex-1" data-testid="genesis-next"
                  onClick={() => { const why = step === 0 ? themeProblem(draft.name, d) : null; if (why) setProblem(why); else setStep(step + 1) }}>
            {STEPS[step + 1].name} →
          </Button>
        )}
      </div>
      {step > 0 && step < 3 && (
        <button type="button" className="text-xs underline text-muted mt-3 w-full text-center"
                onClick={() => { if (save(stored?.status || 'draft')) setDone('Saved as a draft.') }}>
          Save as a draft and finish later
        </button>
      )}
      {done && step < 3 && <p className="text-xs text-center mt-2" style={{ color: 'var(--good)' }} data-testid="genesis-saved">{done}</p>}
      {atLimit && <Banner tone="info" icon="🗂️" title={`${MAX_KID_THEMES} themes is the most`} className="mt-3">Delete one of your themes to save this one.</Banner>}

      <Modal
        open={pinOpen}
        onClose={() => { setPinOpen(false); setPinError('') }}
        title="Parent PIN required"
        footer={<>
          <Button variant="ghost" className="flex-1" onClick={() => setPinOpen(false)}>Cancel</Button>
          <Button className="flex-1" onClick={tryPin}>Unlock</Button>
        </>}
      >
        <p className="text-sm text-muted mb-3">A new theme changes how the app looks. Level, XP, coins and streak stay exactly as they are.</p>
        <TextInput value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" placeholder="Parent PIN" autoFocus />
        {pinError && <p className="text-xs mt-2" style={{ color: 'var(--bad)' }}>{pinError}</p>}
      </Modal>
    </Screen>
  )
}

function Header({ area, onBack, backLabel }) {
  return (
    <header className="mb-3">
      <button type="button" className="text-xs underline text-muted mb-2" onClick={onBack}>
        {backLabel || (area === 'parent' ? '← Settings' : '← You')}
      </button>
      <p className="text-[11px] uppercase tracking-widest font-bold" style={{ color: STEPS[0].colour }}>Theme Genesis</p>
      <h1 className="font-display text-2xl font-extrabold leading-tight">Make your own theme</h1>
      <p className="text-sm text-muted">Where new worlds begin.</p>
    </header>
  )
}

function RemoveModal({ theme, onClose, onConfirm }) {
  return (
    <Modal open={Boolean(theme)} onClose={onClose} title="Delete this theme?"
           footer={<>
             <Button variant="ghost" className="flex-1" onClick={onClose}>Keep it</Button>
             <Button variant="danger" className="flex-1" onClick={onConfirm} data-testid="genesis-confirm-delete">Delete</Button>
           </>}>
      <p className="text-sm">
        <strong>{theme?.name}</strong> will be gone for good. If it is being worn, that player goes back to the
        theme it was made from. Their level, XP and coins stay exactly as they are.
      </p>
    </Modal>
  )
}

/*
 * "Send to RankUp for next Season". A child asks; a parent says yes (with a
 * credit line if they want one) in Parent Mode, and only then does anything
 * leave the family. What goes is the theme alone: its name, colours, pattern,
 * mascot and world names.
 */
function SendToRankUp({ theme, kid, area, credit, setCredit, dispatch }) {
  if (theme.pickedSeason) {
    return <Banner tone="good" icon="🏆" title={`Picked for Season ${theme.pickedSeason}!`} className="mt-3">Every RankUp family can play it once the Season starts.</Banner>
  }
  if (theme.sentAt) {
    return <Banner tone="info" icon="📬" title="Sent to RankUp" className="mt-3">RankUp picks the best themes at the end of each month for the next Season.</Banner>
  }
  if (area === 'parent') {
    return (
      <Card flat className="mt-3" data-testid="genesis-send">
        <p className="font-semibold text-sm mb-1">Send to RankUp for next Season</p>
        <p className="text-xs text-muted mb-2">
          RankUp gets the theme only: its name, colours, pattern, mascot and world names. Never {kid.name}&apos;s name,
          unless you type a credit below. If it is picked, every RankUp family sees it, with the credit.
        </p>
        <Field label="Credit (optional): a first name or a nickname">
          <TextInput value={credit} onChange={(e) => setCredit(e.target.value.slice(0, 20))} placeholder="Left blank: “by a RankUp family”" />
        </Field>
        <Button variant="soft" className="w-full" onClick={() => dispatch({ type: 'SEND_KID_THEME', id: theme.id, credit })}>Send it</Button>
      </Card>
    )
  }
  if (theme.sendAsk) {
    return <Banner tone="info" icon="⏳" title="Waiting for a grown-up" className="mt-3">They will see it in their Review tab and decide.</Banner>
  }
  return (
    <Card flat className="mt-3">
      <p className="font-semibold text-sm mb-1">Think it is good enough for everyone?</p>
      <p className="text-xs text-muted mb-2">RankUp picks the best themes each month for the next Season. A grown-up has to say yes first.</p>
      <Button variant="soft" className="w-full" data-testid="genesis-ask-send" onClick={() => dispatch({ type: 'ASK_KID_THEME', id: theme.id, ask: 'send', on: true })}>
        Send to RankUp for next Season
      </Button>
    </Card>
  )
}
