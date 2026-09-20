/**
 * The stickers a parent can put on an approved chore.
 *
 * Approving used to be a receipt: the XP landed and that was the whole message.
 * A child who scrubbed a bathroom and a child who dropped one sock in a basket
 * got the same silence. These are the cheapest way to say something specific
 * without asking a tired parent to write a sentence at nine at night.
 *
 * Eight, deliberately. Enough that the right one usually exists; few enough to
 * fit one row on a phone and be chosen without reading.
 *
 * MIRRORED in the STICKERS list in supabase/schema.sql, which is the authority
 * — the column takes nothing that is not on it, so a tampered client cannot
 * write arbitrary text into a field a child will read.
 */
export const STICKERS = [
  { id: 'proud', emoji: '🌟', label: 'So proud' },
  { id: 'spotless', emoji: '✨', label: 'Spotless' },
  { id: 'fast', emoji: '⚡', label: 'Lightning fast' },
  { id: 'effort', emoji: '💪', label: 'Real effort' },
  { id: 'kind', emoji: '💛', label: 'Kind of you' },
  { id: 'above', emoji: '🚀', label: 'Went further' },
  { id: 'funny', emoji: '😄', label: 'Made me laugh' },
  { id: 'thanks', emoji: '🙏', label: 'Thank you' },
]

export const STICKER_MAP = Object.fromEntries(STICKERS.map((s) => [s.id, s]))
