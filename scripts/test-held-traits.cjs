const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");
const TraitSystem = require("../traits.js");

const h = createGameHarness({ withHeldUi: true });
h.reset();
const { S, ui } = h.game;

assert.equal(ui.heldSlots.length, 6);
assert.ok(ui.heldSlots.every((button) => button.disabled));
S.player.traits = ["shockwave", "longStride", "astralCrown", "echoMonarch"];
S.player.traitLevels = { shockwave: 1, longStride: 2, astralCrown: 3, echoMonarch: 5 };
h.game.playerMove({ x: 1, y: 0 });
assert.equal(ui.heldSlots.filter((button) => !button.disabled).length, 4, "only equipped traits appear in the fixed six slots");
assert.deepEqual(Array.from(ui.heldSlots.slice(0, 4), (button) => button.dataset.level), ["1", "2", "3", "5"]);
assert.equal(ui.heldSlots[1].title, "큰 걸음 · Lv. 2");

const before = JSON.stringify({ phase: S.phase, score: S.score, xp: S.player.xp, traits: S.player.traits, levels: S.player.traitLevels });
ui.heldSlots[1].handlers.click();
assert.equal(ui.heldName.textContent, "큰 걸음 · Lv. 2");
assert.equal(ui.heldCopy.textContent, TraitSystem.atLevel("longStride", 2).desc.replaceAll(" / ", "\n"), "inspection uses the actual equipped level rule with readable line breaks");
assert.equal(S.heldTraitIndex, 1);
assert.equal(ui.heldSlots[1].attributes["aria-expanded"], "true");
assert.equal(JSON.stringify({ phase: S.phase, score: S.score, xp: S.player.xp, traits: S.player.traits, levels: S.player.traitLevels }), before, "inspecting traits does not move or spend a turn");
ui.heldSlots[1].handlers.click();
assert.equal(S.heldTraitIndex, null);
ui.heldSlots[3].handlers.click();
assert.equal(ui.heldDetails.dataset.level, "5");
ui.heldClose.handlers.click();
assert.equal(S.heldTraitIndex, null);
ui.heldSlots[5].handlers.click();
assert.equal(S.heldTraitIndex, null, "empty slots cannot open stale details");

// A level change refreshes the icon metadata and dismisses an old inspection.
S.player.rank = 2;
h.game.openUpgrade(true);
h.advance(600);
const reward = S.upgradeOptions.find((option) => option.id === "shockwave") || S.upgradeOptions[0];
ui.heldSlots[0].handlers.click();
h.game.chooseUpgrade(S.upgradeOptions.indexOf(reward));
if (reward.id === "shockwave") assert.equal(ui.heldSlots[0].dataset.level, "2");
assert.equal(S.heldTraitIndex, null, "equipment changes clear the previous description");
h.game.reset();
assert.ok(ui.heldSlots.every((button) => button.disabled));
assert.ok(ui.heldSlots.every((button) => button.innerHTML === ""));

// Multiple simultaneous synergies have paired, distinct marker colours and
// separate paragraphs in the tooltip, including the actual partner names.
S.player.traits = ["astralCrown", "echoMonarch", "longStride", "royalStep"];
S.player.traitLevels = { astralCrown: 5 };
S.player.traitXp = { astralCrown: 1 };
h.game.hud();
const colors = ui.heldSlots.map((button) => button.style["--synergy-color"]);
assert.equal(colors[0], colors[1]);
assert.equal(colors[2], colors[3]);
assert.notEqual(colors[0], colors[2]);
assert.equal(colors[0], TraitSystem.activeSynergies(S.player.traits).find((s) => s.id === "eclipse").color);
assert.equal(colors[4], undefined);
ui.heldSlots[0].handlers.click();
assert.ok(ui.heldCopy.textContent.includes("\n재사용 2적 턴\n\n시너지 · 일식\n고리 타격 + 부채날\n"));
assert.ok(ui.heldCopy.textContent.endsWith("\n\n낯선 힘이 응축되고 있습니다."));
h.reset();
assert.ok(ui.heldSlots.every((button) => button.style["--synergy-color"] === undefined), "reset clears old marker colours");

function setup(traits, enemies = [], traitLevels = {}) {
  h.reset();
  Object.assign(S.player, { traits, traitLevels, rank: 50 });
  S.enemies = enemies.map((enemy) => ({ type: "pawn", hp: 1, maxHp: 1, ...enemy }));
}

