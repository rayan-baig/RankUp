# Why the app is built this way

Written for someone who is learning as they go. Every entry is a decision that was
actually made in this codebase, in plain language, with the trade-off stated.

---

## A mobile-friendly website, not a native app

**What that means.** RankUp is a web page that is designed for phones. You open it in
Safari or Chrome, and you can "Add to Home Screen" so it gets an icon and opens
full-screen like an app.

**Why.** A native iPhone or Android app needs Xcode or Android Studio, an Apple
Developer account ($99/year), code signing, and app-store review before a single person
can try it. A website goes live in minutes and updates the moment you push a change.

**The trade-off.** You lose real push notifications (mostly), app-store discovery, and
some polish. You can add a native wrapper later — the code inside barely changes.
Prove the idea first.

---

## React with Vite

**React** is the library that draws the interface. The brief already assumed it.

**Vite** is the tool that runs it while you develop and packages it for the web. It was
chosen over the older Create React App because it starts in under a second, reloads
edits instantly, and is what almost every new React project uses now.

**Plain JavaScript, not TypeScript.** TypeScript catches more mistakes but adds a layer
of syntax to learn. Since you are learning as you go, the code is plain `.jsx` with
comments where a decision is not obvious.

---

## Tailwind CSS plus CSS variables

Layout and spacing use **Tailwind** (`className="flex gap-2"` and so on) so the code
that describes a screen is in one place instead of split between two files.

Colours are **not** Tailwind's. Every theme sets CSS variables (`--bg`, `--accent`, …)
on the page, and Tailwind reads those. That is why 25 themes work without a single
`if (theme === 'blockcraft')` anywhere in a screen. One file does it:
`src/lib/applyTheme.js`.

---

## localStorage first, a real database second

`localStorage` is a small storage box every browser gives a website. Save something,
it is still there tomorrow — but only in that browser on that device.

Starting there means the whole game loop could be finished and played before touching
servers, accounts, or bills. The cost is real: no sync, no multi-device, no guilds
between families.

**The important part:** every read and write goes through one file,
`src/lib/storage.js`. Switching to Supabase means rewriting that file. The 20-odd
screens do not know or care where the data lives. → [BACKEND.md](BACKEND.md)

---

## One store, one reducer

All app data lives in a single object, and every change goes through
`src/state/reducer.js` as a named action (`APPROVE_SUBMISSION`, `APPLY_OVERRIDE`, …).

This is more ceremony than letting each screen keep its own data, and it buys two
things: you can read `reducer.js` top to bottom and see literally everything the app can
do, and saving is one line because there is only one thing to save.

---

## The AI key lives on a server, never in the app

Anything shipped to a phone browser can be read by anyone who has the app. An API key
in the front-end is a key you have published.

So the browser sends the photo to `/api/verify-photo`, a small function that runs on the
server, and *that* holds the key. Vercel and Netlify both run these for free at low
volume. → [AI-CHECK.md](AI-CHECK.md)

---

## Two layers of photo checking

**Layer 1** runs in the browser: sharpness, brightness, flat-colour ratio, long straight
UI edges, and a perceptual fingerprint compared against every photo the kid has sent
before. Free, instant, private, and it catches the mechanical cheats — screenshots,
covered lenses, re-sent photos.

**Layer 2** is Claude looking at the photo and answering "is this a real photo, and does
it show this chore?" It costs money per check and needs a key, so it is optional. When
it is off, the app says so on the parent's screen rather than pretending.

Both layers only ever produce advice. → [STATUS.md](STATUS.md#deliberate-product-rules--not-gaps)

---

## Hash routing (`#/parent/approvals`)

The `#` in the address means the server never has to be told about the app's pages. It
works identically on Vercel, Netlify, a plain static host, or straight off a hard drive
— with no configuration file. The browser back button still works, which matters a lot
on a phone.

---

## Charts drawn by hand

The Behaviour Blueprint charts are about 200 lines of SVG rather than a charting
library. Three chart shapes did not justify adding several hundred kilobytes to
something that loads over a phone connection.

Their colours are fixed and neutral rather than following the parent's theme, and were
checked with a colour-blindness and contrast validator. A chart has to stay readable in
all ten dashboard themes, and it cannot do that if its series colours move around.
