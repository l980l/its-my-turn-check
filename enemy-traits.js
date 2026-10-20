(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EnemyTraits = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const definitions = Object.freeze({
    guardian: Object.freeze({ id:"guardian", name:"수호", desc:"인접 적을 특성 공격에서 보호합니다. 직접 공격은 가능합니다. 수호자·보스는 제외합니다.", color:"#55e6e0", icon:"⬡" }),
    ember: Object.freeze({ id:"ember", name:"잔불", desc:"처치한 칸에 다음 적 턴 폭발을 남깁니다.", color:"#ff9f43", icon:"✦" }),
    healer: Object.freeze({ id:"healer", name:"치유", desc:"적 턴마다 주변 2칸의 다른 일반 적 하나를 내구도 1만큼 회복합니다.", color:"#6ee787", icon:"✚" }),
    split: Object.freeze({ id:"split", name:"분열", desc:"처치되면 최대 두 번까지 폰으로 분열합니다.", color:"#c084fc", icon:"✢" }),
  });
  const ids = Object.freeze(Object.keys(definitions));
  const idSet = new Set(ids);
  const SPAWN_ANCHORS = Object.freeze([
    Object.freeze([0, 0]), Object.freeze([60, 0]), Object.freeze([120, 0.06]),
    Object.freeze([300, 0.10]), Object.freeze([600, 0.16]),
    Object.freeze([1200, 0.28]), Object.freeze([1800, 0.40]),
  ]);
  // Conditional distribution among trait-bearing enemies, not all new enemies.
  const COUNT_ANCHORS = Object.freeze([
    Object.freeze([1800, Object.freeze([0.95, 0.05, 0, 0])]),
    Object.freeze([2400, Object.freeze([0.80, 0.20, 0, 0])]),
    Object.freeze([2700, Object.freeze([0.65, 0.30, 0.05, 0])]),
    Object.freeze([3600, Object.freeze([0.30, 0.40, 0.25, 0.05])]),
    Object.freeze([4500, Object.freeze([0.15, 0.40, 0.30, 0.15])]),
  ]);
  const OFFSETS = Object.freeze([
    Object.freeze({ x:0, y:-1 }), Object.freeze({ x:1, y:0 }), Object.freeze({ x:0, y:1 }), Object.freeze({ x:-1, y:0 }),
    Object.freeze({ x:1, y:-1 }), Object.freeze({ x:1, y:1 }), Object.freeze({ x:-1, y:1 }), Object.freeze({ x:-1, y:-1 }),
  ]);

  function secondsOf(value) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  }
  function lerp(from, to, ratio) { return from + (to - from) * ratio; }

  // Real active play seconds, never wave count. The final anchor remains capped.
  function spawnChance(elapsedPlaySeconds, contract = false) {
    const seconds = secondsOf(elapsedPlaySeconds);
    let normal = SPAWN_ANCHORS[SPAWN_ANCHORS.length - 1][1];
    for (let index = 1; index < SPAWN_ANCHORS.length; index += 1) {
      const [endSeconds, endChance] = SPAWN_ANCHORS[index];
      if (seconds > endSeconds) continue;
      const [startSeconds, startChance] = SPAWN_ANCHORS[index - 1];
      normal = lerp(startChance, endChance, (seconds - startSeconds) / (endSeconds - startSeconds));
      break;
    }
    normal = Math.min(0.40, Math.max(0, normal));
    return contract ? Math.min(0.80, normal * 2) : normal;
  }

  function traitCountWeights(elapsedPlaySeconds) {
    const seconds = secondsOf(elapsedPlaySeconds);
    if (seconds < COUNT_ANCHORS[0][0]) return [1, 0, 0, 0];
    for (let index = 1; index < COUNT_ANCHORS.length; index++) {
      const [end, weights] = COUNT_ANCHORS[index];
      if (seconds > end) continue;
      const [start, previous] = COUNT_ANCHORS[index - 1];
      return weights.map((weight, i) => lerp(previous[i], weight, (seconds - start) / (end - start)));
    }
    return COUNT_ANCHORS[COUNT_ANCHORS.length - 1][1].slice();
  }

  function randomValue(random) {
    const value = Number(typeof random === "function" ? random() : Math.random());
    return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
  }
  function chooseUnique(available, random) { return available.splice(Math.floor(randomValue(random) * available.length), 1)[0]; }

  // Roll the count once, then select that many distinct traits without replacement.
  function rollTraits(elapsedPlaySeconds, contract = false, random = Math.random) {
    const seconds = secondsOf(elapsedPlaySeconds);
    if (randomValue(random) >= spawnChance(seconds, contract)) return [];
    const weights = traitCountWeights(seconds);
    const draw = randomValue(random);
    let count = 4, cumulative = 0;
    for (let index = 0; index < weights.length; index++) {
      cumulative += weights[index];
      if (draw < cumulative) { count = index + 1; break; }
    }
    const available = ids.slice();
    const selected = Array.from({length: count}, () => chooseUnique(available, random));
    return selected;
  }
  function roll(elapsedPlaySeconds, contract = false, random = Math.random) { return rollTraits(elapsedPlaySeconds, contract, random)[0] || null; }

  function traitsOf(enemy) {
    if (!enemy) return [];
    const rawTraits = Array.isArray(enemy.enemyTraits) ? enemy.enemyTraits : [enemy.trait];
    const unique = [];
    for (const id of rawTraits) if (typeof id === "string" && idSet.has(id) && !unique.includes(id)) unique.push(id);
    return unique;
  }
  function has(enemy, id) { return idSet.has(id) && traitsOf(enemy).includes(id); }
  function distance(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

  function isProtected(enemy, enemies = []) {
    if (!enemy || enemy.boss || has(enemy, "guardian")) return false;
    return enemies.some((candidate) => candidate && candidate !== enemy && !candidate.boss && has(candidate, "guardian") && distance(enemy, candidate) <= 1 && (candidate.x !== enemy.x || candidate.y !== enemy.y));
  }
  function protectedEnemies(enemies = []) {
    const byPosition = new Map();
    for (const enemy of enemies) {
      if (!enemy || enemy.boss || has(enemy, "guardian")) continue;
      const key = `${enemy.x},${enemy.y}`;
      const entries = byPosition.get(key);
      if (entries) entries.push(enemy); else byPosition.set(key, [enemy]);
    }
    const protectedSet = new Set();
    for (const guardian of enemies) {
      if (!guardian || guardian.boss || !has(guardian, "guardian")) continue;
      for (const offset of OFFSETS) {
        const entries = byPosition.get(`${guardian.x + offset.x},${guardian.y + offset.y}`);
        if (entries) entries.forEach((enemy) => protectedSet.add(enemy));
      }
    }
    return protectedSet;
  }
  function healthOf(enemy) {
    const hp = Number(enemy && enemy.hp), maxHp = Number(enemy && enemy.maxHp);
    return { hp:Number.isFinite(hp) ? hp : 1, maxHp:Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 1 };
  }
  function heal(enemies = []) {
    const healed = new Set(), results = [];
    const healers = enemies.filter((enemy) => enemy && !enemy.boss && has(enemy, "healer"));
    for (const healer of healers) {
      const targets = enemies.filter((target) => target && target !== healer && !target.boss && !healed.has(target) && distance(healer, target) <= 2)
        .filter((target) => { const { hp, maxHp } = healthOf(target); return hp < maxHp; })
        .sort((a, b) => {
          const dist = distance(healer, a) - distance(healer, b); if (dist) return dist;
          const aHealth = healthOf(a), bHealth = healthOf(b);
          const missing = (bHealth.maxHp - bHealth.hp) - (aHealth.maxHp - aHealth.hp); if (missing) return missing;
          return a.y - b.y || a.x - b.x;
        });
      const target = targets[0];
      if (!target) continue;
      healed.add(target); results.push(Object.freeze({ healer, target, amount:1 }));
    }
    return results;
  }
  function splitChildren(enemy, enemies = [], isBlocked = () => false) {
    if (!enemy || !has(enemy, "split")) return [];
    const remaining = Number.isInteger(enemy.splitsLeft) ? enemy.splitsLeft : 2;
    if (remaining <= 0) return [];
    const occupied = new Set(enemies.filter((other) => other && other !== enemy).map((other) => `${other.x},${other.y}`));
    const childSplits = remaining - 1, childTraits = childSplits > 0 ? ["split"] : [], children = [];
    for (const offset of OFFSETS) {
      if (children.length >= 2) break;
      const x = enemy.x + offset.x, y = enemy.y + offset.y;
      if (occupied.has(`${x},${y}`) || isBlocked(x, y)) continue;
      children.push(Object.freeze({ x, y, type:"pawn", hp:1, maxHp:1, enemyTraits:childTraits.slice(), trait:childTraits[0] || null, splitsLeft:childSplits, face:enemy.face ? { ...enemy.face } : null, risk:Boolean(enemy.risk) }));
    }
    return children;
  }

  return Object.freeze({ definitions, ids, OFFSETS, spawnChance, traitCountWeights, rollTraits, roll, traitsOf, has, isProtected, protectedEnemies, heal, splitChildren });
});
