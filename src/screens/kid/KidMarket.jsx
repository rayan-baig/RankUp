import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import { formatXp } from '../../lib/xp.js'
import { MARKET_SKINS, MARKET_NAME, ticketCost } from '../../data/marketSkins.js'
import { Screen, Card, Button, SectionTitle, Chip, Stat } from '../../components/ui.jsx'

/**
 * The Skin Market.
 *
 * Always open, and selling nothing but paint. No opening hours, no countdown,
 * no rarity labels, and never a real-money price: a child saves up from their
 * chores and buys when they have enough (see data/marketSkins.js). Flash
 * Tickets a grown-up has given appear here only when there are some.
 */
export default function KidMarket() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  if (!kid) return null

  const owned = kid.skins || []
  const tickets = state.family.flashTickets || 0

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">{MARKET_NAME}</h1>
      <p className="text-sm text-muted mb-3">
        Skins for your avatar, bought with what your chores earn. They change how you look and
        nothing else — no extra XP, no faster levelling. Every skin is always here.
      </p>

      <div className="flex gap-2 my-4">
        <Stat icon={theme.currency.icon} value={formatXp(kid.coins)} label={theme.currency.name} tone="var(--accent)" />
        {tickets > 0 && <Stat icon="🎟️" value={tickets} label="Flash Tickets" tone="var(--accent-2)" />}
      </div>

      <SectionTitle>Skins</SectionTitle>
      {MARKET_SKINS.map((skin) => {
        const have = owned.includes(skin.id)
        const wearing = kid.skinId === skin.id
        const affordable = kid.coins >= skin.cost
        return (
          <Card key={skin.id} className="mb-2.5">
            <div className="flex items-center gap-3">
              <span
                className="shrink-0 w-12 h-12 rounded-full grid place-items-center text-xl"
                style={{ background: skin.ring }}
                aria-hidden="true"
              >
                <span className="w-9 h-9 rounded-full grid place-items-center" style={{ background: 'var(--surface)' }}>
                  {skin.icon}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{skin.name}</div>
                <div className="text-xs text-muted">
                  {have ? 'Yours' : `${theme.currency.icon} ${skin.cost}`}
                </div>
              </div>
              {wearing && <Chip tone="var(--good)">Wearing</Chip>}
            </div>

            <div className="flex gap-2 mt-3">
              {have ? (
                <Button
                  variant={wearing ? 'soft' : 'primary'}
                  className="flex-1"
                  onClick={() => dispatch({ type: 'WEAR_SKIN', kidId: kid.id, skinId: wearing ? null : skin.id })}
                >
                  {wearing ? 'Take it off' : 'Wear it'}
                </Button>
              ) : (
                <>
                  <Button
                    variant={affordable ? 'primary' : 'soft'}
                    className="flex-1"
                    disabled={!affordable}
                    onClick={() => dispatch({ type: 'BUY_SKIN', kidId: kid.id, skinId: skin.id })}
                  >
                    {/* The shortfall, not "Not enough": it is the number of
                        chores between them and the thing. */}
                    {affordable
                      ? `Buy for ${skin.cost}`
                      : `${skin.cost - kid.coins} more ${theme.currency.name}`}
                  </Button>
                  {tickets >= ticketCost(skin) && (
                    <Button
                      variant="soft"
                      className="flex-1"
                      onClick={() => dispatch({ type: 'CLAIM_SKIN_WITH_TICKET', kidId: kid.id, skinId: skin.id })}
                    >
                      🎟️ Use {ticketCost(skin)}
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        )
      })}

      <p className="text-xs text-muted mt-4">
        Nothing here costs real money on your phone. Flash Tickets can only come from a grown-up, in
        Parent Mode.
      </p>
    </Screen>
  )
}
