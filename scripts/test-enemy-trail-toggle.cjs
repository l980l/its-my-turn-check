const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// Settings: ENEMY PATHS turns the in-game red dashed enemy routes on or off and remembers the choice.
// The death rewind keeps its routes either way, since it is where players read what killed them.
const h = createGameHarness();
const { game } = h;
const canvas = h.elements.get("#game") || h.elements.get("canvas");
const g = canvas.getContext("2d");
const dashes = [], saved = {};
h.context.localStorage.setItem = (key, value) => { saved[key] = value; };
g.setLineDash = (pattern) => dashes.push(pattern.join(","));
const liveTrail = () => { dashes.length = 0; game.draw(); return dashes.includes("5,6"); };

let S = h.reset({ phase: "player" });
S.enemyTrail = [{ x1: 1, y1: 1, x2: 3, y2: 3 }];
assert.equal(game.ui.enemyTrailToggle.checked, true, "on by default");
assert.equal(liveTrail(), true, "routes are drawn when on");

game.ui.enemyTrailToggle.handlers.change({ target: { checked: false } });
assert.equal(S.showEnemyTrail, false);
assert.equal(game.ui.enemyTrailToggle.checked, false);
assert.equal(saved["its-my-turn-enemy-trail-v1"], "0", "the choice is saved");
assert.equal(liveTrail(), false, "routes are hidden when off");

game.rememberRewind("ENEMY TURN");
S.phase = "dead";
game.beginDeathRewind();
dashes.length = 0;
game.drawRewind();
assert.ok(dashes.includes("7,7"), "the death rewind still shows enemy routes");

game.ui.enemyTrailToggle.handlers.change({ target: { checked: true } });
h.reset({ phase: "player" }).enemyTrail = [{ x1: 1, y1: 1, x2: 3, y2: 3 }];
assert.equal(liveTrail(), true, "turning it back on draws routes again");
assert.equal(saved["its-my-turn-enemy-trail-v1"], "1");
console.log("enemy trail toggle tests passed: on by default, off hides live routes and is saved, rewind keeps its routes");
