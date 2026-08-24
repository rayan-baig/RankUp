# Legal: read before real users or real money

**This is not legal advice.** It is a list of the things that apply to a kids' app so
you know what to ask a lawyer about. Get one paid consultation with a solicitor or
attorney who knows children's apps before you collect one real child's data or take one
real payment. That does not need to happen before you build — it must happen before you
launch.

Right now the app collects nothing: everything is in one browser, nothing is transmitted
(other than a photo to the AI check, if you enable it). That is why development is safe
today and launch is not.

---

## COPPA (United States)

The Children's Online Privacy Protection Act applies to any online service directed at
children under 13 that collects personal information. RankUp is squarely directed at
children.

"Personal information" includes more than you would expect: a name, an account
identifier, a persistent device ID, and **photographs of a child or their home**. The
core mechanic of this app is children taking photos in their own bedrooms. That is
about as sensitive as children's data gets.

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
| Photo proof | How long are children's home photos retained? Who can see them? Are they encrypted at rest? Can a parent delete them all in one action? |
| AI photo check | Sending a child's photo to a third-party API is a disclosure to a third party. It must be named in the privacy policy and covered by consent. Check the retention terms of whatever API you use. |
| Guild chat | Kid-to-kid messaging needs consent on **both** sides, plus moderation, reporting and blocking. Consider whether it is worth the risk at all. |
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
   child's photo into a deployed build.
2. **Before a pilot with real families:** privacy policy, terms, a working delete-my-data
   route, and written parental consent — even if it is a paper form for five families
   you know personally.
3. **Before public launch:** the paid legal consultation, a real verifiable-consent
   mechanism, a data-retention policy that actually deletes things, and a security review
   of how photos are stored.
4. **Before charging money:** everything in [PAYMENTS.md](PAYMENTS.md), plus confirming
   the purchaser is the parent.

---

## One product decision worth making early

Ask whether the photos need to be kept at all after a parent has approved a submission.
If a photo is deleted the moment it has been reviewed, an enormous amount of risk simply
disappears — you cannot leak what you do not store. The app would lose a history view
that nobody has asked for. That trade seems obviously worth it, and it is much easier to
build that way from the start than to retrofit.
