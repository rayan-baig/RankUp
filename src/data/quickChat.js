/**
 * Guild quick chat: the only way children talk to each other in a guild.
 *
 * A guild puts a child in touch with children in other families. Typing to
 * them is where the risk was: a phone number, an address, a "what school do
 * you go to?", an unkind sentence. So there is no typing at all. A child taps
 * one of the messages below, and what is sent and stored is its id, never
 * text. The server accepts only ids on this list (quick_chat_ok in
 * supabase/guilds.sql holds the same ids; tests/quickchat.mjs fails if the two
 * differ), and every phone shows the words from this file. Nothing a child
 * could type can reach another family through it, because nothing is typed.
 *
 * An id, once shipped, keeps its meaning for good: an older phone shows a
 * stored id with the words it knows, and a phone that does not know an id
 * shows a plain 💬 rather than anything else. Add new messages with new ids;
 * never reuse or repurpose one. Every entry is short (QUICK_CHAT_MAX_LENGTH)
 * and passes the rude-word filter, both checked by the test.
 *
 * Written for RankUp: cheering each other on through chores, not any game's
 * list.
 */

export const QUICK_CHAT_TABS = [
  { id: 'cheers', label: 'Cheers', icon: '🙌' },
  { id: 'team', label: 'Teamwork', icon: '🤝' },
  { id: 'chores', label: 'Chore talk', icon: '🧹' },
  { id: 'react', label: 'Reactions', icon: '😮' },
  { id: 'thanks', label: 'Thanks & sorry', icon: '💛' },
  { id: 'hello', label: 'Hello & bye', icon: '👋' },
  { id: 'goal', label: 'Goal moments', icon: '🏆' },
]

/** The longest any message may be, in characters. */
export const QUICK_CHAT_MAX_LENGTH = 32

/** At most this many quick messages a minute per child, and this many seconds apart (post_quick_chat). */
export const QUICK_CHAT_PER_MINUTE = 8
export const QUICK_CHAT_COOLDOWN_SECONDS = 3

const M = (id, tab, text) => ({ id, tab, text })

