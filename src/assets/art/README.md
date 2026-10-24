# Artwork goes here

Drop image files straight into this folder. Nothing else needs changing —
the app picks up any file it finds and uses it automatically. A slot with
no file falls back to the drawn-in-code version, so the app always looks
finished even when only some of the art has arrived.

Accepted: `.png` `.jpg` `.jpeg` `.webp` `.avif` `.svg`
Name the file after the slot. Case and spaces do not matter.

## Banners across the top of each tab

    hero-home.png
    hero-quests.png
    hero-arcade.png
    hero-rewards.png
    hero-you.png

Wide and short works best — roughly 3:1. They are cropped to fill, so keep
anything important away from the edges.

## Arcade tiles

One per game, square:

    game-sports.png      game-tennis.png      game-turbo.png
    game-blocks.png      game-sweets.png      game-impostor.png
    game-track.png       game-wildfire.png    game-royal.png
    game-snake.png       game-merge.png       game-bricks.png
    game-sweeper.png     game-sky.png         game-four.png
    game-slide.png       game-chain.png       game-lights.png
    game-catch.png       game-stack.png       game-memory.png

The full list of ids is in `src/data/minigames.js`.

## Avatars

`avatar-<theme>-<level>`, one per milestone:

    avatar-blockcraft-1.png
    avatar-blockcraft-51.png
    avatar-blockcraft-101.png
    avatar-blockcraft-200.png
    avatar-blockcraft-300.png

Theme ids are in `src/data/kidThemes.js`: matrixblocks, blockcraft,
tactical, apex, aura, coquette, poparena, pegasus, sugarrush, glam,
campfire, cybergrid, plumber, neonpulse, monstertamer.

## Interface icons

    icon-xp.png   icon-crown.png   icon-heart.png   icon-gem.png

## Keep the files small

These ship inside the app, and families download it over a phone
connection. Aim under 150 KB each; a hero banner 1600px wide and a tile
400px square is plenty.
