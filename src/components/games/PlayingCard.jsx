/**
 * One playing card.
 *
 * Three games deal cards now, and a card drawn three slightly different
 * ways reads as three different games rather than one arcade. Face down
 * is part of the same component because a card that flips has to be the
 * same object in the same slot — swapping one element for another is
 * what makes a dealt hand jump about as it is revealed.
 */
export default function PlayingCard({ card, down = false, size = 'md', dim = false }) {
  const w = size === 'sm' ? 38 : size === 'lg' ? 54 : 46
  const h = Math.round(w * 1.44)
  const red = card && (card.suit === '♥' || card.suit === '♦')

  if (down || !card) {
    return (
      <div
        aria-label="Face-down card"
        className="shrink-0"
        style={{
          width: w,
          height: h,
          borderRadius: 7,
          background:
            'repeating-linear-gradient(45deg, var(--surface-2) 0 5px, color-mix(in srgb, var(--accent) 36%, var(--surface-2)) 5px 10px)',
          border: '2px solid color-mix(in srgb, var(--accent) 48%, var(--line))',
        }}
      />
    )
  }

  return (
    <div
      aria-label={`${card.rank} of ${card.suit}`}
      className="grid place-items-center font-display font-extrabold shrink-0"
      style={{
        width: w,
        height: h,
        borderRadius: 7,
        background: '#fff',
        color: red ? '#dc2626' : '#111827',
        border: '2px solid rgb(0 0 0 / 0.18)',
        fontSize: size === 'sm' ? 12 : 15,
        lineHeight: 1.1,
        opacity: dim ? 0.45 : 1,
        transition: 'opacity 160ms ease',
      }}
    >
      <span className="text-center">{card.rank}<br />{card.suit}</span>
    </div>
  )
}