export const QUICK_CHAT = [
  // Cheers
  M('cheer.nice', 'cheers', 'Nice one!'),
  M('cheer.fire', 'cheers', "You're on fire! 🔥"),
  M('cheer.legend', 'cheers', 'Legend!'),
  M('cheer.great', 'cheers', 'Great job!'),
  M('cheer.star', 'cheers', 'Total superstar ⭐'),
  M('cheer.wow', 'cheers', 'What a hero!'),
  M('cheer.goingon', 'cheers', 'Keep it going!'),
  M('cheer.proud', 'cheers', 'So proud of the team!'),
  M('cheer.machine', 'cheers', 'Chore machine! 🤖'),
  M('cheer.unstop', 'cheers', 'Unstoppable!'),
  M('cheer.boss', 'cheers', 'Boss level! 👑'),
  M('cheer.speedy', 'cheers', 'That was speedy!'),
  M('cheer.sparkle', 'cheers', 'Sparkling work ✨'),
  M('cheer.streak', 'cheers', 'Great streak!'),
  M('cheer.levelup', 'cheers', 'Congrats on levelling up!'),
  M('cheer.mvp', 'cheers', 'Guild MVP!'),
  // Teamwork
  M('team.finish', 'team', "Let's finish the goal!"),
  M('team.take', 'team', "I'll take a chore!"),
  M('team.almost', 'team', 'Almost there!'),
  M('team.together', 'team', 'We can do this together!'),
  M('team.onit', 'team', "I'm on it!"),
  M('team.push', 'team', 'One more push!'),
  M('team.plan', 'team', 'Who is doing what today?'),
  M('team.help', 'team', 'Anyone need a hand?'),
  M('team.count', 'team', 'Every chore counts!'),
  M('team.ready', 'team', 'Ready when you are!'),
  M('team.pace', 'team', "We're ahead of last week!"),
  M('team.weekend', 'team', 'Big weekend push?'),
  M('team.beat', 'team', "Let's beat our record!"),
  M('team.two', 'team', "I'll do two today!"),
  M('team.quick', 'team', 'Quick chores first!'),
  // Chore talk
  M('chore.room', 'chores', 'Done my room!'),
  M('chore.dishes', 'chores', 'Doing dishes now'),
  M('chore.laundry', 'chores', "Who's doing laundry?"),
  M('chore.bins', 'chores', 'Took the bins out!'),
  M('chore.bed', 'chores', 'Made my bed ✅'),
  M('chore.pet', 'chores', 'Fed the pet!'),
  M('chore.homework', 'chores', 'Homework done 📚'),
  M('chore.table', 'chores', 'Set the table!'),
  M('chore.hoover', 'chores', 'Vacuuming now'),
  M('chore.plants', 'chores', 'Watered the plants 🌱'),
  M('chore.toys', 'chores', 'Tidied my toys!'),
  M('chore.shoes', 'chores', 'Shoes away!'),
  M('chore.sent', 'chores', 'Sent for checking!'),
  M('chore.accepted', 'chores', 'Got one accepted!'),
  M('chore.boss', 'chores', 'Did a Boss chore!'),
  M('chore.timer', 'chores', 'Beat the timer! ⏱️'),
  M('chore.next', 'chores', 'Starting my next one'),
  M('chore.hard', 'chores', 'That one was tough!'),
  // Reactions
  M('react.wow', 'react', 'Wow!'),
  M('react.noway', 'react', 'No way!'),
  M('react.haha', 'react', 'Haha!'),
  M('react.oops', 'react', 'Oops!'),
  M('react.yes', 'react', 'Yes!'),
  M('react.cool', 'react', 'Cool!'),
  M('react.omg', 'react', 'Whoa!'),
  M('react.yay', 'react', 'Yay! 🎈'),
  M('react.hmm', 'react', 'Hmm…'),
  M('react.ok', 'react', 'OK!'),
  M('react.sure', 'react', 'Sure thing!'),
  M('react.nope', 'react', 'Not yet!'),
  M('react.fun', 'react', 'That was fun!'),
  M('react.close', 'react', 'So close!'),
  M('react.lol', 'react', 'Too funny! 😂'),
  // Thanks / Sorry
  M('thanks.thanks', 'thanks', 'Thanks!'),
  M('thanks.lots', 'thanks', 'Thanks so much!'),
  M('thanks.help', 'thanks', 'Thanks for the help!'),
  M('thanks.team', 'thanks', 'Thanks, team! 💛'),
  M('thanks.welcome', 'thanks', "You're welcome!"),
  M('thanks.np', 'thanks', 'No problem!'),
  M('thanks.sorry', 'thanks', 'Sorry!'),
  M('thanks.myfault', 'thanks', 'My bad, sorry!'),
  M('thanks.later', 'thanks', "Sorry, I'll do it later"),
  M('thanks.busy', 'thanks', 'Busy today, sorry!'),
  M('thanks.allgood', 'thanks', 'All good!'),
  M('thanks.forgot', 'thanks', 'Oops, I forgot!'),
  // Hello / Bye
  M('hello.morning', 'hello', 'Morning, team!'),
  M('hello.hi', 'hello', 'Hi everyone! 👋'),
  M('hello.back', 'hello', "I'm back!"),
  M('hello.afternoon', 'hello', 'Good afternoon!'),
  M('hello.evening', 'hello', 'Good evening!'),
  M('hello.night', 'hello', 'Good night!'),
  M('hello.tomorrow', 'hello', 'See you tomorrow!'),
  M('hello.later', 'hello', 'See you later!'),
  M('hello.bye', 'hello', 'Bye for now!'),
  M('hello.dinner', 'hello', 'Off for dinner!'),
  M('hello.soon', 'hello', 'Back soon!'),
  M('hello.weekend', 'hello', 'Happy weekend!'),
  M('hello.sleep', 'hello', 'Sleep well! 😴'),
  // Goal moments
  M('goal.hit', 'goal', 'We hit the goal! 🎉'),
  M('goal.record', 'goal', 'Guild record!'),
  M('goal.half', 'goal', 'Halfway there!'),
  M('goal.close', 'goal', 'So close to the goal!'),
  M('goal.again', 'goal', "Let's do it again next week!"),
  M('goal.best', 'goal', 'Best week ever!'),
  M('goal.champs', 'goal', 'Champions! 🏆'),
  M('goal.started', 'goal', 'New week, new goal!'),
  M('goal.board', 'goal', "We're on the board!"),
  M('goal.climb', 'goal', 'We moved up!'),
  M('goal.top', 'goal', 'Top guild! 🥇'),
  M('goal.gg', 'goal', 'Good game, everyone!'),
]

/** The big reaction row: one tap, one emoji. Ids like any other message. */
export const QUICK_EMOJI = [
  { id: 'emoji.fire', text: '🔥' },
  { id: 'emoji.clap', text: '👏' },
  { id: 'emoji.party', text: '🎉' },
  { id: 'emoji.star', text: '⭐' },
  { id: 'emoji.heart', text: '💛' },
  { id: 'emoji.laugh', text: '😂' },
  { id: 'emoji.wow', text: '😮' },
  { id: 'emoji.muscle', text: '💪' },
  { id: 'emoji.trophy', text: '🏆' },
  { id: 'emoji.thumbs', text: '👍' },
  { id: 'emoji.rocket', text: '🚀' },
  { id: 'emoji.wave', text: '👋' },
]

const BY_ID = new Map([...QUICK_CHAT, ...QUICK_EMOJI].map((m) => [m.id, m]))

/** Every id the server accepts, in one list. */
export const QUICK_CHAT_IDS = [...BY_ID.keys()]

/** The words for an id, or a plain speech bubble for one this phone does not know. */
export function quickChatText(id) {
  return BY_ID.get(id)?.text || '💬'
}

/** Is this an emoji-only reaction (shown big)? */
export function isQuickEmoji(id) {
  return QUICK_EMOJI.some((m) => m.id === id)
}
