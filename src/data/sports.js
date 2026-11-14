/**
 * SportsMania's ten sports: the cards a child picks from, and how each is
 * played. Kept apart from SportsMania.jsx so the list can be read without a
 * browser (tests/howtoplay.mjs checks every sport has its one-line howTo,
 * which is shown above the sport as it starts).
 *
 * Underneath there are a handful of engines, not ten: `kind` says which one.
 * The five 'aim' sports are "how hard, and exactly when", and the numbers
 * below are the difference between them.
 */
export const SPORTS = [
  {
    id: 'football', name: 'Football', icon: '⚽', kind: 'soccer',
    blurb: 'A full ninety minutes. Pass, shoot, defend a lead.',
    howTo: 'Drag on the left to run, tap on the right to shoot. Outscore the red team.',
  },
  {
    id: 'pingpong', name: 'Table Tennis', icon: '🏓', kind: 'tabletennis',
    blurb: 'Read the spin, pick the stroke. First to eleven.',
    howTo: 'Pick the stroke that beats the spin, then stop the bar in the green.',
  },
  {
    id: 'hockey', name: 'Ice Hockey', icon: '🏒', kind: 'hockey',
    blurb: 'Six breakaways. Beat the defender, then the goalie.',
    howTo: "Drag to skate across, then shoot to the side the goalie isn't on.",
  },
  {
    id: 'volleyball', name: 'Volleyball', icon: '🏐', kind: 'volleyball',
    blurb: 'Bump, set, spike — past a block that moves.',
    howTo: 'Tap to stop the bar in the middle: bump, set, then spike past the block.',
  },
  {
    id: 'basketball', name: 'Basketball', icon: '🏀', kind: 'aim',
    blurb: 'Ten from beyond the arc.',
    howTo: 'Tap once to set the power, then tap again to aim. Green is best.',
    attempts: 10, powerSpeed: 2.4, aimSpeed: 3.0, sweet: 62,
    target: 'Ten three-pointers', verb: 'Shot',
    powerLabel: 'How much arc?', aimLabel: 'Release!',
    good: 'Nothing but net.', bad: 'Off the rim.',
  },
  {
    id: 'golf', name: 'Golf', icon: '⛳', kind: 'aim',
    blurb: 'Nine holes. Power, then line.',
    howTo: 'Tap once to set the power, then tap again to aim. Green is best.',
    attempts: 9, powerSpeed: 1.9, aimSpeed: 2.2, sweet: 74,
    target: 'Nine holes', verb: 'Hole',
    powerLabel: 'Pick your club.', aimLabel: 'Strike it.',
    good: 'Right at the pin.', bad: 'In the rough.',
  },
  {
    id: 'nfl', name: 'American Football', icon: '🏈', kind: 'aim',
    blurb: 'Six field goals, getting longer.',
    howTo: 'Tap once to set the power, then tap again to aim. Green is best.',
    attempts: 6, powerSpeed: 2.6, aimSpeed: 3.4, sweet: 80,
    target: 'Six field goals', verb: 'Kick',
    powerLabel: 'How far out?', aimLabel: 'Through the posts!',
    good: "It's good!", bad: 'Wide.',
  },
  {
    id: 'cricket', name: 'Cricket', icon: '🏏', kind: 'aim',
    blurb: 'Eight balls. Bat for six.',
    howTo: 'Tap once to set the power, then tap again to aim. Green is best.',
    attempts: 8, powerSpeed: 2.2, aimSpeed: 3.6, sweet: 68,
    target: 'Eight deliveries', verb: 'Ball',
    powerLabel: 'How big a shot?', aimLabel: 'Time it!',
    good: 'Over the rope — six!', bad: 'Edged it.',
  },
  {
    id: 'baseball', name: 'Baseball', icon: '⚾', kind: 'aim',
    blurb: 'Eight pitches in the derby.',
    howTo: 'Tap once to set the power, then tap again to aim. Green is best.',
    attempts: 8, powerSpeed: 2.3, aimSpeed: 3.8, sweet: 72,
    target: 'Eight pitches', verb: 'Pitch',
    powerLabel: 'How hard a swing?', aimLabel: 'Swing!',
    good: 'Out of the park.', bad: 'Swing and a miss.',
  },
  {
    id: 'f1', name: 'Formula 1', icon: '🏎️', kind: 'f1',
    blurb: 'The start, then one flying lap.',
    howTo: 'Tap when the lights go out, then tap in the green zone to brake.',
  },
]
