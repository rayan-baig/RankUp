/**
 * The four games that arrived as standalone HTML files, and the bridge each
 * one gets.
 *
 * vite.config.js reads this in Node, so it is plain JavaScript with no
 * imports. It appends each bridge to its game's HTML to make the document
 * the game's frame is given ('virtual:rankup-game/<name>'), and allows
 * exactly those scripts in the app's Content-Security-Policy, by hash. See
 * externalGames() there.
 *
 * A bridge wraps nothing and reaches into nothing: it watches what the game
 * puts on screen and posts a score out when a round is over. Nothing else
 * crosses back.
 */

/**
 * Shared half of every bridge: post a score out, once, and never twice.
 * Each game adds the few lines that say when a round is actually over.
 */
const BRIDGE_BASE = `
  var sent = false;
  function rankupSend(score) {
    if (sent) return;
    sent = true;
    parent.postMessage({ kind: 'rankup:score', score: score }, '*');
  }
  parent.postMessage({ kind: 'rankup:ready' }, '*');
`

/*
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
const SWEETS = `${BRIDGE_BASE}
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

/*
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
 * near four hundred, so that is what a hundred here means.
 */
const TRACK = `${BRIDGE_BASE}
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

/*
 * Tennis Tour, as supplied: a 3D career mode with rankings, a tour
 * calendar and real tennis scoring.
 *
 * The bridge watches the DOM rather than wrapping a function. The other
 * three games are plain scripts, so their functions end up on `window` and
 * can be wrapped; this one is an ES module, so nothing it defines is
 * reachable from outside and wrapping silently does nothing — which is
 * exactly how it failed the first time. What the module cannot hide is the
 * result it writes on screen, so that is what is read: the same words the
 * player sees.
 */
const TENNIS = `${BRIDGE_BASE}
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

/*
 * The SportsMania football match, as supplied: a full ninety-minute game
 * with a team, passing, shooting and a running clock.
 *
 * It has no function that means "the game is over" — full time is an
 * overlay that stops being hidden, inline in its update loop. So rather
 * than wrap a function that is not there, the bridge watches that overlay
 * and reports when it appears. Watching the thing the player actually sees
 * is also the hook least likely to break when the file is regenerated.
 */
const SOCCER = `${BRIDGE_BASE}
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

/**
 * Each game: its file in this folder, its bridge, and any script it loads
 * from outside the page, which the app's policy then allows too. Only Tennis
 * Tour has one — Three.js from a CDN, the exact file of the exact version it
 * imports. That is why its card says it needs the internet; it falls back to
 * a flat court when the import fails.
 */
export const EXTERNAL_GAMES = {
  sweets: { file: 'sweetSwap.html', bridge: SWEETS, scripts: [] },
  track: { file: 'trackstar.html', bridge: TRACK, scripts: [] },
  tennis: { file: 'tennis.html', bridge: TENNIS, scripts: ['https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'] },
  soccer: { file: 'soccer.html', bridge: SOCCER, scripts: [] },
}
