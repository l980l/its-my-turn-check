"use strict";

const assert = require("node:assert/strict");
const TraitSystem = require("../traits.js");

const { SLOT_LIMIT, traits, byId, availableRecipes, fuse, movement, resolve, escape, rewardPool, ancestry } = TraitSystem;

assert.equal(SLOT_LIMIT, 6);
assert.equal(traits.filter((trait) => trait.tier === 1).length, 10);
assert.equal(traits.filter((trait) => trait.tier === 2).length, 6);
assert.equal(traits.filter((trait) => trait.tier === 3).length, 6);
assert.equal(traits.filter((trait) => trait.tier === 4).length, 6);

for (const trait of traits) {
  assert.ok(trait.id && trait.name && trait.desc && trait.icon, `${trait.id} needs display metadata`);
  if (!trait.recipe) continue;
  assert.ok(trait.rule, `${trait.id} has its own effect rule`);
  assert.equal(trait.recipe.length, 2, `${trait.id} is a two-material fusion`);
  for (const ingredient of trait.recipe) {
    assert.ok(byId[ingredient], `${trait.id} references ${ingredient}`);
    assert.equal(byId[ingredient].tier, trait.tier - 1, `${trait.id} uses only the prior tier`);
  }
  assert.ok(ancestry(trait.id).every((id) => byId[id].tier === 1), `${trait.id} resolves to base traits`);
}

assert.deepEqual(rewardPool(0).map((trait) => trait.tier).filter((tier) => tier !== 1), []);
assert.ok(rewardPool(6).some((trait) => trait.tier === 2));
assert.ok(TraitSystem.offer(5, () => 0).every((trait) => trait.tier === 1));
assert.ok(TraitSystem.offer(6, () => 0).every((trait) => trait.tier === 2));
assert.equal(new Set(TraitSystem.offer(6).map((trait) => trait.id)).size, 3);
assert.ok(TraitSystem.offer(6, () => 0.9, ["shockwave"]).some((trait) => trait.id === "diagonalBurst"), "assisted offer includes the missing recipe material");
assert.ok(TraitSystem.offer(19, () => 0.49).every((trait) => trait.tier === 1));
assert.ok(TraitSystem.offer(20, () => 0.49).every((trait) => trait.tier === 2));
assert.ok(TraitSystem.offer(40, () => 0.6).every((trait) => trait.tier === 2));
let offerSeed = 20261016;
const offerRandom = () => { offerSeed = (Math.imul(offerSeed, 1664525) + 1013904223) >>> 0; return offerSeed / 4294967296; };
for (let i=0; i<256; i++) {
  const inventory = i % 2 ? ["shockwave"] : ["kineticCrown"];
  const offered = TraitSystem.offer(40, offerRandom, inventory);
  assert.equal(offered.length, 3);
  assert.equal(new Set(offered.map((trait) => trait.id)).size, 3);
  assert.ok(offered.every((trait) => trait.tier <= 2), "T3/T4 remain fusion-only");
  const eligible = traits.filter((trait) => trait.tier === offered[0].tier &&
    availableRecipes([...inventory, trait.id]).some((recipe) => !inventory.includes(recipe.id)));
  if (eligible.length) assert.ok(offered.some((trait) => eligible.some((candidate) => candidate.id === trait.id)));
}

const materials = ["shockwave", "diagonalBurst", "longStride", "royalStep"];
const before = [...materials];
assert.deepEqual(availableRecipes(materials).map((trait) => trait.id), ["kineticCrown", "royalVector"]);
const fused = fuse(materials, "kineticCrown");
assert.ok(availableRecipes(materials).every((trait) => trait.desc), "workshop recipes include generated effect descriptions");
assert.deepEqual(materials, before, "fuse must not mutate its input");
assert.deepEqual(fused, ["longStride", "royalStep", "kineticCrown"]);
assert.throws(() => fuse(["shockwave"], "kineticCrown"), /missing ingredients/);

