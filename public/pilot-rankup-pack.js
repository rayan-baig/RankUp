// Pilot on RankUp: the knowledge pack, the "why RankUp" list and RankUp's
// tools, loaded by the core when Pilot is first opened (docs/PILOT.md).
// They are written in the app (src/pilot/pilotKnowledge.js and
// src/pilot/pilotTools.js), so every price and number comes from the code
// that charges or counts it; this file hands them to the core.
(function () {
  "use strict";
  if (window.RankUpPilot && typeof window.RankUpPilot.pack === "function") window.PilotPack = window.RankUpPilot.pack();
})();
