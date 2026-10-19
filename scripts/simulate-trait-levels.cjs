"use strict";

// Deterministic evaluator for the six-slot, five-level trait model. It imports
// traits.js directly so draft and combat probes use the same pure rules as the
// game; it intentionally does not estimate real-time pacing or player fun.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "balance");
const TRAIT_PATH = path.join(ROOT, "traits.js");
const SEED = 20261017;
const DRAFTS = 96;
const CHOICES = 30; // 6 acquisitions + 24 level-ups is a complete six-trait build.
const REROLLS = 2;
const SLOT_LIMIT = 6;
const MAX_LEVEL = 5;
const EXPECTED_TRAIT_COUNT = 13;
const BOARDS = 20;

function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function round(value) { return Math.round(value * 1000) / 1000; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
function dirtyFiles() {
  try { return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean); }
  catch (_) { return ["git status unavailable"]; }
}
function stable(value) { return JSON.stringify(value, Object.keys(value).sort()); }
function hash(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function assertApi(T) {
  for (const name of ["atLevel", "movement", "resolve", "escape", "offer"]) {
    if (typeof T[name] !== "function") throw new Error(`TraitSystem.${name} is required for the level evaluator`);
  }
  if (!Array.isArray(T.traits) || T.traits.length !== EXPECTED_TRAIT_COUNT) throw new Error(`expected ${EXPECTED_TRAIT_COUNT} traits`);
}

function idsKey(ids, levels) {
  return [...ids].sort().map((id) => `${id}:${levels[id] || 1}`).join("|");
}
function cloneLevels(levels) { return Object.fromEntries(Object.entries(levels)); }
function levelOf(levels, id) { return Number.isInteger(levels[id]) ? levels[id] : 0; }
function candidatesFor(T, rank, random, ids, levels, previous) {
  const offered = T.offer(rank, random, [...ids], cloneLevels(levels), previous && [...previous]);
  if (!Array.isArray(offered) || !offered.length) throw new Error("offer returned no candidates");
  const seen = new Set();
  return offered.filter((item) => item && T.byId[item.id] && !seen.has(item.id) && seen.add(item.id));
}
function candidateScore(ids, levels, trait) {
  const level = levelOf(levels, trait.id);
  const newTrait = level === 0;
  // Fill six distinct slots first, then prefer the least-levelled offered trait.
  // Deterministic id tie-breaks make a seed replayable; this is not a human policy.
  return (newTrait && ids.length < SLOT_LIMIT ? 1000 : 0) +
    (level > 0 && level < MAX_LEVEL ? 100 - level * 10 : 0) +
    (newTrait ? 5 : 0);
}
function chooseCandidate(ids, levels, options) {
  return [...options].sort((a, b) => candidateScore(ids, levels, b) - candidateScore(ids, levels, a) || a.id.localeCompare(b.id))[0];
}
function hasUseful(ids, levels, options) {
  return options.some((trait) => {
    const level = levelOf(levels, trait.id);
    return (level === 0 && ids.length < SLOT_LIMIT) || (level > 0 && level < MAX_LEVEL);
  });
}
function applyChoice(ids, levels, trait) {
  const before = levelOf(levels, trait.id);
  if (!before) {
    if (ids.length >= SLOT_LIMIT) return false;
    ids.push(trait.id);
    levels[trait.id] = 1;
    return true;
  }
  if (before >= MAX_LEVEL) return false;
  levels[trait.id] = before + 1;
  return true;
}
function runDraft(T, seed) {
  const random = seededRandom(seed);
  const ids = [];
  const levels = {};
  const states = [];
  let rerollsLeft = REROLLS;
  let uselessOffers = 0;
  let failedChoices = 0;
  for (let choice = 1; choice <= CHOICES; choice++) {
    const rank = choice; // The first piece choice is deliberately outside this trait-only model.
    let options = candidatesFor(T, rank, random, ids, levels);
    if (!hasUseful(ids, levels, options) && rerollsLeft > 0) {
      const previous = options.map((trait) => trait.id);
      options = candidatesFor(T, rank, random, ids, levels, previous);
      rerollsLeft--;
    }
    if (!hasUseful(ids, levels, options)) uselessOffers++;
    const picked = chooseCandidate(ids, levels, options);
    if (!applyChoice(ids, levels, picked)) failedChoices++;
    states.push({ choice, rank, offer: options.map((trait) => trait.id), picked: picked.id, ids: [...ids].sort(), levels: cloneLevels(levels) });
  }
  const equippedLevels = ids.map((id) => levels[id]);
  return {
    seed,
    choices: CHOICES,
    rerollsSpent: REROLLS - rerollsLeft,
    uselessOffers,
    failedChoices,
    ids: [...ids].sort(),
    levels: cloneLevels(levels),
    totalLevels: equippedLevels.reduce((sum, level) => sum + level, 0),
    completeBuild: ids.length === SLOT_LIMIT && equippedLevels.every((level) => level === MAX_LEVEL),
    trajectoryHash: hash(states.map((state) => ({ offer: [...state.offer].sort(), picked: state.picked, ids: state.ids, levels: state.levels }))),
    finalStateHash: hash(idsKey(ids, levels)),
    states,
  };
}

function board(index) {
  const random = seededRandom(SEED + 7000 + index * 97);
  const enemies = [];
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    if (!x && !y) continue;
    if (Math.max(Math.abs(x), Math.abs(y)) <= 3 && random() > 0.3) enemies.push({ x, y, hp: 1, boss: false });
  }
  const walls = index % 4 === 0 ? new Set(["1:1", "-1:2"]) : new Set();
  const canonical = { enemies: enemies.map((enemy) => [enemy.x, enemy.y]).sort(), walls: [...walls].sort() };
  // Cycle short, medium and long direct moves. This lets the matched suite
  // exercise one-step-only Cross Check as well as minimum-distance effects.
  const starts = [{ x: -1, y: 0 }, { x: -2, y: -1 }, { x: -3, y: -2 }];
  return { id: `board-${String(index + 1).padStart(2, "0")}`, enemies, walls, from: starts[index % starts.length], canonicalHash: hash({ ...canonical, from: starts[index % starts.length] }) };
}
function probeTrait(T, id, level, definition) {
  const memory = {};
  const context = {
    directKill: true,
    directKills: 8,
    chain: 5,
    wave: 10,
    from: definition.from,
    to: { x: 0, y: 0 },
    enemies: definition.enemies.map((enemy) => ({ ...enemy })),
    isWall: (x, y) => definition.walls.has(`${x}:${y}`),
  };
  const levels = { [id]: level };
  const move = T.movement([id], levels);
  const rule = T.atLevel(id, level).rule;
  const first = T.resolve([id], clone(context), memory, levels);
  const second = T.resolve([id], { ...clone(context), wave: 11 }, memory, levels);
  const escapeReady = T.escape([id], 12, memory, levels);
  return {
    id, level, board: definition.id, rule,
    targetsFirst: first.targets.length,
    targetsSecond: second.targets.length,
    totalTargets: first.targets.length + second.targets.length,
    xp: first.xp + second.xp,
    fx: first.fx.length + second.fx.length,
    movement: move,
    escapeReady,
  };
}
function tactical(T) {
  const boards = Array.from({ length: BOARDS }, (_, index) => board(index));
  const rows = [];
  for (const trait of T.traits) for (const definition of boards) {
    const lv1 = probeTrait(T, trait.id, 1, definition);
    const lv5 = probeTrait(T, trait.id, MAX_LEVEL, definition);
    rows.push({ id: trait.id, board: definition.id, canonicalHash: definition.canonicalHash, lv1, lv5,
      targetDelta: lv5.totalTargets - lv1.totalTargets,
      mobilityDelta: (lv5.movement.stride || 0) + (lv5.movement.royal || 0) - (lv1.movement.stride || 0) - (lv1.movement.royal || 0),
    });
  }
  const byTrait = Object.fromEntries(T.traits.map((trait) => {
    const traitRows = rows.filter((row) => row.id === trait.id);
    return [trait.id, {
      name: trait.name,
      growth: trait.growth,
      boards: traitRows.length,
      meanLv1Targets: round(mean(traitRows.map((row) => row.lv1.totalTargets))),
      meanLv5Targets: round(mean(traitRows.map((row) => row.lv5.totalTargets))),
      maxLv1Targets: Math.max(...traitRows.map((row) => row.lv1.totalTargets)),
      maxLv5Targets: Math.max(...traitRows.map((row) => row.lv5.totalTargets)),
      meanMobilityDelta: round(mean(traitRows.map((row) => row.mobilityDelta))),
      lv1Effect: effectLabel(T.atLevel(trait.id, 1).rule),
      lv5Effect: effectLabel(T.atLevel(trait.id, MAX_LEVEL).rule),
      lv1RuleHash: hash(T.atLevel(trait.id, 1).rule),
      lv5RuleHash: hash(T.atLevel(trait.id, MAX_LEVEL).rule),
    }];
  }));
  return { boards, rows, byTrait };
}

