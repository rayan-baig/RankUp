import { useState } from 'react'
import Logo from '../components/Logo.jsx'
import { Card, Button, Field, TextInput, TextArea, Banner, Chip } from '../components/ui.jsx'
import { TIERS } from '../state/initialState.js'
import { usd, planLines } from '../lib/plans.js'
import { guildsEnabled } from '../lib/guilds.js'
import { giftsLive, startGiftCheckout, noPaymentsWords } from '../lib/billing.js'
import { navigate } from '../lib/router.js'
import { useApp } from '../state/AppContext.jsx'
import { useDeals, GiftSaleBanner } from '../components/DealCards.jsx'
import {
  checkGiftForm, giftError, GIFT_CHECKOUT_ERRORS, GIFT_PLANS, GIFT_MONTHS, GIFT_CODE_YEARS,
  GIFT_MESSAGE_MAX, GIFT_NAME_MAX, GIFT_RECIPIENT_DAYS,
} from '../lib/giftRules.js'

/*
 * What was typed, kept for the trip to Stripe and back, in this tab only, so
 * the thank-you can say where the code went. A convenience: everything works
 * without it.
 */
const KEPT = 'rankup.gift.sent'
const keep = (value) => { try { sessionStorage.setItem(KEPT, JSON.stringify(value)) } catch { /* private mode */ } }
const kept = () => { try { return JSON.parse(sessionStorage.getItem(KEPT) || 'null') } catch { return null } }

/**
 * Give RankUp: "a year of RankUp", bought for a family by somebody with no
 * account (a grandparent, an aunt, an uncle). Public, like the privacy
 * policy: linked from the front door and from the parent's plan screen. On a
 * phone that is set up it opens only in Parent Mode, and never on a child's
 * own phone (the route guard in App.jsx), because children never see buying.
 *
 * One payment at the yearly price, through Stripe Checkout. The code is made
 * after Stripe confirms the payment, and emailed: to the buyer always (the
 * receipt, with a printable card), and to the person it is for if the buyer
 * chose that. The prices, the months and the years all come from the plan
 * list and lib/giftRules.js.
 */