setup(["diagonalBurst", "chainSpark"], [{ x: 1, y: 0 }, { x: 2, y: 1 }], { diagonalBurst: 2, chainSpark: 1 });
h.game.playerMove({ x: 1, y: 0 });
let pulse = ui.heldSlots[0].traitAnimation;
assert.equal(pulse.frames[0].color, "#ff9f43", "two kills flash in CHAIN 2 color");
assert.equal(pulse.options.duration, 320);
assert.equal(ui.heldSlots[0].animations.at(-1), pulse, "the square slot and its icon bounce together");
assert.equal(pulse.frames[0].borderColor, "#ff9f43", "slot border flashes in the same combo color");
assert.ok(pulse.frames[1].boxShadow.includes("2px"), "small expanding edge accent accompanies activation");
assert.equal(ui.heldSlots[0].traitParticles.length, 6, "six small sparks per activated slot");
assert.ok(ui.heldSlots[0].traitParticles.every((particle) => particle.node.style.background === "#ff9f43"), "sparks match combo color");
const spark = ui.heldSlots[0].traitParticles[0];
spark.animation.onfinish();
assert.ok(spark.node.removed);
assert.equal(ui.heldSlots[0].traitParticles.length, 5, "finished sparks are removed");
assert.equal(ui.heldSlots[1].querySelector(".trait-svg-icon").animations, undefined, "XP trait does not flash before its trigger");
h.game.playerMove({ x: 2, y: 0 });
assert.equal(ui.heldSlots[0].traitAnimation, pulse, "no new pulse without activation");

setup(["chainSpark"], [{ x: 1, y: 0 }], { chainSpark: 4 });
S.player.directKills = 3;
h.game.playerMove({ x: 1, y: 0 });
assert.equal(ui.heldSlots[0].traitAnimation.frames[0].color, "#ff4d6d", "bonus XP flashes at the actual fourth capture");
setup(["longStride"], [], { longStride: 4 });
h.game.playerMove({ x: 3, y: 0 });
assert.ok(ui.heldSlots[0].traitAnimation, "extended movement flashes its source trait");
pulse = ui.heldSlots[0].traitAnimation;
S.phase = "player";
h.game.playerMove({ x: 4, y: 0 });
assert.equal(ui.heldSlots[0].traitAnimation, pulse, "ordinary movement does not retrigger range traits");
setup(["longStride"], [], { longStride: 1 });
S.terrain = [{ type: "amplifier", x: 0, y: 0 }];
pulse = ui.heldSlots[0].traitAnimation;
h.game.playerMove({ x: 2, y: 0 });
assert.equal(ui.heldSlots[0].traitAnimation, pulse, "source terrain extension alone does not activate a movement trait");
setup(["diagonalBurst"], [{ x: 1, y: 0 }, { x: 2, y: 1 }], { diagonalBurst: 2 });
h.context.matchMedia = () => ({ matches: true });
h.game.playerMove({ x: 1, y: 0 });
assert.equal(ui.heldSlots[0].traitAnimation.frames[1].transform, "none", "reduced motion keeps color feedback without a bounce");
assert.equal(ui.heldSlots[0].traitParticles.length, 0, "reduced motion suppresses sparks");
h.context.matchMedia = () => ({ matches: false });
setup(["slipstream"], [{ x: 1, y: 0 }], { slipstream: 5 });
h.game.playerMove({ x: 1, y: 0 });
pulse = ui.heldSlots[0].traitAnimation;
h.game.playerMove({ x: 2, y: 0 });
assert.notEqual(ui.heldSlots[0].traitAnimation, pulse, "escape flashes when consumed, not when armed");
const sparks = ui.heldSlots[0].traitParticles.slice();
h.game.reset();
assert.ok(ui.heldSlots[0].traitAnimation.cancelled, "reset cancels stale pulses");
assert.equal(ui.heldSlots[0].traitParticles.length, 0);
assert.ok(sparks.every((particle) => particle.animation.cancelled && particle.node.removed), "reset cleans up spark animations and nodes");

console.log("held trait HUD tests passed: six slots, actual levels, inspection, activation-only feedback, reduced motion and reset cleanup");
