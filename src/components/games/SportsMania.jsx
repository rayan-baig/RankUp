import { useState } from 'react'
import AimShot from './sports/AimShot.jsx'
import Rally from './sports/Rally.jsx'
import GrandPrix from './sports/GrandPrix.jsx'
import Penalty from './Penalty.jsx'

/**
 * SportsMania: eleven sports behind one card.
 *
 * Eleven separate entries on the hub would bury everything else, and most of
 * them would never be opened. One card you pick a sport from keeps the hub
 * readable and makes the sports feel like a set, which is what they are.
 *
 * Underneath there are four engines, not eleven. Golf, basketball, the field
 * goal, cricket and baseball are all "how hard, and exactly when"; tennis,
 * table tennis and hockey are all "keep it away from the other bat". Writing
 * each one separately would mean eleven chances to get the maths slightly wrong
 * rather than four, and the difference between those sports really is the
 * numbers — a table tennis ball is not a hockey puck with a different name
 * once it is moving at twice the speed off a bat a third the size.
 */

const SPORTS = [
  {
    id: 'football', name: 'Football', icon: '⚽', kind: 'penalty',
    blurb: 'Five penalties each way.',
  },
  {
    id: 'tennis', name: 'Tennis', icon: '🎾', kind: 'rally',
    blurb: 'Best of five games on grass.',
    paddle: 62, speed: 4.1, foeSkill: 0.78, upTo: 5, puck: 8,
    surface: 'color-mix(in srgb, var(--good) 14%, transparent)',
  },
  {
    id: 'pingpong', name: 'Table Tennis', icon: '🏓', kind: 'rally',
    blurb: 'Small bat, fast ball, first to seven.',
    paddle: 44, speed: 5.4, foeSkill: 0.84, upTo: 7, puck: 6,
    surface: 'color-mix(in srgb, var(--accent) 16%, transparent)',
  },
  {
    id: 'hockey', name: 'Ice Hockey', icon: '🏒', kind: 'rally',
    blurb: 'Heavy puck, wide stick, first to five.',
    paddle: 76, speed: 4.6, foeSkill: 0.7, upTo: 5, puck: 11,
    surface: 'color-mix(in srgb, #38bdf8 18%, transparent)',
  },
  {
    id: 'volleyball', name: 'Volleyball', icon: '🏐', kind: 'rally',
    blurb: 'Big ball over the net, first to five.',
    paddle: 84, speed: 3.8, foeSkill: 0.68, upTo: 5, puck: 13,
    surface: 'color-mix(in srgb, #f59e0b 16%, transparent)',
  },
  {
    id: 'basketball', name: 'Basketball', icon: '🏀', kind: 'aim',
    blurb: 'Ten from beyond the arc.',
    attempts: 10, powerSpeed: 2.4, aimSpeed: 3.0, sweet: 62,
    target: 'Ten three-pointers', verb: 'Shot',
    powerLabel: 'How much arc?', aimLabel: 'Release!',
    good: 'Nothing but net.', bad: 'Off the rim.',
  },
  {
    id: 'golf', name: 'Golf', icon: '⛳', kind: 'aim',
    blurb: 'Nine holes. Power, then line.',
    attempts: 9, powerSpeed: 1.9, aimSpeed: 2.2, sweet: 74,
    target: 'Nine holes', verb: 'Hole',
    powerLabel: 'Pick your club.', aimLabel: 'Strike it.',
    good: 'Right at the pin.', bad: 'In the rough.',
  },
  {
    id: 'nfl', name: 'American Football', icon: '🏈', kind: 'aim',
    blurb: 'Six field goals, getting longer.',
    attempts: 6, powerSpeed: 2.6, aimSpeed: 3.4, sweet: 80,
    target: 'Six field goals', verb: 'Kick',
    powerLabel: 'How far out?', aimLabel: 'Through the posts!',
    good: "It's good!", bad: 'Wide.',
  },
  {
    id: 'cricket', name: 'Cricket', icon: '🏏', kind: 'aim',
    blurb: 'Eight balls. Bat for six.',
    attempts: 8, powerSpeed: 2.2, aimSpeed: 3.6, sweet: 68,
    target: 'Eight deliveries', verb: 'Ball',
    powerLabel: 'How big a shot?', aimLabel: 'Time it!',
    good: 'Over the rope — six!', bad: 'Edged it.',
  },
  {
    id: 'baseball', name: 'Baseball', icon: '⚾', kind: 'aim',
    blurb: 'Eight pitches in the derby.',
    attempts: 8, powerSpeed: 2.3, aimSpeed: 3.8, sweet: 72,
    target: 'Eight pitches', verb: 'Pitch',
    powerLabel: 'How hard a swing?', aimLabel: 'Swing!',
    good: 'Out of the park.', bad: 'Swing and a miss.',
  },
  {
    id: 'f1', name: 'Formula 1', icon: '🏎️', kind: 'f1',
    blurb: 'The start, then one flying lap.',
  },
]

export default function SportsMania({ onDone }) {
  const [sport, setSport] = useState(null)

  if (sport) {
    if (sport.kind === 'penalty') return <Penalty onDone={onDone} />
    if (sport.kind === 'f1') return <GrandPrix onDone={onDone} />
    if (sport.kind === 'rally') return <Rally sport={sport} onDone={onDone} />
    return <AimShot sport={sport} onDone={onDone} />
  }

  return (
    <div>
      <p className="text-sm text-muted mb-3 text-center">
        Pick your sport. One event, one score.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {SPORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSport(s)}
            className="text-left transition-transform active:scale-95"
            style={{
              borderRadius: 14,
              border: '2px solid var(--line)',
              background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
              padding: 12,
            }}
          >
            <div className="text-2xl mb-1" aria-hidden="true">{s.icon}</div>
            <div className="font-semibold text-sm">{s.name}</div>
            <div className="text-xs text-muted">{s.blurb}</div>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted mt-3 text-center">
        Your token is only spent once you finish an event.
      </p>
    </div>
  )
}
