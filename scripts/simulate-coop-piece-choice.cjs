"use strict";
// Usage: node scripts/simulate-coop-piece-choice.cjs <queen+rook|pawn> <shard> <shards> <out.json>
// Co-op AUTO with fixed start pieces: no pawn promotion, no piece swap.
const fs = require("node:fs");
const Session = require("../coop-session.js");
const {createGameHarness} = require("./game-harness.cjs");
const WAVE_CAP = Number(process.env.WAVE_CAP || 300), RUNS = Number(process.env.RUNS || 48), SECONDS_PER_WAVE = 3.34;
function chooseReward(choose, phase) {
  if (phase === "risk") return choose(false, "risk");
  for (const index of [0, 1, 2]) if (choose(index, "upgrade")) return true;
  return choose(null, "reroll");
}
function coop(seed, pieces) {
  const h = createGameHarness({coop: true, withUpgradeUi: true, withHeldUi: true, seed});
  const e = h.context.window.CoopGame, S = h.game.S;
  const start = e.start;
  e.start = () => { start(); if (pieces) { S.startPiece = "fixed"; e.players().forEach((p, i) => { p.piece = pieces[i]; }); } };
  const session = Session.create(e, () => {}, () => h.now());
  const enemyTurn = e.enemyTurn;
  let firstDeath = null;
  e.enemyTurn = () => { S.elapsedPlaySeconds = S.wave * SECONDS_PER_WAVE; enemyTurn(); const living = e.players().filter(p => p.alive).length; if (firstDeath == null && living < 2) firstDeath = S.wave; };
  session.start();
  for (let step = 0; step < WAVE_CAP * 80 && S.wave < WAVE_CAP; step++) {
    const flow = session.flow();
    if (flow.phase === "over") break;
    if (flow.phase === "planning") {
      for (const i of flow.eligible) if (!flow.actions[i]) { const move = e.auto(i); if (move) session.move(i, move, flow.roundId); }
    } else if (flow.phase === "upgrade" || flow.phase === "risk") {
      h.advance(1000);
      const revision = flow.revision;
      chooseReward((index, kind) => session.choose(flow.actor, index, kind), flow.phase);
      if (session.flow().revision === revision) throw new Error(`stuck at wave ${S.wave}`);
      continue;
    }
    h.advance(Math.max(1, flow.deadline - h.now()));
    session.update(h.now());
  }
  const players = e.players();
  return {seed, capped: session.flow().phase !== "over", firstDeath: firstDeath ?? S.wave, teamDeath: S.wave, score: S.score, kills: S.kills, pieces: players.map(p => p.piece)};
}
const [pair, shard, shards] = [process.argv[2], Number(process.argv[3] || 0), Number(process.argv[4] || 1)];
const pieces = pair === "pawn" ? null : pair.split("+");
const seeds = Array.from({length: RUNS}, (_, i) => 20261026 + i * 7919).filter((_, i) => i % shards === shard);
const rows = seeds.map(seed => coop(seed, pieces));
fs.writeFileSync(process.argv[5], JSON.stringify({pair, rows}));
