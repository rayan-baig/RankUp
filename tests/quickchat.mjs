/**
 * Guild quick chat: the message library, and that it is the only way to chat.
 *
 *   - at least 80 ready-made messages, in tabs, no id or words repeated,
 *     every one short and through the rude-word filter, nothing in them a
 *     contact detail could hide in;
 *   - the ids are exactly the ones the database accepts (quick_chat_ok in
 *     supabase/guilds.sql), and the rate limits are the database's;
 *   - a child's guild screen has no text box in its chat and never sends
 *     words: free text is refused by the database (post_guild_message).
 *
 * Reads files; needs nothing running.   node tests/quickchat.mjs
 */
import { readFileSync } from 'node:fs'
import {
  QUICK_CHAT, QUICK_CHAT_TABS, QUICK_EMOJI, QUICK_CHAT_IDS, QUICK_CHAT_MAX_LENGTH,
  QUICK_CHAT_PER_MINUTE, QUICK_CHAT_COOLDOWN_SECONDS, quickChatText,
} from '../src/data/quickChat.js'
import { wordsOk } from '../src/lib/kidWords.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}
const guildsSql = readFileSync('supabase/guilds.sql', 'utf8')
const fnBody = (name) => guildsSql.match(new RegExp(`function ${name}\\([\\s\\S]*?\\$\\$;`))?.[0] || ''

console.log('\n=== The library ===')
ok(`${QUICK_CHAT.length} messages (at least 80)`, QUICK_CHAT.length >= 80)
ok(`and ${QUICK_EMOJI.length} big emoji reactions`, QUICK_EMOJI.length >= 8)
const ids = QUICK_CHAT_IDS
ok('no id is used twice', new Set(ids).size === ids.length)
const texts = QUICK_CHAT.map((m) => m.text.toLowerCase())
ok('no message says the same thing twice', new Set(texts).size === texts.length,
  texts.filter((t, i) => texts.indexOf(t) !== i).join(', '))
const long = [...QUICK_CHAT, ...QUICK_EMOJI].filter((m) => [...m.text].length > QUICK_CHAT_MAX_LENGTH)
ok(`every message is short (${QUICK_CHAT_MAX_LENGTH} characters at most)`, long.length === 0, long.map((m) => m.text).join(', '))
const rude = QUICK_CHAT.filter((m) => !wordsOk(m.text))
ok('every message passes the rude-word filter', rude.length === 0, rude.map((m) => m.text).join(', '))
const contact = QUICK_CHAT.filter((m) => /\d{3,}|@|https?:|www\.|\.com|phone|address|school|where do you|snap|insta|whatsapp/i.test(m.text))
ok('none asks for or carries a contact detail, a place or an app', contact.length === 0, contact.map((m) => m.text).join(', '))
ok('every id is a short, stable, readable name', ids.every((id) => /^[a-z]+\.[a-z0-9]+$/.test(id) && id.length <= 24))
ok('every message is in a tab that exists', QUICK_CHAT.every((m) => QUICK_CHAT_TABS.some((t) => t.id === m.tab)))
const tabNames = QUICK_CHAT_TABS.map((t) => t.label)
ok('the tabs asked for', ['Cheers', 'Teamwork', 'Chore talk', 'Reactions', 'Thanks & sorry', 'Hello & bye', 'Goal moments'].every((n) => tabNames.includes(n)), tabNames.join(', '))
ok('and each has plenty in it', QUICK_CHAT_TABS.every((t) => QUICK_CHAT.filter((m) => m.tab === t.id).length >= 8))
ok('the examples asked for are there', ['Nice one!', "You're on fire! 🔥", 'Legend!', "Let's finish the goal!", "I'll take a chore!", 'Almost there!',
  'Done my room!', 'Doing dishes now', "Who's doing laundry?", 'Wow!', 'No way!', 'Haha!', 'Oops!', 'Morning, team!', 'Good night!',
  'See you tomorrow!', 'We hit the goal! 🎉', 'Guild record!'].every((t) => QUICK_CHAT.some((m) => m.text === t)))
ok('an id this phone does not know shows a plain bubble, never anything else', quickChatText('made.up') === '💬' && quickChatText(undefined) === '💬')

console.log('\n=== The database accepts exactly these ids ===')
const sqlIds = [...(fnBody('quick_chat_ok').match(/array\[([\s\S]*?)\]/)?.[1] || '').matchAll(/'([^']*)'/g)].map((m) => m[1])
ok(`quick_chat_ok holds ${sqlIds.length} ids`, sqlIds.length > 0)
ok('the same ids, in the same order', sqlIds.length === ids.length && sqlIds.every((id, i) => id === ids[i]),
  `only in the app: ${ids.filter((i) => !sqlIds.includes(i)).join(', ') || '-'}; only in SQL: ${sqlIds.filter((i) => !ids.includes(i)).join(', ') || '-'}`)
const post = fnBody('post_quick_chat')
ok('it refuses anything not on the list', /if not quick_chat_ok\(p_quick_id\) then\s+return jsonb_build_object\('ok', false, 'reason', 'unknown_message'\)/.test(post))
ok(`at most one every ${QUICK_CHAT_COOLDOWN_SECONDS} seconds, as the phone waits`, post.includes(`interval '${QUICK_CHAT_COOLDOWN_SECONDS} seconds'`))
ok(`and ${QUICK_CHAT_PER_MINUTE} a minute`, post.includes(`>= ${QUICK_CHAT_PER_MINUTE} then`) && post.includes("interval '1 minute'"))
ok('it stores the id and no words', /values \(p_message_id, p_guild_id, p_kid_id, '', p_quick_id\)/.test(post))
ok('typing a message is refused, whatever it says', /return jsonb_build_object\('ok', false, 'reason', 'quick_chat_only'\);\s*end \$\$;/.test(fnBody('post_guild_message')))
ok('children are shown quick messages only, never older typed ones', /gm\.quick_id is not null/.test(fnBody('guild_messages_for')))

console.log('\n=== A child\'s guild screen ===')
const screen = readFileSync('src/screens/kid/KidGuild.jsx', 'utf8')
const chatPart = screen.slice(screen.indexOf('<SectionTitle>Guild chat</SectionTitle>'), screen.indexOf('Leave guild'))
ok('the chat has the quick chat bar', chatPart.includes('<QuickChat'))
ok('and no text box, text area or editable area', !/<(TextInput|TextArea|input|textarea)\b|contentEditable/i.test(chatPart))
ok('a message is shown in the library\'s words, never as sent text', chatPart.includes('quickChatText(m.quick_id)') && !chatPart.includes('m.body'))
ok('Report and Mute are on every message from someone else', chatPart.includes('guilds.report(m.id') && chatPart.includes('Mute {m.author}'))
const lib = readFileSync('src/lib/guilds.js', 'utf8')
ok('the app has no way to send words to a guild', !lib.includes("'post_guild_message'") && lib.includes("'post_quick_chat'"))

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
