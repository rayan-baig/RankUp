/**
 * The 15 kid themes.
 *
 * Every theme controls three things and nothing else:
 *   1. an animated background scene (rendered by src/components/ThemeBackground.jsx)
 *   2. the name + icon of the in-app currency
 *   3. the 5-tier avatar that visually evolves as the kid levels up
 *
 * Cards, buttons, spacing and font sizes stay identical across all themes so the
 * app feels like one product. Colours are handed to CSS as custom properties by
 * src/lib/applyTheme.js.
 */

const FONT_DISPLAY = 'Outfit'
const FONT_BODY = 'Inter'
const FONT_MONO = 'JetBrains Mono'

/** Shared defaults so each theme below only lists what makes it different. */
const base = {
  mode: 'dark',
  fonts: { display: FONT_DISPLAY, body: FONT_BODY, mono: FONT_BODY },
  radius: '18px',
  shadow: '0 10px 30px -12px rgb(0 0 0 / 0.55)',
  good: '#1baf7a',
  warn: '#eda100',
  bad: '#e34948',
}

export const KID_THEMES = [
  {
    id: 'matrixblocks',
    story: 'The Stack never stops falling. Every chore you clear is a line cleared — and the well goes deeper than anyone has been.',
    name: 'MatrixBlocks',
    inspiredBy: 'Tetris style',
    blurb: 'Midnight blue fields and glowing cyber tetrominoes.',
    currency: { name: 'Matrix Clears', icon: '🧱' },
    scene: 'tetrominoes',
    ...base,
    fonts: { display: FONT_MONO, body: FONT_MONO, mono: FONT_MONO },
    radius: '4px',
    colors: {
      bg: '#070c22', surface: '#101a3d', surface2: '#16234f', line: '#2b3f7d',
      ink: '#e8f0ff', inkMuted: '#93a7d8', accent: '#3fe0ff', accent2: '#b46bff',
    },
    avatar: { motif: 'block', hues: ['#3fe0ff', '#5ad1ff', '#8ab4ff', '#b46bff', '#ff7ae0'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Deep Stack',
        story: 'The well is deeper than it looked. Clear lines you cannot see the top of.',
        sky: 'stars',
        colors: {
          bg: '#07112b', surface: '#12255a', surface2: '#1b3480', line: '#2b4bb3',
          ink: '#e8f0ff', inkMuted: '#93a7d8', accent: '#3fe0ff', accent2: '#7aa2ff',
        },
      },
      {
        level: 25,
        label: 'Overclock',
        story: 'Drop speed doubles. So does what a cleared line is worth.',
        sky: 'comet',
        colors: {
          bg: '#120a2e', surface: '#231455', surface2: '#2f1c75', line: '#4a2da8',
          ink: '#f0eaff', inkMuted: '#a79bd8', accent: '#b46bff', accent2: '#5ad8ff',
        },
      },
      {
        level: 50,
        label: 'Hard Drop',
        story: 'No more waiting for the piece to land. Slam it and move.',
        sky: 'eclipse',
        colors: {
          bg: '#2a0828', surface: '#4a1148', surface2: '#631a60', line: '#8c2585',
          ink: '#ffeafb', inkMuted: '#d49bcd', accent: '#ff5ce1', accent2: '#ffb84d',
        },
      },
      {
        level: 100,
        label: 'Kill Screen',
        story: 'Past the last level the game was built for. Nobody has seen this board before you.',
        sky: 'rings',
        colors: {
          bg: '#050505', surface: '#121212', surface2: '#1c1c1c', line: '#3a3a3a',
          ink: '#ffffff', inkMuted: '#9a9a9a', accent: '#00ff88', accent2: '#ff2d6f',
        },
      },
    ],
  },
  {
    id: 'blockcraft',
    story: 'Raiders hit your village every night, and you are sick and tired of it. Pick up a pickaxe, get strong, and fight back. Help save your village.',
    /*
     * Block Craft is told as chapters, each one a short battle scene
     * (src/lib/battleEngine.js). `storyStart` is the first, there from
     * level 1 and told by `story` above; every world below names its own.
     */
    storyStart: { chapter: 'raid', label: 'Raid Night' },
    name: 'Block Craft',
    inspiredBy: 'Minecraft style',
    blurb: 'Pixelated soil panels and blocky voxel borders.',
    currency: { name: 'Emeralds', icon: '💎' },
    scene: 'voxel',
    ...base,
    radius: '0px',
    shadow: '4px 4px 0 0 rgb(0 0 0 / 0.45)',
    /*
     * The Overworld: a deep evening sky with grass and water in it. This
     * was brown soil under a brown sky, which is how a voxel theme ends
     * up looking like mud rather than like standing outside at dusk. The
     * ground strata still read as earth because the scene draws those
     * from `surface`; what changed is that the sky is now sky.
     */
    colors: {
      bg: '#081425', surface: '#123050', surface2: '#1b4570', line: '#2f6b9e',
      ink: '#eaf4ff', inkMuted: '#9fc3e2', accent: '#5ad85a', accent2: '#58c7ff',
    },
    /*
     * Block Craft is the one theme with nine forms instead of five.
     *
     * Its later levels are a story rather than a recolour — the portal
     * opens, then the Nether, then the End, then the dragon — and a
     * five-rung ladder would stop that story halfway. Everything that
     * shows a form number reads this list rather than assuming five, so a
     * child here is told "form 6 of 9" and nobody on another theme is
     * measured against it.
     *
     * One hue per rung, in the order the story goes: overworld greens,
     * then diamond, then the Nether reds, the End purples, and the dragon.
     */
    tiers: [1, 10, 25, 50, 100, 125, 175, 250, 399],
    avatar: {
      motif: 'block',
      hues: [
        '#8bd450', '#c9d1d9', '#f5c542', '#26d0c8', '#7ef0ff',
        '#ff5c4d', '#b4202a', '#b06bff', '#6b21a8',
      ],
    },
    /**
     * Every theme now has level-gated worlds; each entry overrides the
     * colours, sky and (here) scene from that level upward. Block Craft's
     * are the deepest, because it has nine forms rather than five and the
     * Nether and the End are drawings of their own.
     */
    /*
     * The worlds, on the levels the story uses.
     *
     * These were at 51, 101, 200 and 300 — numbers from before the nine
     * forms existed — so the world changed in the gaps between forms
     * instead of at them. Now each new world arrives exactly when the
     * avatar does: the portal at 125, deeper in at 175, the End at 250,
     * the dragon at 399.
     *
     * The old "Pale Cream" world is gone. A cream Minecraft is not part
     * of this story, and being the only light theme in the set it also
     * put dark night artwork behind dark-on-light text.
     */
    evolutions: [
      {
        level: 125,
        label: 'The Nether Portal',
        story: "You followed the raiders' tracks to a portal of obsidian, still warm. This is where they come from.",
        chapter: 'portal',
        // Arriving here tears the screen for a moment: something is open that should not be.
        glitchIntro: true,
        scene: 'voxel-volcanic',
        companion: 'boarling',
        colors: {
          bg: '#1b0605', surface: '#3f120c', surface2: '#5c1a12', line: '#8f2e1d',
          ink: '#ffe9e2', inkMuted: '#d79d8f', accent: '#ff6a3d', accent2: '#ffb302',
        },
      },
      {
        level: 175,
        label: 'Nether Rise',
        story: 'Their land. The air burns, and every raid on your village started here.',
        chapter: 'rise',
        scene: 'voxel-nether',
        companion: 'boarling',
        colors: {
          bg: '#170305', surface: '#3d0a12', surface2: '#57101c', line: '#8d1f32',
          ink: '#ffe4e9', inkMuted: '#d2919f', accent: '#ff3b5c', accent2: '#ff9f43',
        },
      },
      {
        level: 250,
        label: 'The End',
        story: 'The raiders were never in charge. Something sent them, from a quiet island at the end of everything.',
        chapter: 'end',
        glitchIntro: true,
        scene: 'voxel-end',
        companion: 'ender',
        colors: {
          bg: '#0a0713', surface: '#1d1533', surface2: '#2b1f4d', line: '#4a3880',
          ink: '#f0e8ff', inkMuted: '#b3a4d6', accent: '#d6b4ff', accent2: '#7ef0ff',
        },
      },
      {
        level: 399,
        label: 'The Dragon',
        story: 'It sent the raiders the whole time. Now it has seen you. Every chore you finish is a hit.',
        chapter: 'dragon',
        scene: 'voxel-end',
        companion: 'ender',
        colors: {
          bg: '#0d0418', surface: '#2a0c3d', surface2: '#3d1157', line: '#6a1f96',
          ink: '#fbe9ff', inkMuted: '#c79add', accent: '#e879f9', accent2: '#a855f7',
        },
      },
      /*
       * The ending. Not reached by level: it opens the moment the dragon's
       * health reaches zero (src/lib/dragonFight.js), which is why it sits
       * on the same level as the dragon and carries `requires`.
       *
       * Back to the Overworld scene, at dawn. Still a dark palette, because
       * Block Craft is a dark theme at every stage.
       */
      {
        level: 399,
        requires: 'dragonDefeated',
        label: "Hero's Return",
        story: 'The dragon is down and the raids are over. You walk back through the portal, and your whole village is waiting to cheer you home.',
        chapter: 'home',
        scene: 'voxel',
        companion: 'ender',
        colors: {
          bg: '#1a1033', surface: '#2e1f4f', surface2: '#3d2a66', line: '#6b4fa0',
          ink: '#fff4e6', inkMuted: '#e0c9b0', accent: '#ffc94a', accent2: '#ff9a6b',
        },
      },
    ],
  },
  {
    id: 'tactical',
    story: 'You run point. The breach, the timing and the call are all yours.',
    name: 'Tactical Override',
    inspiredBy: 'R6 style',
    blurb: 'Matte grey panels with a sharp neon-orange tactical HUD.',
    currency: { name: 'Renown', icon: '🪙' },
    scene: 'hud',
    ...base,
    radius: '2px',
    fonts: { display: FONT_MONO, body: FONT_BODY, mono: FONT_MONO },
    colors: {
      bg: '#141618', surface: '#1e2225', surface2: '#282d31', line: '#3d4449',
      ink: '#eceff1', inkMuted: '#98a3ab', accent: '#ff7a18', accent2: '#5fd0ff',
    },
    avatar: { motif: 'visor', hues: ['#8b959b', '#ff7a18', '#ffa34d', '#5fd0ff', '#ffffff'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Night Op',
        story: 'Lights out, thermals on. Nobody hears you go in.',
        sky: 'moon',
        colors: {
          bg: '#060a0d', surface: '#10181f', surface2: '#182630', line: '#2b4150',
          ink: '#e6f1f7', inkMuted: '#92a8b6', accent: '#ff7a18', accent2: '#5fd0ff',
        },
      },
      {
        level: 25,
        label: 'Sandstorm',
        story: 'Visibility twelve metres. The team moves on your voice alone.',
        sky: 'storm',
        colors: {
          bg: '#1a1205', surface: '#33250b', surface2: '#47340f', line: '#6b4f1a',
          ink: '#fff3dd', inkMuted: '#c7ad83', accent: '#ffb020', accent2: '#7fd4ff',
        },
      },
      {
        level: 50,
        label: 'Blackout',
        story: 'Comms down, grid dark. Finish it without orders.',
        sky: 'stars',
        colors: {
          bg: '#05070a', surface: '#0d1116', surface2: '#141a21', line: '#232d38',
          ink: '#dfe8f0', inkMuted: '#7f8d9b', accent: '#39ff88', accent2: '#ff4d4d',
        },
      },
      {
        level: 100,
        label: 'Orbital',
        story: 'Overwatch from above. You can see the whole board now.',
        sky: 'rings',
        colors: {
          bg: '#04060f', surface: '#0c1227', surface2: '#131c3b', line: '#22305e',
          ink: '#e8ecff', inkMuted: '#8e99c4', accent: '#7cc4ff', accent2: '#ffffff',
        },
      },
    ],
  },
  {
    id: 'apex',
    story: 'A hundred drop in. You plan on walking out.',
    name: 'Apex Royale',
    inspiredBy: 'Fortnite style',
    blurb: 'Slanted high-contrast grids and bright battle-pass tracks.',
    currency: { name: 'V-Coins', icon: '🪙' },
    scene: 'slant',
    ...base,
    radius: '10px',
    colors: {
      bg: '#120b2e', surface: '#1e1350', surface2: '#2a1a69', line: '#4a2fa8',
      ink: '#f4f0ff', inkMuted: '#b2a2e6', accent: '#00e5ff', accent2: '#ffd400',
    },
    avatar: { motif: 'chevron', hues: ['#8b7bd8', '#00e5ff', '#ffd400', '#ff5ea8', '#7CFFB2'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Storm Front',
        story: 'The wall is moving. Everything you need is inside the next circle.',
        sky: 'storm',
        colors: {
          bg: '#0a1322', surface: '#152743', surface2: '#1d375f', line: '#2f5490',
          ink: '#eaf2ff', inkMuted: '#97b0d4', accent: '#48b4ff', accent2: '#ffd166',
        },
      },
      {
        level: 25,
        label: 'Final Ring',
        story: 'Twelve left, and the ring is the size of a rooftop.',
        sky: 'dusk',
        colors: {
          bg: '#2a1206', surface: '#4a2109', surface2: '#63300f', line: '#8f4a18',
          ink: '#fff0e2', inkMuted: '#d3ab8a', accent: '#ff8c42', accent2: '#ffd166',
        },
      },
      {
        level: 50,
        label: 'Last Stand',
        story: 'Squad down. It is you and whatever you are still carrying.',
        sky: 'eclipse',
        colors: {
          bg: '#2b0712', surface: '#4d0f22', surface2: '#67152f', line: '#94224a',
          ink: '#ffe8ef', inkMuted: '#d094a7', accent: '#ff2e63', accent2: '#ffd166',
        },
      },
      {
        level: 100,
        label: 'Champion',
        story: 'The ring closed on you standing up. The crown is yours.',
        sky: 'sun',
        colors: {
          bg: '#1a1403', surface: '#3a2e07', surface2: '#51400b', line: '#7a6213',
          ink: '#fff8df', inkMuted: '#cfbe84', accent: '#ffd700', accent2: '#fff1a8',
        },
      },
    ],
  },
  {
    id: 'aura',
    story: 'The power was always in you. It is just extremely rude about waking up.',
    name: 'Aura Awakening',
    inspiredBy: 'Anime style',
    blurb: 'Manga framing with explosive golden energy meters.',
    currency: { name: 'Power Levels', icon: '💥' },
    scene: 'aura',
    ...base,
    radius: '14px',
    colors: {
      bg: '#12080f', surface: '#241221', surface2: '#33192e', line: '#5c2a4f',
      ink: '#fff4e8', inkMuted: '#d0a9bd', accent: '#ffc22e', accent2: '#ff4d6d',
    },
    avatar: { motif: 'flame', hues: ['#ff4d6d', '#ff8a3d', '#ffc22e', '#fff07a', '#ffffff'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Awakening',
        story: 'It surfaces for the first time, and it is louder than you are.',
        sky: 'moon',
        colors: {
          bg: '#0b0f2b', surface: '#17205a', surface2: '#1f2b78', line: '#32429f',
          ink: '#eaeeff', inkMuted: '#9aa5d8', accent: '#6c7bff', accent2: '#53e0ff',
        },
      },
      {
        level: 25,
        label: 'Surge',
        story: 'You stop holding it back and the ground gives way.',
        sky: 'sun',
        colors: {
          bg: '#2b1003', surface: '#4e1f06', surface2: '#692b0a', line: '#9a4211',
          ink: '#fff0e4', inkMuted: '#d4a98b', accent: '#ff7a1a', accent2: '#ffd84d',
        },
      },
      {
        level: 50,
        label: 'Ascended',
        story: 'Hair, eyes and sky all change colour at once. You barely notice.',
        sky: 'comet',
        colors: {
          bg: '#120031', surface: '#260a5c', surface2: '#34117c', line: '#4e1cb0',
          ink: '#f3eaff', inkMuted: '#b39ddb', accent: '#b469ff', accent2: '#5ce1ff',
        },
      },
      {
        level: 100,
        label: 'Limit Break',
        story: 'The ceiling everyone swore existed turns out to have been a rumour.',
        sky: 'eclipse',
        colors: {
          bg: '#2d0010', surface: '#520021', surface2: '#6e002d', line: '#9c0040',
          ink: '#ffe6ef', inkMuted: '#d98fae', accent: '#ff0055', accent2: '#ffd700',
        },
      },
    ],
  },
  {
    id: 'coquette',
    story: 'A tiny pastel kingdom runs on good manners and better ribbons, and it has decided you are its new favourite.',
    name: 'Coquette Circuit',
    inspiredBy: 'Sanrio style',
    blurb: 'Soft pastel pink fields with retro pixel bows and stars.',
    currency: { name: 'Pink Crystals', icon: '💎' },
    scene: 'bows',
    ...base,
    mode: 'light',
    radius: '22px',
    shadow: '0 10px 24px -12px rgb(214 108 160 / 0.55)',
    colors: {
      bg: '#fff1f6', surface: '#ffffff', surface2: '#ffe4ef', line: '#f3c2d8',
      ink: '#4a2338', inkMuted: '#96637e', accent: '#e0518f', accent2: '#8f6ce0',
    },
    avatar: { motif: 'bow', hues: ['#f7b5cf', '#f38bb4', '#e0518f', '#c33b8e', '#8f6ce0'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Powder Room',
        story: "Mirrors, ribbon drawers, and a kingdom's worth of bows waiting to be tied.",
        sky: 'sun',
        colors: {
          bg: '#fff2f8', surface: '#ffffff', surface2: '#ffe3f0', line: '#f2b9d4',
          ink: '#4a2338', inkMuted: '#8a5d74', accent: '#e0518f', accent2: '#8f6ce0',
        },
      },
      {
        level: 25,
        label: 'Ribbon Lace',
        story: 'Lace that writes itself. Every tidy thing you do adds another stitch.',
        sky: 'stars',
        colors: {
          bg: '#f8f0ff', surface: '#ffffff', surface2: '#efe2ff', line: '#d6bcf5',
          ink: '#3c2850', inkMuted: '#75628f', accent: '#9055e0', accent2: '#e0518f',
        },
      },
      {
        level: 50,
        label: 'Moonlit Bow',
        story: 'The kingdom at night is all silver, and every bow glows.',
        sky: 'moon',
        colors: {
          bg: '#eef1ff', surface: '#ffffff', surface2: '#e0e6ff', line: '#b9c4f2',
          ink: '#262f52', inkMuted: '#616b94', accent: '#4a5fd6', accent2: '#e0518f',
        },
      },
      {
        level: 100,
        label: 'Crown Jewel',
        story: 'A crown made of ribbon, which is heavier than it sounds.',
        sky: 'rings',
        colors: {
          bg: '#fff6ea', surface: '#ffffff', surface2: '#ffecd2', line: '#f0cf9e',
          ink: '#4a3418', inkMuted: '#8a7150', accent: '#c08800', accent2: '#e0518f',
        },
      },
    ],
  },
  {
    id: 'poparena',
    story: 'One stage, one crowd, and a set list you have to earn song by song.',
    name: 'Pop Arena',
    inspiredBy: 'Taylor Swift style',
    blurb: 'Dark stadium fields lit by neon-purple stage rigs.',
    currency: { name: 'VIP Tickets', icon: '🎟️' },
    scene: 'stage',
    ...base,
    radius: '16px',
    colors: {
      bg: '#0d0518', surface: '#1c0e35', surface2: '#2a1550', line: '#4d2a86',
      ink: '#f6efff', inkMuted: '#b39ddb', accent: '#c04bff', accent2: '#4ce0d3',
    },
    avatar: { motif: 'star', hues: ['#b39ddb', '#c04bff', '#ff7ad9', '#4ce0d3', '#ffe27a'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Soundcheck',
        story: 'Empty room, one spotlight, and a song nobody has heard yet.',
        sky: 'stars',
        colors: {
          bg: '#140a2e', surface: '#251456', surface2: '#331d76', line: '#4e2ba6',
          ink: '#f1eaff', inkMuted: '#a99bd4', accent: '#ff4fd8', accent2: '#4fd8ff',
        },
      },
      {
        level: 25,
        label: 'Main Stage',
        story: 'Doors open. The front row already knows the words.',
        sky: 'eclipse',
        colors: {
          bg: '#2b0533', surface: '#4b0a57', surface2: '#640e74', line: '#8f17a4',
          ink: '#ffeaff', inkMuted: '#cf99d8', accent: '#ff2fb4', accent2: '#ffd84d',
        },
      },
      {
        level: 50,
        label: 'Encore',
        story: 'They will not leave. You did not plan a fourth song.',
        sky: 'moon',
        colors: {
          bg: '#05202b', surface: '#0a3a4b', surface2: '#0e4e65', line: '#157291',
          ink: '#e8fbff', inkMuted: '#90c3d4', accent: '#2fe0ff', accent2: '#ff6fc8',
        },
      },
      {
        level: 100,
        label: 'Stadium',
        story: 'Seventy thousand phone lights, all pointed the same way.',
        sky: 'sun',
        colors: {
          bg: '#1c1403', surface: '#3d2d07', surface2: '#54400b', line: '#7d6113',
          ink: '#fff8e0', inkMuted: '#cdbc83', accent: '#ffd43b', accent2: '#ff5fa8',
        },
      },
    ],
  },
  {
    id: 'pegasus',
    story: 'You have wings and no idea how far they go. Time to find out.',
    name: 'Pegasus Horizon',
    inspiredBy: 'My Little Pony style',
    blurb: 'Lavender and sky-blue gradients trailing sparkling star dust.',
    currency: { name: 'Star Shards', icon: '✨' },
    scene: 'stardust',
    ...base,
    mode: 'light',
    radius: '24px',
    shadow: '0 12px 26px -14px rgb(124 92 214 / 0.6)',
    colors: {
      bg: '#f2ecff', surface: '#ffffff', surface2: '#e8e0ff', line: '#cfc2f5',
      ink: '#33235e', inkMuted: '#7a6aa8', accent: '#7c5cd6', accent2: '#1b9ae4',
    },
    avatar: { motif: 'wing', hues: ['#c9b8f5', '#a98cf0', '#7c5cd6', '#1b9ae4', '#ffd166'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'First Flight',
        story: 'The ground lets go. Everything after this is practice.',
        sky: 'sun',
        colors: {
          bg: '#eef4ff', surface: '#ffffff', surface2: '#dfe9ff', line: '#b7caf0',
          ink: '#23304a', inkMuted: '#5f6f8c', accent: '#1273ad', accent2: '#7c5cd6',
        },
      },
      {
        level: 25,
        label: 'Cloud Run',
        story: 'Weaving the cloud field at speed, which is harder than the sky makes it look.',
        sky: 'dusk',
        colors: {
          bg: '#f6effd', surface: '#ffffff', surface2: '#ebdffb', line: '#cfb8f0',
          ink: '#312348', inkMuted: '#6e5f8c', accent: '#7c5cd6', accent2: '#b06712',
        },
      },
      {
        level: 50,
        label: 'Starfall',
        story: 'Flying through falling stars, catching the ones that are still warm.',
        sky: 'stars',
        colors: {
          bg: '#eef0fb', surface: '#ffffff', surface2: '#e1e4f6', line: '#bcc2e6',
          ink: '#232842', inkMuted: '#5e6484', accent: '#4a56c8', accent2: '#d1448f',
        },
      },
      {
        level: 100,
        label: 'Constellation',
        story: 'Somebody has drawn you into the sky. You are a shape people look for now.',
        sky: 'comet',
        colors: {
          bg: '#f3f5ff', surface: '#ffffff', surface2: '#e6eaff', line: '#c2c9f2',
          ink: '#1e2342', inkMuted: '#5a608a', accent: '#3d4bd6', accent2: '#b8860b',
        },
      },
    ],
  },
  {
    id: 'sugarrush',
    story: 'Somebody has to keep the sweet kingdom running. Somebody is you.',
    name: 'Sugar Rush',
    inspiredBy: 'Baking game style',
    blurb: 'Pastel mint counters, dripping icing borders, sprinkle dividers.',
    currency: { name: 'Sugar Orbs', icon: '🔮' },
    scene: 'sprinkles',
    ...base,
    mode: 'light',
    radius: '20px',
    shadow: '0 10px 24px -12px rgb(0 0 0 / 0.25)',
    colors: {
      bg: '#e6fbf3', surface: '#ffffff', surface2: '#d5f6ea', line: '#a8e6d1',
      ink: '#2a4a41', inkMuted: '#547a6f', accent: '#ff4f9c', accent2: '#00a383',
    },
    avatar: { motif: 'cupcake', hues: ['#ffd0e3', '#ff9ec7', '#ff4f9c', '#c2529a', '#00a383'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Icing Lane',
        story: 'The first batch sets. The smell reaches the end of the street.',
        sky: 'sun',
        colors: {
          bg: '#fff0f7', surface: '#ffffff', surface2: '#ffe0ef', line: '#ffbcd9',
          ink: '#4a2a3c', inkMuted: '#8a6076', accent: '#d9206f', accent2: '#00a383',
        },
      },
      {
        level: 25,
        label: 'Citrus Grove',
        story: 'Out past the orchard, where everything is sharper and brighter.',
        sky: 'dusk',
        colors: {
          bg: '#fffaf0', surface: '#ffffff', surface2: '#fff0d6', line: '#ffd99e',
          ink: '#4a3a1a', inkMuted: '#7d6845', accent: '#cf7200', accent2: '#00a383',
        },
      },
      {
        level: 50,
        label: 'Berry Grove',
        story: 'Deeper in, where the fruit grows in the dark and tastes like it.',
        sky: 'stars',
        colors: {
          bg: '#f7efff', surface: '#ffffff', surface2: '#ece0ff', line: '#d4bbf5',
          ink: '#3b2550', inkMuted: '#705f8c', accent: '#9b4fe0', accent2: '#ff4f9c',
        },
      },
      {
        level: 100,
        label: 'Sugar Nebula',
        story: 'Sugar spun so fine it floats. Up you go with it.',
        sky: 'comet',
        colors: {
          bg: '#eef7ff', surface: '#ffffff', surface2: '#ddeeff', line: '#aed4f2',
          ink: '#1f3348', inkMuted: '#5c7288', accent: '#0090d8', accent2: '#ff4f9c',
        },
      },
    ],
  },
  {
    id: 'glam',
    story: 'A whole industry decides who gets looked at. You have decided to decide instead.',
    name: 'Glam Protocol',
    inspiredBy: 'Barbie style',
    blurb: 'Hot-pink vanity columns, mirror lines and diamond particles.',
    currency: { name: 'Glow Points', icon: '✨' },
    scene: 'vanity',
    ...base,
    radius: '18px',
    colors: {
      bg: '#25041a', surface: '#3f0a2c', surface2: '#54103b', line: '#8b1f63',
      ink: '#ffeaf6', inkMuted: '#dba3c6', accent: '#ff2d8f', accent2: '#ffd9f0',
    },
    avatar: { motif: 'diamond', hues: ['#ff9ecb', '#ff5ea8', '#ff2d8f', '#c4187a', '#ffe9f6'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Dressing Room',
        story: 'Bulbs around the mirror, rails of everything you could be tonight.',
        sky: 'sun',
        colors: {
          bg: '#2a1020', surface: '#451a33', surface2: '#5c2345', line: '#853464',
          ink: '#ffeaf6', inkMuted: '#d49cc0', accent: '#ff7ac0', accent2: '#ffd700',
        },
      },
      {
        level: 25,
        label: 'Red Carpet',
        story: 'Flashbulbs from both sides. Walk slower than you want to.',
        sky: 'eclipse',
        colors: {
          bg: '#2b0610', surface: '#4d0b1d', surface2: '#670f28', line: '#951741',
          ink: '#ffe8ee', inkMuted: '#d395a6', accent: '#ff2e63', accent2: '#ffd700',
        },
      },
      {
        level: 50,
        label: 'Spotlight',
        story: 'One light, one chair, one question. Answer it well.',
        sky: 'rings',
        colors: {
          bg: '#1d1803', surface: '#3d3307', surface2: '#54470b', line: '#7e6c13',
          ink: '#fff9e0', inkMuted: '#cfc084', accent: '#ffd700', accent2: '#ff8fd0',
        },
      },
      {
        level: 100,
        label: 'Icon',
        story: "They stop saying your name and start saying 'the look'.",
        sky: 'stars',
        colors: {
          bg: '#07070a', surface: '#121218', surface2: '#1a1a22', line: '#2e2e3a',
          ink: '#f6f6fa', inkMuted: '#9a9aa8', accent: '#e8e8f0', accent2: '#ffd700',
        },
      },
    ],
  },
  {
    id: 'campfire',
    story: 'A quiet island, a loan you never asked for, and neighbours worth the trouble.',
    name: 'Campfire Cozy',
    inspiredBy: 'Animal Crossing style',
    blurb: 'Warm wood panels, calm pastel-green buttons, leaf-thin lines.',
    currency: { name: 'Berberries', icon: '🍒' },
    scene: 'leaves',
    ...base,
    mode: 'light',
    radius: '20px',
    shadow: '0 8px 20px -12px rgb(90 62 33 / 0.5)',
    colors: {
      bg: '#fbf3e4', surface: '#fffaf0', surface2: '#f0e2c8', line: '#d9c39b',
      ink: '#48331c', inkMuted: '#856d4a', accent: '#4e9c52', accent2: '#db722a',
    },
    avatar: { motif: 'leaf', hues: ['#a7d3a1', '#7bbd78', '#4e9c52', '#db722a', '#f3c969'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'First Light',
        story: 'Dew on the grass and the first visitor already down on the beach.',
        sky: 'sun',
        colors: {
          bg: '#f6faf1', surface: '#ffffff', surface2: '#e6f2e0', line: '#bcdcb4',
          ink: '#23381f', inkMuted: '#5f7a5b', accent: '#4e9c52', accent2: '#db722a',
        },
      },
      {
        level: 25,
        label: 'Deep Wood',
        story: 'Rain through the canopy. The good mushrooms only come up in it.',
        sky: 'storm',
        colors: {
          bg: '#eef5ee', surface: '#fbfdfa', surface2: '#dcecdd', line: '#aed2b1',
          ink: '#1c3322', inkMuted: '#56745c', accent: '#2f7d4f', accent2: '#db722a',
        },
      },
      {
        level: 50,
        label: 'Golden Hour',
        story: 'Everything turns amber for twenty minutes and the whole island comes outside.',
        sky: 'dusk',
        colors: {
          bg: '#fff5e8', surface: '#fffaf2', surface2: '#ffe9cc', line: '#f0c998',
          ink: '#42301a', inkMuted: '#7d6a50', accent: '#db722a', accent2: '#a37a12',
        },
      },
      {
        level: 100,
        label: 'Stargazing',
        story: 'A blanket on the hill and a sky with names written in it.',
        sky: 'stars',
        colors: {
          bg: '#eef1f9', surface: '#fbfcff', surface2: '#dee4f2', line: '#b6c2e0',
          ink: '#202842', inkMuted: '#5a6484', accent: '#3f5bbf', accent2: '#c08800',
        },
      },
    ],
  },
  {
    id: 'cybergrid',
    story: 'The city runs on systems. You have learned to run inside them.',
    name: 'Cyber Grid',
    inspiredBy: 'Cyberpunk style',
    blurb: 'Electric purple grids and neon-cyan wireframe boxes.',
    currency: { name: 'Credits', icon: '💎' },
    scene: 'grid',
    ...base,
    radius: '6px',
    fonts: { display: FONT_MONO, body: FONT_BODY, mono: FONT_MONO },
    colors: {
      bg: '#0b0416', surface: '#1a0a33', surface2: '#251047', line: '#5522a8',
      ink: '#eae2ff', inkMuted: '#a98fd8', accent: '#25f4ee', accent2: '#c026d3',
    },
    avatar: { motif: 'wire', hues: ['#8b5cf6', '#c026d3', '#25f4ee', '#7cffb2', '#ffffff'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Boot Sector',
        story: 'First handshake. Something in the dark answers back.',
        sky: 'stars',
        colors: {
          bg: '#04080f', surface: '#0a1522', surface2: '#101f31', line: '#1b3550',
          ink: '#e6f4ff', inkMuted: '#8fb0c8', accent: '#2fe0ff', accent2: '#9d4dff',
        },
      },
      {
        level: 25,
        label: 'Data Stream',
        story: "Riding a river of other people's traffic, reading it as it goes past.",
        sky: 'comet',
        colors: {
          bg: '#030f0c', surface: '#07201a', surface2: '#0b2d24', line: '#12483a',
          ink: '#e6fff6', inkMuted: '#86c4b0', accent: '#00ffaa', accent2: '#2fe0ff',
        },
      },
      {
        level: 50,
        label: 'Firewall',
        story: 'Something has noticed you. It was built to.',
        sky: 'storm',
        colors: {
          bg: '#120308', surface: '#2a0710', surface2: '#3a0a16', line: '#5c1024',
          ink: '#ffe8ee', inkMuted: '#c48f9e', accent: '#ff2d6f', accent2: '#ffb020',
        },
      },
      {
        level: 100,
        label: 'Mainframe',
        story: 'The room the whole city is wired to, and the door is open.',
        sky: 'rings',
        colors: {
          bg: '#0a0616', surface: '#160d2c', surface2: '#1e123e', line: '#331e68',
          ink: '#f0eaff', inkMuted: '#a898cc', accent: '#9d4dff', accent2: '#2fe0ff',
        },
      },
    ],
  },
  {
    id: 'plumber',
    story: 'The kingdom keeps losing its princess and finding its courage.',
    name: 'Plumber Kingdom',
    inspiredBy: 'Super Mario style',
    blurb: 'Bright sky-blue boards with classic castle brick dividers.',
    currency: { name: 'Star Coins', icon: '⭐' },
    scene: 'bricks',
    ...base,
    mode: 'light',
    radius: '12px',
    shadow: '0 8px 0 0 rgb(0 0 0 / 0.18)',
    colors: {
      bg: '#bfe6ff', surface: '#ffffff', surface2: '#e6f4ff', line: '#8cc7ef',
      ink: '#1e3a5f', inkMuted: '#4f7a9c', accent: '#e5342b', accent2: '#c08800',
    },
    avatar: { motif: 'cap', hues: ['#c08800', '#5cb85c', '#3b82f6', '#e5342b', '#ffffff'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Green Hills',
        story: 'Blue sky, warm pipes, and a run of coins pointing somewhere.',
        sky: 'sun',
        colors: {
          bg: '#eefaf0', surface: '#ffffff', surface2: '#dcf3e0', line: '#aedcb6',
          ink: '#1f3a26', inkMuted: '#5a7c62', accent: '#2d8050', accent2: '#c08800',
        },
      },
      {
        level: 25,
        label: 'Underground',
        story: 'Down a pipe. The music changes and so does everything else.',
        sky: 'stars',
        colors: {
          bg: '#eef0f7', surface: '#ffffff', surface2: '#dfe3f0', line: '#b6bedb',
          ink: '#232842', inkMuted: '#5c6384', accent: '#3b5bbf', accent2: '#c08800',
        },
      },
      {
        level: 50,
        label: 'Lava Castle',
        story: 'Bridges over orange, and one bridge that needs cutting.',
        sky: 'eclipse',
        colors: {
          bg: '#fff1ea', surface: '#ffffff', surface2: '#ffded0', line: '#f5b396',
          ink: '#4a2418', inkMuted: '#8a5c48', accent: '#e04a1a', accent2: '#c08800',
        },
      },
      {
        level: 100,
        label: 'Star World',
        story: 'A secret path above the map, where nothing can touch you.',
        sky: 'comet',
        colors: {
          bg: '#f5eeff', surface: '#ffffff', surface2: '#e9dcff', line: '#cdb6f0',
          ink: '#342350', inkMuted: '#6e5e8c', accent: '#7c3bd6', accent2: '#c08800',
        },
      },
    ],
  },
  {
    id: 'neonpulse',
    story: 'The city has a beat. Learn it and the lights start doing what you say.',
    name: 'Neon Pulse',
    inspiredBy: 'Geometry Dash style',
    blurb: 'Pitch-black space cut by razor-sharp neon triangle drifts.',
    currency: { name: 'Mana Orbs', icon: '🔮' },
    scene: 'triangles',
    ...base,
    radius: '4px',
    colors: {
      bg: '#000000', surface: '#0e0e14', surface2: '#16161f', line: '#2c2c3d',
      ink: '#f2f2ff', inkMuted: '#9a9ab5', accent: '#00ffa3', accent2: '#ff2eb5',
    },
    avatar: { motif: 'triangle', hues: ['#00ffa3', '#31d0ff', '#7b5cff', '#ff2eb5', '#ffffff'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'First Pulse',
        story: 'One kick drum at a time, until your feet agree with it.',
        sky: 'stars',
        colors: {
          bg: '#07061a', surface: '#0f0d30', surface2: '#161343', line: '#262070',
          ink: '#eceaff', inkMuted: '#9b97d4', accent: '#7c4dff', accent2: '#2fe0ff',
        },
      },
      {
        level: 25,
        label: 'Bass Drop',
        story: 'The floor goes out from under the whole room at once.',
        sky: 'comet',
        colors: {
          bg: '#1a0620', surface: '#300b3b', surface2: '#420f51', line: '#651a7c',
          ink: '#fbeaff', inkMuted: '#c196d4', accent: '#e24dff', accent2: '#2fe0ff',
        },
      },
      {
        level: 50,
        label: 'Overdrive',
        story: 'Double time. Missing a beat stops being an option.',
        sky: 'eclipse',
        colors: {
          bg: '#200614', surface: '#3d0b26', surface2: '#520f33', line: '#7c1a4e',
          ink: '#ffeaf4', inkMuted: '#d496b4', accent: '#ff2d8f', accent2: '#ffd24d',
        },
      },
      {
        level: 100,
        label: 'Event Horizon',
        story: 'The track never resolves. You stop counting and just stay in it.',
        sky: 'rings',
        colors: {
          bg: '#02020a', surface: '#070718', surface2: '#0b0b24', line: '#151540',
          ink: '#f4f4ff', inkMuted: '#9696c0', accent: '#ffffff', accent2: '#7c4dff',
        },
      },
    ],
  },
  {
    id: 'monstertamer',
    story: 'Leave home, meet something wild, and convince it you are worth following.',
    name: 'Monster Tamer',
    inspiredBy: 'Pokémon style',
    blurb: 'Handheld-yellow casing with a live elemental companion readout.',
    currency: { name: 'Pocket Coins', icon: '🪙' },
    scene: 'handheld',
    ...base,
    mode: 'light',
    radius: '14px',
    shadow: '0 8px 18px -10px rgb(120 90 0 / 0.55)',
    colors: {
      bg: '#ffe066', surface: '#fff8dc', surface2: '#ffefa8', line: '#e0b800',
      ink: '#2f2a0a', inkMuted: '#7a6b1f', accent: '#e04a2f', accent2: '#2f7de0',
    },
    avatar: { motif: 'monster', hues: ['#7ec86b', '#2f7de0', '#e04a2f', '#b06fe0', '#ffd166'] },
    /*
     * The journey. Four worlds, arriving on the four form levels, so the
     * place changes at the same moment the avatar does.
     *
     * The scene stays this theme's own: a theme IS its shape language,
     * and Coquette rebuilt out of Cyber Grid wireframes stops being
     * Coquette. What travels is the light — the palette and what hangs
     * in the sky above it. Block Craft is the exception that proves it;
     * the Nether and the End really are different drawings, because
     * there the worlds are the story.
     */
    evolutions: [
      {
        level: 10,
        label: 'Route One',
        story: 'Tall grass, a borrowed bag, and the first thing that rustles.',
        sky: 'sun',
        colors: {
          bg: '#f0faf3', surface: '#ffffff', surface2: '#dff3e5', line: '#aedcbe',
          ink: '#1f3a2a', inkMuted: '#5a7c68', accent: '#21a07a', accent2: '#e04a2f',
        },
      },
      {
        level: 25,
        label: 'Deep Cavern',
        story: 'No sunlight for hours. Whatever lives down here never needed eyes.',
        sky: 'stars',
        colors: {
          bg: '#eef1f9', surface: '#ffffff', surface2: '#dee4f3', line: '#b4c0e0',
          ink: '#1f2842', inkMuted: '#586384', accent: '#2f7de0', accent2: '#e04a2f',
        },
      },
      {
        level: 50,
        label: 'Volcano Gym',
        story: 'Heat you can feel through your boots, and a badge waiting behind it.',
        sky: 'eclipse',
        colors: {
          bg: '#fff2ea', surface: '#ffffff', surface2: '#ffe0d1', line: '#f5b698',
          ink: '#4a2a18', inkMuted: '#8a6048', accent: '#e04a2f', accent2: '#b8860b',
        },
      },
      {
        level: 100,
        label: 'Champion Road',
        story: 'The last climb. Everything you ever caught comes up it with you.',
        sky: 'rings',
        colors: {
          bg: '#f6efff', surface: '#ffffff', surface2: '#eadfff', line: '#ceb8f2',
          ink: '#332350', inkMuted: '#6c5e8c', accent: '#8b3bd6', accent2: '#b8860b',
        },
      },
    ],
  },
]

