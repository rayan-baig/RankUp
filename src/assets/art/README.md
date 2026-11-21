# Artwork goes here

Drop image files straight into this folder. Nothing else needs changing —
the app picks up any file it finds and uses it automatically. A file here
always wins over RankUp's own drawing for the same slot, which lives in
`src/assets/drawn/` (an original picture for each world, a tile for each
arcade game, and the skyline behind the tab banners). So a picture from an
image generator replaces the drawn one just by being dropped in here under
the same name, e.g. `avatar-pegasus.png` replaces the drawn winged horse.

Block Craft's pictures (`avatar-blockcraft-*.jpg`) are the owner's own and
have no drawn stand-in.

Accepted: `.png` `.jpg` `.jpeg` `.webp` `.avif` `.svg`
Name the file after the slot. Case and spaces do not matter.

## A world's picture (the theme picker card and the first avatar form)

    avatar-<theme>.png     e.g. avatar-pegasus.png, avatar-campfire.webp

Square, the character in the middle: the avatar shows it in a circle.

## Banners across the top of each tab

    hero-home.png
    hero-quests.png
    hero-arcade.png
    hero-rewards.png
    hero-you.png

Wide and short works best — roughly 3:1. They are cropped to fill, so keep
anything important away from the edges. Without one, a dark world shows the
drawn skyline in its own colours and a light world its own lit gradient.

## Arcade tiles

One per game, square:

    game-sports.png      game-tennis.png      game-turbo.png
    game-blocks.png      game-sweets.png      game-impostor.png
    game-track.png       game-wildfire.png    game-gofish.png
    game-snake.png       game-merge.png       game-bricks.png
    game-sweeper.png     game-sky.png         game-four.png
    game-slide.png       game-chain.png       game-lights.png
    game-catch.png       game-stack.png       game-memory.png

The full list of ids is in `src/data/minigames.js`.

## Avatars

`avatar-<theme>-<level>`, one per form, at the levels the theme's `tiers`
list in `src/data/kidThemes.js` gives (five forms at 1, 10, 25, 50 and 100
unless a theme says otherwise):

    avatar-blockcraft-1.jpg
    avatar-blockcraft-10.jpg
    ...
    avatar-blockcraft-399.jpg

Theme ids are in `src/data/kidThemes.js`: matrixblocks, blockcraft,
tactical, apex, aura, coquette, poparena, pegasus, sugarrush, glam,
campfire, cybergrid, plumber, neonpulse, monstertamer.

## Interface icons

    icon-xp.png   icon-crown.png   icon-heart.png   icon-gem.png

## Keep the files small

These ship inside the app, and families download it over a phone
connection. Aim under 150 KB each; a hero banner 1600px wide and a tile
400px square is plenty.