function effectLabel(rule) {
  if (rule.maxTargets) return `range ${rule.range} / targets ${rule.maxTargets}`;
  if (rule.xpEvery) return `every ${rule.xpEvery} kills`;
  if (rule.escape) return `cooldown ${rule.escape}`;
  if (rule.stride || rule.royal) return [rule.stride && `stride +${rule.stride}`, rule.royal && `royal +${rule.royal}`].filter(Boolean).join(" / ");
  return "no scalar effect";
}
function geometryCoverage(T, id, level) {
  const rule = T.atLevel(id, level).rule;
  if (!rule.shape) return [];
  const from = rule.maxDistance ? { x: -1, y: 0 } : rule.minDistance ? { x: -2, y: -1 } : { x: -2, y: -1 };
  const positions = [];
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
    if (!x && !y) continue;
    const result = T.resolve([id], {
      directKill: true, directKills: 120, chain: 5, wave: 10,
      from, to: { x: 0, y: 0 }, enemies: [{ x, y, hp: 1, boss: false }], isWall: () => false,
    }, {}, { [id]: level });
    if (result.targets.length) positions.push(`${x}:${y}`);
  }
  return positions.sort();
}
function monotoneTrait(T, trait) {
  const rules = Array.from({ length: MAX_LEVEL }, (_, index) => T.atLevel(trait.id, index + 1).rule);
  const growth = trait.growth;
  const values = rules.map((rule) => growth === "attack" ? { range: rule.range, targets: rule.maxTargets }
    : growth === "xp" ? rule.xpEvery
      : growth === "escape" ? rule.escape
        : (rule.stride || 0) + (rule.royal || 0));
  const coverage = growth === "attack" ? rules.map((_, index) => geometryCoverage(T, trait.id, index + 1)) : [];
  const monotone = values.every((value, index) => {
    if (!index) return true;
    const previous = values[index - 1];
    if (growth === "attack") return value.range >= previous.range && value.targets >= previous.targets;
    return growth === "xp" || growth === "escape" ? value <= previous : value >= previous;
  });
  const meaningfulUpgrades = values.every((value, index) => {
    if (!index) return true;
    const previous = values[index - 1];
    if (growth === "attack") return value.targets > previous.targets || coverage[index].length > coverage[index - 1].length;
    return value !== previous;
  });
  return { id: trait.id, growth, values, coverage, monotone, meaningfulUpgrades, ruleHashes: rules.map((rule) => hash(rule)) };
}
function compactDraft(draft) {
  const { states, ...summary } = draft;
  return {
    ...summary,
    // The offer/pick sequence reproduces the state evolution while avoiding
    // five repeated inventory snapshots per choice in the checked-in artifact.
    picks: states.map((state) => ({ choice: state.choice, offer: state.offer, picked: state.picked })),
  };
}
function compactProbe(probe) {
  return {
    targetsFirst: probe.targetsFirst,
    targetsSecond: probe.targetsSecond,
    totalTargets: probe.totalTargets,
    xp: probe.xp,
    fx: probe.fx,
    movement: probe.movement,
    escapeReady: probe.escapeReady,
  };
}
function compactTactical(tacticalResult) {
  return {
    boards: tacticalResult.boards.map(({ id, canonicalHash, from }) => ({ id, canonicalHash, from })),
    rows: tacticalResult.rows.map((row) => ({
      id: row.id, board: row.board, canonicalHash: row.canonicalHash,
      targetDelta: row.targetDelta, mobilityDelta: row.mobilityDelta,
      lv1: compactProbe(row.lv1), lv5: compactProbe(row.lv5),
    })),
    byTrait: tacticalResult.byTrait,
  };
}

