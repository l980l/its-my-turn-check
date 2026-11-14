const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// DEV and PRE stay hidden on the start screen until the build label is tapped
// five times within three seconds.
const h = createGameHarness();
const { ui } = h.game;
const tap = () => ui.buildVersion.handlers.click();

assert.equal(ui.modeToggles.hidden, true, "players do not see the developer switches");
for (let i = 0; i < 4; i++) { tap(); h.advance(500); }
assert.equal(ui.modeToggles.hidden, true, "four taps are not enough");
h.advance(3000);
tap();
assert.equal(ui.modeToggles.hidden, true, "taps older than three seconds do not count");
for (let i = 0; i < 4; i++) { h.advance(400); tap(); }
assert.equal(ui.modeToggles.hidden, false, "five quick taps reveal DEV and PRE");

console.log("dev switch tests passed: hidden by default, five quick taps, stale taps ignored");
