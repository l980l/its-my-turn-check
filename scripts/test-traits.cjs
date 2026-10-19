"use strict";

const assert = require("node:assert/strict");
const TraitSystem = require("../traits.js");
const { SLOT_LIMIT, MAX_LEVEL, traits, byId, atLevel, movement, resolve, escape, offer } = TraitSystem;

assert.equal(SLOT_LIMIT, 6);
assert.equal(MAX_LEVEL, 5);
assert.equal(traits.length, 13, "the trait pool is the ten base choices plus three distinct patterns");
assert.equal(new Set(traits.map((trait) => trait.id)).size, traits.length);
assert.ok(traits.every((trait) => !Object.hasOwn(trait, "tier") && !Object.hasOwn(trait, "recipe")), "tiers and recipes are removed");
assert.equal(TraitSystem.availableRecipes, undefined);
assert.equal(TraitSystem.fuse, undefined);
assert.equal(TraitSystem.ancestry, undefined);
for (const removedId of ["kineticCrown", "royalVector", "arcRelay", "forkedEcho", "crossCurrent", "tacticalDrift", "prismaticImpact", "sovereignRelay", "stormFork", "echoCurrent", "currentDrift", "crownDrift", "thunderRegent", "driftEmperor", "prismaticEmperor"]) {
  assert.equal(byId[removedId], undefined, `${removedId} was an old evolution-only choice`);
}

function power(rule) {
  if (rule.maxTargets) return rule.maxTargets * 10 + (rule.range || 0);
  if (rule.xpEvery) return -rule.xpEvery;
  if (rule.escape) return -rule.escape;
  return (rule.stride || 0) + (rule.royal || 0);
}
for (const trait of traits) {
  assert.ok(trait.id && trait.name && trait.icon && trait.desc && trait.rule, `${trait.id} needs display metadata`);
  let previousPower = -Infinity;
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const upgraded = atLevel(trait.id, level);
    assert.equal(upgraded.id, trait.id);
    assert.equal(upgraded.level, level);
    assert.strictEqual(atLevel(trait.id, level), upgraded, `${trait.id} level ${level} is cached`);
    assert.ok(upgraded.desc && upgraded.rule, `${trait.id} level ${level} needs a rule and description`);
    assert.ok(power(upgraded.rule) > previousPower, `${trait.id} level ${level} must be a useful bounded upgrade`);
    previousPower = power(upgraded.rule);
  }
}

const ids = traits.map((trait) => trait.id);
const random = () => 0.37;
const opening = offer(0, random, [], {}, []);
assert.equal(opening.length, 3);
assert.ok(opening.every((trait) => trait.level === 1));
assert.equal(new Set(opening.map((trait) => trait.id)).size, 3);
const rerolled = offer(0, random, [], {}, opening);
assert.equal(rerolled.filter((trait) => opening.some((prior) => prior.id === trait.id)).length, 0, "reroll avoids prior candidates when the pool supports it");
const partial = ids.slice(0, 3);
assert.ok(offer(0, random, partial).every((trait) => !partial.includes(trait.id)), "empty slots never offer owned traits");
const full = ids.slice(0, SLOT_LIMIT);
const levels = Object.fromEntries(full.map((id) => [id, 1]));
const upgrades = offer(0, random, full, levels);
assert.equal(upgrades.length, 3);
assert.ok(upgrades.every((trait) => full.includes(trait.id) && trait.level === 2), "full slots offer upgrades only");
assert.deepEqual(offer(0, random, full, Object.fromEntries(full.map((id) => [id, MAX_LEVEL]))), [], "all-max builds stop offering traits");
const sparseLevels = Object.fromEntries(full.map((id, index) => [id, index < 2 ? MAX_LEVEL : 1]));
const firstSparse = full.slice(2, 5).map((id) => atLevel(id, 2));
const sparseReroll = offer(0, random, full, sparseLevels, firstSparse);
assert.ok(sparseReroll.some((trait) => trait.id === full[5]), "reroll keeps the one fresh result even when repeats must fill the row");

