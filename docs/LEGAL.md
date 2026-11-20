# Legal: read before real users or real money

**This is not legal advice.** It is a list of the things that apply to a kids' app so
you know what to ask a lawyer about. Get one paid consultation with a solicitor or
attorney who knows children's apps before you collect one real child's data or take one
real payment. That does not need to happen before you build — it must happen before you
launch.

Right now the app collects nothing: everything is in one browser, nothing is transmitted. That is why development is safe
today and launch is not.

---

## COPPA (United States)

The Children's Online Privacy Protection Act applies to any online service directed at
children under 13 that collects personal information. RankUp is squarely directed at
children.

"Personal information" includes more than you would expect: a name, an account
identifier, a persistent device ID, and **photographs of a child or their home**.
RankUp collects no photographs at all: a child who wants to show a parent a finished
chore sends a picture from their own camera app, by message, outside RankUp. That
removes the most sensitive kind of children's data from the app entirely.

What COPPA requires, roughly:

- **Verifiable parental consent** *before* collecting anything. A checkbox saying "I am
  a parent" is explicitly not enough. Accepted methods include a small credit-card
  charge, a signed form, or a video call. This is the single biggest piece of work.
- **A privacy policy** that says exactly what you collect, why, how long you keep it,
  and who you share it with.
- **Parental access and deletion** — a parent must be able to see their child's data and
  demand its deletion.
- **Data minimisation** — you may not collect more than the service actually needs, and
  may not condition participation on giving more.
- **No behavioural advertising to under-13s.**

Penalties are per-child and large. This is not a "fix it later" area.

### What this specifically means for RankUp's features

