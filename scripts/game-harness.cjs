"use strict";

// VM-only game harness. The hook injection happens in memory and is never
// written back to game.js or included in the web build.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor() {
    this.children = [];
    this.style = { setProperty() {} };
    this.dataset = {};
    this.value = "0";
    this.checked = false;
    this.disabled = false;
    this.handlers = {};
    this.classList = { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = children; }
  get lastChild() { return this.children.at(-1); }
  set innerHTML(value) { this.html = value; this.children = [new Element(), new Element(), new Element()]; }
  get innerHTML() { return this.html || ""; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || ""; }
  addEventListener(event, handler) { this.handlers[event] = handler; }
  setAttribute(name, value) { (this.attributes ||= {})[name] = value; }
  querySelector(selector) {
    this.queries ||= new Map();
    if (!this.queries.has(selector)) this.queries.set(selector, new Element());
    return this.queries.get(selector);
  }
  querySelectorAll() { return []; }
  focus() {}
  select() {}
  getBoundingClientRect() { return { width: 1280, height: 720, left: 0, top: 0 }; }
  getContext() { return new Proxy({}, { get: () => () => {} }); }
}

function seededRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  next.reset = (nextSeed) => { state = nextSeed >>> 0; };
  next.state = () => state;
  return next;
}

function createGameHarness(options = {}) {
  const gamePath = path.resolve(options.gamePath || path.join(__dirname, "..", "game.js"));
  const traitPath = path.resolve(options.traitPath || path.join(__dirname, "..", "traits.js"));
  const TraitSystem = options.TraitSystem || require(traitPath);
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const choiceSelectors = new Set([".upgrade-choice", ".upgrade-option", ".upgrade-info"]);
  const queryAll = (selector) => options.withHeldUi && selector === ".held-trait-slot"
    ? Array.from({length:6}, (_, index) => {
      const item = element(selector + index);
      item.dataset.slot = String(index);
      return item;
    }) : options.withUpgradeUi && choiceSelectors.has(selector)
    ? Array.from({length:3}, (_, index) => {
      const item = element(selector + index);
      item.dataset.choice = String(index);
      return item;
    }) : [];
  let now = 1000;
  const random = seededRandom(options.seed ?? 20261016);
  const seededMath = Object.create(Math);
  seededMath.random = random;
  const context = {
    TraitSystem,
    console,
    Math: seededMath,
    performance: { now: () => now },
    document: {
      querySelector: element,
      querySelectorAll: queryAll,
      createElement: () => new Element(),
      documentElement: new Element(),
      addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    window: {},
    devicePixelRatio: 1,
    screen: { width: 1280 },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    requestAnimationFrame() {},
    setTimeout: () => 0,
    clearTimeout() {},
    Image: class {},
  };
  vm.createContext(context);
  let source = fs.readFileSync(gamePath, "utf8");
  const boot = "  reset();\n  requestAnimationFrame(tick);";
  const hook = [
    "  reset();",
    "  globalThis.__gameHarness = { S, ui, reset, damageEnemies, playerMove, moves, dirs, enemyBeat, beginPlayerTurn, tick, spawn, spawnBoss, openUpgrade, chooseUpgrade, gainXp, boss, terrainAt, wormholeExit };",
    "  requestAnimationFrame(tick);",
  ].join("\n");
  if (!source.includes(boot)) throw new Error(`game bootstrap marker changed in ${gamePath}`);
  source = source.replace(boot, hook);
  vm.runInContext(source, context, { filename: gamePath });
  const game = context.__gameHarness;
  if (!game) throw new Error("game harness hook was not installed");
  return {
    game,
    context,
    elements,
    random,
    now: () => now,
    advance(ms) { now += ms; return now; },
    reset({ running = true, phase = "player" } = {}) {
      game.reset();
      game.S.running = running;
      game.S.phase = phase;
      game.S.enemies = [];
      now += 1000;
      return game.S;
    },
  };
}

module.exports = { Element, seededRandom, createGameHarness };
