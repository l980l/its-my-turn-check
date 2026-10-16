(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TraitSystem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SLOT_LIMIT = 6;

  const BASE_TRAITS = [
    { id: "shockwave", icon: "✦", name: "IMPACT CORE", tier: 1 },
    { id: "diagonalBurst", icon: "✧", name: "DIAGONAL BURST", tier: 1 },
    { id: "longStride", icon: "↔", name: "LONG STRIDE", tier: 1 },
    { id: "royalStep", icon: "♚", name: "ROYAL STEP", tier: 1 },
    { id: "magnet", icon: "✹", name: "ARC MAGNET", tier: 1 },
    { id: "chainSpark", icon: "⚡", name: "CHAIN SPARK", tier: 1 },
    { id: "echoBlade", icon: "➤", name: "ECHO BLADE", tier: 1 },
    { id: "fork", icon: "♞", name: "FORK", tier: 1 },
    { id: "crossCheck", icon: "✚", name: "CROSS CHECK", tier: 1 },
    { id: "slipstream", icon: "〰", name: "SLIPSTREAM", tier: 1 },
  ];

  // Each ring tier deliberately overlaps its neighbouring recipes. This creates
  // several routes upward while keeping every fusion deterministic and readable.
  const RECIPES = [
    { id: "kineticCrown", icon: "◇", name: "KINETIC CROWN", tier: 2, recipe: ["shockwave", "diagonalBurst"] },
    { id: "royalVector", icon: "◇", name: "ROYAL VECTOR", tier: 2, recipe: ["longStride", "royalStep"] },
    { id: "arcRelay", icon: "◇", name: "ARC RELAY", tier: 2, recipe: ["magnet", "chainSpark"] },
    { id: "forkedEcho", icon: "◇", name: "FORKED ECHO", tier: 2, recipe: ["echoBlade", "fork"] },
    { id: "crossCurrent", icon: "◇", name: "CROSS CURRENT", tier: 2, recipe: ["crossCheck", "slipstream"] },
    { id: "tacticalDrift", icon: "◇", name: "TACTICAL DRIFT", tier: 2, recipe: ["longStride", "slipstream"] },

    { id: "prismaticImpact", icon: "⬡", name: "PRISMATIC IMPACT", tier: 3, recipe: ["kineticCrown", "royalVector"] },
    { id: "sovereignRelay", icon: "⬡", name: "SOVEREIGN RELAY", tier: 3, recipe: ["royalVector", "arcRelay"] },
    { id: "stormFork", icon: "⬡", name: "STORM FORK", tier: 3, recipe: ["arcRelay", "forkedEcho"] },
    { id: "echoCurrent", icon: "⬡", name: "ECHO CURRENT", tier: 3, recipe: ["forkedEcho", "crossCurrent"] },
    { id: "currentDrift", icon: "⬡", name: "CURRENT DRIFT", tier: 3, recipe: ["crossCurrent", "tacticalDrift"] },
    { id: "crownDrift", icon: "⬡", name: "CROWN DRIFT", tier: 3, recipe: ["tacticalDrift", "kineticCrown"] },

    { id: "astralCrown", icon: "✺", name: "ASTRAL CROWN", tier: 4, recipe: ["prismaticImpact", "sovereignRelay"] },
    { id: "thunderRegent", icon: "✺", name: "THUNDER REGENT", tier: 4, recipe: ["sovereignRelay", "stormFork"] },
    { id: "echoMonarch", icon: "✺", name: "ECHO MONARCH", tier: 4, recipe: ["stormFork", "echoCurrent"] },
    { id: "circuitSovereign", icon: "✺", name: "CIRCUIT SOVEREIGN", tier: 4, recipe: ["echoCurrent", "currentDrift"] },
    { id: "driftEmperor", icon: "✺", name: "DRIFT EMPEROR", tier: 4, recipe: ["currentDrift", "crownDrift"] },
    { id: "prismaticEmperor", icon: "✺", name: "PRISMATIC EMPEROR", tier: 4, recipe: ["crownDrift", "prismaticImpact"] },
  ];

  // Every recipe replaces its ingredients with its own rule. No ancestor effects survive implicitly.
  const RULES = {
    shockwave: { shape: "adjacent", range: 1, maxTargets: 1, minDistance: 2, fx: "shockwave" },
    diagonalBurst: { shape: "diagonal", range: 1, maxTargets: 1, fx: "echo" },
    longStride: { stride: 1 },
    royalStep: { royal: 1 },
    magnet: { shape: "adjacent", range: 1, maxTargets: 1, weakest: true, fx: "magnet" },
    chainSpark: { xpEvery: 4, xp: 1 },
    echoBlade: { shape: "forward", range: 2, maxTargets: 1, fx: "echo" },
    fork: { shape: "fork", range: 2, maxTargets: 1, fx: "fork" },
    crossCheck: { shape: "cross", range: 1, maxTargets: 1, maxDistance: 1, fx: "cross" },
    slipstream: { escape: 6 },
    kineticCrown: { shape: "diagonal", range: 1, maxTargets: 2, fx: "shockwave" },
    royalVector: { stride: 1, royal: 1 },
    arcRelay: { shape: "adjacent", range: 2, maxTargets: 2, cooldown: 1, fx: "magnet" },
    forkedEcho: { shape: "fork", range: 2, maxTargets: 2, fx: "fork" },
    crossCurrent: { shape: "cross", range: 2, maxTargets: 2, minChain: 2, fx: "cross" },
    tacticalDrift: { stride: 1, escape: 6 },
    prismaticImpact: { shape: "diagonal", range: 2, maxTargets: 3, minDistance: 2, stride: 1, fx: "shockwave" },
    sovereignRelay: { shape: "cross", range: 2, maxTargets: 2, royal: 1, xpEvery: 4, xp: 1, cooldown: 1, fx: "spark" },
    stormFork: { shape: "fork", range: 2, maxTargets: 3, minChain: 2, fx: "fork" },
    echoCurrent: { shape: "forward", range: 3, maxTargets: 3, cooldown: 1, fx: "echo" },
    currentDrift: { stride: 1, escape: 4 },
    crownDrift: { shape: "adjacent", range: 1, maxTargets: 3, minDistance: 2, cooldown: 1, fx: "shockwave" },
    astralCrown: { shape: "ring", range: 2, maxTargets: 5, minChain: 3, cooldown: 2, fx: "shockwave" },
    thunderRegent: { shape: "cross", range: 3, maxTargets: 4, cooldown: 2, fx: "cross" },
    echoMonarch: { shape: "fan", range: 3, maxTargets: 4, cooldown: 1, fx: "echo" },
    circuitSovereign: { shape: "forkCross", range: 2, maxTargets: 4, minChain: 2, cooldown: 1, fx: "fork" },
    driftEmperor: { stride: 2, royal: 1, escape: 5 },
    prismaticEmperor: { shape: "diagonal", range: 3, maxTargets: 4, minDistance: 2, cooldown: 1, fx: "shockwave" },
  };
  const SHAPES = { adjacent: "주변", diagonal: "대각선", cross: "상하좌우", forward: "이동 방향 직선", fork: "나이트 위치", ring: "바깥 고리", fan: "이동 방향 전방 부채꼴", forkCross: "나이트 위치와 인접 상하좌우" };
  function describe(rule) {
    const parts = [];
    if (rule.stride) parts.push(`기본 사거리 +${rule.stride} (나이트는 긴 L자 추가)`);
    if (rule.royal) parts.push(`상하좌우 ${rule.royal}칸 이동 추가`);
    if (rule.shape) {
      const condition = rule.minDistance ? `${rule.minDistance}칸 이상 이동해 ` : rule.maxDistance ? `${rule.maxDistance}칸 이동해 ` : "";
      const chain = rule.minChain ? `CHAIN ${rule.minChain}부터, ` : "";
      parts.push(`${chain}${condition}직접 처치 시 ${SHAPES[rule.shape]} ${rule.range}칸의 ${rule.weakest ? "내구도가 낮은 " : ""}일반 적 최대 ${rule.maxTargets}기에게 1피해${rule.cooldown ? ` · 재사용 ${rule.cooldown}적 턴` : ""}`);
    }
    if (rule.xpEvery) parts.push(`직접 처치 ${rule.xpEvery}회마다 XP +${rule.xp}`);
    if (rule.escape) parts.push(`직접 처치 후 비공격 이동을 1회 더 허용 · 전체 탈출 효과 공유 재사용 ${rule.escape}적 턴`);
    return parts.join(" / ");
  }
  const traits = [...BASE_TRAITS, ...RECIPES].map((trait) => ({ ...trait, rule: Object.freeze(RULES[trait.id]), desc: describe(RULES[trait.id]) }));
  const byId = Object.freeze(Object.fromEntries(traits.map((trait) => [trait.id, Object.freeze({ ...trait, recipe: trait.recipe && Object.freeze([...trait.recipe]) })])));

  function requireInventory(inventory) {
    if (!Array.isArray(inventory)) throw new TypeError("inventory must be an array of trait ids");
    for (const id of inventory) if (!byId[id]) throw new Error(`unknown trait id: ${id}`);
  }

  function hasIngredients(inventory, ingredients) {
    const counts = new Map();
    for (const id of inventory) counts.set(id, (counts.get(id) || 0) + 1);
    return ingredients.every((id) => {
      const count = counts.get(id) || 0;
      if (!count) return false;
      counts.set(id, count - 1);
      return true;
    });
  }

  function ancestry(id, seen = new Set()) {
    if (seen.has(id)) throw new Error(`cyclic trait recipe: ${id}`);
    const trait = byId[id];
    if (!trait) throw new Error(`unknown trait id: ${id}`);
    if (!trait.recipe) return [id];
    const branch = new Set(seen);
    branch.add(id);
    return trait.recipe.flatMap((ingredient) => ancestry(ingredient, branch));
  }

  function availableRecipes(inventory) {
    requireInventory(inventory);
    return RECIPES.filter((trait) => hasIngredients(inventory, trait.recipe)).map((trait) => byId[trait.id]);
  }

  function fuse(inventory, resultId) {
    requireInventory(inventory);
    const result = byId[resultId];
    if (!result || !result.recipe) throw new Error(`not a fusion trait: ${resultId}`);
    if (!hasIngredients(inventory, result.recipe)) throw new Error(`missing ingredients for ${resultId}`);

    const remaining = [...inventory];
    for (const ingredient of result.recipe) remaining.splice(remaining.indexOf(ingredient), 1);
    remaining.push(resultId);
    return remaining;
  }

  function movement(inventory) {
    requireInventory(inventory);
    return inventory.reduce((result, id) => ({
      stride: Math.max(result.stride, byId[id].rule.stride || 0),
      royal: Math.max(result.royal, byId[id].rule.royal || 0),
    }), { stride: 0, royal: 0 });
  }
  function matches(shape, x, y, dx, dy, range) {
    const ax = Math.abs(x), ay = Math.abs(y), distance = Math.max(ax, ay);
    if (!distance || distance > range) return false;
    const fork = (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
    if (shape === "adjacent") return true;
    if (shape === "diagonal") return ax === ay;
    if (shape === "cross") return x === 0 || y === 0;
    if (shape === "fork") return fork;
    if (shape === "forkCross") return fork || ax + ay === 1;
    if (shape === "ring") return distance === range;
    if (shape === "forward") return x * dy === y * dx && x * dx + y * dy > 0;
    if (shape === "fan") return x * dx + y * dy > 0 && Math.abs(x * dy - y * dx) <= x * dx + y * dy;
    return false;
  }
  function clearLine(from, to, isWall) {
    if (!isWall) return true;
    let x = from.x, y = from.y;
    const dx = Math.abs(to.x - x), dy = Math.abs(to.y - y), sx = Math.sign(to.x - x), sy = Math.sign(to.y - y);
    let error = dx - dy;
    while (x !== to.x || y !== to.y) {
      const twice = error * 2;
      if (twice > -dy) { error -= dy; x += sx; }
      if (twice < dx) { error += dx; y += sy; }
      if (isWall(x, y)) return false;
    }
    return true;
  }
  function resolve(inventory, context, memory) {
    requireInventory(inventory);
    const result = { targets: [], xp: 0, fx: [] };
    if (!context.directKill) return result;
    memory.cooldowns ||= {};
    const dx = Math.sign(context.to.x - context.from.x), dy = Math.sign(context.to.y - context.from.y);
    const distance = Math.max(Math.abs(context.to.x - context.from.x), Math.abs(context.to.y - context.from.y));
    const used = new Set();
    for (const id of new Set(inventory)) {
      const rule = byId[id].rule;
      if (rule.escape) memory.escapeReady = true;
      if (rule.xpEvery && context.directKills % rule.xpEvery === 0) result.xp = Math.max(result.xp, rule.xp);
      if (!rule.shape || (memory.cooldowns[id] || 0) > context.wave ||
          distance < (rule.minDistance || 0) || distance > (rule.maxDistance || Infinity) ||
          context.chain < (rule.minChain || 0)) continue;
      const targets = context.enemies.filter((enemy) => !enemy.boss && !used.has(enemy) &&
        matches(rule.shape, enemy.x - context.to.x, enemy.y - context.to.y, dx, dy, rule.range) &&
        ((rule.shape === "fork" || rule.shape === "forkCross")
          ? !context.isWall?.(enemy.x, enemy.y)
          : clearLine(context.to, enemy, context.isWall)))
        .sort((a, b) => (rule.weakest ? (a.hp || 1) - (b.hp || 1) : 0) ||
          Math.max(Math.abs(a.x - context.to.x), Math.abs(a.y - context.to.y)) - Math.max(Math.abs(b.x - context.to.x), Math.abs(b.y - context.to.y)) || a.x - b.x || a.y - b.y)
        .slice(0, rule.maxTargets);
      if (!targets.length) continue;
      targets.forEach((enemy) => used.add(enemy));
      result.targets.push(...targets);
      result.fx.push({ id, type: rule.fx, targets });
      memory.cooldowns[id] = context.wave + (rule.cooldown || 0);
    }
    return result;
  }
  function escape(inventory, wave, memory) {
    requireInventory(inventory);
    const cooldowns = inventory.map((id) => byId[id].rule.escape).filter(Boolean);
    if (!cooldowns.length || !memory.escapeReady || (memory.nextEscapeWave || 0) > wave) return false;
    memory.escapeReady = false;
    memory.nextEscapeWave = wave + Math.min(...cooldowns);
    return true;
  }

  function rewardPool(rank = 0) {
    const normalizedRank = Number.isFinite(rank) ? rank : 0;
    return traits.filter((trait) => trait.tier === 1 || (normalizedRank >= 6 && trait.tier === 2));
  }
  const PROGRESSION = Object.freeze({ assistRank: 6, middleRank: 20, lateRank: 40, earlyTier2: 0.35, middleTier2: 0.5, lateTier2: 0.65 });
  function offer(rank = 0, random = Math.random, inventory = []) {
    requireInventory(inventory);
    const chance = rank >= PROGRESSION.lateRank ? PROGRESSION.lateTier2
      : rank >= PROGRESSION.middleRank ? PROGRESSION.middleTier2 : PROGRESSION.earlyTier2;
    const tier = rank >= 6 && random() < chance ? 2 : 1;
    const pool = traits.filter((trait) => trait.tier === tier);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const options = pool.slice(0, 3);
    if (rank >= PROGRESSION.assistRank) {
      const helpful = pool.filter((trait) => RECIPES.some((recipe) =>
        recipe.tier === tier + 1 && !inventory.includes(recipe.id) &&
        recipe.recipe.includes(trait.id) && hasIngredients([...inventory, trait.id], recipe.recipe)));
      if (helpful.length) {
        const material = helpful[Math.floor(random() * helpful.length)];
        if (!options.some((trait) => trait.id === material.id)) options[2] = material;
      }
    }
    return options;
  }

  return Object.freeze({
    SLOT_LIMIT,
    traits: Object.freeze(traits.map((trait) => byId[trait.id])),
    byId,
    availableRecipes,
    fuse,
    movement,
    resolve,
    escape,
    rewardPool,
    offer,
    PROGRESSION,
    ancestry,
    RULE_VERSION: "v0.12.1",
  });
});
