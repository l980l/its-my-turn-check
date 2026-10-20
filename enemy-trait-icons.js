(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EnemyTraitIcons = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // These badges deliberately use only simple canvas paths. Emoji and icon-font glyphs
  // vary too much between browser/OS combinations to work as tactical identifiers.
  const PALETTE = Object.freeze({
    guardian:"#54e6f3",
    ember:"#ff9b45",
    healer:"#8df59a",
    split:"#d38cff",
  });

  function safe(ctx, method, ...args) {
    if (typeof ctx[method] === "function") ctx[method](...args);
  }
  function line(ctx, x1, y1, x2, y2) {
    safe(ctx, "moveTo", x1, y1);
    safe(ctx, "lineTo", x2, y2);
  }
  function badgeFrame(ctx, x, y, size, color) {
    const r = size * .52;
    safe(ctx, "beginPath");
    safe(ctx, "arc", x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#0a1126";
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, size * .09);
    ctx.strokeStyle = "#050916";
    ctx.stroke();
    safe(ctx, "beginPath");
    safe(ctx, "arc", x, y, r * .82, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, size * .055);
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  function shield(ctx, x, y, size, color, fill) {
    const u = size * .28;
    safe(ctx, "beginPath");
    safe(ctx, "moveTo", x, y - u * 1.28);
    safe(ctx, "lineTo", x + u, y - u * .75);
    safe(ctx, "lineTo", x + u * .78, y + u * .55);
    safe(ctx, "lineTo", x, y + u * 1.3);
    safe(ctx, "lineTo", x - u * .78, y + u * .55);
    safe(ctx, "lineTo", x - u, y - u * .75);
    safe(ctx, "closePath");
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.15, size * .09);
    ctx.strokeStyle = color;
    if (fill) {
      ctx.fillStyle = color;
      ctx.globalAlpha = .27;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
  }
  function flame(ctx, x, y, size, color) {
    const u = size * .27;
    safe(ctx, "beginPath");
    safe(ctx, "moveTo", x, y + u * 1.27);
    safe(ctx, "bezierCurveTo", x - u * 1.15, y + u * .44, x - u * .55, y - u * .2, x - u * .12, y - u * 1.3);
    safe(ctx, "bezierCurveTo", x + u * .2, y - u * .68, x + u * 1.1, y - u * .12, x + u * .73, y + u * .72);
    safe(ctx, "bezierCurveTo", x + u * .48, y + u * 1.06, x + u * .16, y + u * 1.2, x, y + u * 1.27);
    safe(ctx, "closePath");
    ctx.fillStyle = color;
    ctx.fill();
    safe(ctx, "beginPath");
    safe(ctx, "moveTo", x, y + u * .78);
    safe(ctx, "bezierCurveTo", x - u * .4, y + u * .32, x - u * .1, y - u * .08, x + u * .12, y - u * .48);
    safe(ctx, "bezierCurveTo", x + u * .55, y + u * .2, x + u * .25, y + u * .66, x, y + u * .78);
    safe(ctx, "closePath");
    ctx.fillStyle = "#fff1c6";
    ctx.globalAlpha = .9;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function healer(ctx, x, y, size, color) {
    const u = size * .28;
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, size * .16);
    safe(ctx, "beginPath");
    line(ctx, x - u, y, x + u, y);
    line(ctx, x, y - u, x, y + u);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, size * .05);
    ctx.strokeStyle = "#eaffed";
    safe(ctx, "beginPath");
    line(ctx, x - u * .32, y, x + u * .32, y);
    line(ctx, x, y - u * .32, x, y + u * .32);
    ctx.stroke();
  }
  function split(ctx, x, y, size, color, splitsLeft) {
    const u = size * .28;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.3, size * .13);
    safe(ctx, "beginPath");
    line(ctx, x, y + u * 1.05, x, y - u * .08);
    if (splitsLeft >= 2) {
      line(ctx, x, y - u * .08, x - u * 1.05, y - u * 1.05);
      safe(ctx, "moveTo", x, y - u * .08);
      safe(ctx, "lineTo", x + u * 1.05, y - u * 1.05);
    } else {
      line(ctx, x, y - u * .08, x + u * .92, y - u * 1.0);
    }
    ctx.stroke();
    safe(ctx, "beginPath");
    safe(ctx, "arc", x, y + u * 1.05, Math.max(1.1, size * .075), 0, Math.PI * 2);
    ctx.fillStyle = "#f6eaff";
    ctx.fill();
  }
  function canonicalTrait(trait) {
    const value = String(trait || "").toLowerCase();
    if (["guardian", "guard", "수호"].includes(value)) return "guardian";
    if (["ember", "fire", "잔불"].includes(value)) return "ember";
    if (["healer", "heal", "치유"].includes(value)) return "healer";
    if (["split", "division", "분열"].includes(value)) return "split";
    return "";
  }
  function uniqueTraits(traits) {
    const source = Array.isArray(traits) ? traits : [traits];
    const seen = new Set();
    const result = [];
    for (const trait of source) {
      const id = canonicalTrait(trait);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
      if (result.length === 4) break;
    }
    return result;
  }
  // Large badges sit around the piece rather than on top of it, so even a
  // two-trait elite remains legible at normal board scale.  The edge variant
  // is deliberately tiny for the offscreen-warning renderer.
  function layout(x, y, cell, traits, options = {}) {
    const ids = uniqueTraits(traits);
    const edge = !!(options && options.edge);
    const base = Number(cell);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(base) || base <= 0 || !ids.length) return [];
    const size = edge ? 14 : Math.max(20, Math.min(34, base * .44));
    const positions = edge
      ? [
        { x:x, y:y - 7 },
        { x:x - 8, y:y - 8 },
        { x:x + 8, y:y - 8 },
        { x:x - 8, y:y + 8 },
        { x:x + 8, y:y + 8 },
      ]
      : [
        { x:x + base * .28, y:y - base * .28 },
        { x:x - base * .28, y:y - base * .30 },
        { x:x + base * .28, y:y - base * .30 },
        { x:x - base * .28, y:y + base * .28 },
        { x:x + base * .28, y:y + base * .28 },
      ];
    const indexes = ids.length === 1 ? [0]
      : ids.length === 2 ? [1, 2]
      : ids.length === 3 ? [1, 2, 4]
      : [1, 2, 3, 4];
    return ids.map((id, index) => Object.freeze({
      id,
      x:positions[indexes[index]].x,
      y:positions[indexes[index]].y,
      size,
    }));
  }
  function drawProtection(ctx, x, y, size) {
    if (!ctx || !Number.isFinite(x + y + size) || size <= 0) return false;
    safe(ctx, "save");
    shield(ctx, x, y, size, PALETTE.guardian, false);
    safe(ctx, "restore");
    return true;
  }
  function draw(ctx, x, y, size, trait, splitsLeft = 2, protectedEnemy = false) {
    const id = canonicalTrait(trait);
    if (!ctx || !id || !Number.isFinite(x + y + size) || size <= 0 || (id === "split" && splitsLeft <= 0)) return false;
    safe(ctx, "save");
    const color = PALETTE[id];
    badgeFrame(ctx, x, y, size, color);
    if (id === "guardian") shield(ctx, x, y, size, color, true);
    if (id === "ember") flame(ctx, x, y, size, color);
    if (id === "healer") healer(ctx, x, y, size, color);
    if (id === "split") split(ctx, x, y, size, color, splitsLeft);
    if (protectedEnemy && id !== "guardian") {
      ctx.globalAlpha = .9;
      shield(ctx, x + size * .32, y + size * .3, size * .36, PALETTE.guardian, false);
    }
    safe(ctx, "restore");
    return true;
  }
  return Object.freeze({ PALETTE, draw, drawProtection, canonicalTrait, layout });
});
