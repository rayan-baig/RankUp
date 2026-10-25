# RankUp, explained from the beginning

*A long plain-English essay about the whole project — what it is, why every
part of it is the way it is, what works, what does not, and what it cost to
learn. Written to be pasted into a new Claude account, or read by a person who
has never opened the code.*

*Its companion is `HANDOFF.md`, which holds the tables, the file lists and the
exact counts. This is the part that explains the reasoning. Where the two
disagree, the handoff has the newer numbers.*

---

# Part one — the idea

## What the thing actually is

RankUp is a chore app for families, built around one idea: that a child will do
a boring job willingly if finishing it earns something in a game they care
about, and that a parent will trust the system if they can see proof the job
was really done.

The loop is small enough to say in a sentence. A parent assigns a chore. The
child does it and photographs the result. Software looks at the photograph and
says whether it seems genuine. The parent sees the photo and that opinion, and
decides. If they approve, the child gets experience points, in-game currency,
and sometimes real pocket money.

Everything else in the app — and there is a great deal of it: twenty-two
screens, fifteen worlds, twenty-four arcade games, a database with a hundred and
eight functions in it — exists to make one of those five steps more likely to
happen. The themes and the arcade exist so the child opens the app. The photo
check exists so the parent believes the child. The money ledger exists so the
whole thing connects to something real. The guilds and alliances exist so there
is a reason to keep going after the novelty wears off. The streak exists so
there is a reason to come back tomorrow.

## The assumption the whole thing rests on

It is worth saying clearly, because it is easy to lose in the detail: the
weakest part of this product is not technical. It is the assumption that a
parent will reliably open an app to approve things.

A child will open it. The game pulls them; that is what games do. A parent has
to be pulled by duty, and duty is a weak force at nine o'clock at night when the
washing-up is still out. If the parent does not approve, the child's work sits
unrewarded, the loop stalls, and within a fortnight the app is dead on both
phones.

Almost every feature on the parent side is really an attempt to shore up this
one weakness. Notifications exist so the parent is told rather than having to
remember. The weekly digest exists so the app knocks rather than waiting. The
charts exist because the parent needs a reason to open it that is not a chore
for them too. The approvals screen is the shortest screen in the app, one tap
from the home screen, with the photo and the verdict and two buttons, because
every second of friction there is a second in which they put the phone down.

Nothing in the codebase can prove the assumption holds. Only using it on a real
family for a week will tell you, and that is why the project's own roadmap
document puts "use it yourself for a week" at number one, above every feature.

## Who built it, and how to work with him

The owner has no coding background. Not "a little rusty" — none at all. This
matters more than any technical fact in this document, because it shapes every
reasonable decision about how to help.

What it means in practice is this. He describes what he wants in terms of how it
looks and feels, not in terms of components and state. When he says "the
background sucks ass, make it better", that is a complete and actionable
specification, and the correct response is to go and make the background better,
not to ask which CSS property he has in mind. When he says "make it exactly like
the picture", he means the structure and the artwork, not the colour palette.

He does not want code dumped in chat. He wants short answers in plain language
and the work actually done. If you need to explain a trade-off, explain it in
one or two sentences and then pick one. He will correct you if you pick wrong,
and that correction costs far less than a paragraph of options.

He is direct, and occasionally blunt when something is not working. That is
useful information, not a problem to be managed. The worst stretch in this
project's history was not being told off; it was several exchanges in which the
same mistake was repeated — restyling components when asked to change structure
— and the frustration escalated because the behaviour did not change. The
lesson is not "be more careful with feedback". It is "when someone tells you
twice, stop doing the thing".

He works fast and switches context often. Over a single long session he moved
between the arcade, the theme system, a logo, a parent-company website, and the
print resolution of a notebook cover, sometimes sending a new instruction while
the previous one was still being carried out. Take each one seriously as it
arrives, finish the one in hand, and do not ask him to slow down.

He also asks for things in instalments. "Add a sports game" became, over six
messages, a single game containing eleven different sports. Do not assume the
first message is the whole specification, and do not rebuild from scratch each
time it grows.

---

# Part two — how it is built

## The shape of the code

The app is a single-page web app written in React, built with Vite and styled
with Tailwind. It is plain JavaScript with JSX, not TypeScript, and that is a
deliberate decision rather than an oversight.

For somebody who cannot read code, TypeScript would add a second language to
misunderstand on top of the first, and type errors would become a category of
problem that stops the app from building for reasons he cannot evaluate or fix.
The trade is real — some bugs get through that types would have caught — and it
was made consciously. Do not offer to convert it. A new session that suggests
migrating to TypeScript has not understood who the project is for.

All the application's state lives in one place: a single reducer function in
`src/state/reducer.js`, with sixty action types. In a large team this would
be unusual. Here it is right, because it means every change the app can make to
its own data is in one file and can be found by searching for it. State
scattered across ninety components is unfindable by somebody who does not
already know where to look, and the person who most needs to find it is the one
who cannot read the code.

The state is saved to the browser's local storage under the key
`rankup.state.v1`, with writes debounced so rapid changes do not thrash.

Routing is done with the URL hash — the part after the `#`. This is slightly
old-fashioned and entirely intentional. Hash routing works from a local file,
from a subdirectory, and from any static host, with no server configuration at
all. The app can be opened by double-clicking a file and it still works.

## Offline first, and why that is the central decision

The most important architectural decision is that the app runs completely with
no backend, no account and no internet connection. Every feature works except
the ones that inherently need other people — syncing between two phones, guild
chat, alliances.

The database is an upgrade you can switch on, not a dependency you have to
satisfy before anything happens. This is why the demo needs no setup: there is
nothing to set up. It is also why the first-run experience is a button that says
"Have a look around" rather than a sign-up form.

When the backend is switched on, changes do not go straight to the server. They
go into an outbox queue in `src/lib/sync/`, which drains when it can.

This sounds like over-engineering until you consider the failure it prevents. A
child does four chores on a phone with bad signal in the garden. If the app
wrote directly to the server and the writes failed, that work would simply be
gone, and the child would have done four chores for nothing. With an outbox it
waits, and goes up when the signal comes back. There is a test whose name is
exactly "a bad afternoon on the server must not delete a child's work".

