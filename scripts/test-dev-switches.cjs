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

// DEV BEAT does nothing once the player is down; during the rewind it used to kill them again.
const run = createGameHarness();
for (const phase of ["dead", "rewind"]) {
  const S = run.reset({ phase });
  const wave = S.wave;
  run.game.devBeat();
  assert.equal(S.phase, phase, "DEV BEAT is ignored during " + phase);
  assert.equal(S.wave, wave, "no enemy beat runs during " + phase);
}
const S = run.reset({ phase: "player" });
const wave = S.wave;
run.game.devBeat();
assert.equal(S.wave, wave + 1, "DEV BEAT still runs an enemy beat during play");
// [4] SPEED cycles ×1 → ×2 → ×4 → ×8 → ×16 → ×1 and the label names the current speed.
const speeds = [];
for (let i = 0; i < 5; i++) { run.game.ui.devSpeed.handlers.click(); speeds.push(S.devSpeed + ":" + run.game.ui.devSpeed.textContent); }
assert.deepEqual(speeds, ["2:[4] SPEED ×2", "4:[4] SPEED ×4", "8:[4] SPEED ×8", "16:[4] SPEED ×16", "1:[4] SPEED ×1"]);
console.log("dev tool tests passed: switches hidden by default, five quick taps, stale taps ignored, no DEV BEAT after death, SPEED ×1–×16 cycle");
