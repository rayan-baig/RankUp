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
| Standard / Elite feature differences | ✅ | Both the features and the billing. The tier is written by Stripe's webhook and by nothing else |
| Elite 1.5× XP boost | ✅ | Applied in the reward calculation |
| Elite 10-slot guilds | ✅ | Real children in other families, once a parent on each side approves. Off unless `VITE_GUILDS_ENABLED=true` |
| System Override Protocol | ✅ | Currency Tax, Dimension Lockout and Red Security Lockdown all genuinely work |
| AI Behaviour Blueprints | ✅ | Charts are computed from this family's real activity log |
| Elite cosmetics (frames, drop selectors) | ✅ | |
| Kid-device pairing by 6-digit code | ✅ | Expiry, 5-attempt limit, one-time use — [docs/SYNC.md](SYNC.md). Between two phones it needs Supabase; without it, two tabs of one browser |
| Cross-device sync | ✅ *with a backend* | Quests, submissions, approvals and XP travel between paired devices. Offline-first with an outbox. Needs Supabase — [docs/SYNC.md](SYNC.md) |
| Real cross-family guilds | ✅ *built, off by default* | Invite codes, real rosters, real chat. **A child joins only once a parent on each side approves.** Needs Supabase |
| Parental consent | ✅ | Required before any child exists — enforced by the database, not the app. Export, deletion and withdrawal all work — [docs/LEGAL.md](LEGAL.md) |
| Subscriptions | ✅ *with Stripe connected* | Checkout, webhook, customer portal. Tier is server-owned and fails closed — [docs/PAYMENTS.md](PAYMENTS.md) |
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

Practically: **with no Supabase configured, a parent's phone and a kid's phone are two
separate, unconnected copies of the app.** For a single-device family demo this is fine.

With Supabase configured this no longer applies: pairing links the two devices and
quests, submissions, approvals and XP all travel across, offline-first, through an
outbox. → [docs/SYNC.md](SYNC.md)

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
| **Weekend Challenge** | ✅ gone — the fake event was removed; the kid's home screen now shows the real Sunday Market, and only while it is open | — |
| **Parent Alliance leaderboard** | ✅ real now — real families, real invite codes, scores counted server-side from approved submissions | — |
| **Sync after pairing** | ✅ real now — quests, submissions, approvals and XP all travel the link | — |
| **Reminders while the app is closed** | ✅ built — reminder times are saved to the account with the family's own time zone, and `api/send-reminders.js` delivers them. **You have to schedule it** — [docs/NOTIFICATIONS.md](NOTIFICATIONS.md) | — |
| **Background push delivery** | Written and wired, but never actually delivered a message — no push service is reachable from the sandbox | Test on two real phones |
| **Subscriptions** | ✅ built — off until you connect your own Stripe account | [docs/PAYMENTS.md](PAYMENTS.md) |
| **The 20% Discount Tournament** | ✅ built — `api/settle-alliances.js` decides each month's winner and applies a real Stripe coupon. **You have to schedule it**; nothing pays out until you do — [docs/PAYMENTS.md](PAYMENTS.md) | — |

One row is left, and it is the honest one: background push has been written,
wired and reviewed, but has never delivered a single message, because no push
service is reachable from the sandbox this was built in. It needs two real
phones. Everything else in this table is real.

---

## Knowing it is working, without watching it

| Thing | Where |
|---|---|
| A broken change cannot be pushed | `.github/workflows/ci.yml` — lint, build, SQL against a real Postgres, both browser suites |
| One screen crashing does not take the app down | `src/components/ScreenBoundary.jsx` |
| You hear about crashes on other people's phones | `supabase/crashes.sql` — route and message only, never a name or a photo |
| A scheduled job that stops being called | `/api/health` — silence is the failure mode for all three |
| One URL to point a monitor at | `GET /api/health` → `{"ok":true}`, or 503 |

What none of this does is fix a bug for you. It means you find out from a
dashboard rather than from a parent, and that one broken screen is not a broken
app.

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
