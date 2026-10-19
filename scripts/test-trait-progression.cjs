const assert = require("node:assert/strict");
const TraitSystem = require("../traits.js");
const { createGameHarness } = require("./game-harness.cjs");

assert.equal(TraitSystem.SLOT_LIMIT, 6);
assert.equal(TraitSystem.MAX_LEVEL, 5);
assert.equal(TraitSystem.traits.length, 13);

const impactOne = TraitSystem.atLevel("shockwave", 1);
const impactFive = TraitSystem.atLevel("shockwave", 5);
assert.equal(impactOne.level, 1);
assert.equal(impactOne.rule.maxTargets, 1);
assert.equal(impactFive.level, 5);
assert.equal(impactFive.rule.maxTargets, 5);
assert.match(impactFive.desc, /최대 5기/);
assert.equal(TraitSystem.atLevel("longStride", 4).rule.stride, 2);
assert.equal(TraitSystem.atLevel("royalStep", 5).rule.royal, 3);
assert.equal(TraitSystem.atLevel("chainSpark", 2).rule.xpEvery, 6);
assert.equal(TraitSystem.atLevel("slipstream", 5).rule.escape, 4);
assert.throws(() => TraitSystem.atLevel("not-a-trait"), /unknown trait/);

const initial = TraitSystem.offer(1, () => 0.5, []);
assert.equal(initial.length, 3);
assert.ok(initial.every((trait) => trait.level === 1));
const owned = TraitSystem.traits.slice(0, 6).map((trait) => trait.id);
const levels = Object.fromEntries(owned.map((id) => [id, 1]));
const upgrades = TraitSystem.offer(5, () => 0.5, owned, levels);
assert.equal(upgrades.length, 3);
assert.ok(upgrades.every((trait) => owned.includes(trait.id) && trait.level === 2));
const allCapped = Object.fromEntries(owned.map((id) => [id, TraitSystem.MAX_LEVEL]));
assert.deepEqual(TraitSystem.offer(5, () => 0.5, owned, allCapped), []);

const previous = upgrades.map((trait) => trait.id);
const rerolled = TraitSystem.offer(5, () => 0.5, owned, levels, previous);
assert.equal(rerolled.filter((trait) => previous.includes(trait.id)).length, 0, "reroll candidates avoid the previous offer when enough alternatives exist");
assert.deepEqual(TraitSystem.movement(["longStride", "royalStep"], { longStride: 4, royalStep: 5 }), { stride: 3, royal: 3 }, "Royal Vector adds its bounded stride bonus when both traits are owned");

const targets = [{ x: 3, y: 0, hp: 1 }, { x: 2, y: 1, hp: 1 }, { x: 2, y: -1, hp: 1 }];
const resolved = TraitSystem.resolve(["shockwave"], {
  directKill: true, directKills: 1, wave: 1, chain: 1,
  from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, enemies: targets,
}, {}, { shockwave: 3 });
assert.equal(resolved.targets.length, 3, "attack levels scale targets while preserving a single trait geometry");
assert.deepEqual(resolved.activated, ["shockwave"]);

// Exercise the actual game closure too: no vestigial fusion loot, all 30
// trait rewards including milestone forks, fixed slots, and capped rewards.
const h = createGameHarness({ withUpgradeUi: true });
const { S, ui, damageEnemies, openUpgrade, chooseUpgrade, playerMove } = h.game;
h.reset();
S.enemies = [{ boss: true, bossPhase: "vulnerable", hp: 1, bossXp: 5, bossScore: 5000, x: 1, y: 0 }];
damageEnemies([...S.enemies], 1, new Set());
assert.equal(S.items.length, 0, "boss kills do not create obsolete fusion kits");

// A real capture that levels the player must pause for reward selection, then
// resume the player immediately instead of leaking an enemy turn.
h.reset();
S.player.rank = 1;
S.player.xp = 4;
S.enemies = [{ type: "pawn", hp: 1, maxHp: 1, x: 1, y: 0 }];
playerMove({ x: 1, y: 0 });
assert.equal(S.phase, "upgrade", "a capture-triggered level-up opens the reward before enemy movement");
h.advance(600);
chooseUpgrade(0);
assert.equal(S.phase, "player", "choosing a capture-triggered reward preserves the player turn");

h.reset();
S.player.rank = 1;
for (let reward = 0; reward < 30; reward++) {
  const rankBefore = S.player.rank;
  openUpgrade(true);
  h.advance(600);
  if (S.upgradeMode === "fork") {
    const traitRoute = S.upgradeOptions.findIndex((option) => option.kind === "trait");
    assert.ok(traitRoute >= 0, "every milestone still exposes a trait route");
    chooseUpgrade(traitRoute);
    h.advance(300);
  }
  assert.equal(S.upgradeMode, "trait", "forced milestone trait route resolves to the normal trait chooser");
  assert.ok(S.upgradeOptions.length > 0);
  chooseUpgrade(0);
  assert.equal(S.player.rank, rankBefore + 1, "each reward advances exactly one level");
  assert.equal(S.phase, "player", "capture-origin level rewards never hand an enemy turn to the player");
  assert.ok(S.player.traits.length <= TraitSystem.SLOT_LIMIT);
  assert.equal(Object.hasOwn(S.player, "materials"), false, "the old invisible material bag is gone");
}
assert.equal(S.player.traits.length, TraitSystem.SLOT_LIMIT, "thirty trait rewards fill exactly six fixed slots");
assert.ok(S.player.traits.every((id) => S.player.traitLevels[id] === TraitSystem.MAX_LEVEL), "thirty rewards cap all six equipped traits");
assert.equal(new Set(S.player.traits).size, TraitSystem.SLOT_LIMIT, "trait slots never duplicate or overflow");

// The shared two-use reroll pool resets on a new run and respects the click lock.
h.reset();
Object.assign(S.player, {
  rank: 2,
  traits: TraitSystem.traits.slice(0, TraitSystem.SLOT_LIMIT).map((trait) => trait.id),
  traitLevels: Object.fromEntries(TraitSystem.traits.slice(0, TraitSystem.SLOT_LIMIT).map((trait) => [trait.id, 1])),
});
openUpgrade(true);
h.advance(600);
ui.reroll.handlers.click();
assert.equal(S.traitRerolls, 1);
ui.reroll.handlers.click();
assert.equal(S.traitRerolls, 1, "the reroll lock blocks a second immediate spend");
h.advance(300);
ui.reroll.handlers.click();
assert.equal(S.traitRerolls, 0);
h.reset();
assert.equal(S.traitRerolls, 2, "a new run restores the shared reroll quota");

Object.assign(S.player, {
  rank: 2,
  traits: TraitSystem.traits.slice(0, TraitSystem.SLOT_LIMIT).map((trait) => trait.id),
  traitLevels: Object.fromEntries(TraitSystem.traits.slice(0, TraitSystem.SLOT_LIMIT).map((trait) => [trait.id, TraitSystem.MAX_LEVEL])),
});
S.score = 7;
openUpgrade(true);
assert.equal(S.upgradeMode, "bonus");
h.advance(600);
chooseUpgrade(0);
assert.equal(S.score, 1007, "all-capped slots grant the fixed score bonus rather than an unusable trait");
assert.equal(S.phase, "player");

console.log("trait progression tests passed: 13 standalone traits, levels 1-5, offers, reroll exclusion, 30 real reward flows, fixed slots and capped rewards");
