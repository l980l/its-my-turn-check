"use strict";
// Six distinct fixed boards, not an estimate of live player survival or fun.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createGameHarness} = require('./game-harness.cjs');
const root = path.resolve(__dirname, '..');
const seed = 20261017;
const cases = [];
for (const type of ['rook', 'bishop', 'queen']) {
  for (const hp of [1, 3]) {
    const h = createGameHarness({seed});
    const S = h.reset();
    Object.assign(S.player, {piece:'knight',rank:20,traits:[]});
    S.autoPlay = true;
    S.enemies = [{type,x:1,y:2,hp,maxHp:hp,face:{x:0,y:1}}];
    h.game.moves();
    assert.ok(S.moves.some(m=>m.x===1 && m.y===2), 'target is legally reachable');
    h.game.autoMove();
    cases.push({type,hp,attacked:S.player.x===1 && S.player.y===2,
      remaining:S.enemies.length,phase:S.phase});
  }
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
console.log(JSON.stringify({
  profile:'knight-auto-accumulation-v1',seed,
  runtime:{game:hash('game.js'),traits:hash('traits.js'),
    dirty:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim().length>0},
  metric:'attacked legally reachable target / three distinct boards per durability group',
  hp1Attacks:cases.filter(c=>c.hp===1 && c.attacked).length,
  hp3Attacks:cases.filter(c=>c.hp===3 && c.attacked).length,
  denominatorPerGroup:3,cases,
  limit:'Single-move diagnostic, not full-run density or survival measurement. Seed variants are not counted as independent boards.'
},null,2));
