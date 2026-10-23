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
import TennisTour from '../../components/games/TennisTour.jsx'
import Wildfire from '../../components/games/Wildfire.jsx'
import RoyalDraw from '../../components/games/RoyalDraw.jsx'
import { Screen, Card, Button, SectionTitle, Banner, Stat, EmptyState, PageTitle, Segmented } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

/** One colour per shelf, so the grid is scannable without artwork. */
const TILE_TINT = {
  arcade: '#38bdf8',
  puzzle: '#a855f7',
  brain: '#f59e0b',
  versus: '#f43f5e',
  sports: '#22c55e',
  cards: '#e879f9',
}

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
  tennis: TennisTour,
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

  /*
   * A game tile.
   *
   * Twenty-one games as full-width cards with a button each meant one game
   * filled half the screen and choosing meant scrolling past the rest. The
   * design puts them in a grid of tiles instead, which is right: a child
   * picking a game is looking at pictures, not reading descriptions. The
   * whole tile is the button, so there is nothing to aim at.
   *
   * The art is the game's own colour drawn behind its icon, so every tile
   * looks different at a glance without needing twenty-one images.
   */
  const GameTile = (g) => {
    const best = bests[g.id] || 0
    const locked = tokens < 1
    return (
      <button
        key={g.id}
        type="button"
        disabled={locked}
        onClick={() => setPlaying(g.id)}
        /*
         * Spelled out rather than left to the tile's contents. Read aloud,
         * the tile would otherwise start with the word NEW — the badge sits
         * first in the markup — so a screen reader would announce every
         * unplayed game as "New" before saying which game it is.
         */
        aria-label={`${g.name}. ${g.blurb} ${best > 0 ? `Your best is ${best}.` : 'Not played yet.'}`}
        className="text-left rounded-2xl overflow-hidden transition-transform active:scale-95 disabled:opacity-50"
        style={{
          background: 'color-mix(in srgb, var(--surface) 94%, var(--accent) 6%)',
          border: '1px solid color-mix(in srgb, var(--accent) 28%, var(--line))',
          boxShadow: '0 0 20px -12px color-mix(in srgb, var(--accent) 80%, transparent)',
        }}
      >
        <div
          className="grid place-items-center relative"
          style={{
            aspectRatio: '1 / 1',
            background: `radial-gradient(circle at 50% 42%,
              color-mix(in srgb, ${TILE_TINT[g.category] || 'var(--accent)'} 46%, transparent),
              color-mix(in srgb, var(--bg) 85%, transparent) 72%)`,
          }}
        >
          <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{g.icon}</span>
          {best === 0 && (
            <span
              className="absolute top-1.5 right-1.5 rounded-full font-bold"
              style={{
                fontSize: 8,
                padding: '1px 5px',
                background: 'var(--good)',
                color: 'var(--bg)',
              }}
            >
              NEW
            </span>
          )}
        </div>
        <div className="px-2 py-1.5">
          <div className="font-semibold text-[11px] leading-tight truncate">{g.name}</div>
          {/* The high score is the thing a child checks, so it is the line
              that gets the space once they have played. */}
          <div className="text-[9.5px] text-muted mt-0.5 truncate">
            {best > 0 ? `High: ${best.toLocaleString()}` : `${g.minutes} min`}
            {g.needsNet ? ' · online' : ''}
          </div>
        </div>
      </button>
    )
  }

  return (
    <Screen>
      <PageTitle
        sub={unlimited
          ? `${MINIGAMES.length} games. Play as much as you like — this is the demo.`
          : `${MINIGAMES.length} games. One token for every chore your parent approves.`}
      >
        Arcade
      </PageTitle>

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
        <Button
          className="w-full mt-3"
          style={{ minHeight: 44, fontSize: 14 }}
          disabled={tokens < 1}
          onClick={() => setPlaying(featured.id)}
        >
          {tokens < 1 ? 'Needs a token' : unlimited ? `Play ${featured.name}` : `Play ${featured.name} · 1 token`}
        </Button>
      </Card>

      <SectionTitle>All games</SectionTitle>
      <Segmented
        options={CATEGORIES}
        value={shelf}
        onChange={setShelf}
        label="Kinds of game"
      />

      <div className="grid grid-cols-3 gap-2">
        {shown.map(GameTile)}
      </div>

      <p className="text-xs text-muted mt-4">
        Games pay a little, chores pay properly. The arcade tops out at {DAILY_COIN_CAP}{' '}
        {theme.currency.name} a day on purpose.
      </p>
    </Screen>
  )
}