export const KID_THEME_MAP = Object.fromEntries(KID_THEMES.map((t) => [t.id, t]))

export const DEFAULT_KID_THEME = 'matrixblocks'

/**
 * Resolve a theme for a given level, applying its level-gated worlds.
 */
/** Whether a world is open: its level is reached, and anything it `requires` is done. */
const worldOpen = (e, level, progress) => level >= e.level && (!e.requires || Boolean(progress?.[e.requires]))

/**
 * Resolve a theme for a given level, applying its level-gated worlds.
 *
 * `progress` carries story milestones that are not levels — today only
 * `dragonDefeated`, which opens Block Craft's last world. Callers without a
 * kid to hand can leave it out; the world simply stays closed.
 */
export function resolveKidTheme(themeId, level = 1, progress = null) {
  const theme = KID_THEME_MAP[themeId] || KID_THEME_MAP[DEFAULT_KID_THEME]
  if (!theme.evolutions?.length) return { ...theme, evolution: null }

  const unlocked = theme.evolutions.filter((e) => worldOpen(e, level, progress))
  if (!unlocked.length) return { ...theme, evolution: null }

  const active = unlocked[unlocked.length - 1]
  return {
    ...theme,
    ...active,
    colors: { ...theme.colors, ...active.colors },
    name: theme.name,
    currency: theme.currency,
    evolution: active,
  }
}

