import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import { formatXp } from '../../lib/xp.js'
import { relativeTime } from '../../lib/dates.js'
import { Screen, Card, Button, SectionTitle, EmptyState, Stat, Chip } from '../../components/ui.jsx'
import HeroArt from '../../components/HeroArt.jsx'
import AppHeader from '../../components/AppHeader.jsx'
import { isMarketOpen, nextOpeningLabel } from '../../data/marketSkins.js'
import { navigate } from '../../lib/router.js'

export default function KidShop() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  if (!kid) return null

  const mine = state.redemptions.filter((r) => r.kidId === kid.id).sort((a, b) => b.at - a.at)

  return (
    <Screen>
      <AppHeader theme={theme} />
      {/*
        Laid out as the design has it: the balance sits on the banner
        rather than in a card of its own, the market is a wide panel with
        its countdown, and the catalogue follows underneath.
      */}
      <HeroArt
        slot="hero-rewards"
        emblem="🎁"
        title="Rewards"
        sub="Spend what you have earned."
        right={(
          <span
            className="shrink-0 text-center px-3 py-2 rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
              boxShadow: '0 0 20px -10px var(--accent)',
            }}
          >
            <span className="block text-lg leading-none" aria-hidden="true">{theme.currency.icon}</span>
            <span className="block font-display font-extrabold text-lg leading-none mt-0.5">
              {formatXp(kid.coins)}
            </span>
            <span className="block text-[9px] uppercase tracking-wider text-muted">
              {theme.currency.name}
            </span>
          </span>
        )}
      />

      <button
        type="button"
        onClick={() => navigate('/kid/market')}
        className="card w-full text-left mb-4 p-4"
        style={{ borderColor: 'color-mix(in srgb, var(--accent-2) 45%, var(--line))' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl shrink-0" aria-hidden="true">🎪</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-extrabold text-base">Sunday Market</span>
            <span className="block text-xs text-muted">
              {isMarketOpen() ? 'Open now — skins you cannot get anywhere else.' : nextOpeningLabel()}
            </span>
          </span>
          {/* The design puts the countdown in its own lit box, because it
              is the thing that makes a child come back on Sunday. */}
          <span
            className="shrink-0 text-center px-2.5 py-1.5 rounded-lg"
            style={{
              background: isMarketOpen()
                ? 'color-mix(in srgb, var(--good) 18%, transparent)'
                : 'color-mix(in srgb, var(--accent-2) 16%, transparent)',
              border: `1px solid ${isMarketOpen() ? 'var(--good)' : 'color-mix(in srgb, var(--accent-2) 45%, transparent)'}`,
            }}
          >
            {/* Plain words. Pulling the time out of the sentence with a
                regex produced "8pm / until it opens", which reads as a
                countdown that has already finished. */}
            <span className="block font-display font-extrabold text-xs">
              {isMarketOpen() ? 'OPEN' : 'SUNDAY'}
            </span>
            <span className="block text-[9px] uppercase tracking-wider text-muted">
              {isMarketOpen() ? 'Right now' : '8pm'}
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </div>
      </button>

      <SectionTitle>Catalogue</SectionTitle>
      {state.rewards.length === 0 ? (
        <EmptyState icon="🎁" title="No rewards yet" body="Ask your parent to add some in Parent Mode." />
      ) : (
        state.rewards.map((r) => {
          const affordable = kid.coins >= r.cost
          return (
            <Card key={r.id} className="mb-2.5 flex items-center gap-3">
              <span
                className="shrink-0 grid place-items-center"
                aria-hidden="true"
                style={{
                  width: 42, height: 42, borderRadius: 12, fontSize: 20,
                  background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 34%, var(--line))',
                }}
              >
                {r.icon || '🎁'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{r.name}</div>
                {r.description && <div className="text-xs text-muted truncate">{r.description}</div>}
              </div>
              <Button
                variant={affordable ? 'primary' : 'soft'}
                disabled={!affordable}
                className="px-3 py-2 min-h-0 text-sm shrink-0"
                onClick={() => dispatch({ type: 'REDEEM_REWARD', rewardId: r.id, kidId: kid.id })}
              >
                {theme.currency.icon} {r.cost}
              </Button>
            </Card>
          )
        })
      )}

      {mine.length > 0 && (
        <>
          <SectionTitle>Your redemptions</SectionTitle>
          {mine.map((r) => (
            <Card key={r.id} flat className="mb-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{r.name}</div>
                <div className="text-xs text-muted">{relativeTime(r.at)}</div>
              </div>
              <Chip tone={r.status === 'given' ? 'var(--good)' : 'var(--warn)'}>
                {r.status === 'given' ? 'Given' : 'Waiting on parent'}
              </Chip>
            </Card>
          ))}
        </>
      )}
    </Screen>
  )
}
