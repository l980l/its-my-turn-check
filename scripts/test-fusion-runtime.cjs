// Exercise the actual game closure with an in-memory DOM; no test hooks ship to players.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const TraitSystem = require('../traits.js');
class Element {
  constructor() {
    this.children = []; this.style = {setProperty() {}}; this.dataset = {}; this.value = '0';
    this.classList = {add() {}, remove() {}, toggle() {}, contains() {return false;}};
    this.handlers = {};
  }
  append(...children) {this.children.push(...children);}
  appendChild(child) {this.append(child); return child;}
  replaceChildren(...children) {this.children = children;}
  get lastChild() {return this.children.at(-1);}
  set innerHTML(value) {this.html = value; this.children = [new Element(), new Element()];}
  set textContent(value) {this.text = value; this.children = [];}
  get textContent() {return this.text;}
  addEventListener(event, handler) {this.handlers[event] = handler;}
  setAttribute() {}
  querySelector() {return new Element();}
  getBoundingClientRect() {return {width:390, height:844, left:0, top:0};}
  getContext() {return new Proxy({}, {get:() => () => {}});}
}
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, new Element());
  return elements.get(id);
};
let now = 1000;
let seed = 20261015;
const seededMath = Object.create(Math);
seededMath.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const context = {
  TraitSystem, console, Math:seededMath, performance:{now:() => now},
  document: {querySelector:element, querySelectorAll:() => [], createElement:() => new Element(), documentElement:new Element(), addEventListener() {}},
  localStorage:{getItem:() => null, setItem() {}}, sessionStorage:{getItem:() => null},
  window:{}, devicePixelRatio:1, screen:{width:390}, matchMedia:() => ({matches:true}),
  addEventListener() {}, requestAnimationFrame() {}, setTimeout:() => 0, clearTimeout() {}, Image:class {},
};
vm.createContext(context);
let source = fs.readFileSync(require.resolve('../game.js'), 'utf8');
source = source.replace('  reset();\n  requestAnimationFrame(tick);', '  reset();\n  globalThis.gameTest = {S, ui, reset, damageEnemies, playerMove, tick, openFusionKit, closeFusion, dropFusionKit, spawnFieldItem, enemyBeat, chooseUpgrade, renderFusion, renderTraitCodex, drawFusionDirection};\n  requestAnimationFrame(tick);');
vm.runInContext(source, context);
const game = context.gameTest;
assert.ok(game, 'real game initialized');
const {S, ui} = game;
function reset() {game.reset(); S.running = true; S.phase = 'player'; S.enemies = []; now += 1000;}

reset();
S.enemies = [{boss:true, bossPhase:'vulnerable', hp:1, bossXp:5, bossScore:5000, x:0, y:0}];
game.damageEnemies(S.enemies, 1, new Set());
assert.equal(S.items.length, 1);
let kit = S.items[0];
assert.equal(kit.type, 'fusion');
assert.notEqual(kit.x + ',' + kit.y, '0,0', 'boss loot cannot instantly collect at player');
assert.equal(S.pendingKit, null);
S.enemies = [];
S.player.xp = 0;
game.playerMove({x:kit.x, y:kit.y});
assert.equal(S.phase, 'player', 'kit pickup preserves the player turn');
game.tick(now);
assert.equal(S.phase, 'fusion');
const waveBefore = S.wave;
now += 10000; game.tick(now);
assert.equal(S.wave, waveBefore, 'fusion modal pauses enemy turns');
game.closeFusion();
assert.ok(S.items.includes(kit), 'unused kit remains');
assert.equal(S.phase, 'player');

S.player.traits = ['shockwave', 'diagonalBurst', 'longStride', 'royalStep'];
S.pendingKit = kit; game.openFusionKit(); now += 1000;
ui.fusionRecipes.children[0].handlers.click();
assert.ok(S.player.traits.includes('kineticCrown'));
assert.equal(S.player.traits.length, 3);
now += 1000;
ui.fusionRecipes.children[0].handlers.click();
now += 1000;
ui.fusionRecipes.children[0].handlers.click();
assert.deepEqual([...S.player.traits], ['prismaticImpact'], 'one workshop supports sequential tier upgrades');
game.closeFusion();
assert.ok(!S.items.includes(kit), 'used kit consumed once on close');

