import doc from 'virtual:rankup-game/soccer'
import ExternalGame from '../ExternalGame.jsx'

/**
 * The SportsMania football match, as supplied: a full ninety-minute game
 * with a team, passing, shooting and a running clock.
 *
 * This replaces the penalty shootout as the football event. A shootout is
 * the end of a match; this is the match. Its bridge, which watches for the
 * full-time overlay, is in external/bridges.js.
 */
export default function SoccerMatch({ onDone }) {
  return <ExternalGame doc={doc} title="Football match" onDone={onDone} />
}
