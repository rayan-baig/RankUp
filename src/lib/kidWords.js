/**
 * The words a child's theme may not carry, and keeping typed names plain.
 *
 * Theme Genesis lets a child name a theme, its four worlds and its currency.
 * Those names are seen by their own family and, if a parent sends a theme to
 * RankUp and it is picked for a Season, by every family. So every name is
 * checked against a short list of rude words, here on the phone and again in
 * the database (kid_words_ok in supabase/sync.sql), which holds the same two
 * lists. tests/genesiswords.mjs fails if the two ever disagree.
 *
 * This is a simple filter, not a moderator. It is there to stop the obvious,
 * and a parent sees, renames and removes every custom theme in Settings.
 * Nothing here goes to any outside service.
 *
 * Names are shown with React text only, never as HTML.
 */

/** Whole words: refused only when a word in the name is exactly one of these. */
export const BLOCKED_WORDS = [
  'arse', 'arsehole', 'ass', 'asses', 'asshole', 'bastard', 'bollocks', 'boobs', 'bugger', 'cock', 'cocks',
  'crap', 'damn', 'dick', 'dickhead', 'dicks', 'fag', 'fags', 'kys', 'naked', 'nazi', 'nazis', 'nude',
  'piss', 'pissed', 'prick', 'retard', 'retarded', 'sex', 'sexy', 'tit', 'tits', 'titty', 'hitler',
]

/** Pieces refused anywhere, even run together or spaced out ("f u c k"). */
export const BLOCKED_PARTS = [
  'bitch', 'cunt', 'dildo', 'fagg', 'fuck', 'nigg', 'penis', 'porn', 'pussy', 'shit', 'slut', 'twat',
  'vagina', 'wank', 'whore',
]

/** Letters people swap for numbers and symbols, read back as letters. */
const LOOKALIKE = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' }

const collapse = (s) => s.replace(/(.)\1+/g, '$1')

/** True when the text has none of the words above. Empty text is fine. */
export function wordsOk(text) {
  if (!text) return true
  const norm = String(text).toLowerCase().replace(/[013457@$!]/g, (c) => LOOKALIKE[c])
  for (const word of norm.split(/[^a-z]+/)) {
    if (!word) continue
    if (BLOCKED_WORDS.includes(word) || BLOCKED_WORDS.includes(collapse(word))) return false
  }
  const squashed = norm.replace(/[^a-z]/g, '')
  const collapsed = collapse(squashed)
  return !BLOCKED_PARTS.some((part) => squashed.includes(part) || collapsed.includes(part))
}

/**
 * A typed name made plain: no control characters, no angle brackets, single
 * spaces, trimmed, and no longer than `max` characters (counted as the
 * person sees them, so an emoji is one).
 */
export function plainName(text, max) {
  const cleaned = String(text ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return [...cleaned].slice(0, max).join('').trim()
}
