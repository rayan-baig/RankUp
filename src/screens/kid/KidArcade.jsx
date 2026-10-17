import { useState } from 'react'
import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import {
  MINIGAMES, CATEGORIES, findGame, featuredGame,
  MAX_TOKENS, DAILY_COIN_CAP, payout,
} from '../../data/minigames.js'
import { dayKey } from '../../lib/dates.js'
import Stacker from '../../components/games/Stacker.jsx'
import MemoryMatch from '../../components/games/MemoryMatch.jsx'
import ColourChain from '../../components/games/ColourChain.jsx'
import LightsOut from '../../components/games/LightsOut.jsx'
import Catcher from '../../components/games/Catcher.jsx'
import Snake from '../../components/games/Snake.jsx'
import Merge from '../../components/games/Merge.jsx'
import Bricks from '../../components/games/Bricks.jsx'
import Sweeper from '../../components/games/Sweeper.jsx'
import SkyHop from '../../components/games/SkyHop.jsx'
import FourInARow from '../../components/games/FourInARow.jsx'
import SlidePuzzle from '../../components/games/SlidePuzzle.jsx'
import SportsMania from '../../components/games/SportsMania.jsx'
import TurboBall from '../../components/games/TurboBall.jsx'
import BlockDrop from '../../components/games/BlockDrop.jsx'
import SweetSwap from '../../components/games/SweetSwap.jsx'
import Impostor from '../../components/games/Impostor.jsx'
import Trackstar from '../../components/games/Trackstar.jsx'
import Wildfire from '../../components/games/Wildfire.jsx'
import RoyalDraw from '../../components/games/RoyalDraw.jsx'
import { Screen, Card, Button, SectionTitle, Banner, Stat, Chip, EmptyState } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

const COMPONENTS = {
  stack: Stacker,
  memory: MemoryMatch,
  chain: ColourChain,
  lights: LightsOut,
  catch: Catcher,
  snake: Snake,
  merge: Merge,
  bricks: Bricks,
  sweeper: Sweeper,
  sky: SkyHop,
  four: FourInARow,
  slide: SlidePuzzle,
  sports: SportsMania,
  turbo: TurboBall,
  blocks: BlockDrop,
  sweets: SweetSwap,
  impostor: Impostor,
  track: Trackstar,
  wildfire: Wildfire,
  royal: RoyalDraw,
}

/**
 * The arcade hub.
 *
 * A play token comes from a chore a parent approved, and nothing else. That is
 * the only thing standing between "a game you earn" and "a game instead of
 * doing anything", so the empty state points straight back at the quest list.
 *
 * With thirteen games a flat list stops being browsable, so this is a hub: one
 * game on the front that changes daily, shelves by the kind of game it is, and
 * every card saying roughly how long a round takes — because the real question
 * a child has is "have I got time for this before tea".
 */