A related subtlety that caused a real bug: when a pull from the server arrives
while a local change is still queued, the pull must not overwrite the queued
change. There is a whole test file about what a pull is allowed to overwrite,
and another about a change that commits a moment too late not being stepped
over.

## The database, and the one rule that governs it

The backend is Postgres through Supabase: thirty-two tables, a hundred and eight
functions, thirty-six row-level security policies.

The rule that governs all of it is that **no client is ever allowed to write to a
table directly.** Every write goes through a function that runs with elevated
privileges and checks what the caller is allowed to do before doing anything.

The reason is simple arithmetic. If a child's phone can write to the `kids`
table, then a child who opens the browser's developer tools can set their own
experience to a million. If the phone can only call `approve_submission`, and
that function checks the caller is a parent in the right family, there is
nothing to exploit. The security lives in the database, where it cannot be
bypassed, rather than in the interface, where it is a suggestion.

The same reasoning shows up in several specific places, and it is worth knowing
each of them.

**The subscription tier is written by Stripe's webhook and by absolutely nothing
else.** The column is locked by a trigger and by column-level grants. If a device
could set its own tier, every paid feature in the app would be one edit away
from free, and the business would be decorative.

**The one-child limit on the free plan is a database trigger**, not a hidden
button. Hiding a button stops nobody who knows how to look.

**The list of games the server will pay out for is an explicit allow-list**
inside the `play_minigame` function. This has a story attached, told later,
because it is the single most instructive bug in the project's history.

**Pairing codes and adult invitations are rate-limited** with their own attempt
tables, so a six-digit code cannot be brute-forced, and both are revocable.

Row-level security means every table is deny-by-default and one family can never
read another family's rows. There are tests that deliberately try and assert
that they fail — a parent attempting to read another household's plan, a family
attempting to see another's allowance ledger, a child attempting to play a game
on behalf of a child in a different family.

## The serverless layer

There are ten endpoints, in `api/`, served through a single Cloudflare Pages
adapter at `functions/api/[[route]].js` or directly on Vercel.

`verify-photo` is the Claude vision call. `create-checkout` and `billing-portal`
are Stripe. `stripe-webhook` is the only thing permitted to change a family's
tier. `send-push`, `send-reminders` and `send-digests` are the notification
jobs. `settle-alliances` closes the monthly family contest and awards the
discount. `run-retention` purges what should no longer exist. `health` is a
status endpoint.

The scheduled ones record their runs in a `job_runs` table, so a job that
silently stopped firing is visible rather than merely absent.

---

# Part three — the loop, in detail

## Assigning

A parent can write a custom chore or drop in one of three ready-made packs.

The **kid pack** has seven: make your bed, load the dishwasher, take the bins
out, tidy your desk, vacuum the living room, read for twenty minutes, homework
done and checked.

The **teen pack** has six, and they are deliberately bigger jobs: cook one
family meal, wash and dry and put away one load, clean the bathroom, mow the
lawn, score eighty per cent or better on a practice test, plan and shop for one
meal.

The **adaptive pack** has six, and it is the one most worth understanding,
because it is a different idea about what a chore is. Its entries are "put three
things where they belong", "wipe one surface you choose", "set the table your
way", "ten minutes of tidying, timer stops when you do", "ask for help with one
step", and "follow the picture checklist". These are written for a child for
whom "tidy your room" is not one task but an unbounded and frightening one. They
are bounded, countable, and they let the child choose. The pack exists because a
chore app that only works for children who already find chores easy is not much
of an achievement.

Every chore carries a difficulty, which sets its experience: easy is fifteen
points, medium thirty, hard fifty-five, and a "boss" chore is a hundred. A chore
can optionally carry a real cash price in pence, a requirement for photo proof,
a timer so the child is racing the clock, a recurrence so it comes back every
week, and a flag that doubles its experience as a surprise.

Recurring chores are the thing a parent actually does most. They are handled on
both sides — the app and the database have to agree on when a chore comes back,
and there is a test for exactly that disagreement.

## Doing

The child sees the chore on their Quests tab. When they open it, every reward is
itemised before they start: the experience, the coins, the money, any
multipliers, any timer bonus.

This is deliberate and it is one of the better decisions in the app. A reward
you discover afterwards is a nice surprise. A reward you can see before you
start is a reason to start. The screen is a contract, offered up front.

The camera is the browser's real camera through `getUserMedia`. This carries one
operational consequence that catches people out: browsers only grant camera
access over https. On a plain http host the camera will silently not work, and
nothing will explain why.

## Checking

This is the most unusual part of the app, and the part with the strongest
opinion behind it.

There are two layers. **The first runs entirely on the child's device**, costs
nothing, uploads nothing and needs no API key, so it always runs. It measures
how sharp the image is using the variance of a Laplacian filter, which is a
standard way of asking "is this blurry, or is it a flat screen". It computes a
perceptual hash — a dHash — and compares it against previous submissions, so
re-using last week's photo is caught. It checks timing, so a photo taken long
before the chore was opened is flagged. It looks for the geometry that gives
away photographing a screen, and for the flat darkness of a thumb over the lens.

**The second layer sends the photo to Claude** and asks whether it shows what it
is supposed to show — whether this is actually a made bed. This layer is
optional and off unless you deploy the serverless function with an API key. It
defaults to the cheapest capable model, because this runs on every chore in
every family and the cost compounds fast. One commit cut the running cost by
about three quarters, and there is a document that records what a single check
costs so that nobody optimises the wrong thing later.

And here is the opinion. **Neither layer ever approves or rejects anything.**
They produce an advisory verdict — "looks genuine", "worth a look", or "flagged"
— which the parent sees next to the photo. The parent always decides. Always.

That is not timidity about the technology. It is a judgement that in a family
app the damage from a false accusation is much greater than the damage from a
missed cheat. A child who did the chore properly and was called a liar by a
computer has learned something about the app, and about being trusted, that no
number of correct verdicts afterwards will undo. The cheat that gets through
costs a parent thirty points of imaginary currency. The false accusation costs
the product its reason to exist.

