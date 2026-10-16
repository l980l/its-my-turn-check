const assert = require('node:assert/strict');
const {createGameHarness} = require('./game-harness.cjs');
const TraitSystem = require('../traits.js');
const h = createGameHarness();
const {game} = h;
const {S} = game;
function setup(ids, enemies, from={x:0,y:0}, piece='queen') {
  h.reset();
  Object.assign(S.player, from, {piece, traits:ids, rank:50});
  S.enemies=enemies.map(e=>({type:'pawn', hp:1, maxHp:1, ...e}));
  game.moves();
}

// No starting a free attack chain by landing on an empty square.
for (const trait of TraitSystem.traits) {
  setup([trait.id], [{x:2,y:1}]);
  game.playerMove({x:1,y:0});
  assert.equal(S.kills, 0, trait.id+' cannot attack without a direct kill');
  assert.equal(S.phase, 'enemy', trait.id+' cannot earn escape without a prior direct kill');
  setup([trait.id], [{x:1,y:0,hp:7,maxHp:7}, {x:2,y:1}]);
  game.playerMove({x:1,y:0});
  assert.equal(S.player.xp, 0, trait.id+' cannot farm durable targets for trait XP');
  assert.equal(S.enemies[0].hp, 6);
  assert.equal(S.enemies[1].hp, 1);
  assert.equal(S.phase, 'player', 'direct durability hits still keep the player turn');
}

setup(['kineticCrown'], [{x:1,y:0}, {x:2,y:1}, {x:0,y:1}, {x:2,y:0}]);
game.playerMove({x:1,y:0});
assert.equal(S.kills, 3, 'tier-II crown hits two diagonals after direct capture');
assert.equal(S.enemies[0].x, 2);
assert.equal(S.enemies[0].y, 0, 'orthogonal old shockwave is not inherited');

setup(['diagonalBurst'], [{x:1,y:0}, {x:2,y:1}, {x:4,y:3}]);
game.playerMove({x:1,y:0});
assert.equal(S.kills, 2);
assert.equal(S.enemies[0].x, 4, 'tier-I diagonal cannot reach a distant enemy');

setup(['prismaticEmperor'], [{x:2,y:0}, {x:3,y:1}, {x:4,y:2}]);
S.terrain=[{type:'wall',x:3,y:1}];
game.playerMove({x:2,y:0});
assert.equal(S.kills, 1, 'wall blocks higher-tier diagonal collateral');

setup(['echoMonarch'], [{x:1,y:0}, {x:2,y:0,boss:true,bossPhase:'vulnerable',bossXp:5,bossScore:5000}]);
game.playerMove({x:1,y:0});
assert.equal(S.enemies[0].hp, 1, 'even vulnerable bosses require direct attacks');

setup(['thunderRegent','echoMonarch'], [{x:1,y:0}, {x:2,y:0,hp:7,maxHp:7}]);
game.playerMove({x:1,y:0});
assert.equal(S.enemies[0].hp, 6, 'one collateral victim cannot be hit twice by different traits in one move');

setup(['chainSpark'], [{x:1,y:0}]);
S.player.directKills=3;
game.playerMove({x:1,y:0});
assert.equal(S.player.xp, 2, 'fourth direct capture gives ordinary kill XP plus one bonus XP');

setup(['slipstream'], [{x:1,y:0}]);
game.playerMove({x:1,y:0});
game.playerMove({x:2,y:0});
assert.equal(S.phase, 'player', 'one escape can be earned by a direct capture');
game.playerMove({x:3,y:0});
assert.equal(S.phase, 'enemy', 'escape cannot loop in the same enemy turn');

setup(['royalVector'], [], {x:0,y:0}, 'bishop');
assert.ok(S.moves.some(m=>m.x===1&&m.y===0));
assert.ok(S.moves.some(m=>m.x===4&&m.y===4));
assert.ok(!S.moves.some(m=>m.x===2&&m.y===0), 'royal vector does not inherit old two-square royal step');
console.log('trait combat integration tests passed: all 28 traits, XP exploit, direct-hit retention, geometry, wall/boss gating, shared damage, escape and mobility');