function report(config, drafts, tacticalResult, T, monotone) {
  const complete = drafts.filter((draft) => draft.completeBuild);
  const uniqueTrajectories = new Set(drafts.map((draft) => draft.trajectoryHash)).size;
  const uniqueFinalStates = new Set(drafts.map((draft) => draft.finalStateHash)).size;
  const strongest = Object.entries(tacticalResult.byTrait)
    .sort(([, a], [, b]) => b.maxLv5Targets - a.maxLv5Targets || b.meanLv5Targets - a.meanLv5Targets || a.growth.localeCompare(b.growth))[0];
  const rows = Object.entries(tacticalResult.byTrait)
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.maxLv5Targets - a.maxLv5Targets || a.id.localeCompare(b.id));
  const monotoneFailures = monotone.filter((row) => !row.monotone);
  const noEffectUpgrades = monotone.filter((row) => !row.meaningfulUpgrades);
  const targetCapFlags = rows.filter((row) => row.maxLv5Targets > 10);
  return `# Trait level balance evaluation (${T.RULE_VERSION || "current"})\n\n` +
    `Generated from fixed seed ${SEED}. The source tree was ${config.dirty ? "dirty" : "clean"} when evaluated. This is deterministic rule evidence, not a claim about player enjoyment, survival odds, or real match duration.\n\n` +
    `## Evaluation profile\n\n` +
    `- **Loop:** choose six traits, then improve their levels through the same reward offers.\n` +
    `- **Hypotheses:** each trait progresses from Lv1 to Lv5 without unbounded target/cooldown/pattern stacking; 30 trait rewards can fill six Lv5 slots; two rerolls only repair unusable offers.\n` +
    `- **Fixed inputs:** ${DRAFTS} seeded drafts, ${CHOICES} trait choices each (the initial piece choice is excluded), at most ${REROLLS} rerolls, ${BOARDS} tactical boards, direct-kill contexts and shared pure TraitSystem rules. At every five ranks, the optional piece/trait fork is held to the trait route, so this does not predict real elapsed time.\n` +
    `- **Decision bands:** report any failed 30-choice completion, no-op offer, or Lv5 board result above 10 total secondary targets over two immediate probes. Such a flag is an investigation signal, not automatic retuning.\n\n` +
    `## Draft progression\n\n` +
    `| Metric | Result |\n|---|---:|\n` +
    `| Completed six Lv5 builds | ${complete.length}/${DRAFTS} |\n` +
    `| Mean total equipped levels | ${round(mean(drafts.map((draft) => draft.totalLevels)))}/30 |\n` +
    `| P50 / P95 rerolls spent | ${percentile(drafts.map((draft) => draft.rerollsSpent), 0.5)} / ${percentile(drafts.map((draft) => draft.rerollsSpent), 0.95)} |\n` +
    `| No-op selections | ${drafts.reduce((sum, draft) => sum + draft.failedChoices, 0)} |\n` +
    `| Unusable pre-reroll offers | ${drafts.reduce((sum, draft) => sum + draft.uselessOffers, 0)} |\n` +
    `| Unique trajectories / final states | ${uniqueTrajectories} / ${uniqueFinalStates} |\n\n` +
    `A completed build needs exactly 30 trait rewards: six first picks plus four upgrades for each occupied slot. The simulation applies the offered options using a deterministic fill-first, then lowest-level policy. It is neither optimal nor a player model. The reroll quota is capped at two and is only spent when an offer has no legal acquisition or upgrade.\n\n` +
    `## Level monotonicity\n\n` +
    `All ${T.traits.length} traits were checked at every level, not only at the Lv1/Lv5 endpoints. **${monotoneFailures.length}** violate their configured monotone direction (attack and movement non-decreasing; XP cadence and escape cooldown non-increasing). **${noEffectUpgrades.length}** have an intermediate level with no scalar increase or newly targetable coordinate.\n\n` +
    `| Growth axis | Lv1 → Lv5 scalar sequence | Traits |\n|---|---|---:|\n` +
    ["attack", "xp", "escape", "movement"].map((growth) => {
      const group = monotone.filter((row) => row.growth === growth);
      const format = (values) => values.map((value) => typeof value === "object" ? `r${value.range}/t${value.targets}` : value).join(" → ");
      const sequences = [...new Set(group.map((row) => format(row.values)))];
      return `| ${growth} | ${sequences.join("; ") || "n/a"} | ${group.length} |`;
    }).join("\n") +
    (monotoneFailures.length ? `\n\nFailures: ${monotoneFailures.map((row) => `${row.id}`).join(", ")}.\n` : "\n\nNo monotonicity failure was observed in the shared rules.\n") +
    (noEffectUpgrades.length ? `No-effect upgrade checks: ${noEffectUpgrades.map((row) => row.id).join(", ")}.\n` : "Each checked level-up changed a scalar value or expanded the single-targetable geometry used by this probe.\n") +
    "\n" +
    `## Paired tactical probes\n\n` +
    `Each row compares the same trait and board at Lv1 and Lv5. A probe performs a direct-kill resolve on wave 10 and a second resolve on wave 11 with shared memory; this exposes cooldown behavior without simulating a full match. There are ${tacticalResult.rows.length} paired rows across ${new Set(tacticalResult.boards.map((item) => item.canonicalHash)).size} canonical board states.\n\n` +
    `| Trait | Growth axis | Lv1 rule | Lv5 rule | Lv1 mean targets | Lv5 mean targets | Lv5 max targets | Mobility Δ |\n|---|---|---|---|---:|---:|---:|---:|\n` +
    rows.map((row) => `| ${row.name} (${row.id}) | ${row.growth} | ${row.lv1Effect} | ${row.lv5Effect} | ${row.meanLv1Targets} | ${row.meanLv5Targets} | ${row.maxLv5Targets} | ${row.meanMobilityDelta} |`).join("\n") +
    `\n\n**Strongest observed probe:** ${strongest[0]} reached ${strongest[1].maxLv5Targets} total secondary targets at Lv5 across its two fixed resolves (Lv1 mean ${strongest[1].meanLv1Targets}, Lv5 mean ${strongest[1].meanLv5Targets}). This is a compact-board signal, not an estimate of full-board clears.\n\n` +
    (targetCapFlags.length
      ? `### Investigation flag\n\n${targetCapFlags.map((row) => `- **${row.id}** reached ${row.maxLv5Targets} secondary targets, above the 10-target two-probe decision band. Its Lv5 cap is ${row.lv5Effect}; review this cap against live enemy density before changing other traits. This evaluator does not apply an automatic retune.\n`).join("")}\n`
      : "No Lv5 tactical row exceeded the 10-target two-probe decision band.\n\n") +
    `## Limits\n\n` +
    `- No real XP/minute, enemy pressure, death rate, autoplay policy, boss cadence, UI comprehension, or player preference is measured. In particular, this report does **not** convert 30 rewards into minutes.\n` +
    `- Movement scalar growth is not guaranteed to add a legal destination for every piece or build: royal movement can overlap native king/queen geometry, and stride can overlap another movement modifier. This pure-rule probe records movement output, not the complete game move set.\n` +
    `- Seeded draft trajectories are reproducible samples, not independent player populations. ${DRAFTS - uniqueTrajectories} draft records alias an earlier trajectory, and ${DRAFTS - uniqueFinalStates} alias an earlier final state.\n` +
    `- The tactical layouts are compact authored stress boards. A successful bounded probe does not prove the live game is balanced; player playtests remain the next evidence source.\n`;
}

