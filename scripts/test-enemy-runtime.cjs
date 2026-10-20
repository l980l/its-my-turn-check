"use strict";

// Runtime contract tests for enemy traits.  The pure geometry/probability rules
// live in test-enemy-traits.cjs; this file deliberately drives the game loop so
// trait interactions cannot quietly diverge from their visual rules.
const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

const h = createGameHarness({ seed: 20261019 });
const {
  S,
  damageEnemies,
  enemyBeat,
  beginPlayerTurn,
  resolveRisk,
  offerRisk,
} = h.game;

function enemy(x, y, trait = null, extra = {}) {
  return {
    x, y, type: "pawn", face: { x: 0, y: 1 }, hp: 1, maxHp: 1,
    trait, splitsLeft: trait === "split" ? 2 : 0,
    ...extra,
  };
}

function fresh(options = {}) {
  const state = h.reset(options);
  state.enemies = [];
  state.items = [];
  state.terrain = [];
  state.emberHazards = [];
  state.effects = [];
  state.particles = [];
  state.wave = 0;
  state.rank = 0;
  state.player.x = 0;
  state.player.y = 0;
  state.player.piece = "pawn";
  state.player.traits = [];
  state.player.traitLevels = {};
  state.player.mastered = {};
  state.player.xp = 0;
  state.player.rank = 0;
  state.player.traitMemory = {};
  state.player.directKills = 0;
  state.grace = 99;
  state.invincibleBeats = 0;
  return state;
}

// Guardian blocks only trait-origin collateral. Direct attacks remove a guardian
// and immediately expose the previously shielded target in the same player turn.
fresh();
const guardian = enemy(1, 0, "guardian");
const shielded = enemy(2, 0);
S.enemies = [guardian, shielded];
let result = damageEnemies([shielded], 1, new Set(), 1, "trait");
assert.equal(result.hits, 0, "guardian blocks adjacent trait damage");
assert.equal(shielded.hp, 1);
result = damageEnemies([guardian], 1, new Set(), 1, "direct");
assert.equal(result.kills, 1, "a guardian can be directly removed");
assert.ok(!S.enemies.includes(guardian));
result = damageEnemies([shielded], 1, new Set(), 1, "trait");
assert.equal(result.kills, 1, "the exposed target is hit by a later trait effect in the same action");

// Field items are neither trait attacks nor guardian-blocked collateral.
fresh();
S.enemies = [enemy(1, 0, "guardian"), enemy(2, 0)];
result = damageEnemies([S.enemies[1]], 1, new Set(), 1, "item");
assert.equal(result.kills, 1, "judgement-style item damage ignores guardian shielding");

// Ember does not interrupt a capture chain. It schedules exactly one hazard for
// the following enemy turn, never for subsequent player moves in the same turn.
fresh();
S.wave = 8;
const ember = enemy(1, 0, "ember");
S.enemies = [ember];
result = damageEnemies([ember], 1, new Set(), 1, "direct");
assert.equal(result.kills, 1);
assert.equal(JSON.stringify(S.emberHazards), JSON.stringify([{ x: 1, y: 0, detonateWave: 9 }]));
assert.equal(S.phase, "player", "killing ember does not end the player turn");
beginPlayerTurn();
beginPlayerTurn();
assert.equal(S.emberHazards.length, 1, "repeat player-side work cannot detonate ember hazards");

// Staying on the ember square during the next enemy turn dies; leaving it or an
// active Aegis-like invincibility survives it.
S.player.x = 1;
S.player.y = 0;
S.grace = 0;
S.enemies = [];
enemyBeat();
assert.equal(S.phase, "captured");
assert.equal(S.deathReason, "잔불 폭발");
assert.equal(S.emberHazards.length, 0, "a detonated ember is consumed once");

fresh();
S.wave = 8;
S.emberHazards = [{ x: 1, y: 0, detonateWave: 9 }];
S.player.x = 0;
S.player.y = 0;
S.grace = 0;
S.enemies = [];
enemyBeat();
assert.notEqual(S.phase, "captured", "moving away before the enemy turn survives ember");

fresh();
S.wave = 8;
S.emberHazards = [{ x: 0, y: 0, detonateWave: 9 }];
S.grace = 0;
S.invincibleBeats = 1;
S.enemies = [];
enemyBeat();
assert.notEqual(S.phase, "captured", "invincibility protects against ember explosion");

