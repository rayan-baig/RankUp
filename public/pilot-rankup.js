// Pilot on RankUp: the core's "app config" file (docs/PILOT.md).
// RankUp's config is part of the app itself (src/pilot/pilotRankUp.js),
// fetched only where Pilot is allowed: Parent Mode after the PIN and the
// public pages, never a child's screen or a child's phone. The core loads
// this file after its store and robot; it only hands over to the app,
// which mounts Pilot if it is still allowed.
(function () {
  "use strict";
  if (window.Pilot && window.RankUpPilot && typeof window.RankUpPilot.start === "function") window.RankUpPilot.start();
})();
