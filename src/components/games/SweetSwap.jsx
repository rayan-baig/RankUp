import sweetHtml from './external/sweetSwap.html?raw'
import ExternalGame, { BRIDGE_BASE } from './ExternalGame.jsx'

/**
 * Sweet Swap, as supplied: a full match-three with levels, blockers,
 * cascades, special candies and power-ups.
 *
 * The bridge reads the screen rather than calling into the game. The first
 * attempt wrapped the game's own end function, which looked right and did
 * nothing: its state is declared with const and let, so none of it lands
 * on `window`, and a wrapper that finds nothing to wrap fails silently —
 * the round would have ended with the child's token spent and no score
 * ever sent.
 *
 * What the game cannot keep to itself is what it shows the player. When a
 * round ends it reveals its result panel, so that is what is watched, and
 * the score is read from the scoreboard the player is already looking at.
 * It also means a newer build of the game drops in unchanged, as long as
 * it still tells the player how they did.
 */
const BRIDGE = `${BRIDGE_BASE}
  (function () {
    var panel = document.getElementById('message');
    var title = document.getElementById('modalTitle');
    var board = document.getElementById('score');
    if (!panel || !title) return;
    var check = function () {
      if (!panel.classList.contains('show')) return;
      var points = parseInt(((board || {}).textContent || '0').replace(/[^0-9]/g, ''), 10) || 0;
      var cleared = /COMPLETE/i.test(title.textContent || '');
      // Clearing the level is the thing worth rewarding, so that starts at
      // seventy and the points add the rest. Running out of moves still
      // pays for what was cleared: a token came from a chore and should
      // never buy nothing.
      var earned = Math.min(cleared ? 30 : 95, Math.round(points / 70));
      rankupSend(cleared ? 70 + earned : earned);
    };
    new MutationObserver(check).observe(panel, { attributes: true, attributeFilter: ['class'] });
    check();
  })();
`

export default function SweetSwap({ onDone }) {
  return <ExternalGame html={sweetHtml} bridge={BRIDGE} title="Sweet Swap" onDone={onDone} />
}
