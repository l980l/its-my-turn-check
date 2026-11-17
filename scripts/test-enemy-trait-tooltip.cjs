"use strict";

const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");
const Icons = require("../enemy-trait-icons.js");

// Hovering an enemy trait badge with the mouse shows that trait's description.
const h = createGameHarness();
const { game, elements } = h;
const { S, ui } = game;
const canvas = elements.get("#game");
h.reset();
S.enemies = [{ x: 2, y: 0, type: "rook", hp: 2, maxHp: 2, enemyTraits: ["healer", "split"], splitsLeft: 2 }];
const q = game.pos(2, 0), badges = Icons.layout(q.x, q.y, game.size(), ["healer", "split"]);
ui.enemyTraitTip.getBoundingClientRect = () => ({ width: 200, height: 60, left: 0, top: 0 });
const hover = (x, y, pointerType = "mouse") => { canvas.handlers.pointermove({ pointerType, clientX: x, clientY: y }); game.updateEnemyTraitTip(); };

hover(badges[1].x, badges[1].y);
assert.equal(ui.enemyTraitTipName.textContent, "분열 · 적 특성", "the hovered badge names its own trait");
assert.match(ui.enemyTraitTipCopy.textContent, /남은 분열: 2회/, "split shows the remaining splits");
assert.equal(canvas.style.cursor, "help");
assert.ok(Number.parseFloat(ui.enemyTraitTip.style.left) > badges[1].x, "the tip sits beside the cursor");
// On a large screen the tip's layer is zoomed, so its CSS position is the screen position divided by the scale.
h.context.window.UiScale = { value: () => 1.5 };
hover(badges[1].x, badges[1].y);
assert.ok(Math.abs(Number.parseFloat(ui.enemyTraitTip.style.left) - (badges[1].x + 16) / 1.5) < 0.01, "a zoomed tip still lands beside the cursor");
delete h.context.window.UiScale;

hover(badges[0].x, badges[0].y);
assert.equal(ui.enemyTraitTipName.textContent, "치유 · 적 특성");
assert.doesNotMatch(ui.enemyTraitTipCopy.textContent, /남은 분열/);

hover(q.x - 200, q.y + 200);
assert.equal(canvas.style.cursor, "", "the tip goes away off the badges");

ui.enemyTraitTipName.textContent = "";
hover(badges[0].x, badges[0].y, "touch");
assert.equal(canvas.style.cursor, "", "touch keeps tapping for the trait panel, not hover");

hover(badges[0].x, badges[0].y);
canvas.handlers.pointerleave();
game.updateEnemyTraitTip();
assert.equal(canvas.style.cursor, "", "leaving the canvas hides the tip");

console.log("enemy trait tooltip tests passed: per-badge description, split count, cursor, touch and leave");
