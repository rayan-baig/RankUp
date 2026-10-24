#!/usr/bin/env python3
"""
Cut a multi-screen mockup sheet into one image per tab.

The designs arrive as a single sheet with five phone screens laid out on
it. This finds those screens and writes each one out on its own, named
for the tab it belongs to, straight into src/assets/art/ where the app
picks them up with no code change.

Finding them rather than being told where they are: the panels sit on a
dark background with a lit border, and hand-typed crop boxes go stale the
moment the sheet is regenerated at a different size or with the panels in
a different order. So this scans for the bright rectangles instead, which
survives the sheet being redrawn.

    python3 scripts/slice-sheet.py <sheet.png> [--order home quests arcade rewards you]
    python3 scripts/slice-sheet.py <sheet.png> --dry-run     # just report what it found

Order is left-to-right, top-to-bottom, and defaults to the order the
design sheet uses.
"""
import sys
import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is needed: python3 -m pip install Pillow")

DEFAULT_ORDER = ["home", "quests", "arcade", "rewards", "you"]
OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "assets" / "art"

# A panel has to be a decent fraction of the sheet to be a screen rather
# than a card inside one.
MIN_W_FRAC = 0.18
MIN_H_FRAC = 0.22


def brightness_map(im, step):
    """Rows and columns that carry lit pixels, sampled coarsely for speed."""
    px = im.load()
    w, h = im.size
    cols, rows = [], []
    for x in range(0, w, step):
        lit = sum(1 for y in range(0, h, step) if sum(px[x, y]) > 150)
        cols.append((x, lit))
    for y in range(0, h, step):
        lit = sum(1 for x in range(0, w, step) if sum(px[x, y]) > 150)
        rows.append((y, lit))
    return cols, rows


def bands(samples, total, min_frac):
    """Runs of consecutive lit samples, as (start, end) pixel pairs."""
    threshold = max(2, int(0.06 * max(n for _, n in samples)))
    out, start = [], None
    for pos, lit in samples:
        if lit > threshold and start is None:
            start = pos
        elif lit <= threshold and start is not None:
            if pos - start >= min_frac * total:
                out.append((start, pos))
            start = None
    if start is not None and total - start >= min_frac * total:
        out.append((start, total))
    return out


def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        sys.exit(__doc__)
    dry = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]
    sheet = args[0]
    order = DEFAULT_ORDER
    if "--order" in args:
        order = args[args.index("--order") + 1:]

    im = Image.open(sheet).convert("RGB")
    w, h = im.size
    step = max(2, min(w, h) // 400)
    cols, rows = brightness_map(im, step)

    col_bands = bands(cols, w, MIN_W_FRAC)
    row_bands = bands(rows, h, MIN_H_FRAC)
    print(f"sheet {w}x{h}: {len(col_bands)} columns, {len(row_bands)} rows of panels")

    panels = []
    for (top, bottom) in row_bands:
        for (left, right) in col_bands:
            # A column band only counts in this row if that patch is lit.
            patch = im.crop((left, top, right, bottom))
            small = patch.resize((24, 24)).load()
            lit = sum(1 for yy in range(24) for xx in range(24) if sum(small[xx, yy]) > 150)
            if lit > 40:
                panels.append((left, top, right, bottom))

    print(f"found {len(panels)} panels; naming them {', '.join(order)}")
    if len(panels) != len(order):
        print("  (count does not match the names — pass --order with one name per panel,")
        print("   left to right then top to bottom, or re-run with --dry-run to look)")

    for i, box in enumerate(panels):
        name = order[i] if i < len(order) else f"panel{i + 1}"
        print(f"  {name}: {box[0]},{box[1]} to {box[2]},{box[3]}  ({box[2]-box[0]}x{box[3]-box[1]})")
        if dry:
            continue
        piece = im.crop(box)
        # Wide enough to stay sharp on a phone at two or three times scale.
        if piece.width > 1200:
            piece = piece.resize((1200, round(piece.height * 1200 / piece.width)), Image.LANCZOS)
        os.makedirs(OUT_DIR, exist_ok=True)
        out = OUT_DIR / f"screen-{name}.png"
        piece.save(out, optimize=True)
        print(f"    written {out}")

    if not dry:
        print("\nDone. The app reads src/assets/art/ automatically — nothing else to change.")


if __name__ == "__main__":
    main()