assert.deepEqual(movement(["longStride"], { longStride: 1 }), { stride: 1, royal: 0 });
assert.deepEqual(movement(["longStride"], { longStride: 5 }), { stride: 2, royal: 3 });
assert.deepEqual(movement(["royalStep"], { royalStep: 5 }), { stride: 2, royal: 3 });
assert.equal(byId.astralCrown.name, "고리 타격");
assert.equal(byId.echoMonarch.name, "부채날");
assert.equal(byId.circuitSovereign.name, "교차 타격");
for (const [id, cellAtRange] of [["diagonalBurst", (range) => ({ x:range, y:range })], ["crossCheck", (range) => ({ x:range, y:0 })], ["echoBlade", (range) => ({ x:range, y:0 })]]) {
  for (let level = 2; level <= MAX_LEVEL; level++) {
    const previous = atLevel(id, level - 1).rule;
    const current = atLevel(id, level).rule;
    assert.ok(current.maxTargets > previous.maxTargets || current.range > previous.range, `${id} level ${level} improves a real combat limit`);
    if (current.range <= previous.range) continue;
    const rangeEnemy = cellAtRange(current.range);
    const rangeContext = { from:{ x:-1, y:0 }, to:{ x:0, y:0 }, directKill:true, directKills:1, chain:0, wave:0, enemies:[rangeEnemy] };
    assert.equal(resolve([id], rangeContext, {}, { [id]:level - 1 }).targets.length, 0, `${id} level ${level - 1} cannot reach its next range cell`);
    assert.equal(resolve([id], rangeContext, {}, { [id]:level }).targets.length, 1, `${id} level ${level} reaches its new range cell`);
  }
}
const enemies = [{ x: 1, y: 1, hp: 1 }, { x: -1, y: 1, hp: 1 }, { x: 2, y: 2, hp: 1 }, { x: 8, y: 8, hp: 1 }, { x: 1, y: -1, boss: true }];
const combat = { from: { x: -2, y: 0 }, to: { x: 0, y: 0 }, directKill: true, directKills: 5, chain: 3, wave: 0, enemies };
for (const trait of traits) {
  assert.equal(resolve([trait.id], { ...combat, directKill: false }, {}, { [trait.id]: 5 }).targets.length, 0, `${trait.id} requires direct kill`);
  assert.equal(resolve([trait.id], { ...combat, directKill: false }, {}, { [trait.id]: 5 }).xp, 0, `${trait.id} cannot farm durable hits`);
}
const splash = resolve(["diagonalBurst", "astralCrown"], combat, {}, { diagonalBurst: 5, astralCrown: 5 });
assert.equal(new Set(splash.targets).size, splash.targets.length, "an enemy only takes one secondary hit per move");
assert.ok(splash.targets.every((enemy) => !enemy.boss), "collateral never bypasses boss mechanics");
assert.ok(splash.activated.some((id) => id === "diagonalBurst" || id === "astralCrown"), "only traits that actually hit are activated");
assert.equal(resolve(["chainSpark"], { ...combat, directKills: 4 }, {}, { chainSpark: 5 }).xp, 0);
const xp = resolve(["chainSpark"], { ...combat, directKills: 6 }, {}, { chainSpark: 5 });
assert.equal(xp.xp, 1);
assert.ok(xp.activated.includes("chainSpark"));
const memory = {};
resolve(["slipstream"], combat, memory, { slipstream: 5 });
assert.equal(escape(["slipstream"], 0, memory, { slipstream: 5 }), true);
assert.equal(escape(["slipstream"], 0, memory, { slipstream: 5 }), false, "escape uses shared cooldown");
assert.ok(!resolve(["slipstream"], combat, {}, { slipstream: 5 }).activated.includes("slipstream"), "escape arming does not trigger slot feedback");
assert.equal(byId.shockwave.name, "충격파");
console.log("trait system tests passed");
