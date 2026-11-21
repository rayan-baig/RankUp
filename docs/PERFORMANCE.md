# How fast RankUp is

What a family on a slow phone waits for, what the database spends its time
on, what was changed in 0.21.0, and how to measure it again. The database under
load (a thousand families syncing at once) has its own page:
[LOAD-TEST.md](LOAD-TEST.md).

## The first load on a slow phone

**How it was measured.** The production build, served the way Cloudflare
serves it (compressed, with the headers in `public/_headers`), opened in
Chromium as a phone (390 × 844) on Lighthouse's "slow 4G": 150 ms each way,
1.6 Mbit/s down, 750 kbit/s up, and the processor slowed four times. Google's
fonts, before, came from a stand-in on a second address so the page made the
same requests it makes for real. The front door, a first visit with nothing
cached, and a second visit with the service worker off (so the browser's own
cache is what is measured). Three runs each, the middle one; the whole
measurement was done twice, and both results are shown where they differed.

| | Before (0.20.2) | After (0.21.0) |
|---|---:|---:|
| First visit: something on screen (first paint) | 1.56 to 1.62 s | **1.46 to 1.50 s** |
| First visit: the main text drawn in its font (largest paint) | 2.22 to 2.24 s | 2.22 to 2.23 s |
| First visit: downloaded | 244 to 276 KB | 250 KB |
| Second visit: first paint | 0.98 to 1.01 s | **0.44 to 0.50 s** |
| Second visit: downloaded | 33 KB (about twenty "has this changed?" round trips) | **1.5 KB** |
| The first file every phone downloads (`index-*.js`) | 337 KB (84 KB compressed) | **236 KB (79 KB)** |
| Requests to another company before the first paint | 1 (Google's font stylesheet) | **0** |

Every screen compared before and after (the front door, a child's home, the
arcade, in the demo) was identical pixel for pixel.

**What changed, biggest first:**

1. **Files in `assets/` are kept for a year** (`Cache-Control: public,
   max-age=31536000, immutable` in `public/_headers` and `vercel.json`). Each
   has its contents' fingerprint in its name, so a name never means two
   files. Before, both hosts said "ask again every time", so every visit
   without the service worker asked about each file again. The page and
   `sw.js` are still never cached, so a new version is always found.
2. **The typefaces are RankUp's own files** (`src/styles/fonts.css`, from the
   `@fontsource-variable` packages, which copy Google's). Google's stylesheet
   sat in the page's head: nothing could be drawn until a second company's
   server answered, a network that blocks Google showed a blank page until
   the browser gave up, the fonts never opened offline, and every child's
   phone told Google it had opened RankUp. Same fonts, same weights (Inter 400
   to 800, Outfit 500 to 900, JetBrains Mono 400, 600, 700), one file per
   alphabet, and a phone downloads only the alphabets on its screen. The
   service worker fetches ahead only the basic Latin ones.
3. **No picture is written into the code.** Vite copies any picture under 4 KB
   into the JavaScript, and `src/data/art.js` finds every picture in
   `src/assets/art` at once, so all sixty-odd avatars, arcade tiles, banners
   and icons were in the first file: a third of it, for screens most visits
   never open. Now each is a file of its own (`inlineAsset` in
   `vite.config.js`), fetched when shown, and the arcade's tiles and the theme
   picker's portraits wait until they scroll into view (`loading="lazy"`).

**Looked at and left alone:**

- **Block Craft's avatar pictures** (`src/assets/art/avatar-blockcraft-*.jpg`)
  are 13 to 21 KB each, already carry no hidden data (no EXIF, no colour
  profile, Huffman tables already optimised), and only the one for a child's
  current form is ever loaded. Converting them would change how they look,
  which is not allowed; lossless squeezing saves a few hundred bytes each.
- **The largest paint** waits for the main font to arrive (it swaps in when
  it does, so text is never invisible). Telling the browser to fetch the font
  first ("preload") was tried: it made the first paint 0.44 s slower, because
  on a slow line the font then competes with the app's own code.
- **Splitting the code further.** Every screen, game and the legal text are
  already their own files, fetched when opened (`src/lib/lazy.js`); React is a
  file of its own that phones keep across versions. What is left in the
  first file (the state, the themes, the background, the sync engine) is what
  every screen needs.
- **Compression** is done by the host (Cloudflare and Vercel both compress
  text files on the way out); nothing to set.

`tests/speed.mjs` (static) and `tests/bundle.mjs` (in a real build) hold all
of this: the first file must stay under 260 KB (82 KB compressed), with no
picture and no third-party stylesheet in the page.

**0.27.0.** The level-up and streak moments (`components/LevelUpOverlay.jsx`)
left the first file: they are fetched the first time one is due, which made
about 1.3 KB of compressed room. The computer layouts added in 0.27.0 are a
stylesheet of their own (`src/styles/desk.css`, under 1 KB compressed),
fetched with the front door, the parent dashboard and the children's
screens, and never part of the first file (`tests/fixes27.mjs`). Built
without `.env.local`, as CI builds it, the first file went from 82,391 to
about 81,100 bytes compressed (the budget in `tests/bundle.mjs` is 82,422).

### Measure it again

The script used is not part of the app (it needs a stand-in for Google's
fonts only for the "before"), but the method is simple to repeat: build
(`npx vite build --outDir /tmp/rankup-perf`), serve the folder compressed with
the headers from `_headers`, and open it in Chromium with DevTools' network
throttling at "Slow 4G" and CPU at 4×. Read First Contentful Paint and Largest
Contentful Paint from the Performance panel. For frame rate on a busy screen,
`tests/perf.mjs` is in the repository.

## The database's slow spots

Measured on the load test's seed (`node tools/loadtest.mjs --setup`, 1,000
families with three months of history, 300,000 chores) with 50,000 more
families added, each with a parent, a child, four pocket-money entries and a
few crash reports: 51,000 families in all. Timed with `EXPLAIN ANALYZE`, once,
on a 4-core machine.

