const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");
const TraitSystem = require("../traits.js");

const h = createGameHarness();
const { game } = h;
const { S } = game;

function setup(ids, enemies, from = { x: 0, y: 0 }, piece = "queen", traitLevels = {}) {
  h.reset();
  Object.assign(S.player, { ...from, piece, traits: ids, traitLevels, rank: 50 });
  S.enemies = enemies.map((enemy) => ({ type: "pawn", hp: 1, maxHp: 1, ...enemy }));
  game.moves();
}

assert.equal(TraitSystem.traits.length, 13, "the compact trait roster keeps only distinct play patterns");
assert.equal(TraitSystem.SLOT_LIMIT, 6);
assert.equal(TraitSystem.MAX_LEVEL, 5);
assert.ok(TraitSystem.traits.every((trait) => !Object.hasOwn(trait, "tier") && !Object.hasOwn(trait, "recipe")), "traits no longer expose fusion tiers or recipes");

for (const trait of TraitSystem.traits) {
  setup([trait.id], [{ x: 2, y: 1 }]);
  game.playerMove({ x: 1, y: 0 });
  assert.equal(S.kills, 0, trait.id + " cannot attack without a direct kill");
  assert.equal(S.phase, "enemy", trait.id + " cannot earn an escape without a direct kill");

  setup([trait.id], [{ x: 1, y: 0, hp: 7, maxHp: 7 }, { x: 2, y: 1 }]);
  game.playerMove({ x: 1, y: 0 });
  assert.equal(S.player.xp, 0, trait.id + " cannot farm durable targets for trait XP");
  assert.equal(S.enemies[0].hp, 6, trait.id + " deals one direct durability hit");
  assert.equal(S.enemies[1].hp, 1, trait.id + " cannot trigger collateral from a nonlethal hit");
  assert.equal(S.phase, "player", "direct durability hits still keep the player turn");
}

setup(["diagonalBurst"], [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 5, y: 4 }]);
game.playerMove({ x: 1, y: 0 });
assert.equal(S.kills, 2, "level-one attack traits only gain their base one collateral target");

setup(["shockwave"], [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 1 }, { x: 2, y: -1 }], { x: 0, y: 0 }, "queen", { shockwave: 3 });
game.playerMove({ x: 2, y: 0 });
assert.equal(S.kills, 4, "attack level increases collateral target count without changing its geometry");

setup(["diagonalBurst"], [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 3 }]);
game.playerMove({ x: 1, y: 0 });
assert.equal(S.kills, 2);
assert.equal(S.enemies[0].x, 4, "diagonal range remains bounded at higher progression tiers");

setup(["diagonalBurst"], [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 2 }], { x: 0, y: 0 }, "queen", { diagonalBurst: 5 });
S.terrain = [{ type: "wall", x: 2, y: 1 }];
game.playerMove({ x: 1, y: 0 });
assert.equal(S.kills, 1, "walls still block collateral line attacks at maximum level");

setup(["echoMonarch"], [{ x: 1, y: 0 }, { x: 2, y: 0, boss: true, bossPhase: "vulnerable", bossXp: 5, bossScore: 5000 }], { x: 0, y: 0 }, "queen", { echoMonarch: 5 });
game.playerMove({ x: 1, y: 0 });
assert.equal(S.enemies[0].hp, 1, "secondary effects never damage bosses");

setup(["crossCheck", "echoMonarch"], [{ x: 1, y: 0 }, { x: 2, y: 0, hp: 7, maxHp: 7 }], { x: 0, y: 0 }, "queen", { crossCheck: 5, echoMonarch: 5 });
game.playerMove({ x: 1, y: 0 });
assert.equal(S.enemies[0].hp, 6, "one collateral victim cannot be hit twice by separate traits in one move");

setup(["chainSpark"], [{ x: 1, y: 0 }], { x: 0, y: 0 }, "queen", { chainSpark: 4 });
S.player.directKills = 3;
game.playerMove({ x: 1, y: 0 });
assert.equal(S.player.xp, 2, "level-four Chain Spark grants bonus XP on its fourth direct capture");

setup(["slipstream"], [{ x: 1, y: 0 }], { x: 0, y: 0 }, "queen", { slipstream: 5 });
game.playerMove({ x: 1, y: 0 });
game.playerMove({ x: 2, y: 0 });
assert.equal(S.phase, "player", "one escape can be earned by a direct capture");
game.playerMove({ x: 3, y: 0 });
assert.equal(S.phase, "enemy", "escape cannot loop in the same enemy turn");

setup(["longStride"], [], { x: 0, y: 0 }, "bishop", { longStride: 3 });
assert.ok(S.moves.some((move) => move.x === 1 && move.y === 0));
assert.ok(S.moves.some((move) => move.x === 4 && move.y === 4));
assert.ok(S.moves.some((move) => move.x === 1 && move.y === 0), "Long Stride's royal branch remains visible at level three");

console.log("trait combat integration tests passed: standalone traits, level scaling, kill-only XP, turn retention, boss immunity, shared collateral and movement");
