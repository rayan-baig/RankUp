# Game design reference

The numbers and rules behind the loop, in one place, so they can be tuned deliberately
rather than by accident.

---

## XP and levels

`src/lib/xp.js`

```
XP to go from level N to N+1  =  min(400, 80 + 12 × (N − 1))
```

Gentle at the start (level 2 costs 80 XP — reachable on day one) and flat at 400 from
level 27 onwards. Levels 1→51 total about 18,700 XP; a kid doing ~150 XP a day reaches
the first Block Craft evolution in around four months. That is intentional: an evolution
that arrives in a week is not a secret worth chasing.

To see a high-level theme without waiting, use the level slider in the theme picker. It
previews any level up to 320.

### Difficulty tiers

| Tier | Base XP |
|---|---|
| Easy | 15 |
| Medium | 30 |
| Hard | 55 |
| Boss | 100 |

A parent can override the XP on any individual quest.

### Bonuses, applied in this order

1. **Surprise 2× XP** — doubles the base. Randomly flagged on ~1 in 6 quests when adding
   a pack, or set by hand.
2. **Beat the clock** — +25% if a timed quest was finished inside its target.
3. **Streak** — +5% per 3 consecutive days, capped at +25%. Starts at a 3-day streak.
4. **Elite Pass** — ×1.5 on the total, last, so it multiplies everything above.
5. **Test score** — a separate bonus on top: 80%+ → +30%, 90%+ → +60%, 95%+ → +100% of
   base XP.

### Currency

```
coins = max(1, round(final XP ÷ 5))
```

Same formula for all 15 themes; only the name and icon change. That keeps a reward
priced at "50" meaning the same amount of work no matter which world a kid picked — which
matters when siblings compare.

### One payout per quest

A quest can only ever award XP once. There is a guard when a submission is
created (a quest with a pending submission refuses a second one) and another
when one is approved (a quest already marked approved refuses to pay out again),
and the kid's screen replaces the submit controls with a "sent to your parent"
message once work is in.

All three are needed. Without them a kid could reopen a submitted quest, send a
second time, and have a parent accept both — collecting the XP twice for one
chore. `tests/integrity.mjs` checks this on every run.

### Streaks

A streak advances the first time a quest is **approved** on a given day. Approval, not
submission — otherwise a kid could keep a streak alive by submitting rubbish.

Missing a day resets it to 1. Each kid starts with one **streak freeze** token that
covers a single missed day: the first approval after exactly one missed day spends
it automatically and the run carries on. Days are the family's days (the approving
phone's time zone), so a child abroad, or a clock change, does not break a streak.

Weekly chores come back seven days after they were done, or on the day the parent
picks in Settings → Parent account.

---

## The 15 kid themes

Each theme controls exactly three things: the animated background, the currency name and
icon, and the avatar. Cards, buttons, spacing and font sizes are identical everywhere,
so the app feels like one product rather than fifteen.

Themes are picked at signup and locked. Changing one needs the parent PIN. That is a
deliberate anti-churn rule — the point is investment in a world, and a theme swapped
every day is not an investment.

### Theme Genesis: themes children make

A child can make up to five themes of their own (Spark, Design, Build,
Launch). Each is a look and some names over one of six five-form built-in
themes: the same forms at 1/10/25/50/100 and worlds at 10/25/50/100, so XP,
coins, rewards and unlocks are exactly the same. The currency formula above
does not change; only its name and icon do. Wearing one is a theme change
like any other, so the PIN lock applies.

Spark can start from an idea ("What's it inspired by?"): a few words become a
whole starting theme from a library of kid-friendly topics on the phone, with
brand and game names only as aliases for a generic topic, so the theme never
carries one. No AI and no network.

A parent can send a finished theme to RankUp; picked themes become a Season's
official themes for every family, on the same structure. A Season theme
cannot use another company's game, league or brand name.

### Block Craft evolutions

The only theme with level gates. Each rewrites the palette and the background scene from
that level up:

| Level | Becomes | Extra |
|---|---|---|
| 51 | Volcanic Crimson | Reveals the **Boarling** companion, which then stays for good |
| 101 | Pale Cream (`#E5E3A7`) with purple shadows | |
| 200 | Nether | Glitch transition on entry |
| 300 | End Void | Glitch transition on entry |

### The 5-tier avatar

Forms unlock at levels 1, 10, 25, 50 and 100. Each tier adds a ring, shifts the palette
along the theme's five hues, and from tier 4 adds orbiting particles. Tapping the avatar
makes it react — a squash, a blink and a sparkle burst. Kids poke things; the app should
poke back.

---

## The 10 parent themes

Cosmetic only, and that is the promise made in the pricing. They change the dashboard's
colours and its background pattern. Nothing else.

The one exception is the Behaviour Blueprint charts, which keep fixed neutral colours
regardless of theme — a chart has to stay readable and colour-blind safe in all ten.

---

## Tiers

| | Standard | Elite Pass |
|---|---|---|
| Price | $9.99/mo | $15.99/mo |
| Quests and kid profiles | Unlimited | Unlimited |
| All 15 kid + 10 parent themes | ✓ | ✓ |
| Guild size | 5 | **10** (Megacluster) |
| XP multiplier | ×1 | **×1.5** permanent |
| Profile frames & drop selectors | — | **✓** |
| System Override Protocol | — | **✓** |
| Behaviour Blueprints | — | **✓** |
| Parent Alliance tournament | — | **✓** |

