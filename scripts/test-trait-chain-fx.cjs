"use strict";

const assert = require("node:assert/strict");
const { createGameHarness } = require("./game-harness.cjs");

// The trait-slot flash grows with the chain: longer, higher, brighter, more sparks,
// a shock ring from CHAIN 5 and rainbow sparks plus a second ring from CHAIN 8.
const h = createGameHarness({ withHeldUi: true });
const { game } = h;
const { S, ui } = game;
h.reset();
S.player.traits = ["diagonalBurst"];
const fire = (chain) => {
  game.flashHeldTraits(new Set(["diagonalBurst"]), chain);
  const slot = ui.heldSlots[0], a = slot.traitAnimation, nodes = slot.traitParticles.map((p) => p.node);
  return {
    duration: a.options.duration,
    lift: Number(/translateY\(-([\d.]+)px\)/.exec(a.frames[1].transform)?.[1] ?? 0),
    glow: Number(/drop-shadow\(0 0 ([\d.]+)px/.exec(a.frames[1].filter)[1]),
    sparks: nodes.filter((n) => n.className === "trait-slot-spark"),
    rings: nodes.filter((n) => n.className === "trait-slot-ring").length,
  };
};
const c1 = fire(1), c2 = fire(2), c4 = fire(4), c6 = fire(6), c10 = fire(10), c20 = fire(20);
assert.deepEqual([c1.duration, c1.sparks.length, c1.rings], [320, 6, 0], "CHAIN 1 keeps the small pulse");
assert.deepEqual([c2.duration, c2.sparks.length, c2.rings], [320, 6, 0], "CHAIN 2 too");
for (const [lo, hi, label] of [[c2, c4, "2→4"], [c4, c6, "4→6"], [c6, c10, "6→10"]]) {
  assert.ok(hi.duration > lo.duration, label + " longer");
  assert.ok(hi.lift > lo.lift, label + " higher bounce");
  assert.ok(hi.glow > lo.glow, label + " brighter glow");
  assert.ok(hi.sparks.length > lo.sparks.length, label + " more sparks");
}
assert.equal(c4.rings, 0); assert.equal(c6.rings, 1, "CHAIN 5+ adds a shock ring"); assert.equal(c10.rings, 2, "CHAIN 8+ adds a second ring");
assert.equal(new Set(c6.sparks.map((n) => n.style.background)).size, 1, "below CHAIN 8 sparks share the chain colour");
assert.ok(new Set(c10.sparks.map((n) => n.style.background)).size >= 5, "CHAIN 8+ sparks use every chain colour");
assert.deepEqual([c20.duration, c20.sparks.length, c20.rings], [c10.duration, c10.sparks.length, 2], "it tops out at CHAIN 10");

h.context.matchMedia = () => ({ matches: true });
const calm = fire(10);
assert.deepEqual([calm.sparks.length, calm.rings], [0, 0], "reduced motion keeps colour only, at any chain");
console.log("trait chain fx tests passed: CHAIN 1–2 small, grows to CHAIN 10, rings at 5 and 8, rainbow at 8, reduced motion calm");
