"use strict";

// Reproducible, tactical balance evaluator. It executes game.js inside the
// in-memory VM harness, so records use the shipping move and damage paths.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createGameHarness, seededRandom } = require("./game-harness.cjs");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "balance");
const BASE = path.join(OUT, "baseline-v0.11.0");
const SEED = 20261016;
const SCENARIO_COUNT = 32;
const DRAFT_COUNT = 64;
const MINUTES = 15;
const OFFERS = 24; // Assumption: 1.6 completed trait offers/minute, not telemetry.
const OFFER_SENSITIVITY = [24, 36, 48, 64];
function kitOffersFor(offers) {
  return Array.from({ length: Math.max(0, Math.floor((offers - 6) / 4) + 1) }, (_, index) => 6 + index * 4)
    .filter((offer) => offer <= offers - 2);
}
const KIT_OFFERS = kitOffersFor(OFFERS); // Assumption: one kit roughly every four offers after offer six.

function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function mkdir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function writeJson(file, value) { mkdir(file); fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function round(value) { return Math.round(value * 1000) / 1000; }
function repoDirty() {
  try { return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean); }
  catch (_) { return ["git status unavailable"]; }
}

const OFFSETS = [
  [1, 1], [1, -1], [2, 0], [2, 1], [2, -1], [2, 2], [2, -2],
  [3, 0], [3, 1], [3, -1], [3, 2], [3, -2], [4, 0], [4, 1], [4, -1],
  [0, 1], [0, -1], [-1, 1], [-1, -1], [-1, 2], [-1, -2],
];
function rotate([x, y], turns) {
  for (let i = 0; i < turns; i++) [x, y] = [-y, x];
  return [x, y];
}
function scenario(index) {
  const random = seededRandom(SEED + index * 7919);
  const turns = index % 4;
  const distance = 1 + (index % 4);
  const target = [distance, 0];
  const candidates = OFFSETS.map((offset) => rotate(offset, turns))
    .filter(([x, y]) => x !== target[0] || y !== target[1]);
  const enemyCount = 5 + Math.floor(random() * 8);
  const enemies = [{ x: target[0], y: target[1], hp: index % 7 === 0 ? 2 : 1, direct: true }];
  for (let i = 0; i < enemyCount; i++) {
    const [x, y] = candidates[i];
    enemies.push({ x: target[0] + x, y: target[1] + y, hp: i % 9 === 0 ? 2 : 1, direct: false });
  }
  const walls = index % 4 === 3
    ? [[target[0] + (turns % 2 ? 0 : 3), target[1] + (turns % 2 ? 3 : 0)]]
    : [];
  const canonical = JSON.stringify({ distance, enemies: enemies.map((e) => [e.x - target[0], e.y - target[1], e.hp]).sort(), walls: walls.map(([x, y]) => [x - target[0], y - target[1]]).sort() });
  return { id: `board-${String(index + 1).padStart(2, "0")}`, index, seed: SEED + index * 7919, target: { x: target[0], y: target[1] }, enemies, walls, canonicalHash: crypto.createHash("sha256").update(canonical).digest("hex") };
}
const SCENARIOS = Array.from({ length: SCENARIO_COUNT }, (_, index) => scenario(index));

