import { useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext.jsx'
import { effectiveTier, onTrial, trialDaysLeft } from '../../state/reducer.js'
import { TIERS, TIER_LADDER, PLAN_COMPARISON, ELITE_KID_PERKS, ELITE_PARENT_PERKS } from '../../state/initialState.js'
import { noPaymentsWords, billingLive, startCheckout, openBillingPortal, fetchBillingStatus, billingError, billingNotice, keepPlan, keepOffers, PAUSE_MONTHS, planDate } from '../../lib/billing.js'
import { Screen, Card, Button, SectionTitle, Banner, Chip, Modal } from '../../components/ui.jsx'
import InviteCard from '../../components/InviteCard.jsx'
import { useDeals, FoundingCard, SeasonDealBanner } from '../../components/DealCards.jsx'
import GiftPlanCard from '../../components/GiftPlanCard.jsx'
import { giftState, giftDate } from '../../lib/giftRules.js'
import { guildsEnabled } from '../../lib/guilds.js'
import { usd, toCents, priceTag, priceWords, annualSaving, yearlyNote, yearlyOffered, planLines, upgradeReason } from '../../lib/plans.js'

/*
 * What each plan gives, the answer to "why would I pay more than the tier
 * below", and every price are worked out from the plan list and its limits
 * (lib/plans.js), so this screen cannot say something the app does not do.
 * Guilds are only mentioned when this app has them switched on.
 */
const PLAN_OPTS = { guilds: guildsEnabled() }

export default function ParentPlan() {
  const { state, dispatch } = useApp()
  const current = TIERS[state.family.tier] ? state.family.tier : 'starter'
  const trialTier = onTrial(state) ? effectiveTier(state.family) : null
  const trialDays = trialTier ? trialDaysLeft(state.family) : null
  const [confirm, setConfirm] = useState(null)
  /*
   * Monthly or annual. Monthly is the default deliberately: annual is the
   * better deal and the better business, but defaulting somebody into the
   * larger charge is the kind of thing that gets refunded and remembered.
   */
  const [cycle, setCycle] = useState('month')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const live = billingLive()
  /*
   * The deals on now (0.23.0), from the server: Founding Families on the
   * yearly plan, the Season's deal. Null in the demo, without payments, and
   * on a child's phone (which never reaches this screen anyway).
   */
  const deals = useDeals()
  const founding = live && deals?.founding && !status?.has_subscription ? deals.founding : null
  const seasonYearly = live && !founding && deals?.season?.on === 'yearly' ? deals.season : null
  // A gift plan, running or waiting for the paid one to end.
  const gift = giftState(state.family)
  /*
   * "Before you cancel": a pause, and the half-price month, offered first
   * to a parent on the way to cancelling or managing billing. Cancelling is
   * in the same sheet, one tap, never further away than that; and the plan
   * screen's own "Cancel my plan" button is always there.
   */
  const [keepOpen, setKeepOpen] = useState(false)
  const [keepNote, setKeepNote] = useState(null)
  const offers = keepOffers(status)
  const offering = offers.pause || offers.save
  const paidPlan = TIERS[status?.tier] && TIERS[status.tier].price ? TIERS[status.tier] : null
  // A plan Stripe can still charge: the one a parent can cancel.
  const cancellable = Boolean(status?.has_subscription) && ['active', 'trialing', 'past_due'].includes(status?.status) && !status?.ends_at

  useEffect(() => {
    // Nothing is asked of the server during the look-around. There is no
    // account for it to answer about, and a visitor browsing the plans should
    // not be generating traffic on somebody else's behalf.
    if (state.demo) return undefined
    fetchBillingStatus().then(setStatus)
    // Coming back from Stripe's checkout, the webhook may still be in flight.
    if (window.location.hash.includes('checkout=success')) {
      const t = setTimeout(() => fetchBillingStatus().then(setStatus), 4000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [state.demo])

  // Back from Stripe's page with the browser's back button: the buttons work
  // again (the page can come back from the browser's cache as it was left).
  useEffect(() => {
    const back = () => setBusy(false)
    window.addEventListener('pageshow', back)
    return () => window.removeEventListener('pageshow', back)
  }, [])

  const portal = async (flow = null) => {
    setBusy(true)
    setError('')
    const r = await openBillingPortal(flow)
    if (!r.ok) { setError(billingError(r.reason)); setBusy(false) }
  }

  /** Pause, resume or the half-price month; then ask the server what is true now. */
  const keep = async (action, months = null) => {
    setBusy(true)
    setError('')
    const r = await keepPlan(action, months)
    setBusy(false)
    if (!r.ok) { setError(billingError(r.reason)); return }
    setKeepOpen(false)
    setKeepNote(action === 'pause'
      ? { title: `Paused until ${planDate(r.paused_until)}`, body: 'Nothing is charged until then, and it starts again by itself. Your kids keep everything they have earned.' }
      : action === 'save'
        ? { title: 'Your next month is half price', body: 'Stripe takes 50% off your next payment. Nothing else changes.' }
        : r.charged_today
          ? { title: 'Your plan is back on', body: 'Everything in your plan is back now. Your renewal date fell inside the pause, so a new month starts today and Stripe charges for it today.' }
          : r.next_charge_at
            ? { title: 'Your plan is back on', body: `Everything in your plan is back now. Your renewal date fell inside the pause, so the days you had already paid for come first: your next payment is on ${planDate(r.next_charge_at)}.` }
            : { title: 'Your plan is back on', body: 'Everything in your plan is back now. Billing carries on from your next renewal date.' })
    fetchBillingStatus().then(setStatus)
  }

  /**
   * With Stripe live, the only route to Elite is a real payment — the database
   * refuses to let a device set its own tier. Without Stripe, the switch below
   * flips a local flag so both tiers can be tried in development, and says so.
   */
  const choosePlan = async (tier) => {
    if (!live) {
      dispatch({ type: 'SET_TIER', tier: tier.id })
      setConfirm(null)
      return
    }
    setBusy(true)
    setError('')
    const result = await startCheckout(tier.id, cycle, founding && cycle === 'year' ? 'founding' : null)
    if (!result.ok) {
      setError(billingError(result.reason))
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <Screen className="lg:max-w-5xl">
      <h1 className="font-display text-2xl font-extrabold mb-1">Plans</h1>
      {/*
        A new family is on a free trial of Elite. This said "You are on
        Starter" with Starter marked as the current plan, beside a dashboard
        saying fourteen days of Elite were left: both were true, and together
        they read as a mistake.
      */}
      <p className="text-sm text-muted mb-3">
        {trialDays
          ? `You are trying ${TIERS[trialTier].name} free for ${trialDays} more ${trialDays === 1 ? 'day' : 'days'}. After that you are on ${TIERS[current].name} unless you choose a plan.`
          : `You are on ${TIERS[current].name}.`}
        {gift && (gift.pending
          ? ` Your gift of ${gift.name} starts on ${giftDate(gift.startsAt)} and runs until ${giftDate(gift.until)}${gift.then ? `, then ${gift.then.name} until ${giftDate(gift.then.until)}` : ''}.`
          : ` Your gift of ${gift.name} runs until ${giftDate(gift.until)}${gift.then ? `, then ${gift.then.name} until ${giftDate(gift.then.until)}` : ''}. A plan you choose now is first charged ${gift.then ? 'when the last gift ends' : 'that day'}, never before.`)}
      </p>

      {live ? (
        <>
          {window.location.hash.includes('checkout=success') && (
            <Banner tone="good" icon="🎉" title="Payment received">
              Stripe is confirming it now. Your plan updates within a few seconds.
            </Banner>
          )}
          {/* Why a paid plan stopped (a failed renewal, a refund), in words. */}
          {billingNotice(status) && (
            <Banner tone={billingNotice(status).tone} icon={billingNotice(status).icon} title={billingNotice(status).title}>
              {billingNotice(status).body}
            </Banner>
          )}
          {keepNote && (
            <div data-testid="keep-note">
              <Banner tone="good" icon="✅" title={keepNote.title}>{keepNote.body}</Banner>
            </div>
          )}
          {status?.paused_until && (
            <>
              <Button className="w-full mt-2" disabled={busy} onClick={() => keep('resume')} data-testid="resume-plan">
                Start my plan again now
              </Button>
              <p className="text-xs text-muted mt-1" data-testid="resume-note">
                If your renewal date passed during the pause, the days you had already paid for come back first, then a new month starts and is charged (today, if none were left).
              </p>
            </>
          )}
          {status?.has_customer && (
            <Button variant="soft" className="w-full mt-2" disabled={busy} data-testid="manage-billing"
              onClick={() => (offering ? setKeepOpen(true) : portal())}>
              Manage billing or update card
            </Button>
          )}
          {/* Cancelling is always here, in plain words, one tap from this screen. */}
          {cancellable && (
            <Button variant="ghost" className="w-full mt-2" disabled={busy} data-testid="cancel-plan"
              onClick={() => (offering ? setKeepOpen(true) : portal('cancel'))}>
              Cancel my plan
            </Button>
          )}
        </>
      ) : (
        <Banner tone="info" icon="💳" title={noPaymentsWords(state, 'plan').title}>
          {noPaymentsWords(state, 'plan').body}
        </Banner>
      )}

      {error && <p className="text-sm mt-3" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}

      {/* Deals, for a parent, with their real end dates (src/lib/deals.js). */}
      {(founding || seasonYearly) && (
        <div className="mt-3">
          <FoundingCard deal={founding} onChoose={cycle === 'year' ? null : () => setCycle('year')} />
          <SeasonDealBanner deal={seasonYearly} />
        </div>
      )}

      {/*
        What a year saves is the whole pitch for annual, so it is stated on the
        control rather than hidden inside the cards a tap away (yearlyNote:
        months free when the year is whole months, otherwise a percentage).
      */}
      {yearlyOffered() && (
      <div className="flex gap-1.5 p-1 rounded-xl mt-3" style={{ background: 'var(--surface-2)' }} role="tablist" aria-label="Billing period">
        {[
          { id: 'month', label: 'Monthly' },
          { id: 'year', label: 'Yearly', note: yearlyNote() },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={cycle === option.id}
            onClick={() => setCycle(option.id)}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors"
            style={cycle === option.id
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--ink-muted)' }}
          >
            {option.label}
            {option.note && (
              <span className="block text-[11px] font-normal opacity-80">{option.note}</span>
            )}
          </button>
        ))}
      </div>
      )}

      {/* Side by side on a wide screen, one under another on a phone. */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3 lg:items-start" data-testid="plan-cards">
        {TIER_LADDER.map((tier, i) => {
          const active = tier.id === current
          const below = TIER_LADDER[i - 1]
          const saving = annualSaving(tier)
          const yearly = cycle === 'year' && saving
          return (
            <Card
              key={tier.id}
              style={{ borderColor: active ? 'var(--accent)' : tier.id === 'elite' ? 'var(--accent-2)' : 'var(--line)' }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h2 className="font-display font-extrabold text-lg">{tier.name}</h2>
                <span className="font-display font-extrabold text-xl">
                  {tier.price === 0
                    ? 'Free'
                    : yearly
                      ? <>${usd(tier.yearPrice)}<span className="text-xs font-normal text-muted">/yr</span></>
                      : <>${usd(tier.price)}<span className="text-xs font-normal text-muted">/mo</span></>}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {active && <Chip tone="var(--accent)">{trialTier ? 'Your plan after the trial' : 'Current plan'}</Chip>}
                {tier.id === trialTier && (
                  <Chip tone="var(--good)">Free trial · {trialDays} {trialDays === 1 ? 'day' : 'days'} left</Chip>
                )}
                <Chip>
                  {tier.price === 0
                    ? 'Free forever · no card'
                    : yearly
                      ? 'Billed yearly · cancel any time'
                      : 'Billed monthly · cancel any time'}
                </Chip>
                {yearly && (
                  <Chip tone="var(--good)" data-testid={`saving-${tier.id}`}>
                    ${saving.saved} saved a year
                  </Chip>
                )}
                {/* The saving, worked out from the plan list's own two
                    prices (annualSaving): "Save 30%", and "2 months free"
                    or more when a year costs a whole number of months less. */}
                {tier.price > 0 && saving && (
                  <Chip tone="var(--good)" data-testid={`save-badge-${tier.id}`}>
                    Save {saving.percent}% yearly{saving.monthsFree ? ` · ${saving.monthsFree} months free` : saving.savedCents >= 2 * toCents(tier.price) ? ' · 2 months free+' : ''}
                  </Chip>
                )}
                {yearly && founding && (
                  <Chip tone="var(--accent)" data-testid={`founding-badge-${tier.id}`}>First year {founding.percent}% off</Chip>
                )}
              </div>
              {yearly && (
                <p className="text-xs text-muted mt-1.5">
                  Twelve months at ${usd(tier.price)} is ${usd((saving.savedCents + toCents(tier.yearPrice)) / 100)}.
                  {saving.monthsFree
                    ? ` A year is ${12 - saving.monthsFree} months' money, so ${saving.monthsFree} ${saving.monthsFree === 1 ? 'month is' : 'months are'} free.`
                    : ` A year saves ${saving.percent}%.`}
                </p>
              )}
              {below && (
                <p className="text-sm mt-2">
                  <strong>
                    {below.price === 0
                      ? priceWords(tier)
                      : `$${usd((toCents(tier.price) - toCents(below.price)) / 100)} more than ${below.name}`}
                  </strong>
                  {' — '}{upgradeReason(tier, PLAN_OPTS)}
                </p>
              )}

              <ul className="mt-3 space-y-1.5" data-testid={`plan-lines-${tier.id}`}>
                {planLines(tier, PLAN_OPTS).map((f) => (
                  <li key={f} className="text-sm flex gap-2">
                    <span style={{ color: 'var(--good)' }} aria-hidden="true">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {!active && (
                <Button
                  variant={tier.id === 'elite' ? 'primary' : 'soft'}
                  className="w-full mt-3"
                  disabled={busy}
                  onClick={() => (live ? choosePlan(tier) : setConfirm(tier))}
                >
                  {busy
                    ? 'Opening Stripe…'
                    : tier.price === 0
                      ? `Stay on ${tier.name}`
                      : `${live ? 'Subscribe to' : 'Switch to'} ${tier.name} · `
                        + priceTag(tier, yearly ? 'year' : 'month')}
                </Button>
              )}
            </Card>
          )
        })}
      </div>

      {/* A gift plan, redeeming a code, and giving one. Parent Mode only. */}
      <div className="mt-4">
        <GiftPlanCard compact />
      </div>

      {/* Bring a friend: a free month of whichever plan this family pays for,
          or banked until it chooses one. Only with a backend; never shown
          in the look-around. */}
      <div className="mt-4">
        <InviteCard compact />
      </div>

      {/* Standard or Elite? What Elite adds, line by line, from the plan list. */}
      <SectionTitle>Standard or Elite?</SectionTitle>
      <Card flat className="mb-4" data-testid="standard-or-elite">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="font-display font-extrabold">{TIERS.standard.name}</p>
            <p className="text-xs text-muted mb-2">{priceTag(TIERS.standard)}</p>
            <ul className="space-y-1">
              {planLines(TIERS.standard, PLAN_OPTS).filter((l) => !l.startsWith('Everything in')).map((l) => (
                <li key={l} className="text-xs flex gap-1.5"><span className="text-good" aria-hidden="true">✓</span><span>{l}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-display font-extrabold">{TIERS.elite.name}</p>
            <p className="text-xs text-muted mb-2">{priceTag(TIERS.elite)}</p>
            <ul className="space-y-1">
              <li className="text-xs flex gap-1.5"><span className="text-good" aria-hidden="true">✓</span><span>Everything in {TIERS.standard.name}, and:</span></li>
              {planLines(TIERS.elite, PLAN_OPTS).filter((l) => !l.startsWith('Everything in')).map((l) => (
                <li key={l} className="text-xs flex gap-1.5"><span className="text-accent" aria-hidden="true">+</span><span>{l}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <SectionTitle>Side by side</SectionTitle>
      <Card flat className="mb-4 p-0 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '37%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left px-2.5 py-2 text-xs text-muted font-semibold">&nbsp;</th>
              {TIER_LADDER.map((t) => (
                <th
                  key={t.id}
                  className="px-1 py-2 text-center align-bottom"
                  style={{ borderBottom: '1px solid var(--line)' }}
                >
                  <span className="block font-display font-extrabold text-[12px] leading-tight">{t.name}</span>
                  <span
                    className="block text-[10px] text-muted leading-tight"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {priceTag(t)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON.filter((row) => !row.needs || PLAN_OPTS[row.needs]).map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="text-left px-2.5 py-2 font-normal text-[11px] leading-tight"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  {row.label}
                </th>
                {TIER_LADDER.map((t) => {
                  const v = row.value(t)
                  return (
                    <td
                      key={t.id}
                      className="px-1 py-2 text-center text-[11px] leading-tight"
                      style={{
                        borderTop: '1px solid var(--line)',
                        background: t.id === current ? 'var(--surface-2)' : undefined,
                      }}
                    >
                      {v === true && <span style={{ color: 'var(--good)' }} aria-label="Included">✓</span>}
                      {v === false && <span className="text-muted" aria-label="Not included">—</span>}
                      {typeof v === 'string' && <span>{v}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle>What Elite adds for kids</SectionTitle>
      {ELITE_KID_PERKS.filter((p) => !p.needs || PLAN_OPTS[p.needs]).map((p) => (
        <Card key={p.title} flat className="mb-2 flex gap-3">
          <span className="text-xl" aria-hidden="true">{p.icon}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-sm">{p.title}</span>
            <span className="block text-xs text-muted">{p.body}</span>
          </span>
        </Card>
      ))}

      <SectionTitle>What Elite adds for parents</SectionTitle>
      {ELITE_PARENT_PERKS.map((p) => (
        <Card key={p.title} flat className="mb-2 flex gap-3">
          <span className="text-xl" aria-hidden="true">{p.icon}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-sm">{p.title}</span>
            <span className="block text-xs text-muted">{p.body}</span>
          </span>
        </Card>
      ))}

      <Modal
        open={keepOpen}
        onClose={() => setKeepOpen(false)}
        title="Before you cancel"
      >
        <div data-testid="keep-sheet">
          {offers.pause && (
            <div className="mb-4">
              <p className="font-semibold text-sm">Taking a break? Pause instead.</p>
              <p className="text-sm text-muted mb-2">
                Nothing is charged while it is paused, and it starts again by itself. Your kids keep
                every bit of XP, coins and items; some extras rest until it starts again.
              </p>
              <div className="flex gap-2">
                {PAUSE_MONTHS.map((n) => (
                  <Button key={n} variant="soft" className="flex-1 py-2 min-h-0 text-sm" disabled={busy}
                    onClick={() => keep('pause', n)} data-testid={`pause-${n}`}>
                    {n === 1 ? '1 month' : `${n} months`}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {offers.save && paidPlan && (
            <div className="mb-4">
              <p className="font-semibold text-sm">Or stay, at half price</p>
              <p className="text-sm text-muted mb-2">
                Your next month of {paidPlan.name} at half price, instead of {priceWords(paidPlan)}. Then it
                carries on as before. Once only.
              </p>
              <Button variant="soft" className="w-full py-2 min-h-0 text-sm" disabled={busy}
                onClick={() => keep('save')} data-testid="save-offer">
                Take 50% off my next month
              </Button>
            </div>
          )}
          {error && <p className="text-sm mb-3 text-bad" role="alert">{error}</p>}
          <div className="flex gap-2">
            {cancellable && (
              <Button variant="danger" className="flex-1 py-2 min-h-0 text-sm" disabled={busy}
                onClick={() => portal('cancel')} data-testid="cancel-anyway">
                Cancel my plan
              </Button>
            )}
            {status?.has_customer && (
              <Button variant="ghost" className="flex-1 py-2 min-h-0 text-sm" disabled={busy}
                onClick={() => portal()} data-testid="manage-anyway">
                Billing and card
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={`Switch to ${confirm?.name}?`}
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button className="flex-1" onClick={() => choosePlan(confirm)}>Switch</Button>
          </>
        }
      >
        <p className="text-sm mb-2">
          {confirm && upgradeReason(confirm, PLAN_OPTS)
            ? `On ${confirm.name}: ${upgradeReason(confirm, PLAN_OPTS)}`
            : `${planLines(TIER_LADDER[0], PLAN_OPTS)[0]}, free.`}
        </p>
        <p className="text-sm mb-2">
          Nothing your children have already earned is ever removed by changing plan — XP,
          currency and streaks stay exactly where they are.
        </p>
        <p className="text-xs text-muted">
          {state.demo ? 'Nothing is charged: this is the pretend family.' : 'No payment is taken: payments are not set up on this copy of RankUp.'}
        </p>
      </Modal>
    </Screen>
  )
}
