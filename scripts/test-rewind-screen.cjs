const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// The death replay draws its own header over the top of the screen, so the
// live HUD and the beat meter step aside (#app gets "rewinding") until the
// result screen opens or a new run starts.
const h = createGameHarness();
const { game } = h;
const app = h.elements.get("#app");
const canvas = h.elements.get("#game") || h.elements.get("canvas");
const g = canvas.getContext("2d");

let S = h.reset({ phase: "player" });
game.rememberRewind("YOUR MOVE");
game.rememberRewind("ENEMY TURN");
S.phase = "dead";
game.beginDeathRewind();
assert.equal(S.phase, "rewind");
assert.equal(app.classList.contains("rewinding"), true, "the HUD hides during the replay");
assert.equal(game.ui.rewindControls.classList.contains("hidden"), false, "the replay controls show");

// Header: beat counter, the snapshot label and a two-item legend, none smaller than 12px.
g.texts.length = 0;
game.drawRewind();
const drawn = g.texts.map((t) => t.text);
assert.ok(drawn.includes("REWIND 2 / 2"), "beat counter: " + drawn.join(" | "));
assert.ok(drawn.includes("ENEMY TURN"), "snapshot label");
assert.ok(drawn.includes("내 이동") && drawn.includes("적 이동"), "legend names both trails");
for (const t of g.texts) assert.ok(parseFloat(/(\d+)px/.exec(t.font)[1]) >= 12, t.text + " is drawn at " + t.font);

game.over();
assert.equal(app.classList.contains("rewinding"), false, "the HUD returns on the result screen");

game.rememberRewind("YOUR MOVE");
S.phase = "dead";
game.beginDeathRewind();
h.reset({ phase: "player" });
assert.equal(app.classList.contains("rewinding"), false, "a new run brings the HUD back");
console.log("rewind screen tests passed: HUD hidden during the replay, header text ≥12px with a two-item legend, HUD back after the result or a new run");
