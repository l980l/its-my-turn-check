"use strict";

const assert = require("node:assert/strict");
const EnemyTraits = require("../enemy-traits.js");
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} !== ${expected}`);
const paired = (values) => { let index = 0; return () => values[index++]; };

assert.deepEqual(EnemyTraits.ids, ["guardian", "ember", "healer", "split"]);
for (const id of EnemyTraits.ids) assert.ok(EnemyTraits.definitions[id].name && EnemyTraits.definitions[id].desc);

assert.equal(EnemyTraits.spawnChance(0), 0);
assert.equal(EnemyTraits.spawnChance(60, true), 0, "the first active minute survives the contract");
closeTo(EnemyTraits.spawnChance(90), 0.03);
closeTo(EnemyTraits.spawnChance(120), 0.06);
closeTo(EnemyTraits.spawnChance(210), 0.08);
closeTo(EnemyTraits.spawnChance(300), 0.10);
closeTo(EnemyTraits.spawnChance(600), 0.16);
closeTo(EnemyTraits.spawnChance(1200), 0.28);
closeTo(EnemyTraits.spawnChance(1800), 0.40);
closeTo(EnemyTraits.spawnChance(999999), 0.40);
closeTo(EnemyTraits.spawnChance(600, true), 0.32);
closeTo(EnemyTraits.spawnChance(1800, true), 0.80);
const countAnchors = [
  [1799, [1, 0, 0, 0]], [1800, [0.95, 0.05, 0, 0]],
  [2400, [0.80, 0.20, 0, 0]], [2700, [0.65, 0.30, 0.05, 0]],
  [3600, [0.30, 0.40, 0.25, 0.05]], [4500, [0.15, 0.40, 0.30, 0.15]],
  [999999, [0.15, 0.40, 0.30, 0.15]],
];
for (const [seconds, expected] of countAnchors)
  EnemyTraits.traitCountWeights(seconds).forEach((weight, i) => closeTo(weight, expected[i]));
EnemyTraits.traitCountWeights(2100).forEach((weight, i) => closeTo(weight, [0.875, 0.125, 0, 0][i]));
EnemyTraits.traitCountWeights(2550).forEach((weight, i) => closeTo(weight, [0.725, 0.25, 0.025, 0][i]));
for (let seconds = 0; seconds <= 5400; seconds += 7) {
  const weights = EnemyTraits.traitCountWeights(seconds);
  closeTo(weights.reduce((sum, weight) => sum + weight, 0), 1);
  assert.ok(weights.every((weight) => weight >= 0 && weight <= 1));
}

assert.deepEqual(EnemyTraits.rollTraits(120, false, paired([0.06, 0])), [], "chance uses a strict less-than boundary");
assert.deepEqual(EnemyTraits.rollTraits(120, false, paired([0.059, 0.99, 0.99])), ["split"], "before 30 minutes success selects one trait");
assert.deepEqual(EnemyTraits.rollTraits(1800, false, paired([0, 0.95, 0, 0.5])), ["guardian", "healer"], "the top 5% count draw selects two traits at 30 minutes");
assert.deepEqual(EnemyTraits.rollTraits(3600, false, paired([0, 0.95, 0, 0, 0, 0])), ["guardian", "ember", "healer", "split"], "the top 5% count draw selects four unique traits at 60 minutes");
assert.equal(EnemyTraits.roll(1800, false, paired([0, 0, 0])), "guardian", "legacy roll returns the first trait");
for (const [seconds, weights] of countAnchors) {
  let threshold = 0;
  weights.forEach((weight, index) => {
    if (weight) {
      const values = [0, threshold + weight / 2, 0, 0, 0, 0];
      assert.equal(EnemyTraits.rollTraits(seconds, false, paired(values)).length, index + 1);
      assert.equal(EnemyTraits.rollTraits(seconds, true, paired(values)).length, index + 1, "contract does not alter the count draw");
    }
    threshold += weight;
  });
}

const legacyGuardian = { x:1, y:1, trait:"guardian" };
const mixedGuardian = { x:3, y:3, enemyTraits:["guardian", "healer", "guardian", "unknown"] };
assert.deepEqual(EnemyTraits.traitsOf(legacyGuardian), ["guardian"]);
assert.deepEqual(EnemyTraits.traitsOf(mixedGuardian), ["guardian", "healer"], "canonical arrays validate and dedupe");
assert.equal(EnemyTraits.has(mixedGuardian, "guardian"), true);
assert.equal(EnemyTraits.has(mixedGuardian, "unknown"), false);
assert.deepEqual(EnemyTraits.traitsOf({ trait:"guardian", enemyTraits:[] }), [], "canonical arrays never fall back to legacy state");

const guardian = { x:1, y:1, enemyTraits:["guardian"] };
const protectedPawn = { x:2, y:2, enemyTraits:[] };
const guardianTarget = { x:2, y:1, enemyTraits:["guardian", "healer"] };
assert.equal(EnemyTraits.isProtected(protectedPawn, [guardian, protectedPawn]), true);
assert.equal(EnemyTraits.isProtected(guardianTarget, [guardian, guardianTarget]), false, "any guardian-bearing target is excluded");
assert.equal(EnemyTraits.isProtected({ x:3, y:3, enemyTraits:[] }, [guardian]), false);
const protectedSet = EnemyTraits.protectedEnemies([guardian, protectedPawn, guardianTarget, { x:1, y:2, enemyTraits:[] }, { x:0, y:0, enemyTraits:[] }, { x:2, y:2, boss:true }]);
assert.equal(protectedSet.size, 3);
assert.ok(protectedSet.has(protectedPawn) && !protectedSet.has(guardianTarget));

const healerA = { x:0, y:0, enemyTraits:["healer"], hp:1, maxHp:1 };
const healerB = { x:2, y:0, enemyTraits:["guardian", "healer"], hp:1, maxHp:2 };
const injuredNear = { x:1, y:0, enemyTraits:[], hp:1, maxHp:3 };
const injuredFar = { x:0, y:2, enemyTraits:[], hp:1, maxHp:2 };
const healing = EnemyTraits.heal([healerA, healerB, injuredNear, injuredFar, { x:0, y:1, boss:true, hp:1, maxHp:5 }]);
assert.deepEqual(healing.map(({ healer, target }) => [healer, target]), [[healerA, injuredNear], [healerB, injuredFar]], "mixed healers choose unique targets deterministically");
assert.equal(injuredNear.hp, 1, "heal remains pure");

const splitter = { x:5, y:5, enemyTraits:["split", "ember"], splitsLeft:2, face:{ x:1, y:0 }, risk:true };
const generationOne = EnemyTraits.splitChildren(splitter, [splitter, { x:6, y:5 }], (x, y) => x === 5 && y === 4);
assert.deepEqual(generationOne.map((child) => [child.x, child.y, child.enemyTraits, child.trait, child.splitsLeft]), [[5, 6, ["split"], "split", 1], [4, 5, ["split"], "split", 1]]);
assert.ok(generationOne.every((child) => child.face.x === 1 && child.face !== splitter.face && child.risk), "children preserve contract reward eligibility but do not inherit other enemy traits");
const generationTwo = EnemyTraits.splitChildren(generationOne[0], generationOne);
assert.ok(generationTwo.every((child) => child.enemyTraits.length === 0 && child.trait === null && child.splitsLeft === 0));
assert.deepEqual(EnemyTraits.splitChildren(generationTwo[0], generationTwo), []);

let seed = 20261019;
function seeded() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }
const samples = 120000, distribution = [0, 0, 0, 0, 0];
for (let index = 0; index < samples; index += 1) distribution[EnemyTraits.rollTraits(3600, false, seeded).length] += 1;
const appeared = samples - distribution[0];
const averageTraits = distribution.reduce((sum, count, length) => sum + count * length, 0) / samples;
assert.ok(Math.abs(appeared / samples - 0.40) < 0.006, "same seeded RNG preserves capped 40% appearance chance");
assert.ok(distribution[2] > 0 && distribution[3] > 0 && distribution[4] > 0, "late-game distribution can produce all allowed trait counts");
const expectedAll = [0.60, 0.12, 0.16, 0.10, 0.02];
distribution.forEach((count, index) => assert.ok(Math.abs(count / samples - expectedAll[index]) < 0.006, "seeded count distribution matches the direct weighted table"));
assert.ok(averageTraits > 0.79 && averageTraits < 0.85, "60-minute expected traits per new enemy is 0.82");

console.log("enemy trait rule tests passed");
