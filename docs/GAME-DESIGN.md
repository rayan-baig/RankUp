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
second photo, and have a parent approve both — collecting the XP twice for one
chore. `tests/integrity.mjs` checks this on every run.

### Streaks

A streak advances the first time a quest is **approved** on a given day. Approval, not
submission — otherwise a kid could keep a streak alive by submitting rubbish.

Missing a day resets it to 1. Each kid starts with one **streak freeze** token that
covers a single missed day.

---

## The 15 kid themes

Each theme controls exactly three things: the animated background, the currency name and
icon, and the avatar. Cards, buttons, spacing and font sizes are identical everywhere,
so the app feels like one product rather than fifteen.

Themes are picked at signup and locked. Changing one needs the parent PIN. That is a
deliberate anti-churn rule — the point is investment in a world, and a theme swapped
every day is not an investment.

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
| AI photo verification | ✓ | ✓ |
| All 15 kid + 10 parent themes | ✓ | ✓ |
| Guild size | 5 | **10** (Megacluster) |
| XP multiplier | ×1 | **×1.5** permanent |
| Ads | Present *(none built yet)* | **Removed** |
| Profile frames & drop selectors | — | **✓** |
| System Override Protocol | — | **✓** |
| AI Behaviour Blueprints | — | **✓** |
| Parent Alliance tournament | — | **✓** |

The Elite XP boost is applied last in the reward calculation, so an Elite kid genuinely
levels 1.5× faster than a Standard kid doing identical chores. That is the intended
effect, and it is worth being aware that it makes cross-family guild leaderboards
inherently unequal.

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

Real guilds between families are not built. → [STATUS.md](STATUS.md)