const duplicateMaterials = ["shockwave", "shockwave", "diagonalBurst"];
assert.deepEqual(fuse(duplicateMaterials, "kineticCrown"), ["shockwave", "kineticCrown"], "only required copies are consumed");

assert.deepEqual(movement(["longStride", "longStride"]), {stride:1, royal:0});
assert.deepEqual(movement(["royalVector"]), {stride:1, royal:1});
assert.deepEqual(movement(["kineticCrown"]), {stride:0, royal:0}, "recipes do not silently inherit ancestor effects");
const nearby = [{x:1,y:1,hp:1}, {x:-1,y:1,hp:1}, {x:2,y:2,hp:1}, {x:8,y:8,hp:1}];
const combat = {from:{x:-2,y:0},to:{x:0,y:0},directKill:true,directKills:1,chain:3,wave:0,enemies:nearby};
for (const trait of traits) {
  const noKill = resolve([trait.id], {...combat, directKill:false}, {});
  assert.equal(noKill.targets.length, 0, `${trait.id} requires a direct kill`);
  assert.equal(noKill.xp, 0, `${trait.id} cannot farm durable hits for XP`);
  assert.equal(resolve([trait.id], combat, {}).targets.length, resolve([trait.id, trait.id], combat, {}).targets.length, "duplicate trait cannot add damage");
  if (trait.tier === 1 && trait.rule.shape) assert.ok(trait.rule.maxTargets <= 1 && trait.rule.range <= 2);
  assert.doesNotMatch(trait.desc, /짝수|기본 효과:/);
}
assert.equal(resolve(["kineticCrown"], combat, {}).targets.length, 2);
assert.equal(resolve(["diagonalBurst"], combat, {}).targets.length, 1);
assert.equal(resolve(["kineticCrown"], {...combat,isWall:() => true}, {}).targets.length, 0, "walls block splash rays");
assert.equal(resolve(["kineticCrown"], {...combat,enemies:[{x:1,y:1,boss:true}]}, {}).targets.length, 0, "collateral never bypasses boss mechanics");
assert.equal(resolve(["chainSpark"], {...combat,directKills:3}, {}).xp, 0);
assert.equal(resolve(["chainSpark"], {...combat,directKills:4}, {}).xp, 1);
const cooldown = {};
assert.ok(resolve(["prismaticEmperor"], combat, cooldown).targets.length > 0);
assert.equal(resolve(["prismaticEmperor"], combat, cooldown).targets.length, 0, "waiting and extra player moves cannot refresh cooldowns");
assert.ok(resolve(["prismaticEmperor"], {...combat,wave:1}, cooldown).targets.length > 0);
assert.equal(resolve(["astralCrown"], {...combat,chain:2}, {}).targets.length, 0);
const escapeMemory = {};
assert.equal(escape(["slipstream"], 0, escapeMemory), false, "extra move must be earned by a direct kill");
resolve(["slipstream"], combat, escapeMemory);
assert.equal(escape(["slipstream"], 0, escapeMemory), true);
resolve(["slipstream", "currentDrift"], combat, escapeMemory);
assert.equal(escape(["currentDrift"], 0, escapeMemory), false, "equipping a different escape trait cannot bypass shared cooldown");
assert.equal(escape(["currentDrift"], 6, escapeMemory), true);

let build = ["shockwave", "diagonalBurst", "longStride", "royalStep"];
build = fuse(build, "kineticCrown");
build = fuse(build, "royalVector");
build = fuse(build, "prismaticImpact");
assert.deepEqual(build, ["prismaticImpact"]);
assert.ok(build.length <= SLOT_LIMIT);

const sixTopTierSample = [
  "astralCrown",
  "thunderRegent",
  "echoMonarch",
  "circuitSovereign",
  "driftEmperor",
  "prismaticEmperor",
];
assert.equal(sixTopTierSample.length, SLOT_LIMIT, "six tier-four traits fit the final build capacity");
assert.ok(sixTopTierSample.every((id) => byId[id].tier === 4));

console.log("trait system tests passed");