reset();
S.items = [{type:'fusion', x:100, y:100, life:Infinity}];
for (let i=0; i<16; i++) {S.enemies=[]; game.enemyBeat();}
assert.ok(S.items.some(item => item.type === 'fusion'), 'kits persist beyond normal item lifetime');
game.drawFusionDirection();

reset();
S.player.traits = TraitSystem.traits.filter(t => t.tier === 4).map(t => t.id);
S.upgradeMode='trait'; S.upgradeOptions=[TraitSystem.byId.shockwave]; S.upgradeContinueTurn=true;
game.chooseUpgrade(0);
assert.equal(S.player.traits.length, 6);
assert.deepEqual([...S.player.materials], ['shockwave'], 'overflow goes into inactive material bag');
assert.equal(S.phase, 'player');
S.player.materials=Array(8).fill('shockwave');
S.upgradeOptions=[TraitSystem.byId.diagonalBurst]; S.upgradeMode='trait'; S.upgradeContinueTurn=true;
game.chooseUpgrade(0);
assert.equal(S.phase, 'fusion', 'full equipment and bag opens replacement');
now+=1000;
ui.fusionInventory.children[0].handlers.click();
assert.equal(S.player.traits[0], 'diagonalBurst');
assert.equal(S.phase, 'player', 'replacement preserves continuation after capture');
assert.equal(S.player.materials.length, 8);

reset();
S.player.traits=['royalStep'];
S.player.materials=['longStride'];
game.dropFusionKit({x:2,y:0});
S.pendingKit=S.items[0]; game.openFusionKit(); now+=1000;
ui.fusionRecipes.children[0].handlers.click();
assert.deepEqual([...S.player.traits], ['royalVector'], 'fusion consumes from equipped and inactive bag');
assert.equal(S.player.materials.length, 0);
game.closeFusion();

reset();
game.dropFusionKit({x:1,y:0});
kit=S.items[0];
S.player.xp=3;
game.playerMove({x:kit.x,y:kit.y});
assert.equal(S.phase, 'upgrade', 'level-up takes precedence over pending workshop');
assert.equal(S.pendingKit, kit);
game.chooseUpgrade(0);
assert.equal(S.phase, 'player');
now+=1000; game.tick(now);
assert.equal(S.phase, 'fusion', 'pending workshop opens after level-up without an enemy turn');
game.closeFusion();

// Build six distinct tier-IV traits while retaining previous completed traits.
// Material bag is essential: the sixth final recipe needs room for its ingredients.
reset();
function acquire(id) {
  if (S.player.traits.length<6) S.player.traits.push(id);
  else {assert.ok(S.player.materials.length<8); S.player.materials.push(id);}
}
function craft(id) {
  const trait=TraitSystem.byId[id];
  if (!trait.recipe) {acquire(id); return;}
  trait.recipe.forEach(craft);
  game.dropFusionKit({x:S.player.x+2,y:S.player.y});
  S.pendingKit=S.items.at(-1); game.openFusionKit(); now+=1000;
  const recipes=TraitSystem.availableRecipes([...S.player.traits,...S.player.materials]);
  ui.fusionRecipes.children[recipes.findIndex(t=>t.id===id)].handlers.click();
  game.closeFusion();
  assert.ok(S.player.traits.length<=6 && S.player.materials.length<=8);
}
TraitSystem.traits.filter(t=>t.tier===4).forEach(t=>craft(t.id));
assert.equal(S.player.traits.length, 6);
assert.ok(S.player.traits.every(id=>TraitSystem.byId[id].tier===4));
assert.equal(S.player.materials.length, 0);
console.log('fusion runtime tests passed: drops, persistence, pause, chained recipes, bag, replacement, six distinct tier-IV build');