export default function KidArcade() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const [playing, setPlaying] = useState(null)
  const [result, setResult] = useState(null)
  const [shelf, setShelf] = useState('all')
  if (!kid) return null

  // The demo is a shop window: it should not run out of tokens two games in.
  const unlimited = Boolean(state.demo)
  const tokens = unlimited ? Infinity : kid.playTokens || 0
  const earnedToday = kid.gameDay === dayKey() ? kid.gameCoinsToday || 0 : 0
  const capped = earnedToday >= DAILY_COIN_CAP
  const bests = kid.bestScores || {}

  const finish = (score) => {
    const coins = payout(score, earnedToday)
    dispatch({ type: 'FINISH_MINIGAME', kidId: kid.id, game: playing, score, coins })
    setResult({ game: playing, score, coins })
    setPlaying(null)
  }

  if (playing) {
    const Game = COMPONENTS[playing]
    const meta = findGame(playing)
    return (
      <Screen>
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-display text-xl font-extrabold">{meta.icon} {meta.name}</h1>
          <Button variant="ghost" className="px-3 py-2 min-h-0 text-sm" onClick={() => setPlaying(null)}>
            Give up
          </Button>
        </div>
        <p className="text-xs text-muted mb-3">{meta.howTo}</p>
        <Game theme={theme} onDone={finish} />
      </Screen>
    )
  }

  if (result) {
    const meta = findGame(result.game)
    const best = bests[result.game] || 0
    return (
      <Screen>
        <div className="text-center py-8">
          <div className="text-5xl mb-3 anim-pop" aria-hidden="true">{meta.icon}</div>
          <h1 className="font-display text-2xl font-extrabold mb-1">{result.score} points</h1>
          <p className="text-sm text-muted mb-4">
            {result.score >= best ? 'A new best score.' : `Your best is ${best}.`}
          </p>
          <Card className="mb-4">
            <div className="font-display font-extrabold text-xl" style={{ color: 'var(--good)' }}>
              +{result.coins} {theme.currency.name}
            </div>
            {result.coins === 0 && (
              <p className="text-xs text-muted mt-1">
                You have hit today&apos;s arcade limit. Play for the score — it resets tomorrow.
              </p>
            )}
          </Card>
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setResult(null)}>Back to the arcade</Button>
            {tokens > 0 && (
              <Button className="flex-1" onClick={() => { setResult(null); setPlaying(result.game) }}>
                Again
              </Button>
            )}
          </div>
        </div>
      </Screen>
    )
  }

  const featured = featuredGame(dayKey())
  const shown = shelf === 'all' ? MINIGAMES : MINIGAMES.filter((g) => g.category === shelf)
  const played = MINIGAMES.filter((g) => bests[g.id] > 0).length

  const GameCard = (g) => (
    <Card key={g.id} className="mb-2.5">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">{g.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">{g.name}</div>
          <div className="text-xs text-muted">{g.blurb}</div>
          <div className="text-xs text-muted mt-0.5">
            About {g.minutes} {g.minutes === 1 ? 'minute' : 'minutes'}
          </div>
        </div>
        {bests[g.id] > 0
          ? <Chip tone="var(--accent)">Best {bests[g.id]}</Chip>
          : <Chip tone="var(--good)">New</Chip>}
      </div>
      <Button className="w-full mt-3" disabled={tokens < 1} onClick={() => setPlaying(g.id)}>
        {tokens < 1 ? 'Needs a token' : unlimited ? 'Play' : 'Play · 1 token'}
      </Button>
    </Card>
  )

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Arcade</h1>
      <p className="text-sm text-muted mb-3">
        {MINIGAMES.length} games.{' '}
        {unlimited
          ? 'Play as much as you like — this is the demo.'
          : 'One token for every chore your parent approves.'}
      </p>

      <div className="flex gap-2 mb-4">
        <Stat
          icon="🎮"
          value={unlimited ? '∞' : `${tokens}/${MAX_TOKENS}`}
          label="Play tokens"
          tone="var(--accent)"
        />
        <Stat
          icon={theme.currency.icon}
          value={`${earnedToday}/${DAILY_COIN_CAP}`}
          label="Won today"
          tone="var(--accent-2)"
        />
        <Stat icon="🏆" value={`${played}/${MINIGAMES.length}`} label="Tried" tone="var(--good)" />
      </div>

      {tokens === 0 && !unlimited && (
        <EmptyState
          icon="🎮"
          title="No tokens yet"
          body="Finish a chore and get it approved — that is where tokens come from."
          action={<Button onClick={() => navigate('/kid/quests')}>See my quests</Button>}
        />
      )}

      {capped && tokens > 0 && (
        <Banner tone="info" icon="🏁" title="That is today's winnings">
          You can still play as much as you like — it just will not pay out again until tomorrow.
        </Banner>
      )}

      <SectionTitle>Today&apos;s pick</SectionTitle>
      <Card className="mb-4 anim-pop" style={{ borderColor: 'var(--accent)' }}>
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden="true">{featured.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="font-display font-extrabold text-lg">{featured.name}</div>
            <div className="text-xs text-muted">{featured.blurb}</div>
          </div>
        </div>
        <Button className="w-full mt-3" disabled={tokens < 1} onClick={() => setPlaying(featured.id)}>
          {tokens < 1 ? 'Needs a token' : unlimited ? `Play ${featured.name}` : `Play ${featured.name} · 1 token`}
        </Button>
      </Card>

      <SectionTitle>All games</SectionTitle>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-1" role="group" aria-label="Kinds of game">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={shelf === c.id}
            onClick={() => setShelf(c.id)}
            className={`btn ${shelf === c.id ? 'btn-primary' : 'btn-soft'} whitespace-nowrap`}
            style={{ minHeight: 0, padding: '8px 14px', fontSize: 13 }}
          >
            {c.icon} {c.name}
          </button>
        ))}
      </div>

      {shown.map(GameCard)}

      <p className="text-xs text-muted mt-4">
        Games pay a little, chores pay properly. The arcade tops out at {DAILY_COIN_CAP}{' '}
        {theme.currency.name} a day on purpose.
      </p>
    </Screen>
  )
}
