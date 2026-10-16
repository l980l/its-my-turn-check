(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TraitSystem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SLOT_LIMIT = 6;

  const BASE_TRAITS = [
    { id: "shockwave", icon: "✦", name: "IMPACT CORE", desc: "착지 시 주변 1칸 충격파", tier: 1, kind: "combat" },
    { id: "diagonalBurst", icon: "✧", name: "DIAGONAL BURST", desc: "직접 타격 시 착지 칸의 모든 대각선 적 관통", tier: 1, kind: "combat" },
    { id: "longStride", icon: "↔", name: "LONG STRIDE", desc: "킹·폰 3칸 / 나이트 확장 L자 / 슬라이딩 말 +2칸", tier: 1, kind: "movement" },
    { id: "royalStep", icon: "♚", name: "ROYAL STEP", desc: "모든 방향으로 2칸 이동 가능", tier: 1, kind: "movement" },
    { id: "magnet", icon: "✹", name: "ARC MAGNET", desc: "타격 시 주변 2칸의 적도 타격", tier: 1, kind: "combat" },
    { id: "chainSpark", icon: "⚡", name: "CHAIN SPARK", desc: "타격 시 XP +1", tier: 1, kind: "passive" },
    { id: "echoBlade", icon: "➤", name: "ECHO BLADE", desc: "타격 시 이동 방향의 가장 가까운 적 관통", tier: 1, kind: "combat" },
    { id: "fork", icon: "♞", name: "FORK", desc: "타격 시 나이트 위치의 적도 타격", tier: 1, kind: "combat" },
    { id: "crossCheck", icon: "✚", name: "CROSS CHECK", desc: "타격 시 상하좌우 가장 가까운 적 관통", tier: 1, kind: "combat" },
    { id: "slipstream", icon: "〰", name: "SLIPSTREAM", desc: "3적 턴마다 첫 비처치 이동 후 한 번 더 이동", tier: 1, kind: "movement" },
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

  const rawById = Object.fromEntries([...BASE_TRAITS, ...RECIPES].map((trait) => [trait.id, trait]));
  const baseAncestry = (id, seen = new Set()) => {
    if (seen.has(id)) throw new Error(`cyclic trait recipe: ${id}`);
    const trait = rawById[id];
    if (!trait) throw new Error(`unknown trait id: ${id}`);
    if (!trait.recipe) return [id];
    const next = new Set(seen);
    next.add(id);
    return trait.recipe.flatMap((ingredient) => baseAncestry(ingredient, next));
  };
  const baseById = Object.fromEntries(BASE_TRAITS.map((trait) => [trait.id, trait]));
  const fusionDescription = (trait) => {
    const inherited = [...new Set(baseAncestry(trait.id))];
    const names = inherited.map((id) => baseById[id].name).join(" · ");
    const combatCount = inherited.filter((id) => baseById[id].kind === "combat").length;
    const permanentCount = inherited.length - combatCount;
    const combatRule = combatCount === 0
      ? "이동 효과는 항상 적용됩니다."
      : combatCount === 1
        ? "전투 효과는 매 플레이어 이동에 적용됩니다."
        : "첫 전투 효과는 매 플레이어 이동, 나머지 전투 효과는 짝수 번째 플레이어 이동에 적용됩니다.";
    const permanentRule = combatCount > 0 && permanentCount ? " 이동·XP 효과는 항상 적용됩니다." : "";
    return `기본 효과: ${names}. ${combatRule}${permanentRule}`;
  };
  const traits = [...BASE_TRAITS, ...RECIPES.map((trait) => ({ ...trait, desc: fusionDescription(trait) }))];
  const byId = Object.freeze(Object.fromEntries(traits.map((trait) => [trait.id, Object.freeze({ ...trait, recipe: trait.recipe && Object.freeze([...trait.recipe]) })])));
  const PERMANENT_EFFECTS = new Set(BASE_TRAITS.filter((trait) => trait.kind !== "combat").map((trait) => trait.id));
  const COMBAT_EFFECTS = new Set(BASE_TRAITS.filter((trait) => trait.kind === "combat").map((trait) => trait.id));

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

  function effects(inventory, moveNumber = 0) {
    requireInventory(inventory);
    const active = new Set();
    const alternateCombat = Number(moveNumber) > 0 && Number(moveNumber) % 2 === 0;

    for (const id of inventory) {
      const trait = byId[id];
      if (!trait.recipe) {
        active.add(id);
        continue;
      }
      const inherited = [...new Set(ancestry(id))];
      const primaryCombat = inherited.find((baseId) => COMBAT_EFFECTS.has(baseId));
      for (const baseId of inherited) {
        if (PERMANENT_EFFECTS.has(baseId) || baseId === primaryCombat || alternateCombat) active.add(baseId);
      }
    }
    return active;
  }

  function rewardPool(rank = 0) {
    const normalizedRank = Number.isFinite(rank) ? rank : 0;
    return traits.filter((trait) => trait.tier === 1 || (normalizedRank >= 6 && trait.tier === 2));
  }

  return Object.freeze({
    SLOT_LIMIT,
    traits: Object.freeze(traits.map((trait) => byId[trait.id])),
    byId,
    availableRecipes,
    fuse,
    effects,
    rewardPool,
    ancestry,
    PERMANENT_EFFECTS,
    COMBAT_EFFECTS,
  });
});
