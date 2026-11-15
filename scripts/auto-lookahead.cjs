"use strict";

// Measurement-only AUTO that looks two moves ahead. The game's own AUTO is not
// changed: simulations pass patchedGamePath() to createGameHarness instead.
//
// For every quiet move (no capture, not already judged lethal) it predicts the
// enemies' reply toward the landing cell, then counts what the piece could do
// from there next turn: safe cells to move to and enemies it could capture. A
// landing with neither is a trap. This is the policy behind the solo knight
// re-measurement (docs/balance/piece-choice-report.md, 2026-11-11).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// LOOKAHEAD_WEIGHTS="safe,capture,trap,safeCap" overrides these for tuning runs.
const [safe, capture, trap, safeCap] = (process.env.LOOKAHEAD_WEIGHTS || "25,120,3000,2").split(",").map(Number);
const WEIGHTS = { safe, capture, trap, safeCap };

const LOOKAHEAD = `
  function lookaheadScore(landing) {
    const p = S.player, saved = { x: p.x, y: p.y, enemies: S.enemies };
    // Enemies step toward the landing cell, nearest first, as projectedEnemyCapture assumes.
    const state = S.enemies.map((enemy) => ({ ...enemy })), used = new Set();
    state.filter((enemy) => !enemy.boss)
      .sort((a, b) => dist(a, landing) - dist(b, landing))
      .forEach((enemy) => {
        const next = projectedToward(enemy, landing, state);
        if (next.x === landing.x && next.y === landing.y) return;
        if (!used.has(K(next.x, next.y))) { enemy.x = next.x; enemy.y = next.y; used.add(K(next.x, next.y)); }
      });
    let safe = 0, captures = 0;
    try {
      p.x = landing.x; p.y = landing.y; S.enemies = state;
      for (const [dx, dy] of dirs(p.piece)) {
        const cell = { x: landing.x + dx, y: landing.y + dy };
        if (isWall(cell.x, cell.y) || !pathClear(landing, cell, p.piece)) continue;
        const target = state.find((enemy) => enemy.x === cell.x && enemy.y === cell.y);
        if (target) { if (!target.boss || target.bossPhase === "vulnerable") captures++; continue; }
        if (!projectedEnemyCapture(cell)) safe++;
      }
    } finally { p.x = saved.x; p.y = saved.y; S.enemies = saved.enemies; }
    return Math.min(safe, ${WEIGHTS.safeCap}) * ${WEIGHTS.safe} + captures * ${WEIGHTS.capture} - (safe + captures ? 0 : ${WEIGHTS.trap});
  }
`;
const HOOK = "      score += coopAutoScore(landing, targets, remaining);";

function patchSource(source) {
  if (!source.includes("  function autoMove() {") || !source.includes(HOOK)) throw new Error("autoMove markers changed in game.js");
  return source
    .replace("  function autoMove() {", LOOKAHEAD + "  function autoMove() {")
    .replace(HOOK, HOOK + "\n      if (!targets.length && !lethal) score += lookaheadScore(landing);")
    // Tests read the score directly; the harness only exports its fixed list.
    .replace("  function autoMove() {", "  globalThis.__lookaheadScore = lookaheadScore;\n  function autoMove() {");
}

// Writes the patched game.js to a temp file once per process and returns its path.
let patched = null;
function patchedGamePath(gamePath = path.join(__dirname, "..", "game.js")) {
  if (patched) return patched;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-lookahead-"));
  patched = path.join(dir, "game.js");
  fs.writeFileSync(patched, patchSource(fs.readFileSync(gamePath, "utf8")));
  return patched;
}

module.exports = { WEIGHTS, patchSource, patchedGamePath };