The Elite XP boost is applied last in the reward calculation, so an Elite kid genuinely
levels 1.5× faster than a Standard kid doing identical chores. That is the intended
effect, and it is worth being aware that it makes cross-family guild leaderboards
inherently unequal.

So no leaderboard counts it. `award_for_submission` works out what a chore is
worth before the boost as well as after, `approve_submission` stores it with the
chore (`submissions.base_xp`), and every board, the guild roster's weekly XP and
the guild goal on the public guild board rank on that. A child keeps their
boosted XP and level everywhere else; the boost buys levels at home, never a
place on a board. See [Leaderboards](#leaderboards).

---

## The System Override Protocol

Three escalating tiers, all Elite:

| Tier | Effect | Ends |
|---|---|---|
| **Currency Tax** | Deducts a % of the kid's currency. App stays usable. | Instantly — it is a one-off deduction |
| **Dimension Lockout** | Kid cannot open the app | Automatically, after the set duration |
| **Red Security Lockdown** | Kid cannot open the app | Only when the parent manually lifts it |

Two rules built into the design:

- **A written reason is required.** The trigger button stays disabled without one, and
  the reason is shown to the kid on the lockout screen. A consequence a child cannot see
  the reason for teaches nothing.
- **XP, levels and streaks are never touched.** Currency can be taxed and access can be
  removed, but progress a kid earned stays earned. Taking away earned progress teaches
  that effort is not safe.

---

## Guilds

5 members on Standard, 10 on Elite. The goal bar counts only real family members —
letting sample guild-mates fill it would make a fake number look like progress.
Guilds between families are built and switched off by default
(`VITE_GUILDS_ENABLED`). → [STATUS.md](STATUS.md)

### Quick chat

Guild chat is tap-to-send, like the ready-made buttons in team games, and that
is the only way to chat in a guild: there is no text box. 101 messages in seven
tabs (Cheers, Teamwork, Chore talk, Reactions, Thanks & sorry, Hello & bye, Goal
moments), a row of big emoji, and a "Yours" row of the last few sent and any the
child starred (on their phone only). `src/data/quickChat.js` is the library.

- What is sent and stored is the message's **id**; every phone shows the words
  from its own copy of the library. The server accepts only ids on its list
  (`quick_chat_ok` in `supabase/guilds.sql`, the same list). An id never changes
  meaning; new messages get new ids, and a phone that does not know an id shows
  a plain 💬.
- At most one message every 3 seconds and 8 a minute per child, counted by the
  server; the phone waits 3 seconds after each tap.
- Report hides a message at once and shows it to the parents on both sides; a
  child can mute a guild-mate on their own phone.
- Messages typed before 0.13.0 are not shown to children (nobody can check
  them again); parents still see any that were reported.

## Leaderboards

`src/data/leaderboards.js`, `supabase/leaderboards.sql`.

| Board | Periods | Counts |
|---|---|---|
| Chores done | week, month, all time | Accepted chores, at most 8 a UTC day (the School League's cap) |
| XP earned | week, month, all time | XP before the Elite boost, at most 200 a chore, from those same chores |
| Highest level | all time | The level that XP reaches. Ranked by the XP; the phone works out the level by the app's one curve, so there is no second curve in the database |
| Longest streak | all time | `kids.streak_best`, kept by the server beside the streak |
| Current streak | right now | The streak, if still alive on the family's day |
| Badges earned | all time | The badge shelf's rules, counted from the server's rows |
| Arcade high scores | week, month, all time, per game | The arcade's clamped best score (0-100) |
| Season themes | all time | Themes picked for a Season |
| Rising stars | week | This week's board XP less last week's |
| Top guilds | week | Members' average board XP, so size alone does not win |

Scopes: worldwide, my country, my guild, my family (guilds: worldwide and
country). Weeks start Monday 00:00 UTC, months on the 1st, so one race is the
same race everywhere, and the board says "Resets Monday". A board is empty
again at the boundary itself, not at the next refresh.

**Adventure and Arena.** Every child starts in Adventure: the family and guild
boards only, among people the family already approved, and on no public board.
A parent switches a child into Arena; then they are on the worldwide and
country boards as a nickname (two words from lists of 80 and two digits, picked
or shuffled, never typed, changed at most once a week), a flag and numbers.
Either a parent or the child goes back to Adventure, at once.

**Fair.** A parent tapping Accept 200 times counts 8 chores. A chore set to
9,999 XP counts 200. Elite counts as Standard. Guilds race on their average.

**Cheap.** The scheduled job ranks everybody every ten minutes and stores the
whole ranking; opening a board reads its top 50 and the child's own row by
index. The family and guild boards rank a handful of stored numbers. 4,000
children rank in about a second ([LOAD-TEST.md](LOAD-TEST.md)).


## The arcade

Three minigames — Quick Tap, Stacker, Memory Match — reached from the kid's
Arcade tab.

**A play token is minted only when a parent approves a chore**, capped at five
so they cannot be hoarded. That single rule is what keeps the arcade from
competing with the thing the app exists to encourage: you cannot play without
first having done something.

Payouts are deliberately small. Every game reports one 0-100 score, five
currency is the most any single game can pay, and the whole arcade tops out at
fifteen a day — less than one medium chore. `play_minigame()` in
`supabase/sync.sql` is the authority: it clamps the score, spends the token,
applies the daily cap and records the best score, so a tampered phone claiming
a billion points earns exactly the same five as a good round.

The payout rule is written twice — `coinsForScore()` in `src/data/minigames.js`
for the offline case, and again in SQL. `supabase/test/09-minigames.sql` checks
the two agree.
