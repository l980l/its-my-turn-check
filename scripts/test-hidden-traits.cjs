"use strict";

const assert = require("node:assert/strict");
const localized = require("../traits.js");
assert.deepEqual(localized.traits.map((trait) => trait.name), [
  "충격파", "대각 파동", "큰 걸음", "왕의 걸음", "자력 충격", "연쇄의 깨달음", "잔향검",
  "기사의 일격", "십자 타격", "바람걸음", "고리 타격", "부채날", "교차 타격",
]);
assert.deepEqual(localized.traits.map((trait) => localized.atLevel(trait.id, 5, true).name), [
  "초신성", "빛의 창", "거인의 보폭", "제왕의 행진", "극성 폭풍", "전장의 통찰", "메아리 칼날",
  "기사의 심판", "십자 심판", "무영보", "궤도 폭격", "폭풍의 칼날", "교차 섬멸",
]);
assert.deepEqual(localized.SYNERGIES.map((synergy) => synergy.name), [
  "무지개 충격", "갈라진 잔향", "연쇄 방전", "왕의 진군", "일식",
  "사슬 감옥", "포위망", "진군 나팔", "철벽 교대", "호위 합류",
]);
const TraitSystem = require("../traits.js");
const { traits, coopTraits, MASTERIES, SYNERGIES, MAX_LEVEL, atLevel, checkMasteries, creditMastery, activeSynergies, movement, resolve, escape } = TraitSystem;

assert.equal(Object.keys(MASTERIES).length, traits.length + coopTraits.length, "every solo and two-player trait has one mastery");
assert.equal(SYNERGIES.length, 10);
for (const trait of [...traits, ...coopTraits]) {
  const mastery = MASTERIES[trait.id];
  assert.ok(mastery.name && mastery.desc && Number.isInteger(mastery.requiredXp));

  const levelFirst = { traits:[trait.id], traitLevels:{ [trait.id]:MAX_LEVEL }, traitXp:{}, mastered:{} };
  assert.deepEqual(checkMasteries(levelFirst), []);
  assert.deepEqual(creditMastery(levelFirst, { [trait.id]:mastery.requiredXp - 1 }), []);
  assert.deepEqual(creditMastery(levelFirst, { [trait.id]:1 }), [trait.id], `${trait.id} unlocks at the exact threshold`);
  assert.equal(levelFirst.mastered[trait.id], true);
  assert.deepEqual(checkMasteries(levelFirst), [], `${trait.id} is idempotent`);

  const xpFirst = { traits:[trait.id], traitLevels:{ [trait.id]:1 }, traitXp:{}, mastered:{} };
  creditMastery(xpFirst, { [trait.id]:mastery.requiredXp });
  assert.equal(xpFirst.mastered[trait.id], undefined, `${trait.id} cannot master before its mastery level`);
  xpFirst.traitLevels[trait.id] = MAX_LEVEL;
  assert.deepEqual(checkMasteries(xpFirst), [trait.id], `${trait.id} unlocks when level condition arrives second`);
}

for (const trait of coopTraits) {
  const early = { traits:[trait.id], traitLevels:{ [trait.id]:2 }, traitXp:{ [trait.id]:MASTERIES[trait.id].requiredXp }, mastered:{} };
  assert.deepEqual(checkMasteries(early), [], `${trait.id} waits for Lv. 3`);
  early.traitLevels[trait.id] = 3;
  assert.deepEqual(checkMasteries(early), [trait.id], `two-player ${trait.id} masters at Lv. 3`);
}
const locked = { traits:[], traitLevels:{ shockwave:MAX_LEVEL }, traitXp:{ shockwave:MASTERIES.shockwave.requiredXp } };
assert.deepEqual(checkMasteries(locked), [], "unowned traits cannot master");
assert.equal(locked.mastered, undefined, "failed mastery checks do not create state");
const invalidCredit = { traits:["shockwave"], traitLevels:{ shockwave:1 } };
creditMastery(invalidCredit, { shockwave:-1, diagonalBurst:99, bad:2 });
creditMastery(invalidCredit, { shockwave:1.5 });
assert.equal(invalidCredit.traitXp, undefined, "negative, fractional, and unowned credits are ignored");

