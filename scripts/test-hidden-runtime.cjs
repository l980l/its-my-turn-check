const assert = require("node:assert/strict");
const TraitSystem = require("../traits.js");
const { createGameHarness } = require("./game-harness.cjs");

const { MAX_LEVEL, MASTERIES } = TraitSystem;

// Mastery is deliberately hidden until both prerequisites are complete. XP can
// accumulate first, but the same trait only unlocks once after reaching level 5.
const delayed = {
  traits: ["shockwave"],
  traitLevels: { shockwave: 4 },
  traitXp: { shockwave: MASTERIES.shockwave.requiredXp - 1 },
  mastered: {},
};
assert.deepEqual(TraitSystem.creditMastery(delayed, { shockwave: 1 }), []);
assert.equal(delayed.traitXp.shockwave, MASTERIES.shockwave.requiredXp);
delayed.traitLevels.shockwave = MAX_LEVEL;
assert.deepEqual(TraitSystem.checkMasteries(delayed), ["shockwave"]);
assert.equal(delayed.mastered.shockwave, true);
assert.deepEqual(TraitSystem.checkMasteries(delayed), [], "a mastery cannot unlock twice");
assert.equal(TraitSystem.atLevel("shockwave", MAX_LEVEL, false).mastered, false);
assert.equal(TraitSystem.atLevel("shockwave", MAX_LEVEL, true).mastered, true);
assert.ok(TraitSystem.atLevel("shockwave", MAX_LEVEL, true).rule.damage > TraitSystem.atLevel("shockwave", MAX_LEVEL, false).rule.damage);

const beforeLevel = {
  traits: ["chainSpark"],
  traitLevels: { chainSpark: 4 },
  traitXp: {},
  mastered: {},
};
TraitSystem.creditMastery(beforeLevel, { chainSpark: MASTERIES.chainSpark.requiredXp });
assert.equal(beforeLevel.mastered.chainSpark, undefined, "XP alone cannot reveal mastery before level 5");
beforeLevel.traitLevels.chainSpark = MAX_LEVEL;
assert.deepEqual(TraitSystem.checkMasteries(beforeLevel), ["chainSpark"]);

const capped = {
  traits: TraitSystem.traits.slice(0, 6).map((trait) => trait.id),
  traitLevels: Object.fromEntries(TraitSystem.traits.slice(0, 6).map((trait) => [trait.id, MAX_LEVEL])),
  traitXp: {},
  mastered: {},
};
assert.equal(capped.traits.length, TraitSystem.SLOT_LIMIT);
assert.deepEqual(TraitSystem.offer(99, () => 0.5, capped.traits, capped.traitLevels), [], "mastery never grants a sixth level or a seventh slot");
TraitSystem.creditMastery(capped, Object.fromEntries(capped.traits.map((id) => [id, MASTERIES[id].requiredXp])));
assert.equal(capped.traits.length, TraitSystem.SLOT_LIMIT);
assert.ok(capped.traits.every((id) => capped.traitLevels[id] === MAX_LEVEL && capped.mastered[id]));

assert.deepEqual(TraitSystem.activeSynergies(["shockwave", "diagonalBurst"]).map((entry) => entry.id), ["prismaticImpact"]);
assert.deepEqual(TraitSystem.activeSynergies(["shockwave"]).map((entry) => entry.id), []);
assert.equal(TraitSystem.movement(["longStride", "royalStep"], { longStride: 4, royalStep: 5 }).stride, 3, "the owned-pair synergy adds its bounded movement bonus");

const h = createGameHarness({ withHeldUi: true });
const { S, ui, playerMove, updateHiddenGrowth, hud, hiddenTraitFx, openUpgrade, chooseUpgrade } = h.game;
function setup(traits, levels = {}, enemies = []) {
  h.reset();
  Object.assign(S.player, { traits, traitLevels: levels, rank: 50 });
  S.enemies = enemies.map((enemy) => ({ type: "pawn", hp: 1, maxHp: 1, ...enemy }));
  h.game.moves();
}

// Only killed collateral credits its owning effect. Direct kills, durable hits,
// bosses, items and unrelated traits cannot add mastery XP by accident.
setup(["shockwave"], { shockwave: 5 }, [
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 2, y: -1, hp: 2, maxHp: 2 },
  { x: 2, y: 1, boss: true, bossPhase: "vulnerable", hp: 1, maxHp: 1 },
]);
playerMove({ x: 2, y: 0 });
assert.equal(S.player.traitXp.shockwave, 1, "only Shockwave's killed secondary target is credited");
assert.equal(S.player.traitXp.diagonalBurst, undefined, "unowned effects cannot receive mastery XP");
assert.equal(S.player.traitXp.shockwave, 1, "direct, boss and durable targets add no hidden XP");
assert.equal(S.enemies.find((enemy) => enemy.boss)?.hp, 1, "secondary effects cannot bypass boss immunity");

setup(["diagonalBurst"], { diagonalBurst: 5 }, [
  { x: 2, y: 0 },
  { x: 3, y: 1 },
]);
playerMove({ x: 2, y: 0 });
assert.equal(S.player.traitXp.diagonalBurst, 1, "each secondary kill credits its own effect");