One of the test files is named, literally, "Does the photo check accuse honest
children?"

If you work on this project, treat that rule as fixed. Do not make the checker
auto-reject, however confident it becomes. If a future version is ninety-nine
per cent accurate, the one per cent is a child in tears.

The checks are also rationed per family and require a signed-in caller, with a
`refund_photo_check` function that returns the quota when a call fails — because
a failed call that still consumed the allowance is a bug the user pays for.

## Approving

The parent sees the photo, the verdict, and two choices: approve, or send back
with a note. Sending back puts the chore straight back on the child's list with
the note attached, so the feedback is specific and attached to the thing it is
about rather than delivered as a general complaint later.

On approval the rewards are granted and **the photo is destroyed immediately.**

This is a privacy decision taken early and held to. The app holds photographs of
children inside their homes. The correct amount of time to keep those is as
close to zero as the workflow allows, which is: until the parent has looked.
There is also a scheduled purge for anything that slips through, and a retention
job above that.

One side-effect is worth knowing because it looks like a bug in the demo: the
demo family's fortnight of history has no proof photos, because the app deleted
them, exactly as it would in real life. Adding fake ones would misrepresent what
is actually on screen.

Approving used to be a silent receipt and can now carry a message, because the
moment of approval is the one moment a parent is guaranteed to be looking at
their child's work and it was being wasted.

---

# Part four — the game layer

## Experience and levels

The curve is `min(400, 80 + 12 × (level − 1))` points to reach the next level.
In plain terms: the first level costs eighty points, each level after that costs
twelve more than the last, and the cost stops rising once it reaches four
hundred.

Both ends of that are deliberate. The gentle start means a child sees a level-up
in their first day or two, which is exactly when they are deciding whether this
app is worth opening again. The flat ceiling means the very high levels — Block
Craft's story runs to level 399 — stay reachable rather than becoming
theoretical. A reward nobody can reach is not a reward, it is a taunt.

Elite subscribers get a permanent 1.5× multiplier on all experience.

## Currency

Each theme has its own currency with its own name and icon. Matrix Clears,
Emeralds, Renown, V-Coins, Power Levels, Pink Crystals, VIP Tickets, Star
Shards, Sugar Orbs, Glow Points, Berberries, Credits, Star Coins, Mana Orbs,
Pocket Coins.

It is the same underlying number in all fifteen cases. The renaming is what makes
a theme feel like a world rather than a colour scheme, and it costs nothing.

## Real money

A chore can carry a price in pence, and there is a proper ledger behind it with
payments, payouts and gifts, plus a summary function. It handles multiple
currencies including the zero-decimal ones like yen, which break naive code that
always divides by a hundred.

The framing in the app is careful and should be preserved: it tells the child
"your grown-up pays this however you both agreed — RankUp is just keeping
count". The app is a ledger. It never moves money. That keeps it out of a
regulatory category it has no business being in, and it keeps the promise
honest, because the app genuinely cannot make anyone pay.

There is a database constraint that refuses to price a chore at £9,999, with a
test named for the slipped finger that would otherwise cause it.

## Streaks

A child builds a daily streak and can spend a streak freeze to protect it. There
was a bug where a freeze unfroze itself eight seconds later, which survives in
the commit history under exactly that name.

## Badges

Sixteen of them, and the set is shaped by one rule: a badge should mark
something you did, not something that happened to you.

They run: first one done, ten under your belt, fifty strong, the hundred ("that
is a habit, not a phase"), three in a row, a full week, a whole month ("almost
nobody gets here"), level five, level twenty, all-rounder (a chore in five
different parts of the house), clock beater (beat the timer five times), boss
slayer (three boss chores), scholar (ninety per cent on a test chore), nothing
sent back (ten approvals in a row without a rejection), saver (hold two hundred
currency at once), and cashed in (swap currency for a real reward).

A level is a number. A shelf is a collection — that distinction is in a commit
message, and it is why the badges exist at all.

---

# Part five — the fifteen worlds

This is the part that took the most work and the most argument, and it is the
part most likely to be misunderstood by someone new.

## What a theme is

Each child picks a theme. A theme is not a colour swap. It changes the entire
palette, the currency name and icon, the avatar's visual motif, and the animated
scene behind every screen.

The scenes are drawn as inline SVG — nineteen of them in total. Falling
tetromino shapes. A voxel landscape, in five variants. A tactical heads-up
display. Slanted battle-pass grids. Explosive manga energy. Drifting bows. A
stage rig. Stardust. Sprinkles. A dressing-table mirror. Leaves. A wireframe
grid. Castle bricks. Triangles. A handheld console.

Nothing is an image file. That means a theme change costs no download, and the
scenes re-colour themselves from whatever palette is active without any of them
knowing the others exist.

The scene is drawn three times at different scales, blurs and speeds, which is
where the sense of depth comes from. The far copy is scaled up, heavily blurred
and almost transparent and is held still so the browser can rasterise it once;
the middle copy sits where the scene would normally be; the near copy is scaled
past the edges and drifts faster. There is a note in the code explaining that
every scene opens by painting the background colour across the whole viewBox,
which is correct when there is one copy and fatal when there are three, because
the middle copy's opaque rectangle hid the far one completely. The parallax was
running the entire time and none of it was visible.

In front of the scene sits a layer of atmosphere: two slow drifting washes of
the theme's own light, sixteen specks of dust rising, and a vignette so the
edges fall away rather than ending at the frame. All of it is transform and
opacity only, which the browser's compositor handles on a separate thread, so it
costs nothing measurable on a phone, and all of it stops if the device asks for
reduced motion.

A third effect — a beam sweeping across — was built and then deliberately
removed. However faint it was made, it read as a bright band lying across
whichever card it happened to be behind, rather than as light passing through
the scene. An effect that looks like a rendering fault is worse than no effect.

## How the worlds progress

Each theme has four worlds that unlock as the child levels, at ten, twenty-five,
fifty and one hundred — the same levels at which their avatar changes form.
That alignment is the whole point: the place changes at the same moment the
character does. Before this, the world changed in the gaps between forms, which
meant neither event landed.

