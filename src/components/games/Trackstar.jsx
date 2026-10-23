import trackHtml from './external/trackstar.html?raw'
import ExternalGame, { BRIDGE_BASE } from './ExternalGame.jsx'

/**
 * Trackstar, as supplied: a WebGL runner with three lanes, trains,
 * barriers, coins and power-ups.
 *
 * The whole game is inside one arrow-function wrapper, so nothing it
 * defines can be reached from outside it — a bridge that tried to wrap its
 * end function found nothing and said nothing, which would have cost a
 * child their token for no score. So this reads the screen instead.
 *
 * The run ends when the game puts its overlay up saying RUN OVER. That
 * same overlay is used for pausing, so the text matters, not just the
 * overlay appearing: pausing to answer the door is not the end of a run.
 *
 * Its own score is distance plus ten a coin, which on a decent run lands
 * near four hundred, so that is what a hundred here means. The game needs
 * WebGL; if a device has it off the wrapper says so and tells the child
 * their token is safe, rather than leaving them with a black rectangle.
 */
const BRIDGE = `${BRIDGE_BASE}
  (function () {
    var overlay = document.getElementById('overlay');
    var panel = document.getElementById('panel');
    var board = document.getElementById('score');
    if (!overlay || !panel) return;
    var check = function () {
      if (overlay.classList.contains('hidden')) return;
      // The same overlay shows PAUSED. Only a finished run counts.
      if (!/RUN OVER/i.test(panel.textContent || '')) return;
      var points = parseInt(((board || {}).textContent || '0').replace(/[^0-9]/g, ''), 10) || 0;
      rankupSend(Math.round((points / 400) * 100));
    };
    new MutationObserver(check).observe(overlay, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
    check();
  })();
`

export default function Trackstar({ onDone }) {
  return <ExternalGame html={trackHtml} bridge={BRIDGE} title="Trackstar" onDone={onDone} />
}