// Healers act once per enemy beat, never heal bosses, and cannot stack onto the
// same target even if several healers can reach it.
fresh();
const healerA = enemy(-1, 0, "healer", { hp: 1, maxHp: 2 });
const healerB = enemy(1, 0, "healer", { hp: 1, maxHp: 2 });
const wounded = enemy(0, 1, null, { hp: 1, maxHp: 3 });
const boss = enemy(0, -1, null, { boss: true, hp: 1, maxHp: 5, bossPhase: "sealed" });
S.enemies = [healerA, healerB, wounded, boss];
S.grace = 99;
enemyBeat();
assert.equal(wounded.hp, 2, "one target receives only one point of healing per beat");
assert.equal(boss.hp, 1, "healers never restore bosses");

// A split family has two finite generations: root -> two children -> four
// grandchildren. Empty/player/occupied cells are never used by child spawns.
fresh();
const root = enemy(5, 5, "split", { splitsLeft: 2 });
S.enemies = [root];
result = damageEnemies([root], 1, new Set(), 1, "direct");
assert.equal(result.kills, 1);
assert.equal(S.enemies.length, 2, "a root creates at most two children");
assert.ok(S.enemies.every((entry) => entry.trait === "split" && entry.splitsLeft === 1));
const children = [...S.enemies];
children.forEach((child) => damageEnemies([child], 1, new Set(), 1, "direct"));
assert.equal(S.enemies.length, 4, "two children create at most four final descendants");
assert.ok(S.enemies.every((entry) => entry.trait === null && entry.splitsLeft === 0));
const grandchildren = [...S.enemies];
grandchildren.forEach((child) => damageEnemies([child], 1, new Set(), 1, "direct"));
assert.equal(S.enemies.length, 0, "final descendants cannot split again");

fresh();
S.player.x = 1;
S.player.y = 0;
const cramped = enemy(1, 1, "split", { splitsLeft: 2 });
S.enemies = [cramped, enemy(2, 1), enemy(1, 2)];
damageEnemies([cramped], 1, new Set(), 1, "direct");
assert.ok(S.enemies.every((entry) => entry.x !== S.player.x || entry.y !== S.player.y), "split children never occupy the player square");
assert.equal(new Set(S.enemies.map((entry) => `${entry.x},${entry.y}`)).size, S.enemies.length, "split children do not overlap occupied cells");

// The dangerous contract changes trait density, not enemy durability. Existing
// risk rewards (2 XP / 1.5x points) remain intact for the spawned-risk marker.
fresh();
offerRisk();
assert.equal(S.phase, "risk");
resolveRisk(true);
assert.equal(S.riskBeats, 10, "accepting a contract starts its ten enemy-turn timer");
const riskEnemy = enemy(1, 0, "guardian", { risk: true, hp: 1, maxHp: 1 });
S.enemies = [riskEnemy];
result = damageEnemies([riskEnemy], 1, new Set(), 1, "direct");
assert.equal(result.kills, 1);
assert.equal(result.points, 150, "the prior 1.5x risk score reward remains");
assert.equal(S.player.xp, 2, "the prior doubled risk XP reward remains");
assert.equal(riskEnemy.maxHp, 1, "contract-marked enemies do not gain durability");

// Enemy traits scale from real, active play time rather than wave count. The
// same draw fails at five minutes (10%) but succeeds under a contract (20%).
// Exercise spawn itself, not just a hand-authored risk-marked enemy.
fresh();
S.wave = 4;
S.elapsedPlaySeconds = 300;
const originalRandom = h.context.Math.random;
h.context.Math.random = () => 0.14;
h.game.spawn();
assert.equal(S.enemies.length, 1);
assert.equal(S.enemies[0].trait, null);
assert.equal(S.enemies[0].maxHp, 1);
S.enemies = [];
S.riskBeats = 10;
h.game.spawn();
assert.equal(S.enemies.length, 1);
assert.equal(S.enemies[0].trait, "guardian");
assert.equal(S.enemies[0].maxHp, 1, "contract generation does not add the old durability penalty");
assert.equal(S.enemies[0].risk, true);
h.context.Math.random = originalRandom;

// At thirty active minutes a successful enemy can receive a second, unique
// trait. The controlled RNG selects guardian first, then ember. A single
// physical badge-bearing enemy therefore owns both rules at once.
fresh();
S.wave = 4;
S.elapsedPlaySeconds = 1800;
assert.equal(h.context.EnemyTraits.spawnChance(S.elapsedPlaySeconds), 0.40, "thirty active minutes reaches the 40% normal-trait ceiling");
assert.equal(h.context.EnemyTraits.spawnChance(S.elapsedPlaySeconds, true), 0.80, "the contract doubles the capped normal chance");
const spawnDraws = [0, 0, 0, 0, 0.96, 0, 0, 0];
h.context.Math.random = () => spawnDraws.shift() ?? 0;
h.game.spawn();
assert.equal(S.enemies.length, 1);
assert.deepEqual(Array.from(S.enemies[0].enemyTraits), ["guardian", "ember"]);
assert.equal(S.enemies[0].trait, "guardian", "legacy primary trait remains the first badge");
h.context.Math.random = originalRandom;

