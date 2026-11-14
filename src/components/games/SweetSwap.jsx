import doc from 'virtual:rankup-game/sweets'
import ExternalGame from './ExternalGame.jsx'

/**
 * Sweet Swap, as supplied: a full match-three with levels, blockers,
 * cascades, special candies and power-ups.
 *
 * Its bridge, and why it reads the screen rather than calling into the
 * game, is in external/bridges.js.
 */
export default function SweetSwap({ onDone }) {
  return <ExternalGame doc={doc} title="Sweet Swap" onDone={onDone} />
}