function workloads(traits) {
  const individuals = traits.map((trait) => ({ id: trait.id, kind: "individual", tier: trait.tier, ids: [trait.id] }));
  const tierSets = [1, 2, 3, 4].map((tier) => ({ id: `tier-${tier}-set`, kind: "tier-set", tier, ids: traits.filter((trait) => trait.tier === tier).map((trait) => trait.id).slice(0, 6) }));
  return [...individuals, ...tierSets];
}
function enemy(definition) {
  return { x: definition.x, y: definition.y, hp: definition.hp, maxHp: definition.hp, type: "pawn", face: { x: 0, y: 1 } };
}
function setBoard(harness, board, loadout) {
  harness.random.reset(board.seed);
  const S = harness.reset();
  S.player.x = 0;
  S.player.y = 0;
  S.player.piece = "queen";
  S.player.rank = 100; // prevents XP from opening an upgrade modal during a combat probe.
  S.player.xp = 0;
  S.player.traits = [...loadout.ids];
  S.player.materials = [];
  S.player.directKills = board.index % 5;
  S.player.directChain = board.index % 4;
  S.player.traitMemory = {};
  S.wave = 12 + board.index;
  S.chain = board.index % 4;
  S.items = [];
  S.terrain = board.walls.map(([x, y]) => ({ x, y, type: "wall" }));
  S.enemies = board.enemies.map(enemy);
  harness.game.moves();
  const legalBefore = S.moves.length;
  // Field range is part of the game and lets the matched probe exercise move
  // distances 1..4 while all workloads use the same legal target.
  if (Math.max(Math.abs(board.target.x), Math.abs(board.target.y)) > 3) {
    S.rangeBoostMoves = 1;
    harness.game.moves();
  }
  return { S, legalBefore, target: { ...board.target }, targetLegal: S.moves.some((move) => move.x === board.target.x && move.y === board.target.y) };
}
function runCombatProbe(harness, board, loadout) {
  const { S, legalBefore, target, targetLegal } = setBoard(harness, board, loadout);
  const original = [...S.enemies];
  const hpBefore = new Map(original.map((unit) => [unit, unit.hp]));
  const direct = original.find((unit) => unit.x === target.x && unit.y === target.y);
  const xpBefore = S.player.xp;
  harness.game.playerMove(target);
  const damage = original.reduce((total, unit) => total + hpBefore.get(unit) - Math.max(0, unit.hp || 0), 0);
  const totalKills = original.filter((unit) => unit.hp <= 0).length;
  const directKills = direct && direct.hp <= 0 ? 1 : 0;
  const collateralVictims = original.filter((unit) => unit !== direct && unit.hp < hpBefore.get(unit));
  return {
    board: board.id,
    boardSeed: board.seed,
    canonicalBoard: board.canonicalHash,
    workload: loadout.id,
    workloadKind: loadout.kind,
    tier: loadout.tier,
    ids: loadout.ids,
    directHp: hpBefore.get(direct),
    directKills,
    collateralKills: totalKills - directKills,
    collateralHits: collateralVictims.length,
    damage,
    xp: round(S.player.xp - xpBefore),
    retainedTurn: S.phase === "player" || S.phase === "upgrade",
    phase: S.phase,
    legalMobilityBefore: legalBefore,
    legalMobilityAfter: S.moves.length,
    targetLegal,
    maxCollateralDistance: collateralVictims.reduce((maximum, unit) => Math.max(maximum, Math.max(Math.abs(unit.x - S.player.x), Math.abs(unit.y - S.player.y))), 0),
  };
}
function runDurableProbe(harness, loadout, seed) {
  harness.random.reset(seed);
  const S = harness.reset();
  S.player.x = S.player.y = 0;
  S.player.piece = "queen";
  S.player.rank = 100;
  S.player.traits = [...loadout.ids];
  S.player.directKills = 3;
  S.player.directChain = 3;
  S.player.traitMemory = {};
  S.phase = "player";
  S.wave = 25;
  const durable = { x: 1, y: 0, hp: 2, maxHp: 2, type: "pawn", face: { x: 0, y: 1 } };
  S.enemies = [durable];
  const xp = S.player.xp;
  harness.game.playerMove({ x: 1, y: 0 });
  return { workload: loadout.id, xp: S.player.xp - xp, durableHp: durable.hp, retainedTurn: S.phase === "player" || S.phase === "upgrade" };
}
function runBossProbe(harness, loadout, phase, seed) {
  harness.random.reset(seed);
  const S = harness.reset();
  S.player.x = S.player.y = 0;
  S.player.piece = "queen";
  S.player.rank = 100;
  S.player.traits = [...loadout.ids];
  S.player.traitMemory = {};
  S.phase = "player";
  const boss = { x: 1, y: 0, hp: 5, maxHp: 5, boss: true, bossPhase: phase, bossXp: 0, bossScore: 0, type: "rook", face: { x: 0, y: 1 } };
  S.enemies = [boss];
  harness.game.playerMove({ x: 1, y: 0 });
  return { workload: loadout.id, phase, bossDamage: 5 - boss.hp };
}
function evaluateVersion(label, gamePath, traitPath) {
  const TraitSystem = require(traitPath);
  const harness = createGameHarness({ gamePath, traitPath, seed: SEED });
  const records = [];
  const durable = [];
  const bosses = [];
  for (const loadout of workloads(TraitSystem.traits)) {
    for (const board of SCENARIOS) records.push(runCombatProbe(harness, board, loadout));
    durable.push(runDurableProbe(harness, loadout, SEED + 40000 + durable.length));
    bosses.push(runBossProbe(harness, loadout, "sealed", SEED + 50000 + bosses.length * 2));
    bosses.push(runBossProbe(harness, loadout, "vulnerable", SEED + 50001 + bosses.length * 2));
  }
  return { label, ruleVersion: TraitSystem.RULE_VERSION || "baseline", traits: TraitSystem.traits.length, workloads: workloads(TraitSystem.traits).length, records, durable, bosses };
}
function aggregate(evaluation) {
  const byWorkload = {};
  for (const record of evaluation.records) (byWorkload[record.workload] ||= []).push(record);
  const summary = Object.fromEntries(Object.entries(byWorkload).map(([id, rows]) => [id, {
    scenarios: rows.length,
    directKills: round(mean(rows.map((row) => row.directKills))),
    collateralKills: round(mean(rows.map((row) => row.collateralKills))),
    damage: round(mean(rows.map((row) => row.damage))),
    xp: round(mean(rows.map((row) => row.xp))),
    retainedTurnRate: round(mean(rows.map((row) => row.retainedTurn ? 1 : 0))),
    legalMobility: round(mean(rows.map((row) => row.legalMobilityBefore))),
    maxCollateralDistance: Math.max(...rows.map((row) => row.maxCollateralDistance)),
  }]));
  return {
    byWorkload: summary,
    all: {
      records: evaluation.records.length,
      directKills: round(mean(evaluation.records.map((row) => row.directKills))),
      collateralKills: round(mean(evaluation.records.map((row) => row.collateralKills))),
      damage: round(mean(evaluation.records.map((row) => row.damage))),
      xp: round(mean(evaluation.records.map((row) => row.xp))),
      retainedTurnRate: round(mean(evaluation.records.map((row) => row.retainedTurn ? 1 : 0))),
      durableXpViolations: evaluation.durable.filter((row) => row.xp !== 0).length,
      durableTurnFailures: evaluation.durable.filter((row) => !row.retainedTurn).length,
      sealedBossDamageViolations: evaluation.bosses.filter((row) => row.phase === "sealed" && row.bossDamage !== 0).length,
      vulnerableBossDamageFailures: evaluation.bosses.filter((row) => row.phase === "vulnerable" && row.bossDamage !== 1).length,
    },
  };
}
function pickChoices(pool, random) {
  const available = [...pool];
  const result = [];
  while (available.length && result.length < 3) result.push(available.splice(Math.floor(random() * available.length), 1)[0]);
  return result;
}
function progressionDraft(TraitSystem, seed, offers = OFFERS, kitOffers = kitOffersFor(offers), previousRewards = false) {
  const random = seededRandom(seed);
  let equipped = [], bag = [], rank = 1, discarded = 0, kits = 0, firstSixOffer = null;
  const acquire = (id) => {
    if (equipped.length < TraitSystem.SLOT_LIMIT) equipped.push(id);
    else if (bag.length < 8) bag.push(id);
    else { bag.shift(); bag.push(id); discarded++; }
  };
  const fuseAtKit = () => {
    kits++;
    let changed = true;
    while (changed) {
      changed = false;
      const inventory = [...equipped, ...bag];
      const choices = TraitSystem.availableRecipes(inventory)
        .filter((trait) => trait.tier !== 4 || !inventory.includes(trait.id))
        .sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));
      if (!choices.length) break;
      const next = TraitSystem.fuse(inventory, choices[0].id);
      next.sort((a, b) => TraitSystem.byId[b].tier - TraitSystem.byId[a].tier || a.localeCompare(b));
      equipped = next.slice(0, TraitSystem.SLOT_LIMIT);
      bag = next.slice(TraitSystem.SLOT_LIMIT, TraitSystem.SLOT_LIMIT + 8);
      changed = true;
    }
  };
  for (let offer = 1; offer <= offers; offer++) {
    const pool = TraitSystem.rewardPool(rank);
    const choices = previousRewards ? previousOffer(TraitSystem, rank, random) : TraitSystem.offer
      ? TraitSystem.offer(rank, random, [...equipped, ...bag])
      : pickChoices(pool.filter((trait) => trait.tier === (rank >= 6 && random() < 0.35 ? 2 : 1)), random);
    const candidate = choices.sort((a, b) => {
      const aRecipes = TraitSystem.availableRecipes([...equipped, ...bag, a.id]).reduce((score, recipe) => score + recipe.tier * 10, 0);
      const bRecipes = TraitSystem.availableRecipes([...equipped, ...bag, b.id]).reduce((score, recipe) => score + recipe.tier * 10, 0);
      return bRecipes - aRecipes || a.id.localeCompare(b.id);
    })[0];
    acquire(candidate.id);
    if (kitOffers.includes(offer)) fuseAtKit();
    rank++;
    if (new Set(equipped.filter((id) => TraitSystem.byId[id].tier === 4)).size >= 6) {
      firstSixOffer = offer;
      break;
    }
  }
  const all = [...equipped, ...bag];
  return { seed, offers, kits, equipped, bag, discarded, firstSixOffer, topTier: Math.max(...all.map((id) => TraitSystem.byId[id].tier), 0), tier4: new Set(equipped.filter((id) => TraitSystem.byId[id].tier === 4)).size };
}
function previousOffer(TraitSystem, rank, random) {
  const tier = rank >= 6 && random() < 0.35 ? 2 : 1;
  const pool = TraitSystem.traits.filter((trait) => trait.tier === tier);
  for (let i=pool.length-1; i>0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0,3);
}
function progressionCase(TraitSystem, offers, previousRewards = false, seedOffset = 0) {
  const kitOffers = kitOffersFor(offers);
  const drafts = Array.from({ length: DRAFT_COUNT }, (_, index) => progressionDraft(TraitSystem, SEED + 90000 + seedOffset + index * 97, offers, kitOffers, previousRewards));
  return { offers, kitOffers, drafts, topTierMean: round(mean(drafts.map((draft) => draft.topTier))), tier4Mean: round(mean(drafts.map((draft) => draft.tier4))), maxTier4: Math.max(...drafts.map((draft) => draft.tier4)), reachedSixTier4: drafts.filter((draft) => draft.tier4 >= 6).length };
}
function cohortTimes(drafts) {
  const finished = drafts.map((draft) => draft.firstSixOffer).filter((value) => value !== null).sort((a,b) => a-b);
  const quantile = (p) => {
    const index = Math.ceil(drafts.length * p) - 1;
    return index < finished.length ? finished[index] / (OFFERS / MINUTES) : null;
  };
  return {
    trials: drafts.length,
    completedBy50Minutes: finished.filter((offers) => offers <= 50 * (OFFERS / MINUTES)).length,
    completedBy100Minutes: finished.length,
    medianMinutesWholeCohort: quantile(0.5),
    p75MinutesWholeCohort: quantile(0.75),
    medianMinutesAmongCompleted: finished.length ? finished[Math.floor(finished.length / 2)] / (OFFERS / MINUTES) : null,
  };
}
function progression(TraitSystem) {
  const cases = OFFER_SENSITIVITY.map((offers) => progressionCase(TraitSystem, offers));
  const longRun = progressionCase(TraitSystem, 160);
  const previousLongRun = progressionCase(TraitSystem, 160, true);
  const holdout = progressionCase(TraitSystem, 160, false, 200000);
  const completionOffers = longRun.drafts.filter((draft) => draft.firstSixOffer !== null).map((draft) => draft.firstSixOffer).sort((a,b) => a-b);
  return {
    assumptions: { targetMinutes: 50, minutes: MINUTES, primaryOffers: OFFERS, progressionRules: TraitSystem.PROGRESSION, xpThreshold: "3 + rank * 2 (runtime); offer timing is assumed, not measured", policy: "greedy immediate-recipe choices, skip duplicate legends, equip highest tier at kits; discard oldest bag entry on overflow; not optimal" },
    primary: cases.find((entry) => entry.offers === OFFERS),
    cases,
    previousRewardDrafts: previousLongRun.drafts,
    holdoutDrafts: holdout.drafts,
    pacingComparison: {
      previous: cohortTimes(previousLongRun.drafts),
      calibration: cohortTimes(longRun.drafts),
      holdout: cohortTimes(holdout.drafts),
    },
    timeEstimate: {
      assumptionOffersPerMinute: OFFERS / MINUTES,
      maximumOffers: 160,
      completed: completionOffers.length,
      censored: DRAFT_COUNT - completionOffers.length,
      minOffers: completionOffers[0] ?? null,
      medianOffersAmongCompleted: completionOffers.length ? completionOffers[Math.floor(completionOffers.length / 2)] : null,
      maxOffersAmongCompleted: completionOffers.at(-1) ?? null,
      minMinutes: completionOffers.length ? completionOffers[0] / (OFFERS / MINUTES) : null,
      medianMinutesAmongCompleted: completionOffers.length ? completionOffers[Math.floor(completionOffers.length / 2)] / (OFFERS / MINUTES) : null,
      maxMinutesAmongCompleted: completionOffers.length ? completionOffers.at(-1) / (OFFERS / MINUTES) : null,
      rawDrafts: longRun.drafts,
    },
  };
}
function delta(current, baseline, key) { return round(current.all[key] - baseline.all[key]); }
function report(config, current, baseline, currentSummary, baselineSummary, model) {
  const tierRows = (evaluation, tier) => evaluation.records.filter((row) => row.workloadKind === "individual" && row.tier === tier);
  const currentByTier = [1, 2, 3, 4].map((tier) => {
    const currentRows = tierRows(current, tier), baselineRows = tierRows(baseline, tier);
    return {
      tier,
      baselineCollateral: round(mean(baselineRows.map((row) => row.collateralKills))),
      collateral: round(mean(currentRows.map((row) => row.collateralKills))),
      damage: round(mean(currentRows.map((row) => row.damage))),
      xp: round(mean(currentRows.map((row) => row.xp))),
      maxT1Collateral: tier === 1 ? Math.max(...currentRows.map((row) => row.collateralKills)) : null,
    };
  });
  return `# Trait balance simulation (${current.ruleVersion})\n\n` +
    `Generated with fixed seed ${SEED}. The source tree was ${config.dirty ? "dirty" : "clean"} when evaluated. These are deterministic tactical samples, not independent player samples or a fun score.\n\n` +
    `## Coverage\n\n- ${SCENARIOS.length} authored boards; ${new Set(SCENARIOS.map((board) => board.canonicalHash)).size} canonical unique board states. Rotated layouts share tactical structure and are reported as deterministic coverage, not independent samples.\n- ${current.workloads} workloads: all ${current.traits} individual traits plus four six-trait tier sets.\n- ${current.records.length} paired current rows and ${baseline.records.length} paired baseline rows.\n\n` +
    `## Current rule observations\n\n| Tier | Baseline mean collateral | Current mean collateral | Current mean damage | Current mean XP |\n|---|---:|---:|---:|---:|\n${currentByTier.map((row) => `| T${row.tier} | ${row.baselineCollateral} | ${row.collateral} | ${row.damage} | ${row.xp} |`).join("\n")}\n\n` +
    `Tier I single-trait maximum collateral kills on any matched board: **${currentByTier[0].maxT1Collateral}**. All ${current.records.length} selected destinations were legal: **${current.records.every((row) => row.targetLegal)}**.\n\n` +
    `Current correctness checks: durable zero-kill XP violations **${currentSummary.all.durableXpViolations}**, durable turn-retention failures **${currentSummary.all.durableTurnFailures}**, sealed-boss damage violations **${currentSummary.all.sealedBossDamageViolations}**, vulnerable-boss damage failures **${currentSummary.all.vulnerableBossDamageFailures}**.\n\n` +
    `Matched aggregate deltas versus v0.11.0: direct kills ${delta(currentSummary, baselineSummary, "directKills")}, collateral kills ${delta(currentSummary, baselineSummary, "collateralKills")}, damage ${delta(currentSummary, baselineSummary, "damage")}, XP ${delta(currentSummary, baselineSummary, "xp")}, retained-turn rate ${delta(currentSummary, baselineSummary, "retainedTurnRate")}.\n\n` +
    `## 15-minute progression model\n\nThe primary finite model assumes ${OFFERS} trait offers and ${model.primary.kitOffers.length} fusion kits over ${MINUTES} minutes, uses the runtime reward-pool and recipe APIs, six equipped slots plus the eight-item material bag, and greedily selects among three offers. It does not use measured XP/minute, boss-kill rate, or human choice data.\n\n| Hypothetical offers in 15 min | Fusion kits | Mean T4 | Max T4 | Six-T4 drafts |\n|---:|---:|---:|---:|---:|\n${model.cases.map((entry) => `| ${entry.offers} | ${entry.kitOffers.length} | ${entry.tier4Mean} | ${entry.maxTier4} | ${entry.reachedSixTier4}/${DRAFT_COUNT} |`).join("\n")}\n\n` +
    (model.primary.reachedSixTier4 ? "The primary model produced at least one six-T4 result, but does not establish that typical players reach it by 15 minutes.\n" : "The primary model did not produce a six-T4 result. That is evidence to investigate reward timing, kit frequency, bag pressure, or recipe overlap; it is not proof that the target is impossible.\n") +
    `\n## Conditional time to six distinct equipped T4 traits\n\nUsing the same seeds, capped at ${model.timeEstimate.maximumOffers} offers: ${model.timeEstimate.completed}/${DRAFT_COUNT} completed, ${model.timeEstimate.censored}/${DRAFT_COUNT} censored. At the assumed ${model.timeEstimate.assumptionOffersPerMinute} offers/minute, fastest ${model.timeEstimate.minMinutes} min, median among completed ${model.timeEstimate.medianMinutesAmongCompleted} min, slowest completed ${model.timeEstimate.maxMinutesAmongCompleted} min. This is a draft-model conversion, NOT measured gameplay time. The policy skips duplicate T4 recipes and equips highest-tier traits at a kit; it is greedy, not optimal. XP escalation, actual boss cadence, death, and input time are omitted.\n` +
    `\n## 50-minute goal: reward tuning comparison\n\nThe target is now roughly 50 minutes, not 15. The combat rules are unchanged from v0.12.0. Current rewards assist one useful material option from rank 6 when a compatible material exists, and T2 odds progress from 35% to 50% at rank 20 and 65% at rank 40. Previous rewards reproduce v0.12.0's uniform three options and flat 35% T2 chance. Calibration uses the same 64 seeds as previous; holdout uses 64 disjoint seeds (+200000) that were not used for the single tuning pass.\n\n| Model | Complete by assumed 50 min | Complete by assumed 100 min | Whole-cohort median | Median of completed only |\n|---|---:|---:|---:|---:|\n${Object.entries(model.pacingComparison).map(([name,row]) => `| ${name} | ${row.completedBy50Minutes}/${row.trials} | ${row.completedBy100Minutes}/${row.trials} | ${row.medianMinutesWholeCohort ?? '>100'} | ${row.medianMinutesAmongCompleted} |`).join('\n')}\n\nMinutes in this table are conversions at 1.6 offers/minute, not observed gameplay durations. No XP threshold or kill-rate tuning was performed to manufacture a time claim. The model does not establish whether actual players earn that many rewards per minute. A phase that supplies offers at half this rate would take twice as long.\n` +
    `\n## Limits\n\nThe evaluator uses shipping move/damage code in a VM, but it does not simulate player skill, long-horizon enemy spawn pressure, UI readability, or co-op. Validate tuning decisions with playtests after rule-level regressions are clear.\n`;
}
function main() {
  const currentPaths = { game: path.join(ROOT, "game.js"), traits: path.join(ROOT, "traits.js") };
  const baselinePaths = { game: path.join(BASE, "game.js"), traits: path.join(BASE, "traits.js") };
  const config = { seed: SEED, scenarioCount: SCENARIO_COUNT, draftCount: DRAFT_COUNT, dirtyFiles: repoDirty(), hashes: { evaluator: sha(__filename), harness: sha(path.join(__dirname, "game-harness.cjs")), current: { game: sha(currentPaths.game), traits: sha(currentPaths.traits) }, baseline: { game: sha(baselinePaths.game), traits: sha(baselinePaths.traits) } } };
  config.dirty = config.dirtyFiles.length > 0;
  const baseline = evaluateVersion("baseline-v0.11.0", baselinePaths.game, baselinePaths.traits);
  const current = evaluateVersion("current", currentPaths.game, currentPaths.traits);
  const baselineSummary = aggregate(baseline);
  const currentSummary = aggregate(current);
  const model = progression(require(currentPaths.traits));
  const version = require(currentPaths.traits).RULE_VERSION || "current";
  writeJson(path.join(OUT, `trait-balance-config-${version}.json`), config);
  writeJson(path.join(OUT, "trait-balance-baseline-v0.11.0.json"), { config, evaluation: baseline, summary: baselineSummary });
  writeJson(path.join(OUT, `trait-balance-current-${version}.json`), { config, evaluation: current, summary: currentSummary, progression: model });
  const markdown = report(config, current, baseline, currentSummary, baselineSummary, model);
  const reportPath = path.join(OUT, `trait-balance-report-${version}.md`);
  mkdir(reportPath); fs.writeFileSync(reportPath, markdown);
  console.log(`wrote ${path.relative(ROOT, reportPath)}`);
  console.log(JSON.stringify({ version, current: currentSummary.all, progression: model.cases.map((entry) => ({ offers: entry.offers, tier4Mean: entry.tier4Mean, maxTier4: entry.maxTier4, reachedSixTier4: entry.reachedSixTier4 })) }, null, 2));
}

main();