// Multi-trait enemies apply each compatible rule. A guardian/healer protects
// neighbours from collateral and also heals once per enemy turn.
fresh();
const guardianHealer = enemy(-1, 0, "guardian", { enemyTraits:["guardian", "healer"], hp:1, maxHp:2 });
const protectedWounded = enemy(0, 0, null, { hp:1, maxHp:2 });
S.enemies = [guardianHealer, protectedWounded];
result = damageEnemies([protectedWounded], 1, new Set(), 1, "trait");
assert.equal(result.hits, 0, "guardian remains active when combined with healer");
S.grace = 99;
enemyBeat();
assert.equal(protectedWounded.hp, 2, "healer remains active when combined with guardian");

// A split+ember enemy creates both one hazard and its finite split children.
// Children inherit only their remaining split lineage, never every parent trait.
fresh();
S.wave = 8;
const splitEmber = enemy(5, 5, "split", { enemyTraits:["split", "ember"], splitsLeft:2 });
S.enemies = [splitEmber];
result = damageEnemies([splitEmber], 1, new Set(), 1, "direct");
assert.equal(result.kills, 1);
assert.deepEqual(JSON.parse(JSON.stringify(S.emberHazards)), [{x:5, y:5, detonateWave:9}]);
assert.equal(S.enemies.length, 2);
assert.ok(S.enemies.every((entry) => JSON.stringify(entry.enemyTraits) === JSON.stringify(["split"])));

// Difficulty time accrues only over a consecutive active player/enemy interval.
// Paused overlays and hidden documents establish a fresh baseline on return, so
// none of their elapsed wall-clock time leaks into progression.
fresh({ running:false, phase:"tutorial" });
S.elapsedPlaySeconds = 0;
h.context.document.hidden = false;
h.game.advanceDifficultyClock(h.now());
h.advance(120000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 0, "non-running tutorial time is excluded");

S.running = true;
S.phase = "player";
h.game.advanceDifficultyClock(h.now()); // establish an active baseline
h.advance(30000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 30, "active player time accrues in real seconds");

S.devSpeed = 2;
h.advance(5000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 35, "developer game speed does not accelerate difficulty time");
S.devSpeed = 1;

S.phase = "upgrade";
h.game.advanceDifficultyClock(h.now());
h.advance(60000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 35, "upgrade selection time is excluded");

S.phase = "risk";
h.game.advanceDifficultyClock(h.now());
h.advance(60000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 35, "risk selection time is excluded");

S.phase = "devpick";
h.game.advanceDifficultyClock(h.now());
h.advance(60000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 35, "developer picker time is excluded");

S.phase = "enemy";
h.game.advanceDifficultyClock(h.now()); // returning active starts a fresh baseline
h.advance(15000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 50, "enemy time resumes from the active baseline only");

h.context.document.hidden = true;
h.game.advanceDifficultyClock(h.now());
h.advance(60000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 50, "hidden-tab time is excluded");
h.context.document.hidden = false;
h.game.advanceDifficultyClock(h.now());
h.advance(5000);
h.game.advanceDifficultyClock(h.now());
assert.equal(S.elapsedPlaySeconds, 55, "visible return starts a fresh baseline without counting pause time");

fresh();
S.wave = 4;
S.grace = 99;
S.riskBeats = 10;
for (let turn = 0; turn < 10; turn++) {
  S.enemies = [];
  enemyBeat();
  assert.equal(S.riskBeats, 9 - turn, "contract expires after exactly ten enemy turns");
}

// The larger population exposed an existing knight landing collision: neither
// ordinary allies nor a stationary boss may share a knight's destination.
fresh();
S.wave = 5;
S.grace = 99;
S.player.x = 3; S.player.y = 7;
const stationaryBoss = enemy(3, 3, null, {boss: true, bossPhase: "sealed", gimmick: "blood", seals: 4, hp: 5, maxHp: 5});
const jumpingEnemy = enemy(5, 2, null, {type: "knight"});
S.enemies = [stationaryBoss, jumpingEnemy];
enemyBeat();
assert.notEqual(`${jumpingEnemy.x},${jumpingEnemy.y}`, "3,3", "knights cannot land on a stationary boss");

console.log("enemy trait runtime tests passed");