/**
 * The next locked world, so the kid knows something is coming.
 *
 * Screens show only WHEN (its level, or that the dragon has to fall) and
 * never its name or story: a world nobody has reached is a secret.
 */
export function nextEvolution(themeId, level = 1, progress = null) {
  const theme = KID_THEME_MAP[themeId]
  if (!theme?.evolutions?.length) return null
  return theme.evolutions.find((e) => !worldOpen(e, level, progress)) || null
}

/**
 * The chapters of a theme's story this child has reached, oldest first:
 * the opening, then one for every world they have opened. A theme without
 * a story has none. Nothing here is ever a world they have not reached, so
 * a screen can list all of it without giving anything away.
 */
export function storyChapters(themeId, level = 1, progress = null) {
  const theme = KID_THEME_MAP[themeId]
  if (!theme?.storyStart) return []
  const first = { chapter: theme.storyStart.chapter, label: theme.storyStart.label, story: theme.story, level: 1 }
  const worlds = (theme.evolutions || [])
    .filter((e) => e.chapter && worldOpen(e, level, progress))
    .map((e) => ({
      chapter: e.chapter, label: e.label, story: e.story, level: e.level,
      requires: e.requires || null, glitch: Boolean(e.glitchIntro),
    }))
  return [first, ...worlds]
}