function main() {
  delete require.cache[require.resolve(TRAIT_PATH)];
  const T = require(TRAIT_PATH);
  assertApi(T);
  const actualMaxLevel = T.MAX_LEVEL || MAX_LEVEL;
  if (actualMaxLevel !== MAX_LEVEL) throw new Error(`expected MAX_LEVEL ${MAX_LEVEL}, received ${actualMaxLevel}`);
  if ((T.SLOT_LIMIT || SLOT_LIMIT) !== SLOT_LIMIT) throw new Error(`expected SLOT_LIMIT ${SLOT_LIMIT}`);
  const config = {
    evaluator: "trait-levels-v013",
    seed: SEED, drafts: DRAFTS, choices: CHOICES, rerolls: REROLLS, slotLimit: SLOT_LIMIT, maxLevel: MAX_LEVEL,
    traitCount: T.traits.length, tacticalBoards: BOARDS, ruleVersion: T.RULE_VERSION || "unknown", dirtyFiles: dirtyFiles(),
    hashes: { evaluator: sha(__filename), traits: sha(TRAIT_PATH) },
  };
  config.dirty = config.dirtyFiles.length > 0;
  const drafts = Array.from({ length: DRAFTS }, (_, index) => runDraft(T, SEED + index * 104729));
  const tacticalResult = tactical(T);
  const monotone = T.traits.map((trait) => monotoneTrait(T, trait));
  const raw = { config, drafts: drafts.map(compactDraft), tactical: compactTactical(tacticalResult), monotone };
  const rawPath = path.join(OUT, "trait-levels-v013-raw.json");
  const reportPath = path.join(OUT, "trait-levels-v013-report.md");
  writeJson(rawPath, raw);
  fs.writeFileSync(reportPath, report(config, drafts, tacticalResult, T, monotone));
  console.log(JSON.stringify({ report: path.relative(ROOT, reportPath), raw: path.relative(ROOT, rawPath), complete: drafts.filter((draft) => draft.completeBuild).length, noOps: drafts.reduce((sum, draft) => sum + draft.failedChoices, 0), monotoneFailures: monotone.filter((row) => !row.monotone).length }, null, 2));
}

main();
