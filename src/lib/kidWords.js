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

/* ---------- other companies' names, for a theme sent in for a Season ---------- */

/**
 * Games, sports leagues and brands a Season theme may not be named after.
 *
 * A child's own theme can be called anything the rude-word filter allows:
 * it is seen only by their family. A theme sent to RankUp for a Season can
 * become an official RankUp theme in every family's picker, so it cannot
 * carry another company's or game's name. Checked when a theme is sent, on
 * the phone and again in the database (kid_brands_ok in supabase/sync.sql,
 * the same list; tests/genesiswords.mjs fails if they drift apart).
 *
 * Each entry is matched as a whole word or phrase, in lower case, spaces and
 * punctuation ignored, so "Mine-Craft" and "minecraft" are both caught and
 * "Marvellous", "Legolas" or "Gorilla" are not. An ordinary English word is
 * left off on purpose (halo, sonic, frozen, apple, puma), and so is anything
 * that is mostly a first name: this is a short list of the obvious, and the
 * operator still looks at every theme. At most four words an entry.
 */
export const BRAND_NAMES = [
  // Games and game makers
  'minecraft', 'fortnite', 'roblox', 'pokemon', 'pikachu', 'mario', 'super mario', 'mario kart', 'luigi', 'zelda',
  'nintendo', 'playstation', 'xbox', 'gta', 'grand theft auto', 'call of duty', 'among us', 'fall guys',
  'rocket league', 'fifa', 'ea fc', 'ea sports', 'madden', 'apex legends', 'overwatch', 'valorant',
  'league of legends', 'clash royale', 'clash of clans', 'candy crush', 'angry birds', 'pac man', 'tetris',
  'splatoon', 'animal crossing', 'brawl stars', 'subway surfers', 'geometry dash', 'five nights at freddys', 'fnaf',
  'the sims', 'terraria', 'stumble guys', 'pubg', 'free fire', 'genshin impact', 'mortal kombat', 'street fighter',
  'skylanders', 'stardew valley', 'sea of thieves', 'rainbow six', 'counter strike', 'red dead', 'poppy playtime',
  'hello neighbor', 'donkey kong', 'smash bros', 'need for speed', 'forza', 'gran turismo', 'sega',
  // Sports leagues and races
  'f1', 'formula 1', 'formula one', 'nascar', 'indycar', 'nba', 'wnba', 'nfl', 'nhl', 'mlb', 'mls', 'wwe',
  'ufc', 'premier league', 'champions league', 'la liga', 'uefa', 'olympics', 'wimbledon', 'super bowl',
  // Brands, films and shows
  'disney', 'pixar', 'marvel', 'avengers', 'dc comics', 'star wars', 'lego', 'legos', 'barbie', 'hot wheels',
  'nerf', 'hello kitty', 'sanrio', 'nike', 'adidas', 'coca cola', 'pepsi', 'mcdonalds', 'youtube', 'tiktok',
  'netflix', 'spongebob', 'paw patrol', 'peppa pig', 'bluey', 'harry potter', 'hogwarts', 'transformers',
  'ferrari', 'lamborghini', 'red bull', 'mclaren', 'batman', 'spiderman', 'superman', 'shrek',
  'my little pony', 'jurassic park', 'jurassic world', 'ninjago', 'scooby doo',
]

/** Lower case, accents dropped, '&' read as "and", apostrophes gone, anything else a space. */
const ACCENTED = 'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ'
const PLAIN = 'aaaaaaeeeeiiiiooooouuuuyyncaaaaaaeeeeiiiiooooouuuuync'
export function plainWords(text) {
  return [...String(text ?? '').toLowerCase()]
    .map((ch) => { const i = ACCENTED.indexOf(ch); return i >= 0 ? PLAIN[i] : ch })
    .join('')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const BRAND_SET = new Set(BRAND_NAMES.map((b) => b.replace(/ /g, '')))

/**
 * True when the text names none of the brands above. Every run of one to
 * four words is read run together ("mine craft" is "minecraft") and looked
 * up, so a brand is found however it is spaced, and only as whole words.
 */
export function brandsOk(text) {
  const words = plainWords(text).split(' ').filter(Boolean)
  for (let n = 1; n <= 4; n += 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      if (BRAND_SET.has(words.slice(i, i + n).join(''))) return false
    }
  }
  return true
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
