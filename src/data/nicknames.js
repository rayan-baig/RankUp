/**
 * Leaderboard nicknames, built from word pieces.
 *
 * A child on a public leaderboard (Arena mode) is shown to strangers, so they
 * are never shown by their name. They get a nickname made of three pieces
 * picked from the lists below: a first word, a second word and a two-digit
 * number, "Swift" + "Comet" + 42 → "SwiftComet42". Nothing is typed: a child
 * picks each piece or shuffles, so no name, school, town or anything else a
 * child might type can reach a stranger through it.
 *
 * The same lists are in the database (leaderboard_first_words and
 * leaderboard_second_words in supabase/leaderboards.sql), which accepts a
 * nickname only when every piece is on them. tests/leaderboardwords.mjs fails
 * if the two copies differ, if any word is repeated, and if any first word,
 * second word and number together (all of them, every one of the hundred
 * numbers) trips the rude-word filter in src/lib/kidWords.js.
 *
 * A nickname can be changed once a week (NICKNAME_CHANGE_DAYS, checked by the
 * server), so the boards stay readable.
 */

export const FIRST_WORDS = [
  'Swift', 'Brave', 'Cosmic', 'Lucky', 'Mighty', 'Sunny', 'Clever', 'Bright', 'Bouncy', 'Breezy',
  'Bold', 'Calm', 'Cheery', 'Daring', 'Dizzy', 'Eager', 'Epic', 'Fearless', 'Fizzy', 'Frosty',
  'Gentle', 'Giant', 'Golden', 'Happy', 'Jolly', 'Jumpy', 'Keen', 'Kind', 'Lively', 'Loyal',
  'Magic', 'Merry', 'Mega', 'Misty', 'Nifty', 'Noble', 'Peppy', 'Plucky', 'Polar', 'Quick',
  'Quiet', 'Rapid', 'Royal', 'Shiny', 'Silver', 'Snappy', 'Snowy', 'Sparky', 'Speedy', 'Starry',
  'Steady', 'Stormy', 'Super', 'Turbo', 'Ultra', 'Witty', 'Zany', 'Zesty', 'Zippy', 'Wise',
  'Neon', 'Lunar', 'Solar', 'Crystal', 'Atomic', 'Blazing', 'Chill', 'Dazzling', 'Electric', 'Flying',
  'Glowing', 'Hidden', 'Icy', 'Jazzy', 'Laser', 'Mystic', 'Ocean', 'Pixel', 'Radiant', 'Thunder',
]

export const SECOND_WORDS = [
  'Comet', 'Otter', 'Falcon', 'Rocket', 'Panda', 'Tiger', 'Dragon', 'Phoenix', 'Badger', 'Beaver',
  'Bison', 'Cheetah', 'Dolphin', 'Eagle', 'Fox', 'Gecko', 'Hawk', 'Koala', 'Lemur', 'Lion',
  'Llama', 'Lynx', 'Meteor', 'Narwhal', 'Ocelot', 'Owl', 'Parrot', 'Penguin', 'Puffin', 'Quokka',
  'Rabbit', 'Raven', 'Robin', 'Rover', 'Seal', 'Shark', 'Sloth', 'Sparrow', 'Squid', 'Star',
  'Storm', 'Swan', 'Turtle', 'Walrus', 'Whale', 'Wizard', 'Wolf', 'Yak', 'Zebra', 'Galaxy',
  'Planet', 'Nova', 'Glacier', 'Volcano', 'Breeze', 'Pebble', 'Maple', 'Acorn', 'Cactus', 'Rhino',
  'Moose', 'Pilot', 'Ranger', 'Knight', 'Ninja', 'Robot', 'Panther', 'Orbit', 'Jaguar', 'Hedgehog',
  'Kiwi', 'Mango', 'Muffin', 'Pancake', 'Pretzel', 'Waffle', 'Yeti', 'Unicorn', 'Griffin', 'Kraken',
]

/** How often a child may change their nickname, in days (set_leaderboard_nickname). */
export const NICKNAME_CHANGE_DAYS = 7

/** The nickname three pieces make. */
export function nicknameFrom(first, second, number) {
  const n = Math.max(0, Math.min(99, Math.floor(Number(number) || 0)))
  return `${first}${second}${String(n).padStart(2, '0')}`
}

/** The pieces of a nickname, or null when it is not built from the lists. */
export function nicknamePieces(name) {
  const m = /^([A-Z][a-z]+)([A-Z][a-z]+)([0-9]{2})$/.exec(String(name || ''))
  if (!m || !FIRST_WORDS.includes(m[1]) || !SECOND_WORDS.includes(m[2])) return null
  return { first: m[1], second: m[2], number: Number(m[3]) }
}

/** Three random pieces. `random` is there for tests. */
export function shuffleNickname(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length) % list.length]
  return { first: pick(FIRST_WORDS), second: pick(SECOND_WORDS), number: Math.floor(random() * 100) % 100 }
}