export default function GiveRankUp({ query = '' }) {
  const { state } = useApp()
  // The holiday gift sale or the Season's deal on gifts, while on (0.23.0).
  const deals = useDeals()
  const sale = deals?.gift_sale || (deals?.season?.on === 'gift' ? { percent: deals.season.percent, until: deals.season.until } : null)
  const params = new URLSearchParams(query)
  const paid = params.get('paid') === '1'
  const cancelled = params.get('cancelled') === '1'
  const [form, setForm] = useState({
    plan: 'elite', delivery: 'email', buyerEmail: '', fromName: '', toName: '', toEmail: '', message: '',
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  const live = giftsLive()
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setErrors({}); setFailed('') }
  const plan = TIERS[form.plan]

  const pay = async () => {
    const { ok, errors: found, clean } = checkGiftForm(form)
    if (!ok) { setErrors(found); return }
    if (!live) { setFailed(GIFT_CHECKOUT_ERRORS.not_configured); return }
    setBusy(true)
    keep({ buyerEmail: clean.buyerEmail, delivery: clean.delivery, toName: clean.toName, plan: clean.plan })
    const result = await startGiftCheckout(clean)
    // On success the page is already on its way to Stripe.
    if (!result.ok) {
      setFailed(giftError(result.reason, GIFT_CHECKOUT_ERRORS))
      setBusy(false)
    }
  }

  if (paid) {
    const sent = kept()
    return (
      <div className="shell px-4 py-6" data-testid="gift-thanks">
        <Header />
        <Card className="mt-4 text-center">
          <div className="text-5xl mb-2" aria-hidden="true">🎁</div>
          <h1 className="font-display text-2xl font-extrabold mb-2">Thank you!</h1>
          <p className="text-sm mb-2">
            Your payment went through. The gift code is on its way to
            {sent?.buyerEmail ? <> <strong>{sent.buyerEmail}</strong></> : ' your email'}, with a gift card to print, usually within a minute.
          </p>
          {sent?.delivery === 'email' && (
            <p className="text-sm mb-2">We are emailing the gift to {sent.toName || 'them'} as well, with your message.</p>
          )}
          <p className="text-xs text-muted">
            Not there in a few minutes? Look in spam, then write to us from the help page. Stripe sends its own receipt for the payment too.
          </p>
        </Card>
        <Button variant="soft" className="w-full mt-3" onClick={() => navigate('/gift')}>Give another</Button>
      </div>
    )
  }

  return (
    <div className="shell px-4 pt-5 pb-16" data-testid="give-rankup">
      <Header />
      <h1 className="font-display text-2xl font-extrabold mt-4 mb-1">Give a year of RankUp</h1>
      <p className="text-sm text-muted mb-3">
        For grandparents, aunts, uncles and friends: a year of chores turned into a game, for a family you love. You need no account.
      </p>

      {cancelled && (
        <div className="mb-3">
          <Banner tone="info" icon="↩️" title="Nothing was charged">You left the payment page. Your gift is still here when you want it.</Banner>
        </div>
      )}
      {!live && (
        <div className="mb-3">
          <Banner tone="info" icon="💳" title={noPaymentsWords(state, 'gift').title}>
            {noPaymentsWords(state, 'gift').body}
          </Banner>
        </div>
      )}

      <GiftSaleBanner sale={sale} link={false} />

      <p className="section-title">1. Choose the plan</p>
      <div className="grid grid-cols-2 gap-2.5 mb-1" role="radiogroup" aria-label="Plan">
        {GIFT_PLANS.map((id) => {
          const t = TIERS[id]
          const on = form.plan === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`gift-plan-${id}`}
              onClick={() => set({ plan: id })}
              className="card-flat text-left p-3 transition-transform active:scale-[0.98]"
              style={{ borderColor: on ? 'var(--accent)' : 'var(--line)', borderWidth: on ? 2 : 1 }}
            >
              <span className="block font-display font-extrabold">{t.name}</span>
              <span className="block font-display font-extrabold text-xl">${usd(t.yearPrice)}</span>
              <span className="block text-[11px] text-muted">1 year · paid once</span>
            </button>
          )
        })}
      </div>
      <ul className="mb-3 mt-2 space-y-1" data-testid="gift-plan-lines">
        {planLines(plan, { guilds: guildsEnabled() }).slice(0, 4).map((line) => (
          <li key={line} className="text-xs flex gap-2"><span style={{ color: 'var(--good)' }} aria-hidden="true">✓</span>{line}</li>
        ))}
      </ul>

      <p className="section-title">2. How it is given</p>
      <div className="grid grid-cols-2 gap-2.5 mb-3" role="radiogroup" aria-label="How it is given">
        {[
          { id: 'email', icon: '📧', title: 'Email it to them now', body: 'We send the code with your message.' },
          { id: 'self', icon: '🖨️', title: 'I\'ll give it myself', body: 'Print the gift card, or pass on the code.' },
        ].map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={form.delivery === o.id}
            data-testid={`gift-delivery-${o.id}`}
            onClick={() => set({ delivery: o.id })}
            className="card-flat text-left p-3"
            style={{ borderColor: form.delivery === o.id ? 'var(--accent)' : 'var(--line)', borderWidth: form.delivery === o.id ? 2 : 1 }}
          >
            <span className="text-xl" aria-hidden="true">{o.icon}</span>
            <span className="block font-semibold text-sm leading-tight mt-1">{o.title}</span>
            <span className="block text-[11px] text-muted leading-snug mt-0.5">{o.body}</span>
          </button>
        ))}
      </div>

      <p className="section-title">3. Who it is for</p>
      <Field label="Their name (optional)" hint="A grown-up's name, or the family's: “The Riveras”.">
        <TextInput value={form.toName} maxLength={GIFT_NAME_MAX} onChange={(e) => set({ toName: e.target.value })} placeholder="e.g. Sam" />
      </Field>
      {errors.toName && <FieldError text={errors.toName} />}
      <Field label={form.delivery === 'email' ? 'Their email' : 'Their email (optional)'}>
        <TextInput type="email" inputMode="email" value={form.toEmail} onChange={(e) => set({ toEmail: e.target.value })} placeholder="them@example.com" data-testid="gift-to-email" />
      </Field>
      {errors.toEmail && <FieldError text={errors.toEmail} />}
      <Field label="Your name (optional)" hint="Who the gift says it is from.">
        <TextInput value={form.fromName} maxLength={GIFT_NAME_MAX} onChange={(e) => set({ fromName: e.target.value })} placeholder="e.g. Grandma Jo" />
      </Field>
      {errors.fromName && <FieldError text={errors.fromName} />}
      <Field label={`A short message (optional) · ${form.message.length}/${GIFT_MESSAGE_MAX}`}>
        <TextArea value={form.message} maxLength={GIFT_MESSAGE_MAX} onChange={(e) => set({ message: e.target.value })}
          placeholder="Happy holidays! Love, Grandma" data-testid="gift-message" />
      </Field>
      {errors.message && <FieldError text={errors.message} />}

      <p className="section-title">4. Your receipt</p>
      <Field label="Your email" hint="The receipt and the gift code go here.">
        <TextInput type="email" inputMode="email" value={form.buyerEmail} onChange={(e) => set({ buyerEmail: e.target.value })} placeholder="you@example.com" data-testid="gift-buyer-email" />
      </Field>
      {errors.buyerEmail && <FieldError text={errors.buyerEmail} />}

      {failed && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }} role="alert">{failed}</p>}
      <Button className="w-full font-display font-extrabold" disabled={busy} onClick={pay} data-testid="gift-pay">
        {busy ? 'Opening Stripe…' : `Pay $${usd(plan.yearPrice)} for a year of ${plan.name}`}
      </Button>
      <div className="flex flex-wrap gap-1.5 justify-center mt-2">
        <Chip>One payment</Chip><Chip>Nothing renews</Chip><Chip>Paid with Stripe</Chip>
      </div>
      <p className="text-xs text-muted mt-3" data-testid="gift-terms">
        The family gets {plan.name} free for {GIFT_MONTHS} months from the day they redeem the code, which works once, for {GIFT_CODE_YEARS} years.
        If they already pay for RankUp, their gift year starts when their paid plan ends, so nobody pays twice.
      </p>
      <p className="text-xs text-muted mt-2">
        We keep your email for the receipt and for help with the gift until the code runs out; their name and email, and your message, are
        used only to send the gift and deleted within {GIFT_RECIPIENT_DAYS} days.{' '}
        <a href="#/legal/privacy" className="underline">Privacy policy</a>
      </p>
    </div>
  )
}

/** The page's top line, with the way back: to Settings in Parent Mode, to the front door otherwise. */
export function Header() {
  const { state } = useApp()
  const back = state.onboarded ? '/parent/settings' : '/welcome'
  return (
    <div className="flex items-center gap-2">
      <Logo size={32} />
      <span className="font-display font-extrabold text-lg">Rank<span style={{ color: '#FFC93D' }}>Up</span></span>
      <button type="button" className="ml-auto text-sm underline text-muted" onClick={() => navigate(back)} data-testid="gift-back">
        {state.onboarded ? 'Back to Settings' : 'Back'}
      </button>
    </div>
  )
}

function FieldError({ text }) {
  return <p className="text-xs -mt-2 mb-3" style={{ color: 'var(--bad)' }} role="alert">{text}</p>
}
