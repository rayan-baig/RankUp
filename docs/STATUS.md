# What is real and what is a mockup

Keep this file honest. A mockup that looks finished is worse than one that says what it
is, because it turns into a promise you did not mean to make.

Legend: ✅ genuinely works · 🟡 works but only on this device · ❌ looks real, is not

---

## The core loop — ✅ real

| Thing | Status | Notes |
|---|---|---|
| Parent assigns a quest | ✅ | Custom quests and four bulk packs |
| Adaptive / special tasks | ✅ | Own difficulty and own definition of "done", per kid |
| Kid opens quest, sees rewards breakdown | ✅ | Every bonus is itemised before they start |
| In-app camera | ✅ | Real `getUserMedia`. **Needs https** — see the caveat below |
| On-device photo checks | ✅ | Blur, darkness, flatness, screen-edge and duplicate detection, all in the browser |
| Claude vision photo check | ✅ *if configured* | Off unless you deploy `api/verify-photo.js` with an API key — [docs/AI-CHECK.md](AI-CHECK.md) |
| Parent approve / send back | ✅ | Sending back puts the quest straight back on the kid's list with your note |
| XP, levels, currency | ✅ | Awarded only on approval |
| Streaks and streak freeze | ✅ | |
| 15 kid themes | ✅ | Background, currency and avatar all change |
| 5-tier avatar that evolves | ✅ | Tap it — it reacts |
| Block Craft level evolutions | ✅ | 51 Volcanic + Boarling companion, 101 Pale Cream, 200 Nether, 300 End Void |
| 10 parent dashboard themes | ✅ | Cosmetic only, by design |
| Timer / "race the clock" quests | ✅ | Best times are recorded per quest |
| Test-score quests | ✅ | 80%+ earns a bonus |
| Surprise 2× XP quests | ✅ | Randomly flagged when adding a pack, or set by hand |
| Rewards catalogue and redemption | ✅ | Parent marks a reward as given |
| Family goal | ✅ | Combined XP toward one shared reward |
| Daily login bonus | ✅ | |
| Standard / Elite feature differences | ✅ | The *features* differ correctly. The *billing* does not exist |
| Elite 1.5× XP boost | ✅ | Applied in the reward calculation |
| Elite 10-slot guilds | ✅ | The slot count is real; the people in them are not |
| System Override Protocol | ✅ | Currency Tax, Dimension Lockout and Red Security Lockdown all genuinely work |
| AI Behaviour Blueprints | ✅ | Charts are computed from this family's real activity log |
| Elite cosmetics (frames, drop selectors) | ✅ | |

### The camera caveat

Browsers block camera access on plain `http://`. That means:

- ✅ works on `localhost` while you develop
- ✅ works on a deployed `https://` site
- ❌ does **not** work if you open the app on your phone via a `http://192.168.x.x` address

If the camera cannot start, the app offers the phone's own camera app as a fallback and
tags that photo as "not taken in the app" so the check can tell the parent.

---

## Stored on one device only — 🟡

Everything is saved in this browser's `localStorage`. It survives a refresh and a
restart. It does **not** survive clearing browser data, and it is completely invisible
to any other device or browser.

Practically: **a parent's phone and a kid's phone are two separate, unconnected copies
of the app.** For a single-device family demo this is fine. For real use it is the one
thing that has to change first. → [docs/BACKEND.md](BACKEND.md)

Photos are also stored locally, downsized to about 40–80 KB each. Browsers cap
`localStorage` at roughly 5 MB, so after a few dozen photos the oldest ones are dropped
to make room.

---

## Looks real, is not — ❌

| Thing | What is fake | What it would take |
|---|---|---|
| **Guild roster** | Everyone outside your family is sample data. Invites are saved locally and sent nowhere. | Shared database + accounts + parental consent for kid-to-kid contact |
| **Guild chat** | Messages stay in this browser | Same, plus moderation — kid-to-kid chat is a serious safety surface |
| **Weekend Challenge** | The countdown is real; the event is not | Server-run events |
| **Parent Alliance leaderboard** | The nine other families are sample data, and no discount reaches any bill | Shared database **and** a billing system that can apply a discount |
| **Family sync device list** | There is no sync | See BACKEND.md |
| **Reminders** | The toggles save, nothing is ever scheduled | Push notifications: a server, plus home-screen install on iOS |
| **Subscriptions** | Switching plans flips feature flags. No card, no charge, no receipt | Stripe, or Apple/Google in-app purchase — [docs/PAYMENTS.md](PAYMENTS.md) |
| **Accounts** | The parent PIN keeps a kid out of Parent Mode on this device. It is not a login. | Real auth — [docs/BACKEND.md](BACKEND.md) |

Every one of these is labelled in the interface itself with a dashed **SAMPLE** tag or a
warning banner. If you build a new mockup, label it the same way.

---

## Deliberate product rules — not gaps

These look like missing features. They are choices.

- **The AI never approves or rejects.** It produces a score and a list of flags for the
  parent to read. A false accusation from an automated checker does far more damage in a
  family app than a missed cheat. There is no "auto-approve anything clean" button and
  there should not be one.
- **Adaptive quests are scored leniently.** They are written around one child's limits,
  so a fixed "does the photo show a perfectly made bed" test does not apply. The photo
  check knows a quest is adaptive and softens accordingly.
- **Overrides never remove XP, levels or streaks.** A parent can tax currency and lock
  the app, but progress a kid earned stays earned.
- **Parent themes change nothing but colours.** That is the promise made in the pricing.
