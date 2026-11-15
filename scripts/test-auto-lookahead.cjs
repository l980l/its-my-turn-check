const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createGameHarness } = require("./game-harness.cjs");
const { WEIGHTS, patchSource, patchedGamePath } = require("./auto-lookahead.cjs");

// The measurement-only two-move AUTO: safe next moves and captures add to a
// quiet move's score, and a landing with neither is a trap.
const h = createGameHarness({ gamePath: patchedGamePath(), seed: 7 });
const S = h.reset();
const score = h.context.__lookaheadScore;
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
S.player.piece = "knight";
S.player.x = 0;
S.player.y = 0;
S.terrain = [];
S.grace = 0;
S.invincibleBeats = 0;
const landing = { x: 2, y: 1 };

assert.equal(score(landing), WEIGHTS.safeCap * WEIGHTS.safe, "safe moves count up to the cap");
assert.deepEqual([S.player.x, S.player.y], [0, 0], "the player is put back after scoring");

S.enemies = [{ x: landing.x + 1, y: landing.y + 2, type: "rook", boss: true, bossPhase: "vulnerable", hp: 1 }];
assert.equal(score(landing), WEIGHTS.safeCap * WEIGHTS.safe + WEIGHTS.capture, "a vulnerable boss on a knight cell counts as a capture");
S.enemies.push({ x: 9, y: 9, type: "pawn", hp: 1, maxHp: 1, face: { x: 0, y: 1 } });
score(landing);
assert.deepEqual([S.enemies[1].x, S.enemies[1].y], [9, 9], "the predicted reply does not move the real enemies");

S.enemies = [];
S.terrain = KNIGHT.map(([dx, dy]) => ({ x: landing.x + dx, y: landing.y + dy, type: "wall" }));
assert.equal(score(landing), -WEIGHTS.trap, "a landing with no safe move and no capture is a trap");

assert.throws(() => patchSource("function other() {}"), /markers changed/, "a changed autoMove fails loudly");
assert.ok(!fs.readFileSync(require.resolve("../game.js"), "utf8").includes("lookaheadScore"), "the game's own AUTO stays unchanged");
console.log("auto lookahead tests passed: capped safe moves, captures, traps, no side effects, game AUTO untouched");