Each theme also has a premise and a line of story for each world. The story
appears in two places: a "Your story" card on the child's profile showing the
premise and where they have reached, and the world's own line on the level-up
screen at the moment the screen changes colour around them.

The *next* world's name is shown but not its story. Knowing what is coming is
the hook; being told what happens in it is the spoiler.

## The rule about what travels and what does not

The four worlds of a theme keep that theme's own scene. Only the light changes
— the palette, plus a shared sky layer that can hang a sun, a crescent moon, a
field of stars, an eclipse, a ringed planet, a comet or a storm over whichever
scene is underneath.

This rule exists because the alternative is obviously wrong once stated: a theme
*is* its shape language. Coquette Circuit rebuilt out of Cyber Grid wireframes
stops being Coquette Circuit. The child did not choose a colour, they chose a
world, and a world that becomes a different world has not progressed, it has
been replaced.

The sky layer is drawn into the middle parallax copy only, because three moons
at three different sizes is not depth, it is a mistake. It also sits about a
third of the way down the screen rather than at the top, because the readability
wash over the scene is heaviest at the top edge — it has to be, the header is
there — and a moon drawn at the very top was rendered faithfully and then almost
entirely painted out.

## Block Craft, the exception

Block Craft has nine forms instead of five, and its worlds genuinely are
different drawings: the Overworld, then The Nether Portal at level 125, Nether
Rise at 175, The End at 250, and The Dragon at 399.

That is allowed because in Block Craft the worlds *are* the story. Going to the
Nether is the thing that happens. It is not a recolour of the surface, and
drawing it as one would be a worse lie than drawing nothing.

An earlier version of this theme had a world at level 101 called Pale Cream. It
was deleted. A cream Minecraft is not part of that story, and being the only
light world inside a dark theme it also put dark night artwork behind
dark-on-light text and made the app unreadable at that level.

## Every theme and its journey

**MatrixBlocks** — Tetris. Midnight blue fields and glowing cyber tetrominoes.
Currency: Matrix Clears. *The Stack never stops falling. Every chore you clear is
a line cleared — and the well goes deeper than anyone has been.* Deep Stack at
10, Overclock at 25, Hard Drop at 50, and Kill Screen at 100: "Past the last
level the game was built for. Nobody has seen this board before you."

