import { useState } from 'react'
import AimShot from './sports/AimShot.jsx'
import GrandPrix from './sports/GrandPrix.jsx'
import SoccerMatch from './sports/SoccerMatch.jsx'
import TableTennis from './sports/TableTennis.jsx'
import Volleyball from './sports/Volleyball.jsx'
import Hockey from './sports/Hockey.jsx'

/**
 * SportsMania: ten sports behind one card.
 *
 * Ten separate entries on the hub would bury everything else, and most of
 * them would never be opened. One card you pick a sport from keeps the hub
 * readable and makes the sports feel like a set, which is what they are.
 *
 * Underneath there are a handful of engines, not ten. Golf, basketball, the field
 * goal, cricket and baseball are all "how hard, and exactly when"; tennis,
 * table tennis and hockey are all "keep it away from the other bat". Writing
 * each one separately would mean ten chances to get the maths slightly wrong
 * rather than four, and the difference between those sports really is the
 * numbers — a table tennis ball is not a hockey puck with a different name
 * once it is moving at twice the speed off a bat a third the size.
 */

const SPORTS = [
  {
    id: 'football', name: 'Football', icon: '⚽', kind: 'soccer',
    blurb: 'A full ninety minutes. Pass, shoot, defend a lead.',
  },
  {
    id: 'pingpong', name: 'Table Tennis', icon: '🏓', kind: 'tabletennis',
    blurb: 'Read the spin, pick the stroke. First to eleven.',
  },
  {
    id: 'hockey', name: 'Ice Hockey', icon: '🏒', kind: 'hockey',
    blurb: 'Six breakaways. Beat the defender, then the goalie.',
  },
  {
    id: 'volleyball', name: 'Volleyball', icon: '🏐', kind: 'volleyball',
    blurb: 'Bump, set, spike — past a block that moves.',
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
    if (sport.kind === 'soccer') return <SoccerMatch onDone={onDone} />
    if (sport.kind === 'f1') return <GrandPrix onDone={onDone} />
    if (sport.kind === 'tabletennis') return <TableTennis onDone={onDone} />
    if (sport.kind === 'volleyball') return <Volleyball onDone={onDone} />
    if (sport.kind === 'hockey') return <Hockey onDone={onDone} />
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
