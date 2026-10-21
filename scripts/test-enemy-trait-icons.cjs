"use strict";

const assert = require("node:assert/strict");
const Icons = require("../enemy-trait-icons.js");

function mockContext() {
  const calls = [];
  const ctx = { calls };
  for (const method of ["save", "restore", "beginPath", "arc", "fill", "stroke", "moveTo", "lineTo", "closePath", "bezierCurveTo"]) {
    ctx[method] = (...args) => calls.push([method, ...args]);
  }
  return ctx;
}

assert.equal(Icons.canonicalTrait("수호"), "guardian");
assert.equal(Icons.canonicalTrait("EMBER"), "ember");
assert.equal(Icons.canonicalTrait("unknown"), "");
assert.deepEqual(Icons.layout(20, 20, 40, ["guardian", "unknown", "guardian", "ember"]).map((badge) => badge.id), ["guardian", "ember"], "layout canonicalizes and deduplicates traits");
assert.deepEqual(Icons.layout(20, 20, 40, []).map((badge) => badge.id), [], "empty trait lists have no badges");
assert.deepEqual(Icons.layout(20, 20, 40, ["unknown"]).map((badge) => badge.id), [], "unknown trait lists have no badges");
for (let count = 1; count <= 4; count++) {
  const traits = ["guardian", "ember", "healer", "split"].slice(0, count);
  const badges = Icons.layout(100, 100, 50, traits);
  assert.equal(badges.length, count, `${count} traits produce ${count} badges`);
  assert.equal(new Set(badges.map((badge) => `${badge.x},${badge.y}`)).size, count, `${count} badges have distinct centers`);
  assert.ok(badges.every((badge) => badge.id && Number.isFinite(badge.x) && Number.isFinite(badge.y) && Number.isFinite(badge.size)), `${count} badge layout coordinates are finite`);
  assert.ok(badges.every((badge) => badge.size === 22), "large badge size follows the bounded cell rule");
}
assert.equal(Icons.layout(10, 10, 1000, ["guardian"])[0].size, 34, "large cells clamp the badge size");
assert.equal(Icons.layout(10, 10, 1, ["guardian"])[0].size, 20, "small cells clamp the badge size");
const edgeBadges = Icons.layout(50, 50, 40, ["guardian", "ember", "healer", "split"], { edge:true });
assert.equal(edgeBadges.length, 4);
assert.ok(edgeBadges.every((badge) => badge.size === 14 && Number.isFinite(badge.x) && Number.isFinite(badge.y)), "edge layout stays compact and finite");
assert.equal(Icons.layout(20, 20, 40, ["guardian", "ember", "healer", "split", "guardian"]).length, 4, "layout never returns more than four unique badges");
assert.deepEqual(Icons.layout(Number.NaN, 20, 40, ["guardian"]), [], "invalid layout coordinates are rejected");
const multiBadgeCtx = mockContext();
for (const badge of Icons.layout(20, 20, 44, ["guardian", "ember", "healer", "split"])) {
  assert.equal(Icons.draw(multiBadgeCtx, badge.x, badge.y, badge.size, badge.id), true);
}
assert.ok(multiBadgeCtx.calls.every(([, ...args]) => args.every(Number.isFinite)), "multi-badge canvas paths keep finite coordinates");
for (const trait of ["guardian", "ember", "healer", "split"]) {
  const ctx = mockContext();
  assert.equal(Icons.draw(ctx, 20, 20, 24, trait, 2), true, `${trait} should render`);
  assert.equal(ctx.calls[0][0], "save");
  assert.equal(ctx.calls.at(-1)[0], "restore");
  assert.ok(ctx.calls.some(([name]) => name === "stroke"), `${trait} has an outline`);
  assert.ok(ctx.calls.every(([, ...args]) => args.every(Number.isFinite)), `${trait} paths have finite coordinates`);
}
const singleSplit = mockContext();
Icons.draw(singleSplit, 20, 20, 24, "split", 1);
assert.ok(singleSplit.calls.every(([, ...args]) => args.every(Number.isFinite)));
const protectedCtx = mockContext();
Icons.draw(protectedCtx, 20, 20, 24, "ember", 2, true);
assert.ok(protectedCtx.calls.filter(([name]) => name === "stroke").length >= 3, "protected badge adds a small shield");
assert.equal(Icons.draw(mockContext(), 20, 20, 24, "split", 0), false, "exhausted split lineage has no badge");
assert.equal(Icons.draw(null, 20, 20, 24, "guardian"), false);
const protectionCtx = mockContext();
assert.equal(Icons.drawProtection(protectionCtx, 9, 9, 12), true);
assert.ok(protectionCtx.calls.some(([name]) => name === "stroke"));

console.log("enemy trait icon tests passed");
