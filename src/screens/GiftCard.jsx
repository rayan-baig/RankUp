import Logo from '../components/Logo.jsx'
import { Button } from '../components/ui.jsx'
import { TIERS } from '../state/initialState.js'
import { navigate } from '../lib/router.js'
import { readGiftCard, giftDate, GIFT_MONTHS } from '../lib/giftRules.js'

/*
 * Printed as it looks: the colours are kept, the buttons go, and the card
 * sits alone on the page.
 */
const PRINT = `
@media print {
  @page { margin: 12mm; }
  html, body { background: #ffffff !important; }
  .gift-no-print { display: none !important; }
  .gift-sheet { padding: 0 !important; max-width: none !important; }
  .gift-card { box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; break-inside: avoid; }
}`

/**
 * The printable gift card, from the link in the buyer's receipt.
 *
 * Everything on it (the code, the plan, the names, the message, the date)
 * travels after the # in that link, which a browser never sends to a server:
 * the card is drawn here, on the buyer's phone or computer, and RankUp never
 * sees it opened. A link with no proper code shows the card without one.
 */
export default function GiftCard({ query = '' }) {
  const card = readGiftCard(query)
  const plan = TIERS[card.plan] || TIERS.elite
  const site = typeof window !== 'undefined' ? window.location.host : ''
  const by = card.by ? giftDate(Date.parse(`${card.by}T12:00:00Z`)) : ''

  return (
    <div className="gift-sheet shell px-4 py-5" data-testid="gift-card-page">
      <style>{PRINT}</style>
      <div
        className="gift-card rounded-[22px] p-5 relative overflow-hidden"
        data-testid="gift-card"
        style={{
          background: 'linear-gradient(150deg, #7C5CFF 0%, #4A22C9 55%, #1B0B48 100%)',
          color: '#ffffff',
          boxShadow: '0 18px 50px -18px rgba(74, 34, 201, 0.75)',
        }}
      >
        {/* A ribbon, and stars: paint, nothing to read. */}
        <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: 34, width: 16, background: 'rgba(255, 201, 61, 0.9)' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: 72, left: 0, right: 0, height: 16, background: 'rgba(255, 201, 61, 0.9)' }} />
        <div aria-hidden="true" className="text-3xl" style={{ position: 'absolute', top: 54, right: 20 }}>🎀</div>

        <div className="flex items-center gap-2 relative">
          <Logo size={36} />
          <span className="font-display font-extrabold text-xl">Rank<span style={{ color: '#FFC93D' }}>Up</span></span>
        </div>

        <div className="relative mt-10 pr-12">
          <p className="text-xs uppercase tracking-[0.18em] opacity-80">A gift for {card.toName || 'your family'}</p>
          <h1 className="font-display font-extrabold text-[34px] leading-[1.05] mt-1">A year of RankUp</h1>
          <p className="font-display font-bold text-lg mt-1" style={{ color: '#FFC93D' }} data-testid="gift-card-plan">{plan.name} · {GIFT_MONTHS} months</p>
          {card.message && (
            <p className="text-[15px] leading-snug mt-3 italic" data-testid="gift-card-message">“{card.message}”</p>
          )}
          {card.fromName && <p className="text-sm mt-2 opacity-90">With love from {card.fromName}</p>}
        </div>

        <div className="relative mt-5 rounded-2xl px-3 py-3 text-center" style={{ background: '#ffffff', color: '#1B0B48' }}>
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold" style={{ color: '#4A22C9' }}>Your gift code</p>
          <p className="font-mono font-bold text-[26px] tracking-[0.08em] mt-0.5" data-testid="gift-card-code">
            {card.code || '••••-••••-••••'}
          </p>
          {by && <p className="text-[11px] mt-0.5" style={{ color: '#5b5470' }}>Use it by {by}</p>}
        </div>

        <ol className="relative mt-4 pr-12 space-y-1.5 text-[13px] leading-snug">
          <li><strong>1.</strong> Open <strong>{site || 'RankUp'}</strong> on a grown-up&rsquo;s phone and set up your family (free), or open RankUp if you already use it.</li>
          <li><strong>2.</strong> Go into Parent Mode, then Settings, then <strong>Redeem a gift</strong>.</li>
          <li><strong>3.</strong> Type the code. {plan.name} is yours for {GIFT_MONTHS} months from that day. No card needed.</li>
        </ol>
        <p className="relative text-[10px] opacity-70 mt-4 pr-12">RankUp turns kids&rsquo; chores into quests. A product of MTRX Horizyn.</p>
      </div>

      <div className="gift-no-print mt-4 space-y-2">
        <Button className="w-full" onClick={() => window.print()} data-testid="gift-card-print">Print this card</Button>
        <p className="text-xs text-muted text-center">
          Keep the code safe: it works once. Lost it? It is in the receipt email too.
        </p>
        <Button variant="ghost" className="w-full" onClick={() => navigate('/gift')}>Give a gift</Button>
      </div>
    </div>
  )
}
