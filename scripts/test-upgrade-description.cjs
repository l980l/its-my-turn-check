const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");
const TraitSystem = require("../traits.js");

const h = createGameHarness({ withUpgradeUi: true });
h.reset();
const { S, ui } = h.game;

S.player.rank = 2;
h.game.openUpgrade(true);
assert.equal(S.upgradeMode, "trait");
assert.equal(ui.upgradePanel.dataset.mode, "trait");
assert.equal(S.upgradeDescriptionIndex, null);
assert.equal(S.traitRerolls, 2);
ui.choices.forEach((card, index) => {
  const option = S.upgradeOptions[index];
  assert.equal(card.querySelector("strong").textContent, option.name);
  assert.equal(card.dataset.level, "1", "new traits expose their initial level to CSS");
  assert.equal(card.querySelector("span").textContent, "Lv. 1");
  assert.equal(ui.choiceInfo[index].hidden, false);
});

ui.choiceInfo[0].handlers.click();
assert.equal(S.upgradeDescriptionIndex, null, "initial touch lock also covers description buttons");
h.advance(600);
const before = JSON.stringify(S.player);
ui.choiceInfo[0].handlers.click();
assert.equal(S.upgradeDescriptionIndex, 0);
assert.equal(JSON.stringify(S.player), before, "opening details cannot select a trait or consume the reward");
assert.equal(S.phase, "upgrade");
assert.equal(ui.upgradeDetailName.textContent, S.upgradeOptions[0].name);
assert.ok(ui.upgradeDetailCopy.textContent.includes(S.upgradeOptions[0].desc));
assert.equal(ui.choiceInfo[0].attributes["aria-expanded"], "true");
ui.choiceInfo[1].handlers.click();
assert.equal(S.upgradeDescriptionIndex, 1);
assert.equal(ui.choiceInfo[0].attributes["aria-expanded"], "false");
ui.choiceInfo[1].handlers.click();
assert.equal(S.upgradeDescriptionIndex, null, "clicking the same button closes its details");

const selected = S.upgradeOptions[0].id;
ui.choices[0].handlers.click();
assert.ok(S.player.traits.includes(selected), "normal selection remains separate from description");
assert.equal(S.player.traitLevels[selected], 1);
assert.equal(S.phase, "player");

// A full six-slot build offers upgrades only, including a compact current -> next explanation.
h.reset();
Object.assign(S.player, {
  rank: 2,
  traits: TraitSystem.traits.slice(0, 6).map((trait) => trait.id),
  traitLevels: Object.fromEntries(TraitSystem.traits.slice(0, 6).map((trait) => [trait.id, 1])),
});
h.game.openUpgrade(true);
assert.equal(S.upgradeMode, "trait");
assert.ok(S.upgradeOptions.every((option) => S.player.traits.includes(option.id) && option.level === 2));
ui.choices.forEach((card) => {
  assert.equal(card.dataset.level, "2");
  assert.equal(card.querySelector("span").textContent, "Lv. 1 → 2");
});
h.advance(600);
ui.choiceInfo[0].handlers.click();
assert.match(ui.upgradeDetailCopy.textContent, /현재 Lv\. 1/);
assert.match(ui.upgradeDetailCopy.textContent, /→ Lv\. 2/);
const upgraded = S.upgradeOptions[0].id;
ui.choices[0].handlers.click();
assert.equal(S.player.traitLevels[upgraded], 2, "a full build levels the owned trait rather than adding a hidden material");
assert.equal(S.player.traits.length, TraitSystem.SLOT_LIMIT);

// Rerolls share a two-use quota, avoid the shown set where candidates permit it, and respect locks.
h.reset();
Object.assign(S.player, {
  rank: 2,
  traits: TraitSystem.traits.slice(0, 6).map((trait) => trait.id),
  traitLevels: Object.fromEntries(TraitSystem.traits.slice(0, 6).map((trait) => [trait.id, 1])),
});
h.game.openUpgrade(true);
h.advance(600);
const firstSet = new Set(S.upgradeOptions.map((option) => option.id));
assert.equal(ui.reroll.hidden, false);
ui.reroll.handlers.click();
assert.equal(S.traitRerolls, 1);
assert.equal(S.upgradeOptions.filter((option) => firstSet.has(option.id)).length, 0, "reroll avoids the immediately previous candidates when the pool permits it");
ui.reroll.handlers.click();
assert.equal(S.traitRerolls, 1, "reroll lock prevents rapid double spending");
h.advance(300);
ui.reroll.handlers.click();
assert.equal(S.traitRerolls, 0);
assert.equal(ui.reroll.disabled, true);

// Once every equipped trait is capped, level-up becomes a fixed score reward.
h.reset();
Object.assign(S.player, {
  rank: 2,
  traits: TraitSystem.traits.slice(0, 6).map((trait) => trait.id),
  traitLevels: Object.fromEntries(TraitSystem.traits.slice(0, 6).map((trait) => [trait.id, TraitSystem.MAX_LEVEL])),
});
S.score = 42;
h.game.openUpgrade(true);
assert.equal(S.upgradeMode, "bonus");
assert.equal(S.upgradeOptions[0].id, "scoreBonus");
h.advance(600);
h.game.chooseUpgrade(0);
assert.equal(S.score, 1042);
assert.equal(S.phase, "player");

console.log("upgrade description tests passed: acquisition, level-up copy, shared rerolls, locks, fixed-slot growth and max-level score reward");
