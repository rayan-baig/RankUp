import { useState } from 'react'
import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import { MINIGAMES, findGame, MAX_TOKENS, DAILY_COIN_CAP, payout } from '../../data/minigames.js'
import { dayKey } from '../../lib/dates.js'
import QuickTap from '../../components/games/QuickTap.jsx'
import Stacker from '../../components/games/Stacker.jsx'
import MemoryMatch from '../../components/games/MemoryMatch.jsx'
import { Screen, Card, Button, SectionTitle, Banner, Stat, Chip, EmptyState } from '../../components/ui.jsx'
import { navigate } from '../../lib/router.js'

const COMPONENTS = { tap: QuickTap, stack: Stacker, memory: MemoryMatch }

/**
 * The arcade.
 *
 * A play token comes from a chore a parent approved, and nothing else. That is
 * the only thing standing between "a game you earn" and "a game instead of
 * doing anything", so the empty state points straight back at the quest list.
 */
export default function KidArcade() {
  const { dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  const [playing, setPlaying] = useState(null)
  const [result, setResult] = useState(null)
  if (!kid) return null

  const tokens = kid.playTokens || 0
  const earnedToday = kid.gameDay === dayKey() ? kid.gameCoinsToday || 0 : 0
  const capped = earnedToday >= DAILY_COIN_CAP

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
    const best = (kid.bestScores || {})[result.game] || 0
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

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Arcade</h1>
      <p className="text-sm text-muted mb-3">
        One token for every chore your parent approves. Spend one to play.
      </p>

      <div className="flex gap-2 mb-4">
        <Stat icon="🎮" value={`${tokens}/${MAX_TOKENS}`} label="Play tokens" tone="var(--accent)" />
        <Stat
          icon={theme.currency.icon}
          value={`${earnedToday}/${DAILY_COIN_CAP}`}
          label="Won today"
          tone="var(--accent-2)"
        />
      </div>

      {tokens === 0 && (
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

      <SectionTitle>Games</SectionTitle>
      {MINIGAMES.map((g) => {
        const best = (kid.bestScores || {})[g.id] || 0
        return (
          <Card key={g.id} className="mb-2.5">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">{g.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{g.name}</div>
                <div className="text-xs text-muted">{g.blurb}</div>
              </div>
              {best > 0 && <Chip tone="var(--accent)">Best {best}</Chip>}
            </div>
            <Button
              className="w-full mt-3"
              disabled={tokens < 1}
              onClick={() => setPlaying(g.id)}
            >
              {tokens < 1 ? 'Needs a token' : 'Play · 1 token'}
            </Button>
          </Card>
        )
      })}

      <p className="text-xs text-muted mt-4">
        Games pay a little, chores pay properly. The arcade tops out at {DAILY_COIN_CAP}{' '}
        {theme.currency.name} a day on purpose.
      </p>
    </Screen>
  )
}
