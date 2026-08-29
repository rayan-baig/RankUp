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
| Kid-device pairing by 6-digit code | ✅ | Expiry, 5-attempt limit, one-time use — [docs/SYNC.md](SYNC.md). Between two phones it needs Supabase; without it, two tabs of one browser |
| Cross-device sync | ✅ *with a backend* | Quests, submissions, approvals and XP travel between paired devices. Offline-first with an outbox. Needs Supabase — [docs/SYNC.md](SYNC.md) |
| Real cross-family guilds | ✅ *with a backend* | Invite codes, real rosters, real chat. **A child joins only once a parent on each side approves.** Needs Supabase |
| Notifications | ✅ | Submissions, approvals, send-backs and daily reminders. Works with no server while the app is open; background delivery needs VAPID keys — [docs/NOTIFICATIONS.md](NOTIFICATIONS.md) |
| A kid's device has no Parent Mode | ✅ | Not behind a PIN — not present at all |

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

The two devices can now *find* each other — the six-digit pairing flow is built and
tested — but nothing flows across the link yet. Pairing establishes who belongs to whom;
sharing the actual quests and XP is the next job. → [docs/SYNC.md](SYNC.md)

Photos are also stored locally, downsized to about 40–80 KB each. Browsers cap
`localStorage` at roughly 5 MB, so after a few dozen photos the oldest ones are dropped
to make room. Photos belonging to a deleted kid or quest are purged automatically after
every save — deleting a child's profile really does remove their pictures from the
device.

If storage is full when a photo is taken, the submission still goes through and the
parent is told the photo was lost, rather than being shown "no photo required" as though
none was ever taken.

---

## Looks real, is not — ❌

| Thing | What is fake | What it would take |
|---|---|---|
| **Guild roster** | ✅ real now — see the working list below | — |
| **Guild chat** | ✅ real now, with a contact-detail guard and reporting | Human moderation at scale is still an open question |
| **Weekend Challenge** | The countdown is real; the event is not | Server-run events |
| **Parent Alliance leaderboard** | The nine other families are sample data, and no discount reaches any bill | Shared database **and** a billing system that can apply a discount |
| **Sync after pairing** | Pairing is real (below); sharing quests and XP across the link is not | See SYNC.md |
| **Reminders while the app is closed** | Reminders fire only while RankUp is open | A scheduled server job — [docs/NOTIFICATIONS.md](NOTIFICATIONS.md) |
| **Background push delivery** | Written and wired, but never actually delivered a message — no push service is reachable from the sandbox | Test on two real phones |
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
