# MTRX Horizon

The page published at https://claude.ai/artifact/87BocytnDhYC266rVJqWQh,
kept here so it is in version control rather than only in an artifact.

The two screens are supplied artwork, full-bleed and untouched, with
hit areas in percentages laid over them — which is why the hotspots
stay on their targets at any width. The artwork files themselves are
not in this repo; they live with the artifact.

## Replacing a logo inside a flat image

The artwork has the old mark baked into it in three places per screen,
so the new one cannot be swapped in — it can only be covered. Three
things make that invisible rather than obvious:

- The mark is round, and it is the tight crop of the logo where the
  sphere fills the frame. A circle has no corners to mismatch, and the
  tight crop keeps the M as large as the pixels allow.
- On the near-black headers, a flat patch in the colour sampled beside
  the old mark is enough.
- On the cards it is not: those carry a gradient both down and across,
  so any single colour reads as a dark or pale square. `patch-home.png`
  and `patch-con.png` are generated from the artwork's own pixels —
  a clean column of real background either side of the mark, row by
  row, ramped between. The patch IS the card, minus the old logo.

It is served at 512px into slots of 36-72px, so it only ever scales
down, and nothing filters it.
