"use strict";

// Deterministic pacing model for hidden trait mastery. This intentionally
// models attributed kills, not all kills. Attack/collateral kills have one
// anchor, while a direct kill may earn each eligible support credit together.
// It is a tuning aid, not a prediction of actual match duration or fun.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "balance");
const TRAITS = path.join(ROOT, "traits.js");
const SEED = 20261018;
const RUNS_PER_SEGMENT = 120;
const MINUTES = 50;
const SLOT_LIMIT = 6;
const MAX_LEVEL = 5;

const RATE_PROFILES = Object.freeze({
  slow: { killsPerMinute: 16, attackSourceRate: 0.31, extendedMoveRate: 0.13, escapeConsumeRate: 0.030 },
  typical: { killsPerMinute: 28, attackSourceRate: 0.39, extendedMoveRate: 0.16, escapeConsumeRate: 0.040 },
  fast: { killsPerMinute: 44, attackSourceRate: 0.46, extendedMoveRate: 0.19, escapeConsumeRate: 0.050 },
});

// Retain the first implementation as a paired comparison. Tuned thresholds are
// read directly from runtime; the evaluator never writes tuning into the game.
const THRESHOLD_VARIANTS = Object.freeze({
  baseline: { attack: 240, movement: 180, chainSpark: 48, slipstream: 48 },
  tuned: null,
});

function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function round(value) { return Math.round(value * 1000) / 1000; }
function quantile(values, q) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1))]; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function dirtyFiles() { try { return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean); } catch (_) { return ["git status unavailable"]; } }
function randomFor(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 0x100000000; }; }
function poisson(random, lambda) {
  // Small, bounded per-minute rates keep Knuth sampling fast and exact enough
  // for this synthetic workload.
  const limit = Math.exp(-lambda); let p = 1, count = 0;
  do { count++; p *= random(); } while (p > limit);
  return count - 1;
}
function shuffled(items, random) { const out = [...items]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }

