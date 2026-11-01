import { useState } from 'react'
import { useApp, useKid } from '../../state/AppContext.jsx'
import { levelFromXp } from '../../lib/xp.js'
import { storyChapters } from '../../data/kidThemes.js'
import { storyProgress } from '../../lib/dragonFight.js'
import { navigate } from '../../lib/router.js'
import BattleScene from '../../components/BattleScene.jsx'
import { Screen, Card, Button, PageTitle, SectionTitle } from '../../components/ui.jsx'
import KidHome from './KidHome.jsx'
import KidDragon from './KidDragon.jsx'

/**
 * One chapter of the theme's story, played as a battle scene, with the
 * chapters reached so far listed underneath to watch again.
 *
 * Only chapters this child has reached can be opened. Typing the address of
 * one they have not reached shows the home screen, the same as a link to
 * nothing: a secret world stays secret even to a child who guesses its name.
 */
export default function KidStory({ chapter }) {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const [playKey, setPlayKey] = useState(0)
  const [done, setDone] = useState(false)

  if (!kid) return null
  const chapters = storyChapters(kid.themeId, levelFromXp(kid.xp).level, storyProgress(state, kid))
  const current = chapters.find((c) => c.chapter === chapter)
  if (!current) return <KidHome />
  // The dragon's chapter is the fight itself.
  if (current.chapter === 'dragon') return <KidDragon />

  const number = chapters.indexOf(current) + 1

  return (
    <Screen>
      <PageTitle sub={`Chapter ${number} of the story so far`}>{current.label}</PageTitle>

      <BattleScene
        chapter={current.chapter}
        playKey={playKey}
        label={`${current.label}: the battle`}
        onWon={() => {
          setDone(true)
          if (!kid.storySeen?.[current.chapter]) dispatch({ type: 'SEE_STORY', kidId: kid.id, chapter: current.chapter })
        }}
      />

      {/* The words arrive when the fight is won, like the end of an episode. */}
      <Card className={`mt-3 ${done ? 'anim-pop' : 'opacity-0'}`} aria-live="polite">
        <p className="text-sm">{done ? current.story : ' '}</p>
      </Card>

      <div className="flex gap-2 mt-3">
        <Button variant="soft" className="flex-1" onClick={() => { setDone(false); setPlayKey((k) => k + 1) }}>
          ↻ Watch again
        </Button>
        <Button className="flex-1" onClick={() => navigate('/kid')}>Back home</Button>
      </div>

      <SectionTitle>Your story so far</SectionTitle>
      <div className="grid gap-2">
        {chapters.map((c, i) => (
          <button
            key={c.chapter}
            type="button"
            onClick={() => navigate(c.chapter === 'dragon' ? '/kid/dragon' : `/kid/story/${c.chapter}`)}
            aria-current={c.chapter === current.chapter ? 'true' : undefined}
            className="card w-full p-3 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
            style={c.chapter === current.chapter ? { borderColor: 'var(--accent)' } : undefined}
          >
            <span className="font-display font-extrabold text-sm w-6 text-center shrink-0" style={{ color: 'var(--accent)' }}>
              {i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-sm truncate">{c.label}</span>
              <span className="block text-xs text-muted">
                {c.level === 1 ? 'The beginning' : c.requires ? 'After the dragon' : `Level ${c.level}`}
                {kid.storySeen?.[c.chapter] ? '' : ' · new'}
              </span>
            </span>
            <span aria-hidden="true" className="text-muted">▶</span>
          </button>
        ))}
      </div>
    </Screen>
  )
}
