import doc from 'virtual:rankup-game/track'
import ExternalGame from './ExternalGame.jsx'

/**
 * Trackstar, as supplied: a WebGL runner with three lanes, trains,
 * barriers, coins and power-ups.
 *
 * The game needs WebGL; if a device has it off the wrapper says so and
 * tells the child their token is safe, rather than leaving them with a
 * black rectangle. Its bridge, and why it reads the screen, is in
 * external/bridges.js.
 */
export default function Trackstar({ onDone }) {
  return <ExternalGame doc={doc} title="Trackstar" onDone={onDone} />
}
