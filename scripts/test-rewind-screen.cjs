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
assert.ok(drawn.includes("REWIND"), "replay tag: " + drawn.join(" | "));
assert.ok(!drawn.some((t) => /\d+ \/ \d+/.test(t)), "the beat count lives in the dock, not the header");
assert.ok(drawn.includes("ENEMY TURN"), "snapshot label");
assert.ok(drawn.includes("내 이동") && drawn.includes("적 이동"), "legend names both trails");
for (const t of g.texts) assert.ok(parseFloat(/(\d+)px/.exec(t.font)[1]) >= 12, t.text + " is drawn at " + t.font);

// Dock: one diamond per beat, the last marks the checkmate, the current one is checked.
const dots = () => game.ui.rewindDots.children;
const checked = () => dots().findIndex((d) => d.attributes["aria-checked"] === "true");
assert.equal(dots().length, 2, "one beat marker per snapshot");
assert.equal(checked(), 1, "the replay opens on the checkmate");
assert.ok(dots()[1].className.includes("fatal") && !dots()[0].className.includes("fatal"), "only the last beat is the checkmate");
assert.equal(game.ui.rewindLabel.textContent, "장면 2 / 2");
assert.equal(game.ui.rewindNext.disabled, true);
dots()[0].handlers.click();
assert.equal(S.rewind.index, 0, "clicking a marker jumps to that beat");
assert.equal(checked(), 0);
assert.equal(game.ui.rewindPrev.disabled, true);
assert.equal(game.ui.rewindLabel.textContent, "장면 1 / 2");
// ← / → step the replay, and only while it is open.
const key = (k) => { let prevented = false; h.context.document.handlers.keydown.forEach((f) => f({ key: k, preventDefault: () => (prevented = true) })); return prevented; };
assert.equal(key("ArrowRight"), true);
assert.equal(S.rewind.index, 1, "→ steps forward");
key("ArrowRight");
assert.equal(S.rewind.index, 1, "→ stops at the checkmate");
key("ArrowLeft");
assert.equal(S.rewind.index, 0, "← steps back");

game.over();
assert.equal(app.classList.contains("rewinding"), false, "the HUD returns on the result screen");
assert.equal(key("ArrowRight"), false, "arrow keys are left alone outside the replay");

game.rememberRewind("YOUR MOVE");
S.phase = "dead";
game.beginDeathRewind();
h.reset({ phase: "player" });
assert.equal(app.classList.contains("rewinding"), false, "a new run brings the HUD back");
console.log("rewind screen tests passed: HUD hidden during the replay, header text ≥12px with a two-item legend, beat markers and ←/→ in the dock, HUD back after the result or a new run");
