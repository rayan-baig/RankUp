import { useState } from 'react'
import AimShot from './sports/AimShot.jsx'
import GrandPrix from './sports/GrandPrix.jsx'
import SoccerMatch from './sports/SoccerMatch.jsx'
import TableTennis from './sports/TableTennis.jsx'
import Volleyball from './sports/Volleyball.jsx'
import Hockey from './sports/Hockey.jsx'
import { SPORTS } from '../../data/sports.js'

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
 *
 * The list itself, with each sport's one-line how-to, is in data/sports.js.
 */

export default function SportsMania({ onDone }) {
  const [sport, setSport] = useState(null)

  if (sport) {
    // Each sport says how it is played as it starts, in one line.
    return (
      <>
        <p className="text-sm font-semibold mb-2" data-testid="sport-how-to">
          <span aria-hidden="true">{sport.icon}</span> {sport.howTo}
        </p>
        {sport.kind === 'soccer' ? <SoccerMatch onDone={onDone} />
          : sport.kind === 'f1' ? <GrandPrix onDone={onDone} />
            : sport.kind === 'tabletennis' ? <TableTennis onDone={onDone} />
              : sport.kind === 'volleyball' ? <Volleyball onDone={onDone} />
                : sport.kind === 'hockey' ? <Hockey onDone={onDone} />
                  : <AimShot sport={sport} onDone={onDone} />}
      </>
    )
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