function assertApi(T) {
  if (!Array.isArray(T.traits) || T.traits.length !== 13 || T.SLOT_LIMIT !== SLOT_LIMIT || T.MAX_LEVEL !== MAX_LEVEL) throw new Error("expected current 13-trait, six-slot, Lv5 API");
  for (const name of ["atLevel", "MASTERIES", "creditMastery", "checkMasteries"]) if (!(name in T)) throw new Error(`TraitSystem.${name} is required for hidden-growth evaluation`);
}
function masteryEntries(T) {
  const raw = T.MASTERIES;
  const entries = Array.isArray(raw) ? raw : Object.entries(raw || {}).map(([id, entry]) => ({ id, ...entry }));
  if (!entries.length) throw new Error("MASTERIES must contain entries");
  return entries.map((entry) => ({ ...entry, id: entry.id || entry.traitId })).sort((a, b) => a.id.localeCompare(b.id));
}
function familyFor(T, id) {
  if (id === "chainSpark") return "chainSpark";
  if (id === "slipstream") return "slipstream";
  const growth = T.byId[id].growth;
  return growth === "movement" ? "movement" : "attack";
}
function thresholdsFor(T, variant) {
  if (!variant) return Object.fromEntries(masteryEntries(T).map((entry) => [entry.id, entry.requiredXp]));
  return Object.fromEntries(masteryEntries(T).map((entry) => [entry.id, variant[familyFor(T, entry.id)]]));
}
function masterIds(T) { return masteryEntries(T).map((entry) => entry.id); }
function buildArchetypes(T, random) {
  const attacks = T.traits.filter((trait) => trait.growth === "attack").map((trait) => trait.id);
  const utility = T.traits.filter((trait) => trait.growth !== "attack").map((trait) => trait.id);
  const pick = (items, n) => shuffled(items, random).slice(0, n);
  const fixedUtility = (ids) => ids.filter((id) => T.byId[id]);
  return [
    { kind: "attack-focused", ids: [...pick(attacks, 5), ...pick(utility, 1)] },
    { kind: "balanced", ids: [...pick(attacks, 3), ...fixedUtility(["longStride", "chainSpark", "slipstream"])] },
    { kind: "mobile-support", ids: [...pick(attacks, 2), ...fixedUtility(["longStride", "royalStep", "chainSpark", "slipstream"])] },
    { kind: "random-six", ids: pick(T.traits.map((trait) => trait.id), SLOT_LIMIT) },
  ].map((build) => ({ ...build, ids: [...new Set(build.ids)].slice(0, SLOT_LIMIT) }));
}
function weightedPick(ids, weights, random) {
  const total = ids.reduce((sum, id) => sum + weights[id], 0);
  let needle = random() * total;
  for (const id of ids) { needle -= weights[id]; if (needle <= 0) return id; }
  return ids.at(-1);
}
function playerFor(build, thresholds) {
  return {
    traits: [],
    traitLevels: {},
    traitXp: Object.fromEntries(build.ids.map((id) => [id, 0])),
    mastered: {},
    _modelThresholds: { ...thresholds },
  };
}
function probePlayer(ids, thresholds) {
  return {
    traits: [...ids],
    traitLevels: Object.fromEntries(ids.map((id) => [id, MAX_LEVEL])),
    traitXp: Object.fromEntries(ids.map((id) => [id, 0])),
    mastered: {},
    _modelThresholds: { ...thresholds },
  };
}
function recordCredit(T, player, id, credits, minute, unlocks, useRuntime) {
  if (!id || !credits) return;
  const before = new Set(Object.keys(player.mastered || {}).filter((key) => player.mastered[key]));
  if (useRuntime) {
    T.creditMastery(player, { [id]: credits });
  } else {
    player.traitXp[id] = (player.traitXp[id] || 0) + credits;
    if (player.traitLevels[id] === MAX_LEVEL && player.traitXp[id] >= player._modelThresholds[id]) player.mastered[id] = true;
  }
  for (const unlocked of Object.keys(player.mastered || {})) if (player.mastered[unlocked] && !before.has(unlocked)) unlocks.push({ id: unlocked, minute });
}
function progressionSchedule(build, random) {
  const acquireMinutes = [2, 4, 6, 8, 10, 12];
  const maxMinutes = [18, 24, 30, 36, 42, 48];
  const acquisitionOrder = shuffled(build.ids, random);
  const maxOrder = shuffled(build.ids, random);
  return {
    acquiredAt: Object.fromEntries(acquisitionOrder.map((id, index) => [id, acquireMinutes[index]])),
    maxAt: Object.fromEntries(maxOrder.map((id, index) => [id, maxMinutes[index]])),
  };
}
function simulate(T, build, profile, thresholds, seed, useRuntime) {
  const random = randomFor(seed);
  const player = playerFor(build, thresholds);
  const attacks = build.ids.filter((id) => T.byId[id].growth === "attack");
  const movement = build.ids.filter((id) => T.byId[id].growth === "movement");
  const hasChain = build.ids.includes("chainSpark");
  const hasSlip = build.ids.includes("slipstream");
  const attackWeights = Object.fromEntries(attacks.map((id, index) => [id, 0.55 + random() * 1.8 + index * 0.07]));
  const movementWeights = Object.fromEntries(movement.map((id) => [id, 0.8 + random() * 0.8]));
  const schedule = progressionSchedule(build, random);
  const unlocks = [];
  const sourceCredits = Object.fromEntries(build.ids.map((id) => [id, 0]));
  let totalKills = 0;
  let directKills = 0;
  for (let minute = 1; minute <= MINUTES; minute++) {
    const beforeLevelUnlock = new Set(Object.keys(player.mastered).filter((id) => player.mastered[id]));
    for (const id of build.ids) {
      if (schedule.acquiredAt[id] === minute) player.traits.push(id);
      if (schedule.acquiredAt[id] <= minute) {
        const span = schedule.maxAt[id] - schedule.acquiredAt[id];
        const progress = Math.max(0, minute - schedule.acquiredAt[id]);
        player.traitLevels[id] = Math.min(MAX_LEVEL, 1 + Math.floor((progress / span) * (MAX_LEVEL - 1)));
      }
    }
    if (useRuntime) T.checkMasteries(player);
    else for (const id of player.traits) {
      if (player.traitLevels[id] === MAX_LEVEL && player.traitXp[id] >= player._modelThresholds[id]) player.mastered[id] = true;
    }
    for (const id of Object.keys(player.mastered)) {
      if (player.mastered[id] && !beforeLevelUnlock.has(id)) unlocks.push({id, minute});
    }
    const kills = poisson(random, profile.killsPerMinute);
    totalKills += kills;
    for (let kill = 0; kill < kills; kill++) {
      // Trait secondary-kill sources are mutually exclusive and do not feed
      // support credit. Direct kills may co-credit their support sources.
      if (attacks.length && random() < profile.attackSourceRate) {
        const id = weightedPick(attacks, attackWeights, random);
        if (player.traits.includes(id)) { sourceCredits[id]++; recordCredit(T, player, id, 1, minute, unlocks, useRuntime); }
        continue;
      }
      directKills++;
      // Direct-kill supports can co-credit when their real trigger conditions
      // overlap. Slipstream's next-move consumption without a kill is not
      // represented, so its synthetic contribution remains an explicit limit.
      if (hasSlip && random() < profile.escapeConsumeRate) {
        if (player.traits.includes("slipstream")) { sourceCredits.slipstream++; recordCredit(T, player, "slipstream", 1, minute, unlocks, useRuntime); }
      }
      const chainEvery = hasChain && player.traits.includes("chainSpark")
        ? T.atLevel("chainSpark", player.traitLevels.chainSpark || 1, Boolean(player.mastered.chainSpark)).rule.xpEvery
        : null;
      if (hasChain && directKills % chainEvery === 0) {
        if (player.traits.includes("chainSpark")) { sourceCredits.chainSpark++; recordCredit(T, player, "chainSpark", 1, minute, unlocks, useRuntime); }
      }
      if (movement.length && random() < profile.extendedMoveRate) {
        const id = weightedPick(movement, movementWeights, random);
        if (player.traits.includes(id)) { sourceCredits[id]++; recordCredit(T, player, id, 1, minute, unlocks, useRuntime); }
      }
    }
  }
  const third = unlocks[2]?.minute ?? null;
  return {
    seed, build: build.kind, ids: build.ids, credits: player.traitXp, sourceCredits, attackWeights, movementWeights, schedule, totalKills, directKills,
    unlocks, mastersAt50: Object.values(player.mastered || {}).filter(Boolean).length,
    thirdMasterMinute: third, trajectoryHash: hash({ ids: build.ids, schedule, unlocks, credits: player.traitXp, sourceCredits }),
    finalHash: hash({ masters: Object.keys(player.mastered || {}).filter((id) => player.mastered[id]).sort(), credits: player.traitXp }),
  };
}
function aggregate(records) {
  const masters = records.map((record) => record.mastersAt50);
  const thirds = records.map((record) => record.thirdMasterMinute).filter((value) => value !== null);
  return {
    runs: records.length,
    meanMastersAt50: round(mean(masters)), medianMastersAt50: quantile(masters, 0.5), p10MastersAt50: quantile(masters, 0.1), p90MastersAt50: quantile(masters, 0.9),
    threeMastersAt50: masters.filter((value) => value >= 3).length,
    thirdMasterObserved: thirds.length,
    medianThirdMasterMinute: quantile(thirds, 0.5), p90ThirdMasterMinute: quantile(thirds, 0.9),
    uniqueTrajectories: new Set(records.map((record) => record.trajectoryHash)).size,
    uniqueFinalStates: new Set(records.map((record) => record.finalHash)).size,
  };
}
function orderIndependence(T, thresholds) {
  const failures = [];
  for (const id of masterIds(T)) {
    const need = thresholds[id];
    for (const chunks of [[1, need - 1], [need - 1, 1], [Math.floor(need / 2), need - Math.floor(need / 2)]]) {
      const probe = probePlayer([id], thresholds);
      for (const value of chunks) { T.creditMastery(probe, { [id]: value }); T.checkMasteries(probe); }
      if (!probe.mastered?.[id]) failures.push({ id, chunks });
    }
  }
  return failures;
}
function masteryPureProbes(T, thresholds) {
  const failures = [];
  for (const id of masterIds(T)) {
    const player = probePlayer([id], thresholds);
    T.creditMastery(player, { [id]: thresholds[id] });
    T.checkMasteries(player);
    const base = T.atLevel(id, MAX_LEVEL).rule;
    const master = T.atLevel(id, MAX_LEVEL, true).rule;
    if (!player.mastered?.[id] || hash(base) === hash(master)) failures.push(id);
  }
  return failures;
}
function boundedRuleProbes(T) {
  const failures = [];
  for (const trait of T.traits) {
    const rule = T.atLevel(trait.id, MAX_LEVEL, true).rule;
    if (rule.range && rule.range > 4) failures.push({ id:trait.id, reason:"range", value:rule.range });
    if (rule.maxTargets && rule.maxTargets > 8) failures.push({ id:trait.id, reason:"targets", value:rule.maxTargets });
    if (rule.damage && rule.damage > 3) failures.push({ id:trait.id, reason:"damage", value:rule.damage });
    if (rule.xp && rule.xp > 3) failures.push({ id:trait.id, reason:"xp", value:rule.xp });
    if (rule.escape && rule.escape < 2) failures.push({ id:trait.id, reason:"escape", value:rule.escape });
    if ((rule.stride || 0) > 4 || (rule.royal || 0) > 4) failures.push({ id:trait.id, reason:"movement", value:rule });
  }
  for (const synergy of T.SYNERGIES || []) {
    const rule = synergy.rule;
    if (rule && ((rule.range || 0) > 4 || (rule.maxTargets || 0) > 8 || (rule.cooldown || 0) < 1)) failures.push({ id:synergy.id, reason:"synergy-rule", value:rule });
    const active = T.activeSynergies(synergy.recipe).some((entry) => entry.id === synergy.id);
    if (!active) failures.push({ id:synergy.id, reason:"synergy-activation" });
  }
  return failures;
}
function profileMarkdown() {
  return [
    "# 숨겨진 강화 페이스 검증 프로필",
    "",
    "- 목표: 가정한 보통 처치 속도의 50분 플레이에서 달인 약 3개. 3개 하드 캡이나 시간 잠금은 두지 않는다.",
    "- 비교: 최초 임계값(공격 240 / 이동 180 / CHAIN SPARK 48 / SLIPSTREAM 48)과 실제 런타임의 현재 임계값을 같은 시드·빌드·획득 일정으로 비교한다.",
    "- 입력: 시드 20261018, 구간당 120회, 4가지 빌드 × 느림/보통/빠름(분당 16/28/44처치). 실제 플레이 수집값이 아닌 설계 가정이다.",
    "- 특성 획득 시점: 2/4/6/8/10/12분. Lv.5 도달 시점: 18/24/30/36/42/48분. 각각 다른 순서로 배정한다. Lv.5 이전에도 숙련이 쌓인다.",
    "- 2차 처치는 공격 출처 하나에만 귀속한다. 직접 처치는 확장 이동·실제 경험치 보너스 발동·이미 소비한 추가 턴 효과가 겹친 경우 각 보조 특성에 기여할 수 있다.",
    "- 내구도 타격·아이템 처치·미보유 특성에는 숙련을 주지 않는다. 추가 턴을 소비하고도 다음 수에 처치하지 못한 경우는 모델링하지 않으므로 SLIPSTREAM 페이스의 불확실성이 특히 크다.",
    "- Lv.5 도달 순간과 처치 경험치 증가 순간 모두 즉시 해금을 검사한다. 실제 달인 해금은 공유 TraitSystem API를 사용한다.",
    "",
    "## 측정 계약",
    "",
    "한 표본은 정해진 빌드·시드로 만든 50분 가상 궤적이다. 50분의 달인 수, 3번째 해금을 관찰한 표본 수와 그 표본에 한한 시간 분위수, 고유 궤적·최종 상태 수를 기록한다. 4개 빌드를 같은 비중으로 합친 값은 인위적인 비교 집합이지 실제 플레이어 분포가 아니다.",
    "",
    "## 판정과 한계",
    "",
    "조건 순서 오류·범위/피해 상한 오류는 실패로 처리한다. 목표 페이스의 차이는 조정 근거이며 재미나 생존 가능성 판정이 아니다. 50분 이후 해금은 관찰되지 않은 것이지 불가능한 것이 아니다. 실제 입력 속도, 경험치 수급, 죽음, 보스, 적 밀도, 시너지의 처치 기여도·강화 후 눈덩이 효과는 별도 실측이 필요하다.",
    "",
  ].join("\n");
}
function report(config, T, results, checks, records) {
  const lines = [];
  for (const [variant, byProfile] of Object.entries(results))
    for (const [profile, byBuild] of Object.entries(byProfile))
      for (const [build, summary] of Object.entries(byBuild)) lines.push({variant, profile, build, ...summary});
  const mixed = aggregate(Object.values(records.tuned.typical).flat());
  const thresholds = thresholdsFor(T, null);
  return [
    "# 숨겨진 강화 페이스 모델 (" + T.RULE_VERSION + ")",
    "",
    "고정 시드 " + SEED + ". 변경 중인 작업트리에서 평가했으며, 규칙·평가기 SHA-256과 표본별 원시 결과는 hidden-growth-raw.json에 기록했다. 아래 분 단위 결과는 실측이 아닌 가정 기반 모델이다.",
    "",
    "## 런타임 적용값",
    "",
    "공격 특성 " + thresholds.shockwave + "처치 / 이동 특성 " + thresholds.longStride +
      "회 기여 처치 / CHAIN SPARK " + thresholds.chainSpark + "회 보너스 발동 처치 / SLIPSTREAM " +
      thresholds.slipstream + "회 추가 턴 기여 처치. 모든 특성은 Lv.5도 필요하며 두 조건을 달성한 순서는 무관하다.",
    "",
    "동일 비중의 네 빌드·보통 속도 집합 " + mixed.runs + "개에서 50분 달인 수 중앙값 " +
      mixed.medianMastersAt50 + ", 평균 " + mixed.meanMastersAt50 + ", P10–P90 " +
      mixed.p10MastersAt50 + "–" + mixed.p90MastersAt50 + "개. 3번째 달인을 50분 안에 관찰한 표본은 " +
      mixed.thirdMasterObserved + "/" + mixed.runs + "이며, 이 표본들에 한한 시간 중앙값은 " + mixed.medianThirdMasterMinute + "분이다.",
    "",
    "## 계약 검증",
    "",
    "- 조건 검사 오류: " + checks.orderFailures.length,
    "- 달인 효과 미변경: " + checks.masterRuleFailures.length,
    "- 범위≤4·대상≤8·피해≤3·보너스XP≤3·이동≤4·탈출 재사용≥2 상한 오류: " + checks.boundFailures.length,
    "- 달인 개수 3개 제한이나 시간 기반 잠금 없음. 6개 모두 조건을 채우면 모두 진화 가능.",
    "",
    "## 구간별 결과",
    "",
    "| 값 | 처치 속도 | 빌드 | 평균 달인 | 중앙값 | P10–P90 | 50분 내 3개 | 관찰된 3번째 시간 중앙값 | 고유 궤적/최종 상태 |",
    "|---|---|---|---:|---:|---|---:|---:|---:|",
    ...lines.map(r => "| " + r.variant + " | " + r.profile + " | " + r.build + " | " + r.meanMastersAt50 +
      " | " + r.medianMastersAt50 + " | " + r.p10MastersAt50 + "–" + r.p90MastersAt50 + " | " +
      r.threeMastersAt50 + "/" + r.runs + " | " + (r.medianThirdMasterMinute ?? "미관찰") + " | " +
      r.uniqueTrajectories + "/" + r.uniqueFinalStates + " |"),
    "",
    "## 해석과 다음 검증",
    "",
    "초기값은 가정한 보통 플레이에서 너무 느렸다. 공격 숙련 기준을 낮추고 경험치 특성의 빠른 진화를 늦춰 전체적인 목표에 접근시켰다. 빌드·처치 속도에 따라 달인 수는 달라지며, 목표 수치에 맞춰 매 게임 결과를 강제하지 않는다.",
    "",
    "획득·최고 레벨 일정, 출처별 처치 비율과 가중치는 가정이다. 시너지의 실제 발동 빈도와 달인 진화가 이후 처치를 얼마나 가속하는지, 실패한 추가 턴 사용, 전투 생존·선호도는 측정하지 않았다. 실제 플레이 기록으로 숙련 분포와 해금 시간을 확인한 뒤 임계값을 재조정해야 한다.",
    "",
  ].join("\n");
}
function main() {
  delete require.cache[require.resolve(TRAITS)];
  const T = require(TRAITS); assertApi(T);
  const config = { evaluator: "hidden-growth", seed: SEED, runsPerSegment: RUNS_PER_SEGMENT, minutes: MINUTES, rateProfiles: RATE_PROFILES, variants: THRESHOLD_VARIANTS, dirtyFiles: dirtyFiles(), hashes: { evaluator: sha(__filename), traits: sha(TRAITS) } };
  config.dirty = config.dirtyFiles.length > 0;
  const results = {};
  const records = {};
  for (const [variant, familyThresholds] of Object.entries(THRESHOLD_VARIANTS)) {
    const thresholds = thresholdsFor(T, familyThresholds);
    results[variant] = {}; records[variant] = {};
    for (const [profileName, profile] of Object.entries(RATE_PROFILES)) {
      results[variant][profileName] = {}; records[variant][profileName] = {};
      for (const buildName of ["attack-focused", "balanced", "mobile-support", "random-six"]) {
        const runRecords = [];
        for (let index = 0; index < RUNS_PER_SEGMENT; index++) {
          const random = randomFor(SEED + index * 7919 + profileName.length * 101 + buildName.length * 17);
          const build = buildArchetypes(T, random).find((entry) => entry.kind === buildName);
          runRecords.push(simulate(T, build, profile, thresholds, SEED + index * 104729 + profileName.length * 31 + buildName.length, variant === "tuned"));
        }
        records[variant][profileName][buildName] = runRecords;
        results[variant][profileName][buildName] = aggregate(runRecords);
      }
    }
  }
  const tuned = thresholdsFor(T, THRESHOLD_VARIANTS.tuned);
  const checks = { orderFailures: orderIndependence(T, tuned), masterRuleFailures: masteryPureProbes(T, tuned), boundFailures: boundedRuleProbes(T) };
  const raw = { config, masteries: masteryEntries(T), runtimeThresholds: Object.fromEntries(masteryEntries(T).map((entry) => [entry.id, entry.requiredXp])), results, records, checks };
  const rawPath = path.join(OUT, "hidden-growth-raw.json");
  const reportPath = path.join(OUT, "hidden-growth-report.md");
  const profilePath = path.join(OUT, "hidden-growth-profile.md");
  writeJson(rawPath, raw); fs.writeFileSync(profilePath, profileMarkdown()); fs.writeFileSync(reportPath, report(config, T, results, checks, records));
  console.log(JSON.stringify({ report: path.relative(ROOT, reportPath), raw: path.relative(ROOT, rawPath), checks, tunedTypical: results.tuned.typical }, null, 2));
  if (checks.orderFailures.length || checks.masterRuleFailures.length || checks.boundFailures.length) process.exitCode = 1;
}
main();