const masterShock = atLevel("shockwave", 5, true);
assert.equal(masterShock.mastered, true);
assert.equal(masterShock.name, MASTERIES.shockwave.name);
assert.equal(masterShock.rule.damage, 2);
assert.ok(masterShock.rule.maxTargets <= 8);
const masterOrbit = atLevel("astralCrown", 5, true);
assert.equal(masterOrbit.rule.damage, 3, "orbit mastery gets its defined heavy hit");
assert.equal(atLevel("chainSpark", 5, true).rule.xpEvery, 2);
assert.equal(atLevel("chainSpark", 5, true).rule.xp, 3);
assert.equal(atLevel("slipstream", 5, true).rule.escape, 2);
assert.deepEqual(atLevel("longStride", 5, true).rule, { stride:3, royal:3 });
assert.deepEqual(atLevel("royalStep", 5, true).rule, { stride:2, royal:4, directDamage:2 });
assert.match(atLevel("royalStep", 5, true).desc, /직접 공격 2피해/);

const combat = {
  from:{ x:-2, y:0 }, to:{ x:0, y:0 }, directKill:true, directKills:2, chain:3, wave:10,
  enemies:[{ x:1, y:0 }, { x:-1, y:0 }, { x:0, y:1 }, { x:0, y:-1 }, { x:1, y:1, boss:true }, { x:2, y:0 }],
};
const masterHit = resolve(["shockwave"], combat, {}, { shockwave:5 }, { shockwave:true });
assert.equal(masterHit.fx.length, 1);
assert.equal(masterHit.fx[0].damage, 2);
assert.equal(masterHit.fx[0].style, "master");
assert.ok(masterHit.fx[0].targets.every((enemy) => !enemy.boss), "master collateral still excludes bosses");
assert.equal(resolve(["shockwave"], { ...combat, isWall:() => true }, {}, { shockwave:5 }, { shockwave:true }).targets.length, 0, "walls still block master splash");
const escapeMemory = {};
resolve(["slipstream"], combat, escapeMemory, { slipstream:5 }, { slipstream:true });
assert.equal(escape(["slipstream"], 10, escapeMemory, { slipstream:5 }, { slipstream:true }), true);
resolve(["slipstream"], combat, escapeMemory, { slipstream:5 }, { slipstream:true });
assert.equal(escape(["slipstream"], 11, escapeMemory, { slipstream:5 }, { slipstream:true }), false);
assert.equal(escape(["slipstream"], 12, escapeMemory, { slipstream:5 }, { slipstream:true }), true, "master escape shares a finite two-turn cooldown");

assert.deepEqual(activeSynergies(["shockwave"]), []);
const active = activeSynergies(["shockwave", "diagonalBurst", "longStride", "royalStep"]);
assert.deepEqual(active.map((synergy) => synergy.id), ["prismaticImpact", "royalVector"]);
assert.deepEqual(movement(["longStride", "royalStep"], { longStride:5, royalStep:5 }), { stride:3, royal:3 }, "royal vector adds one bounded stride");
const synergyCombat = {
  from:{ x:-2, y:0 }, to:{ x:0, y:0 }, directKill:true, directKills:1, chain:0, wave:4,
  enemies:[{ x:2, y:0 }, { x:-2, y:0 }, { x:0, y:2 }, { x:0, y:-2 }, { x:1, y:1, boss:true }],
};
const synergyMemory = {};
const synergyHit = resolve(["shockwave", "diagonalBurst"], synergyCombat, synergyMemory, { shockwave:1, diagonalBurst:1 });
const prismatic = synergyHit.fx.find((effect) => effect.synergy === "prismaticImpact");
assert.ok(prismatic);
assert.equal(prismatic.id, "shockwave");
assert.equal(prismatic.style, "synergy");
assert.equal(prismatic.damage, 1);
assert.equal(prismatic.targets.length, 3);
assert.equal(new Set(synergyHit.targets).size, synergyHit.targets.length, "normal and synergy effects cannot hit an enemy twice");
assert.ok(synergyHit.targets.every((enemy) => !enemy.boss));
assert.equal(resolve(["shockwave", "diagonalBurst"], synergyCombat, synergyMemory, { shockwave:1, diagonalBurst:1 }).fx.some((effect) => effect.synergy === "prismaticImpact"), false, "synergy cooldown is finite and enforced");
assert.equal(resolve(["shockwave", "diagonalBurst"], { ...synergyCombat, isWall:() => true }, {}, { shockwave:1, diagonalBurst:1 }).fx.some((effect) => effect.synergy === "prismaticImpact"), false, "walls block synergy rays");

console.log("hidden mastery and synergy tests passed");
