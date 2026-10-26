"use strict";

// Solo vs 2-player co-op survival under the same auto AI, seeds and time model.
// Measures pressure per living player, not fun or human survival time.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const Session = require("../coop-session.js");
const {createGameHarness} = require("./game-harness.cjs");

const ROOT = path.resolve(__dirname, "..");
const SEED = 20261026;
const RUNS = Number(process.env.RUNS || 48);
const WAVE_CAP = Number(process.env.WAVE_CAP || 600);
// Enemy traits scale with play seconds. Both modes use the co-op round pace
// (1.8s plan + 2 x (0.22s focus + 0.34s follow) + 0.42s enemy) so only the
// player count differs between them.
const SECONDS_PER_WAVE = 3.34;

const sha = file => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex").slice(0, 16);
const dirty = () => { try { return execFileSync("git", ["status", "--porcelain"], {cwd: ROOT, encoding: "utf8"}).trim().split("\n").filter(Boolean); } catch (_) { return ["unknown"]; } };
const quantile = (values, q) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(s.length * q) - 1)]; };
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = value => value == null ? null : Math.round(value * 100) / 100;

function chooseReward(choose, phase, lock) {
  // Mirrors co-op AUTO (first option, decline contracts); falls back when a
  // full trait slot rejects the first option.
  if (phase === "risk") return choose(false, "risk");
  for (const index of [0, 1, 2]) if (choose(index, "upgrade")) return true;
  return choose(null, "reroll");
}

function solo(seed, balance) {
  const h = createGameHarness({withUpgradeUi: true, withHeldUi: true, seed});
  const g = h.game, S = g.S;
  g.reset(); S.running = true; S.autoPlay = true;
  const pressure = [];
  for (let step = 0; step < WAVE_CAP * 60 && S.wave < WAVE_CAP; step++) {
    if (S.phase === "enemy") {
      S.elapsedPlaySeconds = S.wave * SECONDS_PER_WAVE;
      g.enemyBeat();
      pressure.push(S.enemies.filter(x => !x.boss).length);
    } else if (S.phase === "player") {
      g.moves();
      if (!S.moves.length) S.phase = "enemy"; else g.autoMove();
    } else if (S.phase === "upgrade" || S.phase === "risk") {
      h.advance(1000);
      const before = JSON.stringify([S.phase, S.upgradeMode, S.upgradeOptions]);
      chooseReward((index, kind) => {
        if (kind === "risk") g.resolveRisk(false);
        else if (kind === "reroll") g.rerollTraits();
        else g.chooseUpgrade(index);
        return JSON.stringify([S.phase, S.upgradeMode, S.upgradeOptions]) !== before;
      }, S.phase);
      if (JSON.stringify([S.phase, S.upgradeMode, S.upgradeOptions]) === before) S.phase = "player";
    } else break; // captured
  }
  const capped = S.wave >= WAVE_CAP && S.phase !== "captured";
  return {mode: "solo", seed, capped, firstDeath: S.wave, teamDeath: S.wave, kills: S.kills, score: S.score,
    ranks: [S.player.rank], traits: [S.player.traits.length], reasons: [S.deathReason || null],
    pressurePerLiving: mean(pressure), peakEnemies: Math.max(0, ...pressure)};
}

function coop(seed, balance) {
  const h = createGameHarness({coop: true, withUpgradeUi: true, withHeldUi: true, seed});
  const e = h.context.window.CoopGame, S = h.game.S;
  if (balance) e.balance = {...e.balance, ...balance};
  const session = Session.create(e, () => {}, () => h.now());
  const enemyTurn = e.enemyTurn;
  const pressure = [];
  let firstDeath = null;
  e.enemyTurn = () => {
    S.elapsedPlaySeconds = S.wave * SECONDS_PER_WAVE;
    enemyTurn();
    const living = e.players().filter(p => p.alive).length;
    if (living) pressure.push(S.enemies.filter(x => !x.boss).length / living);
    if (firstDeath == null && living < 2) firstDeath = S.wave;
  };
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
      if (session.flow().revision === revision) throw new Error(`co-op reward stuck at wave ${S.wave}`);
      continue;
    }
    h.advance(Math.max(1, flow.deadline - h.now()));
    session.update(h.now());
  }
  const players = e.players();
  const capped = session.flow().phase !== "over";
  return {mode: "coop", seed, capped, firstDeath: firstDeath ?? S.wave, teamDeath: S.wave, kills: S.kills, score: S.score,
    ranks: players.map(p => p.rank), traits: players.map(p => p.traits.length), reasons: players.map(p => p.deathReason || null),
    pressurePerLiving: mean(pressure), peakEnemies: Math.max(0, ...pressure)};
}

function summarize(rows) {
  const pick = key => rows.map(r => r[key]);
  const dist = values => ({p10: quantile(values, .1), p50: quantile(values, .5), p90: quantile(values, .9), mean: round(mean(values))});
  const reasons = {};
  for (const r of rows) for (const reason of r.reasons) if (reason) reasons[reason.replace(/^.*의 /, "보스 ")] = (reasons[reason.replace(/^.*의 /, "보스 ")] || 0) + 1;
  return {runs: rows.length, capped: rows.filter(r => r.capped).length,
    firstDeathWave: dist(pick("firstDeath")), teamDeathWave: dist(pick("teamDeath")),
    killsPerWave: dist(rows.map(r => round(r.kills / Math.max(1, r.teamDeath)))),
    score: dist(pick("score")), enemiesPerLivingPlayer: dist(rows.map(r => round(r.pressurePerLiving))),
    finalRank: dist(rows.flatMap(r => r.ranks)), deathReasons: reasons};
}

function run(variants) {
  const seeds = Array.from({length: RUNS}, (_, i) => SEED + i * 7919);
  const out = {profile: "coop-balance-v1", seed: SEED, runs: RUNS, waveCap: WAVE_CAP, secondsPerWave: SECONDS_PER_WAVE,
    policy: "game autoMove for every player; first reward option; contracts declined",
    runtime: {game: sha("game.js"), coopRuntime: sha("coop-runtime.js"), coopSession: sha("coop-session.js"), traits: sha("traits.js"), enemyTraits: sha("enemy-traits.js"), dirty: dirty()},
    metrics: {
      firstDeathWave: "wave of the first capture per run (solo: the only capture); unit run",
      teamDeathWave: "wave when no player remains; unit run",
      killsPerWave: "team kills / teamDeathWave; unit run",
      enemiesPerLivingPlayer: "mean over enemy turns of non-boss enemies / living players; unit run",
      finalRank: "rank per player at end; unit player",
    },
    limit: "Fixed auto policy; seeds are paired across variants but not human players. Survival waves are not play time or fun.",
    variants: {}, raw: {}};
  for (const [name, fn] of Object.entries(variants)) {
    const rows = seeds.map(fn);
    out.variants[name] = summarize(rows);
    out.raw[name] = rows;
    process.stderr.write(`${name}: done\n`);
  }
  return out;
}

if (require.main === module) {
  const variants = {solo: seed => solo(seed), coop: seed => coop(seed)};
  if (process.env.ONLY) for (const name of Object.keys(variants)) if (!process.env.ONLY.split(",").includes(name)) delete variants[name];
  for (const spec of (process.env.COOP_VARIANTS || "").split(";").filter(Boolean)) {
    const [name, json] = spec.split("=");
    variants[name] = seed => coop(seed, JSON.parse(json));
  }
  const result = run(variants);
  const file = process.env.OUT;
  if (file) fs.writeFileSync(path.resolve(ROOT, file), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({...result, raw: undefined}, null, 2));
}

module.exports = {solo, coop, summarize, run};
