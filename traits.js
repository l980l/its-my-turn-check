(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TraitSystem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SLOT_LIMIT = 6;
  const MAX_LEVEL = 5;

  const MASTERIES = Object.freeze({
    shockwave: { name:"초신성", requiredXp:110, desc:"보조 타격이 강해지고 주변을 더 넓게 휩쓸어냅니다." },
    diagonalBurst: { name:"빛의 창", requiredXp:110, desc:"대각선 파동이 강해지고 더 먼 칸까지 닿습니다." },
    longStride: { name:"거인의 보폭", requiredXp:180, desc:"기본 사거리와 왕의 걸음이 한 단계 더 확장됩니다." },
    royalStep: { name:"제왕의 행진", requiredXp:180, desc:"왕의 걸음과 기본 사거리가 한 단계 더 확장됩니다." },
    magnet: { name:"극성 폭풍", requiredXp:110, desc:"약한 적을 끌어당기는 충격이 더 강해집니다." },
    chainSpark: { name:"전장의 통찰", requiredXp:100, desc:"직접 처치 2회마다 XP 3을 얻습니다." },
    echoBlade: { name:"메아리 칼날", requiredXp:110, desc:"전방 검격이 강해지고 더 먼 칸까지 닿습니다." },
    fork: { name:"기사의 심판", requiredXp:110, desc:"나이트 착지점에 강한 연쇄 타격을 남깁니다." },
    crossCheck: { name:"십자 심판", requiredXp:110, desc:"직선 판정이 강해지고 더 먼 칸까지 닿습니다." },
    slipstream: { name:"무영보", requiredXp:48, desc:"탈출 재사용 대기시간이 2턴으로 줄어듭니다." },
    astralCrown: { name:"궤도 폭격", requiredXp:110, desc:"외곽 고리가 3피해의 광역 타격으로 진화합니다." },
    echoMonarch: { name:"폭풍의 칼날", requiredXp:110, desc:"전방 부채꼴이 강해지고 넓어집니다." },
    circuitSovereign: { name:"교차 섬멸", requiredXp:110, desc:"교차 포크가 3피해의 광역 타격으로 진화합니다." },
  });
  const SYNERGIES = Object.freeze([
    Object.freeze({ id:"prismaticImpact", name:"무지개 충격", recipe:Object.freeze(["shockwave", "diagonalBurst"]), desc:"긴 이동 뒤 십자 파동", color:"#d66efd", fx:"cross", rule:Object.freeze({ shape:"cross", range:2, maxTargets:3, cooldown:3, minDistance:2 }) }),
    Object.freeze({ id:"forkedEcho", name:"갈라진 잔향", recipe:Object.freeze(["echoBlade", "fork"]), desc:"전방 부채꼴 잔향", color:"#67e8f9", fx:"echo", rule:Object.freeze({ shape:"fan", range:2, maxTargets:2, cooldown:2 }) }),
    Object.freeze({ id:"arcCircuit", name:"연쇄 방전", recipe:Object.freeze(["magnet", "chainSpark"]), desc:"주변 연쇄 충격", color:"#facc15", fx:"magnet", rule:Object.freeze({ shape:"adjacent", range:2, maxTargets:2, cooldown:3 }) }),
    Object.freeze({ id:"royalVector", name:"왕의 진군", recipe:Object.freeze(["longStride", "royalStep"]), desc:"기본 사거리 +1", color:"#86efac", movement:Object.freeze({ stride:1 }) }),
    Object.freeze({ id:"eclipse", name:"일식", recipe:Object.freeze(["astralCrown", "echoMonarch"]), desc:"넓어진 외곽 고리", color:"#818cf8", fx:"shockwave", rule:Object.freeze({ shape:"ring", range:3, maxTargets:4, cooldown:4 }) }),
  ]);

  // Four utility traits and nine attack patterns. Sparse attack upgrades alternate
  // target capacity and reach; utility upgrades change XP cadence, escape cooldown, or movement.
  const DEFINITIONS = [
    ["shockwave", "✦", "충격파", "attack", { shape:"adjacent", range:1, targets:1, minDistance:2, fx:"shockwave" }],
    ["diagonalBurst", "✧", "대각 파동", "attack", { shape:"diagonal", range:[1,1,2,2,2], targets:[1,2,2,3,4], fx:"echo" }],
    ["longStride", "↔", "큰 걸음", "movement", { stride:[1,1,2,2,2], royal:[0,1,1,2,3] }],
    ["royalStep", "♚", "왕의 걸음", "movement", { stride:[0,1,1,2,2], royal:[1,1,2,2,3] }],
    ["magnet", "✹", "자력 충격", "attack", { shape:"adjacent", range:1, targets:1, weakest:true, fx:"magnet" }],
    ["chainSpark", "⚡", "연쇄의 깨달음", "xp", { every:[8,6,5,4,3], xp:1 }],
    ["echoBlade", "➤", "잔향검", "attack", { shape:"forward", range:[2,2,3,3,4], targets:[1,2,2,3,3], fx:"echo" }],
    ["fork", "♞", "기사의 일격", "attack", { shape:"fork", range:2, targets:1, fx:"fork" }],
    ["crossCheck", "✚", "십자 타격", "attack", { shape:"cross", range:[1,1,2,2,2], targets:[1,2,2,3,4], fx:"cross" }],
    ["slipstream", "〰", "바람걸음", "escape", { cooldown:[8,7,6,5,4] }],
    ["astralCrown", "✺", "고리 타격", "attack", { shape:"ring", range:2, targets:1, minChain:3, cooldown:2, fx:"shockwave" }],
    ["echoMonarch", "✺", "부채날", "attack", { shape:"fan", range:3, targets:1, cooldown:1, fx:"echo" }],
    ["circuitSovereign", "✺", "교차 타격", "attack", { shape:"forkCross", range:2, targets:1, minChain:2, cooldown:1, fx:"fork" }],
  ];
  const SHAPES = { adjacent:"주변", diagonal:"대각선", cross:"상하좌우", forward:"이동 방향 직선", fork:"나이트 위치", forkCross:"나이트 위치와 인접 상하좌우", ring:"바깥 고리", fan:"이동 방향 전방 부채꼴" };
  function levelOf(id, levels) {
    const value = Number(levels && levels[id]);
    return Number.isInteger(value) && value >= 1 && value <= MAX_LEVEL ? value : 1;
  }
  function freezeRule(growth, base, level, mastered = false, id = "") {
    const index = level - 1;
    if (growth === "attack") {
      const rule = {
        ...base,
      range:Array.isArray(base.range) ? base.range[index] : base.range,
      maxTargets:Array.isArray(base.targets) ? base.targets[index] : base.targets + index,
        damage:1,
      };
      if (mastered) {
        rule.range = Math.min(4, rule.range + 1);
        rule.maxTargets = Math.min(8, rule.maxTargets + 2);
        rule.damage = ["astralCrown", "circuitSovereign"].includes(id) ? 3 : 2;
        if (rule.cooldown) rule.cooldown = Math.max(0, rule.cooldown - 1);
        if (rule.minChain) rule.minChain = Math.max(0, rule.minChain - 1);
        if (rule.minDistance) rule.minDistance = Math.max(0, rule.minDistance - 1);
      }
      return Object.freeze(rule);
    }
    if (growth === "xp") return Object.freeze(mastered ? { xpEvery:2, xp:3 } : { xpEvery:base.every[index], xp:base.xp });
    if (growth === "escape") return Object.freeze({ escape:mastered ? 2 : base.cooldown[index] });
    const rule = { stride:base.stride ? base.stride[index] : 0, royal:base.royal ? base.royal[index] : 0 };
    if (mastered) {
      if (id === "longStride") rule.stride = Math.min(4, rule.stride + 1);
      else {
        rule.royal = Math.min(4, rule.royal + 1);
        if (id === "royalStep") rule.directDamage = 2;
      }
    }
    return Object.freeze(rule);
  }
  function describe(rule) {
    const parts = [];
    if (rule.stride) parts.push(`기본 사거리 +${rule.stride} (나이트는 긴 L자 추가)`);
    if (rule.royal) parts.push(`상하좌우 ${rule.royal}칸 이동 추가`);
    if (rule.shape) {
      const condition = rule.minDistance ? `${rule.minDistance}칸 이상 이동해 ` : rule.maxDistance ? `${rule.maxDistance}칸 이동해 ` : "";
      const chain = rule.minChain ? `CHAIN ${rule.minChain}부터, ` : "";
      parts.push(`${chain}${condition}직접 처치 시 ${SHAPES[rule.shape]} ${rule.range}칸의 ${rule.weakest ? "내구도가 낮은 " : ""}일반 적 최대 ${rule.maxTargets}기에게 ${rule.damage || 1}피해${rule.cooldown ? ` · 재사용 ${rule.cooldown}적 턴` : ""}`);
    }
    if (rule.xpEvery) parts.push(`직접 처치 ${rule.xpEvery}회마다 XP +${rule.xp}`);
    if (rule.escape) parts.push(`직접 처치 후 비공격 이동을 1회 더 허용 · 전체 탈출 효과 공유 재사용 ${rule.escape}적 턴`);
    return parts.join(" / ");
  }
  const traits = DEFINITIONS.map(([id, icon, name, growth, base]) => {
    const rule = freezeRule(growth, base, 1, false, id);
    return Object.freeze({ id, icon, name, growth, base:Object.freeze({ ...base }), rule, desc:describe(rule) });
  });
  const byId = Object.freeze(Object.fromEntries(traits.map((trait) => [trait.id, trait])));
  function makeLevel(trait, level, mastered) {
    const mastery = MASTERIES[trait.id];
    const rule = freezeRule(trait.growth, trait.base, level, mastered, trait.id);
    return Object.freeze({
      id:trait.id, icon:trait.icon, name:mastered ? mastery.name : trait.name,
      masterName:mastery.name, mastered, level, rule,
      desc:mastered ? `MASTER · ${mastery.desc}${rule.directDamage ? " / 직접 공격 2피해 (보스는 1피해)" : ""} / ${describe(rule)}` : describe(rule),
    });
  }
  const levelCache = Object.freeze(Object.fromEntries(traits.map((trait) => [trait.id, Object.freeze(
    Array.from({ length:MAX_LEVEL }, (_, index) => Object.freeze([
      makeLevel(trait, index + 1, false), makeLevel(trait, index + 1, true),
    ]))
  )])));
  function atLevel(id, level = 1, mastered = false) {
    const trait = byId[id];
    if (!trait) throw new Error(`unknown trait id: ${id}`);
    const normalized = Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL ? level : 1;
    return levelCache[trait.id][normalized - 1][mastered ? 1 : 0];
  }
  function requireInventory(inventory) {
    if (!Array.isArray(inventory)) throw new TypeError("inventory must be an array of trait ids");
    if (new Set(inventory).size !== inventory.length) throw new Error("inventory cannot contain duplicate trait ids");
    for (const id of inventory) if (!byId[id]) throw new Error(`unknown trait id: ${id}`);
  }
  function checkMasteries(player) {
    const inventory = Array.isArray(player?.traits) ? player.traits : [];
    requireInventory(inventory);
    const levels = player.traitLevels || {};
    const xp = player.traitXp || {};
    const mastered = player.mastered || {};
    const unlocked = [];
    for (const id of inventory) {
      const mastery = MASTERIES[id];
      const earned = Number.isInteger(xp[id]) && xp[id] >= 0 ? xp[id] : 0;
      if (!mastery || mastered[id] || levelOf(id, levels) !== MAX_LEVEL || earned < mastery.requiredXp) continue;
      mastered[id] = true;
      unlocked.push(id);
    }
    if (unlocked.length && !player.mastered) player.mastered = mastered;
    return unlocked;
  }
  function creditMastery(player, credits) {
    const inventory = Array.isArray(player?.traits) ? player.traits : [];
    requireInventory(inventory);
    const owned = new Set(inventory);
    const valid = [];
    if (credits && typeof credits === "object" && !Array.isArray(credits)) {
      for (const [id, count] of Object.entries(credits)) {
        if (!owned.has(id) || !Number.isInteger(count) || count < 0) continue;
        if (count > 0) valid.push([id, count]);
      }
    }
    if (valid.length) {
      player.traitXp ||= {};
      for (const [id, count] of valid) player.traitXp[id] = (Number.isInteger(player.traitXp[id]) && player.traitXp[id] >= 0 ? player.traitXp[id] : 0) + count;
    }
    return checkMasteries(player);
  }
  function masteredOf(id, mastered) { return Boolean(mastered && mastered[id]); }
  function activeSynergies(inventory) {
    requireInventory(inventory);
    const owned = new Set(inventory);
    return SYNERGIES.filter((synergy) => synergy.recipe.every((id) => owned.has(id)));
  }
  function movement(inventory, levels = {}, mastered = {}) {
    requireInventory(inventory);
    const result = inventory.reduce((result, id) => {
      const rule = atLevel(id, levelOf(id, levels), masteredOf(id, mastered)).rule;
      return { stride:Math.max(result.stride, rule.stride || 0), royal:Math.max(result.royal, rule.royal || 0) };
    }, { stride:0, royal:0 });
    if (activeSynergies(inventory).some((synergy) => synergy.id === "royalVector")) result.stride = Math.min(4, result.stride + 1);
    return result;
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
  function targetsForRule(rule, context, dx, dy, used) {
    return context.enemies.filter((enemy) => !enemy.boss && !used.has(enemy) &&
      matches(rule.shape, enemy.x - context.to.x, enemy.y - context.to.y, dx, dy, rule.range) &&
      ((rule.shape === "fork" || rule.shape === "forkCross") ? !context.isWall?.(enemy.x, enemy.y) : clearLine(context.to, enemy, context.isWall)))
      .sort((a, b) => (rule.weakest ? (a.hp || 1) - (b.hp || 1) : 0) || Math.max(Math.abs(a.x - context.to.x), Math.abs(a.y - context.to.y)) - Math.max(Math.abs(b.x - context.to.x), Math.abs(b.y - context.to.y)) || a.x - b.x || a.y - b.y)
      .slice(0, rule.maxTargets);
  }
  function canTrigger(rule, context, memory, cooldownId, distance) {
    return rule.shape && (memory.cooldowns[cooldownId] || 0) <= context.wave &&
      distance >= (rule.minDistance || 0) && distance <= (rule.maxDistance || Infinity) && context.chain >= (rule.minChain || 0);
  }
  function resolve(inventory, context, memory, levels = {}, mastered = {}) {
    requireInventory(inventory);
    const result = { targets:[], xp:0, fx:[], activated:[] };
    if (!context.directKill) return result;
    memory.cooldowns ||= {};
    const dx = Math.sign(context.to.x - context.from.x), dy = Math.sign(context.to.y - context.from.y);
    const distance = Math.max(Math.abs(context.to.x - context.from.x), Math.abs(context.to.y - context.from.y));
    const used = new Set();
    for (const id of inventory) {
      const isMastered = masteredOf(id, mastered);
      const rule = atLevel(id, levelOf(id, levels), isMastered).rule;
      if (rule.escape) memory.escapeReady = true;
      if (rule.xpEvery && context.directKills % rule.xpEvery === 0) { result.xp = Math.max(result.xp, rule.xp); result.activated.push(id); }
      if (!canTrigger(rule, context, memory, id, distance)) continue;
      const targets = targetsForRule(rule, context, dx, dy, used);
      if (!targets.length) continue;
      targets.forEach((enemy) => used.add(enemy));
      result.targets.push(...targets);
      result.fx.push({ id, type:rule.fx, targets, damage:rule.damage || 1, ...(isMastered ? { style:"master" } : {}) });
      result.activated.push(id);
      memory.cooldowns[id] = context.wave + (rule.cooldown || 0);
    }
    for (const synergy of activeSynergies(inventory)) {
      if (!synergy.rule || !canTrigger(synergy.rule, context, memory, "synergy:" + synergy.id, distance)) continue;
      const targets = targetsForRule(synergy.rule, context, dx, dy, used);
      if (!targets.length) continue;
      targets.forEach((enemy) => used.add(enemy));
      result.targets.push(...targets);
      result.fx.push({ id:synergy.recipe[0], type:synergy.fx, targets, damage:1, style:"synergy", synergy:synergy.id });
      result.activated.push(synergy.recipe[0]);
      memory.cooldowns["synergy:" + synergy.id] = context.wave + (synergy.rule.cooldown || 0);
    }
    result.activated = [...new Set(result.activated)];
    return result;
  }
  function escape(inventory, wave, memory, levels = {}, mastered = {}) {
    requireInventory(inventory);
    const cooldowns = inventory.map((id) => atLevel(id, levelOf(id, levels), masteredOf(id, mastered)).rule.escape).filter(Boolean);
    if (!cooldowns.length || !memory.escapeReady || (memory.nextEscapeWave || 0) > wave) return false;
    memory.escapeReady = false;
    memory.nextEscapeWave = wave + Math.min(...cooldowns);
    return true;
  }
  function shuffled(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }
  function offer(rank = 0, random = Math.random, inventory = [], levels = {}, previous = []) {
    requireInventory(inventory);
    const owned = new Set(inventory);
    const pool = inventory.length < SLOT_LIMIT ? traits.filter((trait) => !owned.has(trait.id)).map((trait) => atLevel(trait.id, 1)) : inventory.filter((id) => levelOf(id, levels) < MAX_LEVEL).map((id) => atLevel(id, levelOf(id, levels) + 1));
    if (!pool.length) return [];
    const prior = new Set(previous.map((candidate) => typeof candidate === "string" ? candidate : candidate.id));
    const fresh = shuffled(pool.filter((trait) => !prior.has(trait.id)), random);
    const repeated = shuffled(pool.filter((trait) => prior.has(trait.id)), random);
    return [...fresh, ...repeated].slice(0, Math.min(3, pool.length));
  }
  return Object.freeze({ SLOT_LIMIT, MAX_LEVEL, MASTERIES, SYNERGIES, traits:Object.freeze(traits), byId, atLevel, checkMasteries, creditMastery, activeSynergies, movement, resolve, escape, offer, RULE_VERSION:"v0.14.0" });
});
