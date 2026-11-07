import { useState } from 'react'
import { useApp, useKid } from '../state/AppContext.jsx'
import { navigate } from '../lib/router.js'
import { plainName } from '../lib/kidWords.js'
import { buildTheme, customThemeId, themeProblem, MAX_KID_THEMES, NAME_MAX, CREDIT_MAX } from '../data/themeGenesis.js'
import { ThemeSwatch } from './ThemePreview.jsx'
import { Card, Button, Chip, TextInput, Modal, Banner, Section } from './ui.jsx'

/**
 * Theme Genesis, on the parent's side.
 *
 * Every theme any child in the family has made is here, and a parent can
 * rename or remove any of them. The requests a child makes about a theme
 * (to wear it, on their own phone where the theme lock needs a parent; to
 * send it to RankUp for a Season) wait in the Review tab, and nothing leaves
 * the family until a parent says yes there.
 */

const built = (t) => buildTheme({ id: customThemeId(t.id), name: t.name, design: t.design })

/** The requests waiting, at the top of the Review tab. Nothing when there are none. */
export function ThemeRequests() {
  const { state, dispatch } = useApp()
  const [credits, setCredits] = useState({})
  const asks = (state.kidThemes || []).filter((t) => t.useAsk || (t.sendAsk && !t.sentAt))
  if (!asks.length) return null
  return (
    <section className="mb-4" data-testid="theme-requests">
      <h2 className="font-display font-bold text-lg mb-2">Theme requests</h2>
      {asks.map((t) => {
        const kid = state.kids.find((k) => k.id === t.kidId)
        if (!kid) return null
        return (
          <Card key={t.id} className="mb-2">
            <div className="flex items-center gap-3 mb-2">
              <ThemeSwatch theme={built(t)} size={46} />
              <div className="min-w-0">
                <p className="font-semibold truncate">{t.name}</p>
                <p className="text-xs text-muted">Made by {kid.name} in Theme Genesis</p>
              </div>
            </div>
            {t.useAsk && (
              <div className="mb-2" data-testid="theme-ask-use">
                <p className="text-sm mb-2">{kid.name} would like to play in it. Their level, XP and coins stay exactly as they are.</p>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1 !min-h-0 py-2 text-sm"
                          onClick={() => dispatch({ type: 'ASK_KID_THEME', id: t.id, ask: 'use', on: false })}>Not now</Button>
                  <Button className="flex-1 !min-h-0 py-2 text-sm" onClick={() => {
                    dispatch({ type: 'SET_KID_THEME', kidId: kid.id, themeId: customThemeId(t.id) })
                    dispatch({ type: 'ASK_KID_THEME', id: t.id, ask: 'use', on: false })
                  }}>Switch {kid.name} to it</Button>
                </div>
              </div>
            )}
            {t.sendAsk && !t.sentAt && (
              <div data-testid="theme-ask-send">
                <p className="text-sm mb-1">{kid.name} would like to send it to RankUp for next Season.</p>
                <p className="text-xs text-muted mb-2">
                  RankUp gets the theme only: its name, colours, pattern, mascot and world names. Never {kid.name}&apos;s
                  name, unless you type a credit. If it is picked, every RankUp family sees the theme and the credit.
                  One theme a month from each child.
                </p>
                <div className="mb-2">
                  <TextInput value={credits[t.id] || ''} placeholder="Credit, optional: a first name or nickname"
                             aria-label="Credit" data-testid="theme-credit"
                             onChange={(e) => setCredits({ ...credits, [t.id]: e.target.value.slice(0, CREDIT_MAX) })} />
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1 !min-h-0 py-2 text-sm"
                          onClick={() => dispatch({ type: 'ASK_KID_THEME', id: t.id, ask: 'send', on: false })}>Not now</Button>
                  <Button className="flex-1 !min-h-0 py-2 text-sm" data-testid="theme-send"
                          onClick={() => dispatch({ type: 'SEND_KID_THEME', id: t.id, credit: credits[t.id] || '' })}>Send to RankUp</Button>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </section>
  )
}

/** A theme picked for a Season, said once on this phone. */
export function PickedNotice({ who = 'parent' }) {
  const { state, dispatch } = useApp()
  const me = useKid()
  const picked = (state.kidThemes || []).filter((t) => t.pickedSeason && !state.seen?.[`picked:${who}:${t.id}`]
    && (who !== 'kid' || t.kidId === me?.id))
  if (!picked.length) return null
  const t = picked[0]
  const kid = state.kids.find((k) => k.id === t.kidId)
  return (
    <Banner tone="good" icon="🏆" title={`Your theme was picked for Season ${t.pickedSeason}!`} className="mb-3"
            action={<button type="button" className="text-xs underline" onClick={() => dispatch({ type: 'SEE_MOMENT', key: `picked:${who}:${t.id}` })}>OK</button>}>
      {who === 'parent' ? `${kid?.name || 'Your child'}'s ${t.name}` : t.name} joins every RankUp family&apos;s theme picker when Season {t.pickedSeason} starts.
    </Banner>
  )
}

/** Settings → Kids' own themes: every one, renamed or removed by a parent. */
export function KidThemesSection() {
  const { state, dispatch } = useApp()
  const themes = state.kidThemes || []
  const [renaming, setRenaming] = useState(null)
  const [newName, setNewName] = useState('')
  const [removing, setRemoving] = useState(null)
  const [problem, setProblem] = useState('')

  const rename = () => {
    const why = themeProblem(newName, renaming.design)
    if (why) { setProblem(why); return }
    dispatch({ type: 'RENAME_KID_THEME', id: renaming.id, name: newName })
    setRenaming(null)
  }

  return (
    <Section title="Kids' own themes" icon="✨" summary={themes.length ? `${themes.length} made in Theme Genesis` : 'Theme Genesis'}>
      <div data-testid="kid-themes-settings">
        <p className="text-xs text-muted mb-3">
          Themes your children make change how the app looks and what things are called, never the rules or the
          rewards. They stay in your family: nobody outside it sees them, unless you send one to RankUp. Up to
          {' '}{MAX_KID_THEMES} each.
        </p>
        {state.kids.map((kid) => {
          const mine = themes.filter((t) => t.kidId === kid.id)
          return (
            <div key={kid.id} className="mb-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-semibold text-sm">{kid.name} <span className="text-muted font-normal">· {mine.length} of {MAX_KID_THEMES}</span></p>
                {mine.length < MAX_KID_THEMES && (
                  <button type="button" className="chip" onClick={() => navigate(`/parent/genesis?kid=${kid.id}`)}>+ Make one</button>
                )}
              </div>
              {mine.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 py-2" style={{ borderTop: '1px solid var(--line)' }} data-testid="kid-theme-row">
                  <ThemeSwatch theme={built(t)} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{t.name}</p>
                    <div className="flex flex-wrap gap-1">
                      <Chip>{t.status === 'ready' ? 'Finished' : 'Draft'}</Chip>
                      {kid.themeId === customThemeId(t.id) && <Chip tone="var(--good)">Wearing</Chip>}
                      {t.sentAt && <Chip tone="var(--accent-2)">{t.pickedSeason ? `Season ${t.pickedSeason}` : 'Sent to RankUp'}</Chip>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {t.status === 'ready' && kid.themeId !== customThemeId(t.id) && (
                      <button type="button" className="chip" onClick={() => dispatch({ type: 'SET_KID_THEME', kidId: kid.id, themeId: customThemeId(t.id) })}>Use</button>
                    )}
                    <button type="button" className="chip" onClick={() => { setRenaming(t); setNewName(t.name); setProblem('') }}>Rename</button>
                    <button type="button" className="chip" style={{ color: 'var(--bad)' }} onClick={() => setRemoving(t)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <Modal open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Rename this theme"
             footer={<>
               <Button variant="ghost" className="flex-1" onClick={() => setRenaming(null)}>Cancel</Button>
               <Button className="flex-1" onClick={rename} data-testid="kid-theme-rename-save">Save</Button>
             </>}>
        <TextInput value={newName} onChange={(e) => setNewName([...e.target.value].slice(0, NAME_MAX).join(''))} aria-label="Theme name" data-testid="kid-theme-rename" />
        {problem && <p className="text-xs mt-2" style={{ color: 'var(--bad)' }}>{problem}</p>}
        <p className="text-xs text-muted mt-2">Now: {plainName(renaming?.name, NAME_MAX)}</p>
      </Modal>

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title="Remove this theme?"
             footer={<>
               <Button variant="ghost" className="flex-1" onClick={() => setRemoving(null)}>Keep it</Button>
               <Button variant="danger" className="flex-1" data-testid="kid-theme-remove-confirm"
                       onClick={() => { dispatch({ type: 'DELETE_KID_THEME', id: removing.id }); setRemoving(null) }}>Remove</Button>
             </>}>
        <p className="text-sm">
          <strong>{removing?.name}</strong> goes from every phone in the family. A child wearing it goes back to
          the theme it was made from, with their level, XP and coins exactly as they are.
        </p>
      </Modal>
    </Section>
  )
}