setup(["longStride"], { longStride: 4 }, [{ x: 3, y: 0 }]);
playerMove({ x: 3, y: 0 });
assert.equal(S.player.traitXp.longStride, 1, "a kill reached only through movement assistance credits its movement trait");
S.phase = "player";
playerMove({ x: 4, y: 0 });
assert.equal(S.player.traitXp.longStride, 1, "ordinary follow-up movement grants no mastery XP");

// Royal mastery breaks ordinary durability, not the boss's hit-by-hit gimmick.
setup(["royalStep"], { royalStep: 5 }, [{ x: 1, y: 0, hp: 2, maxHp: 2 }]);
S.player.mastered.royalStep = true;
playerMove({ x: 1, y: 0 });
assert.equal(S.enemies.length, 0, "Royal mastery deals two direct damage to ordinary enemies");
setup(["royalStep"], { royalStep: 5 }, [
  { x: 1, y: 0, hp: 5, maxHp: 5, boss: true, bossPhase: "vulnerable" },
]);
S.player.mastered.royalStep = true;
playerMove({ x: 1, y: 0 });
assert.equal(S.enemies[0].hp, 4, "mastered direct damage still removes only one boss durability");
assert.equal(S.enemies[0].bossPhase, "recover", "the boss closes its opening after the hit");

// Reaching Lv. 5 after the XP requirement is already satisfied unlocks in
// finishUpgrade, without needing another capture or a second upgrade.
h.reset();
const upgradeTraits = ["shockwave", "diagonalBurst", "longStride", "royalStep", "magnet", "chainSpark"];
Object.assign(S.player, {
  rank: 1,
  traits: upgradeTraits,
  traitLevels: Object.fromEntries(upgradeTraits.map((id) => [id, id === "shockwave" ? 4 : MAX_LEVEL])),
  traitXp: { shockwave: MASTERIES.shockwave.requiredXp },
  mastered: {},
});
openUpgrade(true);
h.advance(600);
assert.equal(S.upgradeMode, "trait");
assert.equal(S.upgradeOptions.length, 1);
assert.equal(S.upgradeOptions[0].id, "shockwave");
chooseUpgrade(0);
assert.equal(S.player.traitLevels.shockwave, MAX_LEVEL);
assert.equal(S.player.mastered.shockwave, true, "the Lv. 5 upgrade immediately checks an already-earned mastery");

setup(["slipstream"], { slipstream: 5 }, [{ x: 1, y: 0 }]);
playerMove({ x: 1, y: 0 });
assert.equal(S.player.masteryEscapeReady, false, "a capture only arms Slipstream's internal escape; it does not earn mastery credit yet");
playerMove({ x: 2, y: 0 });
assert.equal(S.player.masteryEscapeReady, true, "the non-attacking escape move arms exactly the next move for attribution");
S.enemies = [{ type: "pawn", hp: 1, maxHp: 1, x: 3, y: 0 }];
playerMove({ x: 3, y: 0 });
assert.equal(S.player.traitXp.slipstream, 1, "only a direct kill on the immediately following escape move credits Slipstream");
assert.equal(S.player.masteryEscapeReady, false);

// Discovery is per run: the same owned pair emits once, and HUD refreshes do
// not rediscover it. Notice particles stay bounded and respect reduced motion.
setup(["shockwave", "diagonalBurst"], { shockwave: 1, diagonalBurst: 1 });
let hidden = updateHiddenGrowth();
assert.deepEqual(Array.from(hidden.synergies), ["prismaticImpact"]);
assert.deepEqual(Array.from(S.discoveredSynergies), ["prismaticImpact"]);
const particleCount = S.particles.length;
assert.ok(particleCount > 0 && particleCount <= 10, "a synergy discovery uses a small bounded particle burst");
hidden = updateHiddenGrowth();
hud();
assert.deepEqual(Array.from(hidden.synergies), []);
assert.equal(S.discoveredSynergies.length, 1, "HUD refresh cannot rediscover an owned synergy");
assert.equal(S.particles.length, particleCount, "repeat checks do not stack particles");
assert.ok(S.growthNoticeActive, "discovery starts a non-blocking notice");
h.game.advanceGrowthNotice(3);
assert.equal(S.growthNoticeActive, null, "the notice expires without stopping the turn");
assert.equal(S.phase, "player");
for (let i = 0; i < 100; i++) hiddenTraitFx("mastery", 0, 0);
assert.ok(S.particles.length <= 280, "repeated hidden effects cannot exceed their particle budget");
assert.ok(S.effects.length <= 80, "repeated hidden effects cannot exceed their effect budget");
h.context.matchMedia = () => ({ matches: true });
const beforeParticles = S.particles.length;
hiddenTraitFx("mastery", 0, 0);
assert.equal(S.particles.length, beforeParticles, "reduced motion suppresses hidden-growth particles");
h.context.matchMedia = () => ({ matches: false });

// Reset clears every hidden-growth state and does not carry discoveries or
// mastery data into the next run.
S.player.traitXp.shockwave = 9;
S.player.mastered.shockwave = true;
h.reset();
assert.deepEqual(Object.keys(S.player.traitXp), []);
assert.deepEqual(Object.keys(S.player.mastered), []);
assert.equal(S.player.masteryEscapeReady, false);
assert.deepEqual(Array.from(S.discoveredSynergies), []);

console.log("hidden growth runtime tests passed: attribution, gated mastery, one-time synergies, bounded feedback and reset");
