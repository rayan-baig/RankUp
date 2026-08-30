import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import { formatXp } from '../../lib/xp.js'
import { relativeTime } from '../../lib/dates.js'
import { Screen, Card, Button, SectionTitle, EmptyState, Stat, Chip } from '../../components/ui.jsx'
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
      <h1 className="font-display text-2xl font-extrabold mb-1">Rewards</h1>
      <p className="text-sm text-muted mb-3">Spend your {theme.currency.name} on things your parent set up.</p>

      <div className="flex gap-2 mb-4">
        <Stat icon={theme.currency.icon} value={formatXp(kid.coins)} label={`${theme.currency.name} in the bank`} tone="var(--accent)" />
      </div>

      <button
        type="button"
        onClick={() => navigate('/kid/market')}
        className="card w-full flex items-center gap-3 text-left mb-4 p-4"
      >
        <span className="text-2xl" aria-hidden="true">🎪</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-sm">Sunday Market</span>
          <span className="block text-xs text-muted">
            {isMarketOpen() ? 'Open now — skins you cannot get anywhere else.' : nextOpeningLabel()}
          </span>
        </span>
        {isMarketOpen() && <Chip tone="var(--good)">Open</Chip>}
        <span aria-hidden="true" className="text-muted">›</span>
      </button>

      <SectionTitle>Catalogue</SectionTitle>
      {state.rewards.length === 0 ? (
        <EmptyState icon="🎁" title="No rewards yet" body="Ask your parent to add some in Parent Mode." />
      ) : (
        state.rewards.map((r) => {
          const affordable = kid.coins >= r.cost
          return (
            <Card key={r.id} className="mb-2.5 flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">{r.icon || '🎁'}</span>
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
