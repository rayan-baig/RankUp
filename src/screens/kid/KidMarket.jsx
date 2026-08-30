import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import { formatXp } from '../../lib/xp.js'
import { MARKET_SKINS, isMarketOpen, nextOpeningLabel } from '../../data/marketSkins.js'
import { Screen, Card, Button, SectionTitle, Banner, Chip, Stat } from '../../components/ui.jsx'

/**
 * The Sunday Market.
 *
 * Open Sunday evening only, and selling nothing but paint. Deliberately shows
 * no countdown: a clock ticking down is the part of a limited-time shop that
 * actually pressures a child, and none of this is worth pressuring anyone over.
 */
export default function KidMarket() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  if (!kid) return null

  const open = isMarketOpen()
  const owned = kid.skins || []
  const tickets = state.family.flashTickets || 0

  return (
    <Screen>
      <h1 className="font-display text-2xl font-extrabold mb-1">Sunday Market</h1>
      <p className="text-sm text-muted mb-3">
        Skins you cannot get anywhere else. They change how you look and nothing else — no extra XP,
        no faster levelling.
      </p>

      {open ? (
        <Banner tone="good" icon="🎪" title="The market is open">
          It shuts at midnight and comes back next Sunday at 8pm.
        </Banner>
      ) : (
        <Banner tone="info" icon="🌙" title="The market is shut">
          {nextOpeningLabel()}. Nothing here is ever gone for good — every skin comes back.
        </Banner>
      )}

      <div className="flex gap-2 my-4">
        <Stat icon={theme.currency.icon} value={formatXp(kid.coins)} label={theme.currency.name} tone="var(--accent)" />
        <Stat icon="🎟️" value={tickets} label="Flash Tickets" tone="var(--accent-2)" />
      </div>

      {tickets > 0 && open && (
        <Banner tone="info" icon="🎟️" title={`You have ${tickets} Flash Ticket${tickets === 1 ? '' : 's'}`}>
          A ticket takes any skin without spending your {theme.currency.name}.
        </Banner>
      )}

      <SectionTitle>This week's stock</SectionTitle>
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
                    disabled={!open || !affordable}
                    onClick={() => dispatch({ type: 'BUY_SKIN', kidId: kid.id, skinId: skin.id })}
                  >
                    {affordable ? `Buy for ${skin.cost}` : 'Not enough yet'}
                  </Button>
                  {tickets > 0 && (
                    <Button
                      variant="soft"
                      className="flex-1"
                      disabled={!open}
                      onClick={() => dispatch({ type: 'CLAIM_SKIN_WITH_TICKET', kidId: kid.id, skinId: skin.id })}
                    >
                      🎟️ Use a ticket
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        )
      })}

      <p className="text-xs text-muted mt-4">
        Flash Tickets are bought by a grown-up in Parent Mode. You cannot buy them here, and nothing
        in this shop can be paid for with real money from your phone.
      </p>
    </Screen>
  )
}
