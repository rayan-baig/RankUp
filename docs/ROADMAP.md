# What to build next

In order. Each step is finishable, and each one is worth demoing before starting the
next. Resist doing two at once — that is how a project stops having a working version.

---

### 1. Use it yourself for a week ← do this first

Before writing another line: assign real chores to a real kid on one device for seven
days. You will find out more in that week than in a month of building. Specifically, you
will find out whether the parent is willing to open the app to approve things, which is
the whole product's weakest assumption.

Cost: nothing. Value: highest of anything on this list.

### 2. Supabase project, auth, and ONE quest syncing between two devices

**Half of this exists already.** Device pairing is built and tested: a kid gets a
six-digit code, the parent types it in, the two are linked.
→ [SYNC.md](SYNC.md). What remains is making data actually travel across that link.

Not the whole app. One quest, one parent device, one kid device. → [BACKEND.md](BACKEND.md)

This is the step that turns a demo into a product, and it is the one most likely to
throw up surprises. Doing it on the smallest possible slice keeps those surprises cheap.

### 3. Move the rest of the data across

Rewrite `src/lib/storage.js` properly. Add a loading state on first open, and an error
state for "that save did not go through". The screens do not change.

### 4. Photos into Supabase Storage

Upload the JPEG, store the URL. Fixes the 5 MB browser quota and the silent dropping of
old photos.

Make the retention decision here rather than later: consider deleting photos as soon as
a parent has reviewed them. → [LEGAL.md](LEGAL.md)

### 5. Multiple kids on multiple devices

Once one kid syncs, several is mostly repetition — but test the case that actually
matters: two kids submitting at the same time while a parent approves.

### 6. Turn on the Claude photo check in production

Layer 2 is written and works. Deploy it with a key, watch the cost for a week, and read
the reports it produces against photos you know the truth about. → [AI-CHECK.md](AI-CHECK.md)

### 7. Real reminders

Push notifications need a server and, on iOS, the app installed to the home screen. This
is the point at which the "Reminders" mockup stops being a lie.

Worth doing before payments: a chore app nobody remembers to open is a chore app nobody
pays for.

### 8. Real guilds and friends

The hardest and riskiest. Needs shared tables, invitations across families, verified
consent on both sides, and moderation for chat. Consider shipping guilds *within* a
family first (siblings competing), which needs none of that and delivers most of the fun.

### 9. Payments

Stripe, Standard tier only, one plan. → [PAYMENTS.md](PAYMENTS.md)

### 10. The tournament discount

Last, and honestly optional. It needs the leaderboard, the billing system, and a monthly
job that applies coupons to ten separate subscriptions. It is the most complicated
feature in the product and the least essential.

---

## Things worth *not* building

- **A native app**, until the web version has families using it weekly. It costs an
  Apple Developer account, review cycles, and 15–30% of every subscription.
- **More themes.** There are 25. That is not the constraint.
- **Ads.** Advertising to under-13s is heavily restricted, the revenue at this scale is
  negligible, and the Elite tier already promises to remove them.
- **Anything that auto-approves a quest.** It is the one thing that would break the
  product's actual promise.
