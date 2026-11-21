import { useEffect, useRef, useState } from 'react'
import { useApp, useKid, useKidTheme } from '../../state/AppContext.jsx'
import { formatXp } from '../../lib/xp.js'
import { relativeTime } from '../../lib/dates.js'
import { Screen, Card, Button, SectionTitle, Chip, Modal } from '../../components/ui.jsx'
import HeroArt from '../../components/HeroArt.jsx'
import AppHeader from '../../components/AppHeader.jsx'
import { isMarketOpen, nextOpeningLabel } from '../../data/marketSkins.js'
import { navigate } from '../../lib/router.js'
import { rewardLeftThisWeek, rewardFreesUpAt } from '../../state/reducer.js'
import EmptyNext from '../../components/EmptyNext.jsx'
// A child's screens sit in a frame on a computer (styles/desk.css).
import '../../styles/desk.css'

export default function KidShop() {
  const { state, dispatch } = useApp()
  const kid = useKid()
  const theme = useKidTheme()
  /*
   * The reward just bought, for a moment. A child taps "buy" twice when the
   * first tap seems to do nothing, and each tap was a real purchase sent to
   * the server: the second one spent the coins again. The button now says it
   * worked and stays still long enough for the second tap to land on nothing.
   */
  const [justGot, setJustGot] = useState(null)
  const settle = useRef(null)
  /*
   * The same thing, read at the moment of the tap. `justGot` is what the last
   * render saw, so two taps that arrive before the screen redraws (two events
   * in one frame) both found it empty. A ref has the first tap's answer at
   * once.
   */
  const buying = useRef(false)
  /*
   * "Are you sure?" before coins are spent. A tap on the price used to buy
   * the reward at once, so a child scrolling past, or testing what the button
   * did, spent their savings. The price now asks first; the purchase is the
   * second tap, on "Yes, get it".
   */
  const [asking, setAsking] = useState(null)
  useEffect(() => () => clearTimeout(settle.current), [])
  if (!kid) return null

  const redeem = (r) => {
    setAsking(null)
    if (justGot || buying.current) return
    buying.current = true
    dispatch({ type: 'REDEEM_REWARD', rewardId: r.id, kidId: kid.id })
    setJustGot(r.id)
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      buying.current = false
      setJustGot(null)
    }, 1500)
  }

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
        <EmptyNext which="kidRewards" />
      ) : (
        state.rewards.map((r) => {
          // The parent's weekly limit, as the server counts it. Null: none.
          const left = rewardLeftThisWeek(state, kid.id, r)
          const freesUp = left === 0 ? rewardFreesUpAt(state, kid.id, r) : null
          const affordable = kid.coins >= r.cost && left !== 0
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
                {left !== null && (
                  <div className="text-xs text-muted truncate">
                    {left === 0
                      ? `All used this week. Next one ${new Date(freesUp).toLocaleDateString(undefined, { weekday: 'long' })}.`
                      : `${left} left this week`}
                  </div>
                )}
              </div>
              <Button
                variant={affordable ? 'primary' : 'soft'}
                disabled={!affordable || justGot === r.id}
                aria-busy={justGot === r.id}
                className="px-3 py-2 min-h-0 text-sm shrink-0"
                onClick={() => { if (!justGot && !buying.current) setAsking(r) }}
              >
                {justGot === r.id ? 'Got it!' : <>{theme.currency.icon} {r.cost}</>}
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
      <Modal
        open={Boolean(asking)}
        onClose={() => setAsking(null)}
        title={asking ? `Get ${asking.name}?` : ''}
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setAsking(null)}>Not now</Button>
            <Button className="flex-1" data-testid="confirm-reward" onClick={() => asking && redeem(asking)}>Yes, get it</Button>
          </>
        }
      >
        {asking && (
          <p className="text-sm">
            It costs {theme.currency.icon} {asking.cost} of your {formatXp(kid.coins)} {theme.currency.name}.
            Your grown-up hands it over.
          </p>
        )}
      </Modal>
    </Screen>
  )
}