**Block Craft** — Minecraft. Pixelated soil and blocky voxel borders. Emeralds.
*You spawned with nothing but your hands. Dig, build, and find the way through to
whatever is on the other side.* The Nether Portal at 125 ("You found obsidian.
Twelve blocks and one spark later, something is open that should not be"),
Nether Rise at 175, The End at 250, The Dragon at 399 ("It has been circling the
whole time. Now it has seen you").

**Tactical Override** — Rainbow Six. Matte grey panels with a neon-orange
heads-up display. Renown. *You run point. The breach, the timing and the call are
all yours.* Night Op, Sandstorm, Blackout, Orbital.

**Apex Royale** — Fortnite. Slanted high-contrast grids. V-Coins. *A hundred drop
in. You plan on walking out.* Storm Front, Final Ring, Last Stand, Champion:
"The ring closed on you standing up. The crown is yours."

**Aura Awakening** — anime. Manga framing with golden energy meters. Power
Levels. *The power was always in you. It is just extremely rude about waking up.*
Awakening, Surge, Ascended ("Hair, eyes and sky all change colour at once. You
barely notice"), Limit Break.

**Coquette Circuit** — Sanrio. Soft pastel pink with pixel bows. Pink Crystals.
A light theme. *A tiny pastel kingdom runs on good manners and better ribbons,
and it has decided you are its new favourite.* Powder Room, Ribbon Lace,
Moonlit Bow, Crown Jewel: "A crown made of ribbon, which is heavier than it
sounds."

**Pop Arena** — Taylor Swift. Dark stadium lit by neon-purple rigs. VIP Tickets.
*One stage, one crowd, and a set list you have to earn song by song.* Soundcheck,
Main Stage, Encore ("They will not leave. You did not plan a fourth song"),
Stadium.

**Pegasus Horizon** — My Little Pony. Lavender and sky-blue, trailing star dust.
Star Shards. Light. *You have wings and no idea how far they go. Time to find
out.* First Flight, Cloud Run, Starfall, Constellation: "Somebody has drawn you
into the sky. You are a shape people look for now."

**Sugar Rush** — baking games. Pastel mint counters and dripping icing. Sugar
Orbs. Light. *Somebody has to keep the sweet kingdom running. Somebody is you.*
Icing Lane, Citrus Grove, Berry Grove, Sugar Nebula.

**Glam Protocol** — Barbie. Hot-pink vanity columns and diamond particles. Glow
Points. *A whole industry decides who gets looked at. You have decided to decide
instead.* Dressing Room, Red Carpet, Spotlight, Icon: "They stop saying your
name and start saying 'the look'."

**Campfire Cozy** — Animal Crossing. Warm wood and pastel green. Berberries.
Light. *A quiet island, a loan you never asked for, and neighbours worth the
trouble.* First Light, Deep Wood, Golden Hour ("Everything turns amber for twenty
minutes and the whole island comes outside"), Stargazing.

**Cyber Grid** — cyberpunk. Electric purple grids and cyan wireframes. Credits.
*The city runs on systems. You have learned to run inside them.* Boot Sector,
Data Stream, Firewall ("Something has noticed you. It was built to"), Mainframe.

**Plumber Kingdom** — Mario. Sky-blue boards with castle bricks. Star Coins.
Light. *The kingdom keeps losing its princess and finding its courage.* Green
Hills, Underground, Lava Castle, Star World.

**Neon Pulse** — Geometry Dash. Pitch-black cut by neon triangles. Mana Orbs.
*The city has a beat. Learn it and the lights start doing what you say.* First
Pulse, Bass Drop, Overdrive, Event Horizon: "The track never resolves. You stop
counting and just stay in it."

**Monster Tamer** — Pokémon. Handheld-yellow casing with a companion readout.
Pocket Coins. Light. *Leave home, meet something wild, and convince it you are
worth following.* Route One, Deep Cavern, Volcano Gym, Champion Road: "The last
climb. Everything you ever caught comes up it with you."

## Readability, which is not optional

Seventy-five palettes exist: fifteen themes, each with a base and four worlds.
All seventy-five are checked against contrast floors in an automated test, and
three colours had to be darkened to pass.

Light themes stay light at every stage. This sounds obvious and was not — the
Pale Cream disaster is described above. The rule now is written into the data
file as a comment, so the next person adding a world sees it.

## The parent side looks nothing like this

There are ten parent dashboard themes — Executive Focus, Cozy Café, Zen
Minimalist, Midnight Admin, Botanical Core, Velocity Carbon, Solstice Clean,
Oceania Slate, Architect Blueprint and Sovereign Estate — and they are
deliberately calm, flat and adult. Cosmetic only, by design.

The two halves of the app should not look like the same app, because they are
not for the same person and they are not doing the same job. The child's side is
a world. The parent's side is a tool.

---

# Part six — the arcade

Twenty-four games, reachable from the child's Arcade tab.

The rule that makes it work is that a token to play comes from an approved chore
and from nothing else. There is a maximum of five tokens, and a cap of fifteen
coins earnable from games per day so the arcade cannot become a currency faucet
that makes the chores pointless. When a child has no tokens, the empty state
points them straight back at their quest list.

With twenty-four games a flat list stops being browsable, so the screen is a hub:
one featured game on the front that changes daily, shelves by the kind of game it
is, and every card saying roughly how long a round takes — because the real
question a child has is whether they have time for this before dinner.

## The games

**Arcade shelf.** *Snake* — eat, grow, run out of room; reach twenty-five long.
*Brick Breaker* — a ball, a paddle and a wall that will not clear itself; three
lives, and the paddle edge sends the ball off at an angle. *Sky Hop* — one tap
to fly, gravity does the rest; fifteen gaps is perfect. *Star Catcher* — thirty
seconds, catch the stars and not the rocks. *Stacker* — time your tap, stack the
tower, do not wobble. *Trackstar* — three lanes, no brakes, sixty seconds.

**Puzzle shelf.** *Block Drop* — falling shapes, clear ten lines for a perfect
round. *Sweet Swap* — twenty moves, no timer, and a swap that matches nothing is
free. *2048* — no timer, every doubling scores, cash in whenever. *Slide Puzzle*
— fifteen tiles and one gap; green means a tile is already home. *Lights Out* —
tap a tile and its neighbours flip; a puzzle, not a race, so fewer moves scores
more.

**Brain shelf.** *Memory Match* — eight pairs, fewer flips and less time scores
better. *Colour Chain* — watch, play back, one longer each time. *Minesweeper* —
ten mines in sixty-four squares, and the first tap is always safe. *Find the
Impostor* — five crewmates, three meetings, the crew tell the truth and one of
them does not; every round has exactly one answer, which is a property of the
generator and is tested as such.

**Sports shelf.** *SportsMania* — eleven sports in one game: football, golf,
Formula One, cricket, hockey, tennis, basketball, ping pong, baseball,
volleyball and soccer. The token is only spent when an event ends. *Tennis Tour*
— a full 3D career with rankings, a tour calendar and best-of-three sets. *Turbo
Ball* — football with cars; you cannot carry the ball, only hit it.

**Versus shelf.** *Four in a Row* — you against the app, which plays properly but
can be beaten; you go first.

**Cards shelf.** *Royal Draw* — five-card draw, five hands, payout table on
screen. *Wildfire* — match the colour or the number, three opponents, skips and
wilds. Plus the three described below.

Several of these have invented names because the obvious ones are trademarks.
Wildfire is the Uno-like game. Trackstar is the endless runner. Sweet Swap is the
match-three. This was an explicit instruction and should be preserved.

Four of the games arrived as standalone HTML files and run inside a sandboxed
iframe with a message bridge back to the app. Three of those four bridges did
nothing at first, because the technique used — wrapping a function on the window
object — fails for a game written as an immediately-invoked function, for one
using `const` and `let` at the top level, and for an ES module. In all three
cases nothing the bridge needed ever landed on `window`. The fix was to watch the
page's own DOM with a `MutationObserver` and read the score out of the elements
the game updates. A test that actually plays each of them caught this.

## The card games, and the gambling question

Three of these are casino or card-table games inside a children's app, which
needs an answer rather than a shrug.

The answer taken was to remove the betting and keep the game.

**Blackjack** is six hands with nothing staked. The dealer plays a printed rule —
hits below seventeen, stands on seventeen, soft or hard — and the rule is shown
on screen, so the child is deciding against something knowable rather than
against a machine that might be doing anything. The decision the game is made of
is sixteen against a dealer's ten, and that survives the removal of money
intact.

**Texas Hold'em** is heads-up with no chips at all. This needed a scoring
invention to survive, because without betting, folding costs nothing, and a
scoring system that only counted wins would make folding a way of avoiding the
game. Instead: winning a showdown is worth two points, folding is worth one, and
losing a showdown is worth nothing. Fold every hand and you finish on exactly
fifty per cent. Judgement beats that, and beats playing every hand. The skill the
game actually teaches — knowing when to walk away — is the skill it scores. A
split pot also scores one, because a split is nobody's win and nobody's mistake.

**Go Fish** enforces the one rule that separates it from guessing: you may only
ask for a rank you already hold, so every question you ask tells the other player
something about your hand. The interface enforces it by only offering buttons for
the ranks you actually have. The computer opponent plays by the same rule, asks
for whatever it holds most of, and remembers which ranks you have already said no
to since it last drew, so it does not loop on a dead question.

The rules that are objectively right or wrong live outside the screens, in two
plain JavaScript files — `pokerHands.js` and `cardRules.js` — and are tested
without a browser. That includes poker hand ranking, where the classic traps are
the wheel straight (ace-two-three-four-five, where the ace counts low and the
hand does not look like five consecutive numbers), a hand that is both a flush
and a straight, and four of a kind, which also contains three of a kind and a
pair and will be called the lesser hand by a check written in the wrong order.

It also includes blackjack's ace arithmetic, which is its own trap: an ace is
eleven until that would bust you and then it is one, and a hand can hold several
of them, so ace-ace-nine is twenty-one rather than thirty-one, and four aces are
fourteen rather than forty-four. The usual bug steps only the first ace down.

## Adding a game — the checklist

Build the component, calling `onDone` with a score from zero to a hundred. Add an
entry to the catalogue in `src/data/minigames.js`. Add it to the component map in
`KidArcade.jsx`. **Add its id to the allow-list in the `play_minigame` function in
`supabase/sync.sql`.** Then run `node tests/gameids.mjs`, which proves all four
agree.

The fourth step is the one that gets missed, and the next section explains what
that costs.

---

# Part seven — four bugs worth knowing

These are told in full because each teaches something that will otherwise be
learned expensively.

## The game allow-list

The server keeps a list of game identifiers it will pay out for. Ten games were
added to the app over time and never added to that list. Every one of them
silently paid nothing.

The reason nobody noticed is both beautiful and awful: a refused game also never
spends the play token. So after playing, a refresh restored all five tokens, and
everything looked completely normal. Better than normal, in fact — the tokens
appeared infinite. And the browser tests were passing *because* of the bug,
since they checked that tokens behaved correctly across a reload and the server
was quietly never taking one.

The fix was one line of SQL plus a test that reads the list out of the SQL file
with a regular expression and compares it against the app's catalogue.

The lesson: when a check fails silently *and* undoes its own side-effect,
nothing downstream will ever tell you. Look for the places where failure and
success leave the same visible state.

## The demo that ate itself

A saved demo was being restored from local storage like real data, so somebody
who opened the demo once kept that exact copy forever and never saw any
improvement. A new theme, a new game, a redesigned screen — none of it reached
them, and from their side the app simply had not changed.

The fix was to rebuild the demo on every load. That was the opposite mistake,
and it was worse, because it was the one the visitor could see: change the
theme, reload, and it was back to the default. Everything they had just done
vanished.

The right answer was a version stamp. Stale demos are replaced; a demo of the
current build is left alone.

The lesson: when you fix something, check you have not just moved the problem to
a more visible place. And reproduce the original bug before fixing it — this one
was reproduced by deliberately planting an old saved state first, which is why
the second version was caught.

## The backdrop that erased every heading

An element positioned `fixed` at `z-index: 0` paints *above* ordinary
unpositioned content, not below it. The background wash was placed at zero and
washed out every heading in the app. It needs `-z-10`.

This is a real CSS rule and it surprises people who assume zero is the bottom of
the stack. It is not; zero creates a stacking context that sits above the normal
flow.

## The patch that ate a line of text

When replacing a logo baked into a flat image, the surrounding colour was
sampled by averaging a ring of pixels around the old logo. That ring included
the old logo's own glow, so the average came out far too pale, and the
"matching" patch painted a visible pale rectangle over a card and covered the
first line of its body text.

The fix was to sample a clean column of background to each side of the mark, row
by row, and generate the patch from the artwork's own pixels with a horizontal
ramp between them — so the patch *is* the card, minus the old logo.

The lesson: when sampling a colour in order to hide something, sample from
somewhere that thing is not affecting.

---

# Part eight — mistakes about design

There is a cluster of failures in this project's history that are all the same
failure, and anyone picking it up should read them as one lesson.

Asked repeatedly to match a supplied design, the repeated error was to restyle
components — rounder buttons, a different accent, softer shadows — when what was
being asked for was a change of structure and of world. The feedback, verbatim,
was "you are just changing the style of the buttons I want the style of the
entire thing replace the entire design with this design not just the buttons".
It took several rounds to land. The frustration was entirely earned.

Related, and worse: hand-made artwork was twice covered over with generated
artwork that was worse than what it replaced. If a human has supplied art, it is
the ground truth. Build the interface around it. Do not generate something to
sit on top of it.

Another, practical: pasted images are visible in a conversation but are not
files on disk. Several rounds were lost trying to work from a design that had
never actually arrived as a file, with neither side understanding why. The
resolution was for the owner to zip it, at which point it landed. If you need to
*process* an image rather than merely look at it, check it exists on disk first,
and if it does not, say so plainly and ask for a zip.

And a small one with a large effect: the CSS class `.btn` in this project
carries layout only and no surface. A button with `className="btn"` and nothing
else renders as bare text with no background or border. It needs a variant —
`btn-primary`, `btn-soft`, `btn-ghost` or `btn-danger`. This shipped briefly in
three card games, where "Stand", "Fold" and every rank button in Go Fish looked
like plain text that a child had no reason to tap.

One more, from the same family: do not print the game's own title inside the
game. The arcade's header already names it, so the title appeared twice on one
screen. The big type belongs to the score.

---

# Part nine — the rest of the app

**Device pairing.** A child's device shows a six-digit code and a parent types it
in on theirs. Rate-limited, revocable, and tested as two genuinely separate
browser sessions rather than two tabs pretending to be two phones.

**Co-parents.** A second adult can be invited into a family with their own
device. Also tested as two real devices. There is a maximum number of adults per
family, enforced in the database.

**Guilds.** Groups of five children on Standard or ten on Elite, with a roster
and a message board. Joining requires parental approval, messages can be
reported, and a parent moderates. Guilds ship switched off by default behind a
feature flag, because a chat feature for children is the single highest-risk
thing in the product and should be switched on deliberately. There was a bug
where leaving a guild made it impossible ever to rejoin.

**Alliances.** Ten families compete each month on chores approved, and the
winning family gets twenty per cent off their next bill. Elite only. Settled by
a scheduled job. Earned rather than bought, which is the point — it is the one
paid feature you cannot get simply by paying.

**The Consequence Engine.** Elite parents can impose real consequences in the
app: a currency tax, a lockout from a dimension, and a full red lockdown. This is
the sharpest feature in the product and it deserves care. Lockouts expire on a
timer, and there was a bug where a child could be locked out permanently, which
is in the history under "four ways a change could vanish, and a child locked out
for good".

**Behaviour Blueprints.** Weekly charts built from what actually happened in the
app, not from invented sample data. These exist because nobody opens charts
voluntarily — hence the commit "Nobody opens the charts, so the charts now
knock".

**Rewards and redemption.** A catalogue of real-world rewards a parent defines,
redeemed with the child's currency, with the parent marking a reward as given.
The demo has "pick Friday's film" at sixty, "an hour later bedtime" at ninety,
and "day out, you choose" at two hundred and fifty.

**The Sunday Market.** A cosmetic shop with six skins priced by rarity — Ember
Halo and Tide Glass at a hundred and twenty, Orchard Bloom and Live Circuit at a
hundred and fifty, Dusk Prism at two hundred, and the legendary Gilded Crown at
two hundred and sixty — plus flash tickets sold in three pack sizes. There was a
bug where a skin bought for a hundred and twenty coins disappeared eight seconds
later.

**Notifications and reminders.** Real web push with a server behind it. On iOS
the app has to be installed to the home screen for these to work at all, which
is a platform limitation and not a bug. There was a period where notifications
silently never worked anywhere except the domain root.

**Consent, export and deletion.** Parental consent is recorded properly, with
notices and revocation. A family can export everything they have, or delete
their account for real, and both are implemented in the database rather than
promised in a policy document.

**Crash reporting.** One broken screen no longer takes the whole app down, and
the failure is reported rather than swallowed. There is a test that proves this
by actually breaking a screen.

**Referrals.** Codes, qualification and reward days, with the usual guard that a
two-year-old household is not a new signup.

---

# Part ten — the money

Three tiers.

**Starter** is free and supports one child. **Standard** is 9.99 a month or 99.90
a year and adds unlimited children, the AI photo check and five-player guilds.
**Elite Pass** is 15.99 a month or 159.90 a year and adds a permanent 1.5×
experience multiplier, ten-player guilds, the richer visual tier called
Overdrive, profile frames and rare-drop selectors, the Consequence Engine, the
behaviour charts, and entry into the monthly family contest.

Starter used to cost $4.99 and is now free, and that single change is the whole
growth strategy in one number. A family app lives or dies on its first week, and
you cannot have a first week behind a paywall.

Critically, Starter runs the *entire* loop — assign, photograph, check, approve,
experience, themes, streaks, the arcade. What somebody loses by not paying is a
smaller app, not a locked one. That is what makes upgrading a choice rather than
a ransom, and it is the difference between a free tier and a trial.

The annual price is ten months' money for twelve months' app. The saving is the
smaller half of why it exists. The larger half is that the decision to cancel
then happens once a year instead of twelve times, and in a family app most churn
is not a decision to leave — it is a quiet month where nobody opened it and the
charge looked like a good thing to stop.

The comparison table on the plan screen computes its rows from the live data
rather than being written out by hand. This was added after the table claimed
"All 25 themes" while the app shipped fifteen for children and ten for parents.
The total was right and the sentence was wrong, and a child reading it expects
twenty-five worlds and finds fifteen. A pricing page that has to be explained is
a pricing page that is wrong. Now, adding a theme updates the pricing page by
itself.

## Charity Week

Every year from the 22nd to the 28th of June, every penny RankUp takes goes to
charity.

This is implemented rather than merely stated. There are database functions for
determining whether a date falls inside the window and for totalling what came
in during it, and there are tests covering both the app and the database. It is
a promise the code can be audited against.

---

# Part eleven — testing, and what counts as proof

There are forty-four test files and twenty-four SQL test files, in three groups:
fast logic tests that run in Node with no browser, browser tests driven with
Playwright, and database tests against a real Postgres brought up by a script.

The suites are named after the failure they prevent rather than the code they
cover, which makes the list read like a catalogue of fears: a kid getting
experience they did not earn; the app and the database disagreeing on what a
chore is worth; a bad afternoon on the server deleting a child's work; "erase
this device" erasing the family; the banner that asks a parent for money lying to
them; does the photo check accuse honest children; the cursor stepping over a
change; a photo deleted in the gap between arriving and being claimed.

## The standard

**A passing test proves nothing until it has been shown to fail on a broken
version.**

Several tests here were mutation-tested on purpose: the code was deliberately
broken to confirm the test noticed. The 2048 board test passed against a
deliberately broken merge on its first draft, and the row `[2,2,4]` turned out to
be the case that separates the correct rule from the plausible wrong one. The
blackjack ace logic was broken two ways — once by stepping only the first ace
down, once by checking the dealer's bust before the player's — and both made the
suite fail, which is how you know the suite is real.

## Two tests that were themselves broken

One proved a theme was applied by searching the home screen for that theme's
currency name. A redesign moved that text, and the check then failed for all
fifteen themes at once without a single theme actually being broken. It now reads
the colour variable that every themed pixel is drawn from, which cannot drift
with the layout.

The other passed a *number* to a function that reads `fails.length`. A number has
no length, so the expression was undefined, so every run exited successfully no
matter how much was broken. It was reporting a failure in its own output and
still returning success.

Both of these are the same category: a test that cannot fail is worse than no
test, because it occupies the space where a real one would go.

## The browser tests are real

They click through the actual app in a real browser. The card-game suite plays
all three card games to the end, and earned its place immediately by finding
that Go Fish never finished: with the pond empty and one seven in each hand, the
card crossed over and came back forever, neither hand was empty and the thirteen
books were never completed, so no end condition could fire. That is a deadlock
you cannot find by reading the code and cannot find by building it.

---

# Part twelve — deployment and operations

Two deployment targets are configured: Cloudflare Pages, with a `wrangler.toml`
and a catch-all function adapter, and Vercel. The local stack script can serve
the real production build through Cloudflare's actual runtime, which caught
problems that the development server hid.

The database files are applied in a specific order documented in
`docs/BACKEND.md`. Payments setup is in `docs/PAYMENTS.md`, push in
`docs/NOTIFICATIONS.md`, the photo check in `docs/AI-CHECK.md`, deployment in
`docs/DEPLOY.md`, legal and retention in `docs/LEGAL.md`, and the running
decision log in `docs/DECISIONS.md`.

The single rule about configuration is that **anything beginning with `VITE_` is
compiled into the JavaScript that every phone downloads.** A secret in a `VITE_`
name is a published secret. The app checks for this at start-up and shouts in the
console if it finds one, and there is a test asserting that every setting the
code reads appears in `.env.example`.

The camera needs https. That is worth repeating because it is the most common
"the app is broken" report that is not a bug.

---

# Part thirteen — the things around the app

**MTRX Horizon** is the parent company's website: a two-screen page where RankUp
sits alongside two other products, CyberLogix and OmniArmor, neither of which is
built. The page is supplied artwork shown full-bleed with clickable hot spots
laid over it in percentages, so they stay on target at any width. The RankUp card
opens the RankUp preview; the two unbuilt products say so rather than going
nowhere. It lives in the repository under `horizon/`.

**The logo** is an M-shaped mark inside a glowing sphere, made outside this
project. Two vector versions were built here and then deleted when the owner had
it finished elsewhere, which is the correct outcome — his version is the real
one. The supplied file is stored with squared copies at 512, 192 and 64 pixels,
because the original is not square and every place a logo actually goes is. There
is also a tight crop, where the sphere fills the frame rather than floating in
padding, used in the Horizon page at small sizes.

**The notebook.** There is an ongoing effort to print the logo on a custom
hardcover journal. The current cover design has exactly the right aspect ratio
for a 5.5 by 8.5 inch cover and only about sixty per cent of the pixels needed
for a sharp print, and its finest glowing lines come out at under half a point,
which is thinner than a press can hold when printing light on dark. The advice
was to regenerate at 1650 by 2550 with a two-point minimum stroke and an eighth
of an inch of bleed. This is not software, but it comes up, and it is the kind of
question worth answering with measurements rather than impressions.

---

# Part fourteen — where it stands

The core loop works end to end, for real. So do the themes, the worlds, the
avatar progression, the arcade, pairing, cross-device sync, guilds, alliances,
notifications, Stripe subscriptions, consent, export, deletion, the allowance
ledger, Charity Week and crash reporting.

There is a document in the repository called `STATUS.md` whose only job is to
stay honest about this, on the principle that a mockup which looks finished turns
into a promise you did not mean to make. It uses three marks: genuinely works,
works but only on this device, and looks real but is not.

## What is genuinely not finished

There is an owner-only console behind a client-side password, which is not
security — anybody can read the password in the downloaded code. This has been
flagged twice and still needs real authentication before it protects anything
that matters.

The Rewards tab was designed as two columns, catalogue and redemptions side by
side with a live countdown, and is still one column. Profile customisation and
the rare-drop selectors are designed and not built.

Block Craft has nine hand-drawn avatar forms. The other fourteen themes fall back
to a generated motif, and the slots for real artwork are sitting empty and
correctly named, waiting for files to be dropped in — the registry picks them up
with no code change. Four arcade tiles have no artwork either: Tennis Tour,
Memory Match, Colour Chain and Stacker.

"Grandparents can chip in" is half-built: the database functions exist
(`supporter_gift`, `supporter_view`, `supporter_family_id`) and the interface
does not.

And there is a task called "Something worth screenshotting", never started, whose
idea is that a level-up or a world unlock should produce something a child
actually wants to show somebody. Nothing in the app is currently shareable, and
for a product that depends on children telling other children about it, that is a
real hole.

Above all of those sits the thing the roadmap has had in first place from the
start: use it on a real family for a week.

---

# Part fifteen — if you are a new Claude reading this

A few things you will otherwise get wrong.

**It is not TypeScript and should not become TypeScript.** Do not offer.

**Any new game must be added to the allow-list in the `play_minigame` function**,
or it will silently never pay out and the browser will show nothing wrong. There
is a test that catches this. Run it.

**The photo check is advisory and must stay advisory.** Never make it decide.

**The demo rebuilds only when its version stamp changes.** Rebuilding on every
load destroys whatever the visitor just did, which is the more visible bug.

**Light themes must stay light at every world.** A dark world behind
dark-on-light text already shipped once.

**The artifact preview links from the original account are private to it** and
will not open elsewhere. The repository is the portable thing.

**Write for someone who cannot read code.** Short answers. Plain words. Do the
work rather than describing it.

**And before you say a visual change is done, screenshot it and look.** Not "this
should work" — render it and look at the picture. Nearly every visual mistake in
this project's history would have been caught by one screenshot taken before
claiming it was finished.

---

# Appendix — a glossary

**Quest** — a chore, in the app's language. The child-facing word.

**Submission** — a child's completed quest awaiting a parent's decision, with its
photo and verdict attached.

**Form** — one of the five avatar stages (nine in Block Craft), reached at levels
1, 10, 25, 50 and 100.

**World** / **evolution** — one of the four palette-and-sky stages a theme passes
through, at the same levels as the forms. Called `evolutions` in the code for
historical reasons.

**Scene** — the animated SVG backdrop belonging to a theme. Nineteen exist.

**Sky** — the shared overlay that hangs a sun, moon, stars, eclipse, rings, comet
or storm over any scene; what makes a world feel different without changing the
theme's shapes.

**Overdrive** — the Elite visual tier: aurora, button glow, a highlight on the XP
bar, a turning ring round the avatar, and a bigger level-up burst.

**Token** — the right to play one arcade game. Earned only from an approved
chore. Maximum five.

**Flash ticket** — the Sunday Market currency, bought in packs, used for skins.

**Guild** — a group of children with a shared message board, five or ten
depending on tier.

**Alliance** — a group of ten *families* competing monthly for a discount. Elite
only.

**Blueprint** — the Elite weekly behaviour chart.

**Override** / **Consequence Engine** — the Elite parental tools: currency tax,
dimension lockout, red lockdown.

**Look-around** — the demo. Started from the welcome screen, rebuilt when its
version stamp is stale, and the only place arcade tokens are unlimited.
