"use strict";

const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// Mouse hover explains what is under the cursor: enemy pieces (with HP, movement, traits
// and guardian protection), bosses, field items, embers, terrain and off-screen enemy markers.
const h = createGameHarness();
const { game, elements } = h;
const canvas = elements.get("#game");
const { ui } = game;
const S = h.reset({ phase: "player" });
Object.assign(ui.enemyTraitTip, { offsetWidth: 200, offsetHeight: 60 });
const at = (x, y) => game.pos(x, y);
const hover = ({ x, y }) => {
  canvas.handlers.pointermove({ pointerType: "mouse", clientX: x, clientY: y });
  game.updateEnemyTraitTip();
  return { hidden: ui.enemyTraitTip.classList.contains("hidden"), name: ui.enemyTraitTipName.textContent, copy: ui.enemyTraitTipCopy.textContent };
};

S.enemies = [
  { x: 2, y: 0, type: "rook", hp: 2, maxHp: 2, enemyTraits: [] },
  { x: 3, y: 0, type: "pawn", hp: 1, maxHp: 1, enemyTraits: ["guardian"] },
  { x: -2, y: 0, type: "knight", hp: 1, maxHp: 1, enemyTraits: [] },
];
let tip = hover(at(2, 0));
assert.equal(tip.hidden, false);
assert.equal(tip.name, "적 룩");
assert.match(tip.copy, /내구도 2\/2/);
assert.match(tip.copy, /상하좌우 직선으로 최대 3칸/);
assert.match(tip.copy, /수호받는 중/, "an enemy beside a guardian says it is protected");
assert.equal(canvas.style.cursor, "help");

tip = hover(at(-2, 0));
assert.equal(tip.name, "적 나이트");
assert.doesNotMatch(tip.copy, /수호받는 중/, "an unguarded enemy does not");

tip = hover(at(3, 0));
assert.match(tip.copy, /특성: 수호/, "the guardian lists its trait");
assert.doesNotMatch(tip.copy, /수호받는 중/, "a guardian is not itself protected");

S.items = [{ type: "aegis", x: 0, y: 2, life: 9 }];
tip = hover(at(0, 2));
assert.match(tip.name, /KING'S AEGIS · 아이템/);
assert.match(tip.copy, /무적/);
assert.match(tip.copy, /9턴 뒤 사라집니다/);

S.emberHazards = [{ x: 1, y: 2, detonateWave: S.wave + 1 }];
assert.equal(hover(at(1, 2)).name, "잔불");

S.terrain = [{ x: -1, y: 2, type: "amplifier" }];
tip = hover(at(-1, 2));
assert.equal(tip.name, "증폭 지대 · 지형");
assert.match(tip.copy, /사거리 \+1/);

tip = hover(at(0, -2));
assert.equal(tip.hidden, true, "an empty cell shows nothing");
assert.equal(canvas.style.cursor, "");

S.enemies = [{ x: 60, y: 0, type: "queen", hp: 1, maxHp: 1, enemyTraits: [] }];
S.showOffscreenIndicators = true;
const marker = game.edgeEnemyTargets()[0];
assert.ok(marker, "the far queen gets an edge marker");
tip = hover(marker);
assert.equal(tip.name, "화면 밖 · 적 퀸");
assert.match(tip.copy, /화면 밖에 있는 적입니다. 거리 60칸/);

game.spawnBoss("rook");
const boss = S.enemies.find((e) => e.boss);
tip = hover(at(boss.x, boss.y));
if (game.edgeEnemyTargets().some((t) => t.e === boss)) tip = hover(game.edgeEnemyTargets().find((t) => t.e === boss));
assert.match(tip.name, /IRON ROOK/);
assert.match(tip.copy, /청록색으로 빛날 때만 공격할 수 있고/);
assert.match(tip.copy, /가로 또는 세로 한 줄을 붉은 선으로 예고합니다/, "IRON ROOK explains its line pattern");
assert.match(tip.copy, /RAGE/);
assert.match(tip.copy, /지금: 예고 중/);

// Every boss explains its own pattern.
const bossTip = (kind) => {
  S.enemies = [];
  game.spawnBoss(kind);
  const b = S.enemies.find((e) => e.boss), edge = game.edgeEnemyTargets().find((t) => t.e === b);
  return hover(edge || at(b.x, b.y));
};
tip = bossTip("bloodQueen");
assert.match(tip.name, /BLOOD QUEEN/);
assert.match(tip.copy, /봉인된 채로 나타나/);
assert.match(tip.copy, /지금: 봉인 중 · 남은 봉인 4\/4/);
tip = bossTip("checkmateBishop");
assert.match(tip.copy, /SAFE 구역/);
assert.doesNotMatch(tip.copy, /RAGE/, "CHECKMATE BISHOP has no rage lines");
assert.match(bossTip("bishop").copy, /대각선 한 줄/);
assert.match(bossTip("queen").copy, /가로·세로·대각선 중 한 줄/);
console.log("hover info tests passed: enemies with HP/movement/protection, guardian, item, ember, terrain, empty cell, off-screen marker, every boss pattern");
