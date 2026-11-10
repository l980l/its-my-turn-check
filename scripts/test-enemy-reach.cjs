"use strict";

// HOW TO PLAY tells players that enemy rooks, bishops and queens slide at most
// three squares per enemy turn; this pins the engine to that promise.
const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

const h = createGameHarness({ seed: 20261110 });
const { toward } = h.game;
const S = h.reset();
S.player.x = 0;
S.player.y = 0;
const step = (type, x, y) => {
  const e = { x, y, type, face: { x: 0, y: 1 }, hp: 1, maxHp: 1 };
  S.enemies = [e];
  const to = toward(e);
  return [to.x, to.y];
};

assert.deepEqual(step("rook", 7, 0), [4, 0], "a far rook stops after three squares");
assert.deepEqual(step("bishop", -6, 6), [-3, 3], "a far bishop stops after three squares");
assert.deepEqual(step("queen", 0, -8), [0, -5], "a far queen stops after three squares");
assert.deepEqual(step("rook", 4, 0), [1, 0], "a rook four squares away cannot reach the player");
assert.deepEqual(step("queen", 3, 3), [0, 0], "a queen three squares away reaches the player");
assert.deepEqual(step("pawn", 5, 0), [4, 0], "pawns move one square");
assert.deepEqual(step("king", 5, 5), [4, 4], "kings move one square");
console.log("enemy reach ok");
