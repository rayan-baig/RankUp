import soccerHtml from '../external/soccer.html?raw'
import ExternalGame, { BRIDGE_BASE } from '../ExternalGame.jsx'

/**
 * The SportsMania football match, as supplied: a full ninety-minute game
 * with a team, passing, shooting and a running clock.
 *
 * This replaces the penalty shootout as the football event. A shootout is
 * the end of a match; this is the match.
 *
 * It has no function that means "the game is over" — full time is an
 * overlay that stops being hidden, inline in its update loop. So rather
 * than wrap a function that is not there, the bridge watches that overlay
 * and reports when it appears. Watching the thing the player actually sees
 * is also the hook least likely to break when the file is regenerated.
 */
const BRIDGE = `${BRIDGE_BASE}
  (function () {
    var overlay = document.getElementById('end');
    if (!overlay) return;
    var report = function () {
      if (overlay.classList.contains('hidden')) return;
      var mine = Number(window.blueScore) || 0;
      var theirs = Number(window.redScore) || 0;
      // Winning carries the score; goals count either way, so losing a
      // high-scoring match still beats a goalless one.
      var won = mine > theirs ? 55 : mine === theirs ? 30 : 0;
      rankupSend(Math.min(100, won + mine * 12));
    };
    new MutationObserver(report)
      .observe(overlay, { attributes: true, attributeFilter: ['class'] });
    report();
  })();
`

export default function SoccerMatch({ onDone }) {
  return <ExternalGame html={soccerHtml} bridge={BRIDGE} title="Football match" onDone={onDone} />
}
