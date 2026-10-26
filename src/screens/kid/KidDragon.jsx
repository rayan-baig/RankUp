import { useEffect, useState } from 'react'
import { useApp, useKid } from '../../state/AppContext.jsx'
import { dragonFight, DRAGON_HP, HERO_HP, HIT, SENT_BACK, IDLE } from '../../lib/dragonFight.js'
import { navigate } from '../../lib/router.js'
import BattleScene from '../../components/BattleScene.jsx'
import { Screen, Card, Button, PageTitle, SectionTitle, ProgressBar } from '../../components/ui.jsx'
import KidHome from './KidHome.jsx'

/** The most of the fight a single visit replays; older moves are in the list. */
const REPLAY_MAX = 8

/** One move of the fight in plain words, as the child is told it. */
export function fightLine(e) {
  if (e.kind === 'hit') {
    return e.dragon === 0
      ? `${e.title} was approved: ${e.dmg} damage, and the dragon is down!`
      : `${e.title} was approved: ${e.dmg} damage to the dragon.`
  }
  const what = {
    sentBack: `${e.title} was sent back. The dragon breathed fire: ${e.dmg} damage to you.`,
    idle: `Two days with no chore done. The dragon dived: ${e.dmg} damage to you.`,
    special: `Special attack, ${e.name}: ${e.dmg} damage to you.`,
  }[e.kind]
  return e.knockout ? `${what} Knocked out! You rested in the village: full health again, and the dragon healed a little.` : what
}

const when = (at) => new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The dragon fight.
 *
 * Opens on everything that happened since the child last looked, replayed
 * as a battle — so a chore approved while they were at school is a hit
 * they get to watch land — and ends with the two health bars on the real
 * numbers from lib/dragonFight.js.
 */
export default function KidDragon() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  /*
   * Worked out once, when the screen opens. Marking the fight as seen
   * (below) would otherwise empty the replay the moment it began.
   */
  const [view] = useState(() => {
    if (!kid) return null
    const fight = dragonFight(state, kid)
    if (!fight.active) return null
    const seenAt = kid.storySeen?.dragon || 0
    const fresh = fight.events.filter((e) => e.at > seenAt).slice(-REPLAY_MAX)
    const before = fight.events[fight.events.indexOf(fresh[0]) - 1]
    const from = fresh.length
      ? (before ? { dragon: before.dragon, hero: before.hero } : { dragon: DRAGON_HP, hero: HERO_HP })
      : { dragon: fight.dragon, hero: fight.hero }
    return { fight, replay: { from, events: fresh, defeated: Boolean(fight.defeatedAt) }, fresh: fresh.length }
  })
  const [playKey, setPlayKey] = useState(0)
  const [line, setLine] = useState('')

  useEffect(() => {
    if (view && kid) dispatch({ type: 'SEE_STORY', kidId: kid.id, chapter: 'dragon' })
  }, [])

  if (!kid || !view) return <KidHome />
  const { fight, replay } = view
  const beaten = Boolean(fight.defeatedAt)

  return (
    <Screen>
      <PageTitle sub={beaten ? 'You did it.' : 'Every chore you finish is a hit.'}>The Dragon</PageTitle>

      <BattleScene
        chapter="dragon"
        fight={replay}
        playKey={playKey}
        label="The dragon fight"
        onEvent={(e) => setLine(fightLine(e))}
      />
      <p className="text-sm mt-2 min-h-[2.5em]" aria-live="polite">
        {line || (view.fresh
          ? `${view.fresh} new ${view.fresh === 1 ? 'move' : 'moves'} since you last looked. Watch!`
          : beaten ? 'The dragon is down and the raids are over.' : 'The dragon is waiting. Your next chore is your next hit.')}
      </p>

      <Card className="mt-2 grid gap-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-semibold">You</span>
            <span className="text-muted">{fight.hero} / {HERO_HP}</span>
          </div>
          <ProgressBar value={fight.hero} max={HERO_HP} height={10} tone="#5ad85a" label="Your health" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-semibold">The dragon</span>
            <span className="text-muted">{fight.dragon} / {DRAGON_HP}</span>
          </div>
          <ProgressBar value={fight.dragon} max={DRAGON_HP} height={10} tone="#c94bff" label="The dragon's health" />
        </div>
      </Card>

      {beaten && (
        <Card className="mt-3 text-center anim-pop" style={{ borderColor: 'var(--accent)' }}>
          <p className="font-display text-lg font-extrabold mb-1">You beat the dragon!</p>
          <p className="text-sm text-muted mb-3">Somebody is waiting for you back home.</p>
          <Button className="w-full" onClick={() => navigate('/kid/story/home')}>Go home</Button>
        </Card>
      )}

      <div className="flex gap-2 mt-3">
        <Button variant="soft" className="flex-1" onClick={() => { setLine(''); setPlayKey((k) => k + 1) }}>
          ↻ Watch again
        </Button>
        <Button className="flex-1" onClick={() => navigate('/kid/quests')}>Find a chore</Button>
      </div>

      <SectionTitle>How the fight works</SectionTitle>
      <Card className="text-sm grid gap-1.5">
        <p>⚔️ Every chore your parent approves is a hit. Harder chores hit harder: easy {HIT.easy}, medium {HIT.medium}, hard {HIT.hard}, boss {HIT.boss}.</p>
        <p>🔥 A chore sent back lets the dragon breathe fire: {SENT_BACK} damage to you.</p>
        <p>🌀 Two whole days with no chore done, and it dives at you: {IDLE} damage.</p>
        <p>✨ Now and then it uses a special attack on its own.</p>
        <p>🏠 If your health runs out you rest in the village. Your health fills up again and the dragon heals a little. Nothing you earned is ever taken away.</p>
      </Card>

      {fight.events.length > 0 && (
        <>
          <SectionTitle>What happened</SectionTitle>
          <Card className="grid gap-2">
            {[...fight.events].reverse().slice(0, 8).map((e) => (
              <div key={`${e.at}-${e.kind}`} className="text-sm">
                <span className="text-xs text-muted block">{when(e.at)}</span>
                {fightLine(e)}
              </div>
            ))}
          </Card>
        </>
      )}
    </Screen>
  )
}
