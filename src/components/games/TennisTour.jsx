import doc from 'virtual:rankup-game/tennis'
import ExternalGame from './ExternalGame.jsx'

/**
 * Tennis Tour, as supplied: a 3D career mode with rankings, a tour
 * calendar and real tennis scoring.
 *
 * It is a whole game rather than a SportsMania event, so it gets its own
 * card in the arcade and the quick tennis event has been taken out of the
 * picker. Two tennises on one hub would only make a child pick the wrong
 * one.
 *
 * This file loads its 3D engine from a CDN, so unlike everything else in
 * the arcade it needs the internet. That is marked on its card. The rest
 * of RankUp works on a bus with no signal and this game will not, which is
 * a fact about the game rather than something to hide.
 *
 * Its bridge, and why it reads the screen, is in external/bridges.js.
 */
export default function TennisTour({ onDone }) {
  return <ExternalGame doc={doc} title="Tennis Tour" onDone={onDone} />
}