| Feature | The question to ask |
|---|---|
| Photos | None. RankUp never takes, sends or keeps a photo. Say so in the privacy policy. |
| Guild chat | Kid-to-kid messaging needs consent on **both** sides, plus moderation, reporting and blocking. Since 0.13.0 it is ready-made messages only: a child taps one of a fixed list and nobody can type, which removes the free-text risk (contact details, grooming, bullying in a child's own words). Guilds still ship switched off. |
| Leaderboards | Every child is in **Adventure** (on no public board) until a parent switches on **Arena** for them. In Arena, children in other families see a nickname built from word lists, a country flag the parent picked, and leaderboard numbers. That is a disclosure to strangers of a pseudonym and activity data. |
| Guild rosters | A child's display name visible to children in other families is a disclosure. |
| Accessibility notes | Notes a parent writes about a child's disability are **health-adjacent data** and are among the most sensitive fields in the app. They should never leave the parent's own account. |
| Parent Alliance | Adults competing on a leaderboard using data derived from their children's behaviour. Think carefully about what is displayed. |

---

## Apple App Store — Kids Category

Only relevant if you ship a native iOS app. Additional rules on top of COPPA:

- No third-party analytics or advertising without explicit permission.
- No links out of the app, no purchases, and no other distractions without passing a
  parental gate.
- Must have a privacy policy.
- Review for Kids Category apps is stricter and slower.

## Google Play — Families Policy

Similar: a compliant ads SDK if you show ads at all, a privacy policy, an accurate
target-age declaration, and no collection of Android advertising IDs from children.

---

## UK and EU

- **UK Age Appropriate Design Code** ("Children's Code") — 15 standards, including
  high-privacy defaults, data minimisation, and no nudge techniques that push children
  into weaker privacy settings. Note that "streaks" and "daily login bonuses" are
  exactly the kind of engagement mechanic the Code asks you to justify.
- **GDPR** — a lawful basis for processing, and in most member states parental consent
  for children under 16 (13–16 depending on the country).

---

## Practical order of operations

1. **Now (development):** collect nothing real. Use invented names. Do not put a real
   child's details into a deployed build.
2. **Before a pilot with real families:** privacy policy, terms, a working delete-my-data
   route, and written parental consent — even if it is a paper form for five families
   you know personally.
3. **Before public launch:** the paid legal consultation, a real verifiable-consent
   mechanism, a data-retention policy that actually deletes things, and a security review.
4. **Before charging money:** everything in [PAYMENTS.md](PAYMENTS.md), plus confirming
   the purchaser is the parent.

---

## One product decision already made

RankUp keeps no photos. You cannot leak what you do not store. A parent who wants proof
gets a picture from the child's own camera app, by message, and taps Accept in RankUp.

---

## Consent notice versions

The words a parent signs are kept in the database by version
(`consent_notices` in `supabase/consent.sql`) and match `CONSENT_NOTICE` in
`src/data/legalText.js`; `tests/consent.mjs` fails if they differ. A
published version is never edited (the database refuses), because it is the
record of what the parents who signed it agreed to. A change is a new
version, and the newest is the only one a new parent can sign.

- **2026-01**, the first, still describes photographs taken in the app and an
  AI photo check. RankUp has neither now. It stays as it was.
- **2026-11** is the same notice without them.
- **2026-12** (0.22.0) is 2026-11 without the guild section ("exchange short
  messages", "guild chat"), because guilds are switched off: the notice
  describes only what is on, and says "Guilds are switched off. If we ever
  switch them on, we will ask you first." It is what new parents sign.
  **Switching guilds on (`VITE_GUILDS_ENABLED`) needs a new version that
  describes them, and every existing parent asked again first**: that is
  collecting more, and the screen that asks is not built yet.

A new version does not undo the consents already given: a version that only
collects **less** (as 2026-11 and 2026-12 do) needs nobody to consent again, so families
who signed 2026-01 carry on. A version that collects **more** would need every
existing parent asked again before the new collection starts. That is not
built: it needs `has_valid_consent` to require the new version and a screen
that asks existing parents. Ask the lawyer whether any change you plan is of
that kind.

---

## Leaderboards (Adventure and Arena): what was decided, and what to ask

**No new consent version.** The leaderboards came in 0.13.0 under consent
notice 2026-11, unchanged, following the precedent of the School League and of
sending a theme for a Season: what is shown to people outside the family is
off by default, and turned on by a separate, explicit choice a parent makes for
one child, on a screen that says exactly what will be shown (Parent Mode →
Settings → Leaderboards). Every existing and new child starts in Adventure, so
nothing about any child became visible to anyone new by the update itself.
Guild chat became ready-made messages only at the same time; that collects
less. (Since 0.22.0 the notice, version 2026-12, has no guild section at all,
because guilds are switched off; see "Consent notice versions".)

What Arena shows strangers, and nothing else: a nickname made of two words from
fixed lists and two digits (never typed; changed at most weekly; the lists are
checked against the rude-word filter, all 640,000 combinations), a flag from a
list the parent picks (RankUp asks for no location), and numbers worked out by
the server. A parent or the child can switch back to Adventure at any time, and
that removes them from every public board in the same request. Deleting a child
or the account, or withdrawing consent, removes them from every board at once.
"Download my data" includes each child's mode, nickname and the country. The
privacy policy and terms say all of this (`src/data/legalText.js`).

Ask specifically:

- Is a parent's Arena switch enough consent for a child's pseudonym and
  activity numbers on a public leaderboard under COPPA and the UK Children's
  Code, or should the consent notice be reissued to describe it? A new version
  is shown only to new parents; asking every existing parent again needs
  building (see "Consent notice versions" above).
- The Children's Code asks for high-privacy defaults and no nudges towards
  weaker settings. Adventure is the default and the child is never prompted to
  ask for Arena beyond one line on the leaderboard screen; confirm that is
  enough.
- Is a two-digit-number nickname plus a country "personal information" where
  you launch (it is not linkable to the child by anything RankUp shows)?

## The School League: questions to add for the lawyer

The School League shows a school some information about children whose parents
chose to join it. The in-app privacy policy and terms describe it (see
`src/data/legalText.js`). Ask specifically:

- **Disclosure to a third party.** A school sees its monthly top ten, with a
  child's first name only where the parent switched that on. Is the parent's
  explicit choice on the School League screen enough consent for that under
  COPPA, or should the main consent notice (`CONSENT_VERSION`) be reissued to
  cover it? A new version on its own is only shown to new parents (see
  below); asking every existing parent again needs building.
- **FERPA and state student-privacy laws.** RankUp is not given records by the
  school; parents bring the data. Confirm that this keeps RankUp outside FERPA,
  and check states with their own student-data laws (for example California's
  SOPIPA), since schools may ask you to sign a data agreement anyway.
- **School contracts.** Many districts require a data processing agreement
  before staff can use a service. Have a standard one ready.
- **Who may sign a school up.** The terms say the person must work there and be
  allowed to. You check each school by hand before it joins a league; decide
  what evidence you accept.

## School districts: questions to add for the lawyer

A district buys the School League for its schools (docs/PAYMENTS.md, "School
districts"). It sees totals for each school and for the district (students
taking part, chores done, how many did one), never a child's name or one
child's numbers, nothing typed, and no numbers at all for a school with fewer
than 5 students taking part; its totals add up only the schools shown, so a
small school cannot be worked out by subtraction. No new data about children
is collected, and nothing a child types reaches a district. The privacy policy
says what a district sees and how long its account is kept (a year after its
plan ends); a quote request is emailed and not stored. The consent notice is
unchanged: a district sees less than a school. Ask:

- **Aggregate data.** Is a school's monthly total, shown to its district only
  from 5 students up, enough to keep it outside "personal information" under
  COPPA and the state student-privacy laws? Would they set the floor higher?
- **District contracts.** Districts usually sign a data processing agreement
  and often a state's standard student-data agreement before paying an
  invoice. Have one ready that matches what a district actually sees.
- **Who may sign a district up.** The terms say whoever signs a school up must
  work there; decide what you accept for a district office, and whether a
  district should be checked by hand like a school before its schools are.
- **Invoices and purchase orders.** Whether the terms need anything for a
  district paying by invoice (net 30), and for what happens to its schools
  when it does not pay (they fall back to their own plan or the free level,
  and nothing is deleted).

## School pilots, the pilot report and houses: questions for the lawyer

A school can get a free pilot instead of the trial, with a code we send
(docs/PAYMENTS.md, "School pilots"). Its admin can print a one-page report of
totals for whoever decides: students taking part, the share who did a chore,
chores done, the average, the busiest week and the kinds of chore, for the
school and for each house or class. A school can name houses or classes; a
parent chooses which one their child is in. No numbers are shown for a group
of fewer than 5 students or from fewer than 3 families, no chore totals (nor
an average, a busiest week or a kind of chore) unless at least 3 of them did
a chore, and none when what is left over would break the same rule (so no
group can be worked out by subtraction, and a parent cannot take their own
children's numbers away to find another child's). The same rule is the
school card's average, its league and its district's picture. Never a name, nothing
typed, and there is no "what families said": families are asked for no
rating. "Request a pilot" is emailed and not stored. The privacy policy now
says a parent chooses the house and the school sees totals only; the terms
say what a pilot is and that a school can pay by invoice. The consent notice
is unchanged: a school sees totals, as before. Ask:

- **The report leaving the school.** It is made to be handed to a governing
  board or a bursar. Is a printed page of totals, from 5 students up, still
  outside "personal information"? Would they want a note on it saying so?
- **Houses.** Which house a child is in is a new fact about the child, chosen
  by the parent and never shown to the school. Is the privacy policy's one
  sentence enough, or does it belong in the consent notice too?
- **A pilot's end.** Nothing is charged when a pilot ends; check the terms'
  sentence is enough for a school's purchasing rules.

## Gifts: what is collected from people who are not families

"A year of RankUp" can be bought by somebody with no account, for another
family (docs/PAYMENTS.md, "Gift subscriptions"). It collects personal data
from two adults who never agreed to the family terms:

- **The buyer:** their email, for the receipt and for help with the gift,
  kept until the code runs out (two years); their name if they give one, and
  their message, kept with the recipient's details below. Stripe holds the
  payment as for any other.
- **The recipient:** the name and email the buyer typed, used only to send
  the gift and deleted 30 days after purchase. The form asks for a grown-up's
  name or the family's, never a child's; nothing about a child is collected.

The privacy policy says both in one sentence (`src/data/legalText.js`, "How
long we keep it"), and the Give page says it beside the button. The consent
notice is unchanged: no child's data is involved until the family redeems the
code, as an ordinary family. Ask the lawyer:

- Is a one-off email to somebody else's address, sent because a buyer asked,
  fine under the email marketing rules where you sell (it is transactional:
  one email, no list, nothing more is ever sent to them)?
- Does a gift need its own short terms (what a refund means once a code is used, the two-year
  life of a code, what happens if RankUp closes), or do the main terms cover a
  buyer who never signs up?

## Pausing a plan, the half-price month and offers: what was decided

A parent on the way to cancelling is offered a pause of 1, 2 or 3 months and,
once per family, one month at half price (docs/PAYMENTS.md, "Pause instead of
cancel"). What keeps this fair, and what to keep true:

- **Cancelling is never hidden.** "Cancel my plan" is on the plan screen in
  plain words, and in the offer sheet beside the offers; one tap opens
  Stripe's own cancel page. Nothing has to be declined first. Keep it that
  way: rules on "click to cancel" in several places require cancelling to be
  as easy as signing up.
- **A pause is said plainly**: nothing is charged, the family has the free
  plan's features, nothing is deleted, and it starts again by itself on a
  date shown before agreeing. An email goes three days before.
- **Kept**: a note of each pause (when it started and ended, and its
  reminder) for 90 days after it is over, and whether the family has had its
  half-price month for as long as the account exists. Nothing about a child.
  The privacy policy and terms say so; the consent notice is unchanged.
- **Children never see a price, an offer or anything to buy.** The pause and
  half-price offers, the Elite nudge and "Switch to yearly" are on Parent Mode
  screens only, behind the PIN. A child is told only "Paused — your progress
  is safe". `tests/pauseplan.mjs` checks every child's screen.

Ask the lawyer whether the half-price month needs its own line in the terms
beyond "a family may be offered one month at half price, once", and whether
any place you sell in requires a cancellation to be confirmed by email (Stripe
can send one: Settings, Emails).