| What | Before | After | Why |
|---|---:|---:|---|
| The adult list in Settings (`family_adults`) | **492 ms** | **1 ms** | It read every parent of every family, asking "is this my family?" of each. Index `parents_family_idx` |
| One batch of the weekly digest (`claim_due_digests_at`, Sunday evening) | **6.9 s** | **1.5 s** | It worked out every quiet family's whole week (a dozen counts each) before finding it had nothing to say. Quiet families are now skipped with one look at an index. A request this long risks being stopped by Supabase's time limit for one statement, and then no digest goes out at all |
| A family deleted (account deletion, retention) | 95 ms | 74 ms | Finding its parents and its pocket-money entries read both whole tables. Indexes `parents_family_idx`, `allowance_entries_family_idx` |
| A reward taken off the list | 4.6 ms | 0.8 ms | Its purchases are kept with the reward taken off them, which read every purchase. Index `redemptions_reward_idx` |

A phone's sync, purchases, "I did it!" and accepts were already using an index
made for each (`supabase/test/36-hot-queries.sql`); at 51,000 families a pull
still costs the database under 1 ms.

`supabase/test/18-upgrade.sql` checks the three indexes exist after the files
are run twice; `34-scheduled-jobs.sql` counts that the digest works out a week
only for families it sends one to; `36-hot-queries.sql` checks the adult list
uses its index.

**Left alone, on purpose:**

- **Deleting an adult** still reads `submissions`, `quests` and the
  pocket-money ledger whole, to clear the "decided by" and "added by" marks
  that adult left (most of the 74 ms above). It happens only when an adult is
  removed or an account deleted; an index on each would slow down every
  accept and every new chore, which happen all day, to speed up something
  rare.
- **The leaderboard job** took 4.8 s at 51,000 families with every second
  child in Arena (it reads every accepted chore every ten minutes). That is
  inside Supabase's limit; [LOAD-TEST.md](LOAD-TEST.md) says where to start
  when it is not (a per-child, per-day table).
- **The weekly digest at a few hundred thousand families.** Each batch still
  looks at every family due that hour, about 30 microseconds each. Past about
  250,000 families in one time zone, the next step is an index on accepted
  chores by date, so a batch starts from the families that did something.

### Measure it again

```bash
supabase/test/up.sh                          # or any Postgres 16 with every file applied
node tools/loadtest.mjs --setup              # the seed
node tools/loadtest.mjs --jobs               # each scheduled job's query, timed once
```

`--jobs` now times `claim_due_digests` (one batch, what `/api/send-digests`
calls) as well as the older all-at-once `due_digests`.
