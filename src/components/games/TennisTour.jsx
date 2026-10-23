import tennisHtml from './external/tennis.html?raw'
import ExternalGame, { BRIDGE_BASE } from './ExternalGame.jsx'

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
 * The bridge watches the DOM rather than wrapping a function. The other
 * three games are plain scripts, so their functions end up on `window` and
 * can be wrapped; this one is an ES module, so nothing it defines is
 * reachable from outside and wrapping silently does nothing — which is
 * exactly how it failed the first time. What the module cannot hide is the
 * result it writes on screen, so that is what is read: the same words the
 * player sees.
 */
const BRIDGE = `${BRIDGE_BASE}
  (function () {
    var box = document.getElementById('matchState');
    if (!box) return;
    var check = function () {
      var said = (box.textContent || '');
      if (!/MATCH (WON|LOST)/i.test(said)) return;
      var won = /MATCH WON/i.test(said);
      // The scoreline is on the HUD as "2–1 SETS | 3–4 GAMES".
      var hud = (document.getElementById('hudScore') || {}).textContent || '';
      var sets = hud.match(/(\\d+)\\s*[–-]\\s*(\\d+)/);
      var mine = sets ? Number(sets[1]) : 0;
      // Winning is the full hundred. Losing still pays for the sets taken,
      // because playing a match out is not the same as walking away.
      rankupSend(won ? 100 : Math.min(55, 15 + mine * 20));
    };
    new MutationObserver(check).observe(box, { childList: true, subtree: true, characterData: true });
    check();
  })();
`

export default function TennisTour({ onDone }) {
  return <ExternalGame html={tennisHtml} bridge={BRIDGE} title="Tennis Tour" onDone={onDone} />
}
