"use strict";
const assert=require("node:assert/strict");
const Session=require("../coop-session.js");
const {createGameHarness}=require("./game-harness.cjs");
{
  const camera=Session.createCamera(1),players=[{alive:true},{alive:true}];
  const flow=(phase,eligible=[],actor=null)=>({phase,eligible,actor});
  assert.equal(camera.update(flow("planning",[0,1]),players).focus,1);
  assert.ok(camera.toggle(players),"can inspect ally while choosing own move");
  assert.equal(camera.update(flow("planning",[0,1]),players).focus,0,"manual view survives own selection updates");
  assert.ok(camera.toggle(players));
  assert.equal(camera.update(flow("planning",[0,1]),players).focus,1);
  camera.reset();
  assert.equal(camera.update(flow("acting",[],0),players).focus,0);
  camera.update(flow("acting",[],1),players);
  assert.equal(camera.update(flow("planning",[0]),players).focus,0,"spectator follows ally during repeated selection");
  assert.ok(camera.toggle(players));assert.equal(camera.update(flow("acting",[],0),players).focus,1,"manual own view survives ally action");
  camera.update(flow("planning",[0]),players);assert.ok(camera.toggle(players));
  assert.equal(camera.update(flow("planning",[0]),players).focus,0,"manual ally view survives updates");
  assert.equal(camera.update(flow("planning",[0,1]),players).focus,1,"new own opportunity automatically returns to own piece");
  camera.update(flow("acting",[],0),players);camera.toggle(players);
  camera.update(flow("planning",[0,1]),players);
  assert.equal(camera.update(flow("acting",[],0),players).focus,0,"automatic following restored after own opportunity");
  players[0].alive=false;assert.equal(camera.update(flow("enemy"),players).focus,1);
  assert.equal(camera.toggle(players),false,"dead ally cannot be a camera destination");
  camera.reset();assert.equal(camera.update(flow("planning",[1]),players).focus,1);
}
{
  for(const phase of ["planning","enemy","acting","upgrade","risk"]){
    const camera=Session.createCamera(0),players=[{alive:true},{alive:true}];
    assert.equal(camera.update({phase,eligible:[0,1],actor:phase==="acting"?1:null},players).canToggle,true,phase+" permits camera control");
    assert.ok(camera.toggle(players));
  }
}
function setup(){
  const h=createGameHarness({coop:true,withUpgradeUi:true,withHeldUi:true,seed:20261023});
  const e=h.context.window.CoopGame;e.start();
  const S=h.game.S;S.enemies=[];S.items=[];S.terrain=[];S.wave=1;
  e.roster[0].x=0;e.roster[0].y=0;e.roster[1].x=4;e.roster[1].y=0;
  e.roster.forEach(p=>p.rank=10); // combat probes must not open a level-up panel
  return {h,e,S};
}
const pawn=(x,y,hp=1)=>({x,y,type:"pawn",face:{x:0,y:1},hp,maxHp:hp,enemyTraits:[]});
{
  const {e}=setup();let input;
  e.present({view:0,focus:1,interactive:true});e.onInput=event=>{input=event;};
  const move=e.moves(0)[0];e.request({type:"move",move});
  assert.equal(e.focus,1);assert.equal(input.slot,0,"viewing ally never transfers control to ally");
  assert.deepEqual(input.move,move);
}
{
  const {e}=setup();
  for(const slot of [0,1]){
    const move=e.auto(slot);
    assert.ok(move&&Number.isFinite(move.x)&&Number.isFinite(move.y),"original auto AI proposes a real destination");
    assert.ok(e.moves(slot).some(m=>m.x===move.x&&m.y===move.y));
  }
}
{
  const {e,S}=setup();
  S.enemies=[pawn(1,0,2)];
  let r=e.act(0,{x:1,y:0});assert.equal(r.retained,true);assert.equal(S.enemies[0].hp,1);
  assert.equal(e.roster[1].xp,0,"durable hit grants no ally XP");
  r=e.act(0,{x:0,y:0});assert.equal(r.retained,false);
  r=e.act(1,{x:3,y:0});assert.equal(r.retained,false);
  assert.equal(S.wave,1,"player actions do not secretly advance enemies");
}
{
  const {e,S}=setup();S.enemies=[pawn(1,0)];
  const r=e.act(0,{x:1,y:0});assert.equal(r.retained,true);assert.equal(S.kills,1);assert.equal(S.score,100);
  assert.equal(e.roster[0].xp,1);assert.equal(e.roster[1].xp,0);
  assert.equal(e.turns[0].chain,1);assert.equal(e.turns[1].chain,0,"chain context is per player");
  S.extendedMoves=1;e.turns[0].extendedMoves=1;
  assert.equal(e.act(0,{x:0,y:0}).retained,true,"original necklace extra action applies");
}
{
  const {h,e,S}=setup();e.roster[0].rank=0;S.enemies=[pawn(1,0),pawn(2,0),pawn(3,0)];
  e.act(0,{x:1,y:0});e.act(0,{x:2,y:0});let r=e.act(0,{x:3,y:0});
  assert.equal(r.pending,true);assert.equal(e.pending().slot,0);
  h.advance(700);r=e.choose(0,0,"upgrade");assert.equal(r.retained,true,"promotion retains attacking player's turn");
  assert.notEqual(e.roster[0].piece,"pawn");assert.equal(e.roster[1].piece,"pawn");
  assert.equal(S.wave,1);
}
{
  const {e,S}=setup();e.debug("trait","longStride",0);
  assert.ok(e.roster[0].traits.includes("longStride"));assert.equal(e.roster[1].traits.length,0);
  assert.ok(e.moves(0).length>8,"same trait system expands legal moves");
  S.terrain=[{type:"wall",x:1,y:0}];assert.ok(!e.moves(0).some(m=>m.x===1&&m.y===0));
  e.roster[1].x=0;e.roster[1].y=1;assert.ok(!e.moves(0).some(m=>m.x===0&&m.y===1),"ally cell blocks landing");
}
{
  const {e,S}=setup();S.enemies=[pawn(0,1)];S.grace=0;e.turns[0].grace=0;e.turns[1].grace=0;
  e.enemyTurn();assert.equal(e.roster[0].alive,false);assert.equal(e.roster[1].alive,true);
  assert.equal(S.enemies[0].x,0);assert.equal(S.enemies[0].y,0,"capturing enemy occupies victim's cell");
}
{
  // Listed far-first, the king would step into the rook's line; solo order moves the nearer rook first.
  const {h,e,S}=setup();e.roster[1].x=0;e.roster[1].y=-6;e.turns.forEach(t=>t.grace=0);S.grace=0;
  const piece=(x,y,type)=>({...pawn(x,y),type});S.enemies=[piece(-1,-4,"king"),piece(0,-4,"rook")];
  S.player=e.roster[1];assert.equal(h.game.projectedEnemyCapture(e.roster[1]),true,"solo prediction expects the rook capture");S.player=e.roster[0];
  e.enemyTurn();assert.equal(e.roster[1].alive,false,"co-op enemies move nearest-first like solo");assert.equal(e.roster[0].alive,true);
}
{
  // Reward revive: the survivor may trade a level-up reward for the fallen ally.
  const {h,e,S}=setup();S.enemies=[pawn(5,1)];e.roster[1].alive=false;e.roster[1].deathReason="PAWN에게 잡힘";e.turns[1].grace=0;
  const before={piece:e.roster[1].piece,rank:e.roster[1].rank};
  e.debug("xp",null,0);assert.equal(e.pending().slot,0);assert.equal(S.upgradeMode,"revive");
  assert.equal(S.upgradeOptions[0].kind,"revive");assert.match(h.elements.get("#upgradeTitle").textContent,/P2/);
  h.advance(700);const rank=e.roster[0].rank,r=e.choose(0,0,"upgrade");
  assert.equal(r.pending,false);assert.equal(e.roster[1].alive,true);assert.equal(e.roster[1].deathReason,undefined);
  assert.equal(Math.max(Math.abs(e.roster[1].x-e.roster[0].x),Math.abs(e.roster[1].y-e.roster[0].y)),1,"revived next to the survivor");
  assert.ok(!(e.roster[1].x===5&&e.roster[1].y===1),"never revived onto an enemy");
  assert.deepEqual({piece:e.roster[1].piece,rank:e.roster[1].rank},before,"revived ally keeps its piece and rank");
  assert.equal(e.turns[1].grace,2,"revived ally is briefly uncapturable");assert.equal(e.roster[0].rank,rank+1,"the level still counts");
  S.enemies=[pawn(e.roster[1].x,e.roster[1].y+1)];e.turns[0].grace=5;e.enemyTurn();assert.equal(e.roster[1].alive,true,"grace protects right after revive");
}
{
  const {h,e,S}=setup();S.enemies=[];e.roster[1].alive=false;e.debug("xp",null,0);
  const held=S.upgradeHeld.mode;h.advance(700);e.choose(0,1,"upgrade");
  assert.equal(S.upgradeMode,held,"declining shows the original reward");assert.equal(e.roster[1].alive,false);
  assert.equal(e.pending().slot,0,"the reward is still pending");
}
{
  const {e,S}=setup();S.enemies=[];e.roster[1].alive=false;e.roster[0].rank=0;e.debug("xp",null,0);
  assert.equal(S.upgradeMode,"piece","the first promotion is never traded for a revive");
}
{
  const {e,S}=setup();S.enemies=[];e.roster[1].alive=false;e.roster[0].rank=10;
  e.roster.forEach(p=>p.alive=true);e.debug("xp",null,0);assert.notEqual(S.upgradeMode,"revive","no revive offer while both live");
}
{
  const {e,S}=setup();S.enemies=[];e.balance.spawnScale=1.5;S.wave=0;let spawned=0;
  for(let i=0;i<4;i++){const before=S.enemies.length;e.enemyTurn();spawned+=S.enemies.length-before;}
  assert.ok(spawned>=6&&spawned<=7,"x1.5 over waves 1-4 (base 1+1+1+2) attempts 7 spawns; a blocked cell may drop one");assert.equal(S.coopSpawnCarry,.5);
}
{
  const {e,S}=setup();S.wave=11;e.enemyTurn();assert.equal(S.wave,12);assert.ok(S.terrain.some(t=>t.type==="wall"));
  e.debug("boss","rook",1);assert.ok(S.enemies.some(e=>e.boss));
  const snapshot=e.snapshot();const other=setup();other.e.apply(snapshot);other.e.present({view:1});
  assert.equal(other.e.players()[0].x,e.players()[0].x);assert.equal(other.h.game.S.player,other.e.players()[1]);
}
// Pure ordering/clock tests: one player selects at a time, kill chains keep the
// turn, the lead alternates per wave, and monsters wait for both turns.
{
  let time=0,enemySteps=0;const actions=[],players=[{alive:true},{alive:true}];let results=[true,false,false];
  const engine={start(){},players:()=>players,enemyTurn(){enemySteps++;},pending:()=>null,moves:()=>[{x:1,y:0},{x:2,y:0}],act(i,m){actions.push(i);return {retained:results.shift(),pending:false};},choose(){return {retained:true,pending:false};},debug(){}};
  const s=Session.create(engine,()=>{},()=>time);s.start();assert.equal(enemySteps,1);
  const step=()=>{time=s.flow().deadline;s.update();};
  assert.deepEqual(s.flow().eligible,[0],"P1 leads the first wave");
  const id=s.flow().roundId;assert.equal(s.move(1,{x:2,y:0},id),false,"P2 cannot select during P1's turn");
  time=500;assert.ok(s.move(0,{x:1,y:0},id));assert.equal(s.flow().deadline,500,"a submitted move resolves without waiting out the window");
  s.update();assert.equal(s.flow().phase,"acting");assert.equal(s.flow().actor,0);
  step();assert.deepEqual(actions,[0]);step();
  assert.deepEqual(s.flow().eligible,[0],"a kill keeps P1's turn before P2 moves");assert.equal(enemySteps,1);
  assert.equal(s.move(0,{x:1,y:0},id),false,"old-round packet is rejected");
  s.move(0,{x:2,y:0},s.flow().roundId);step();step();step();
  assert.deepEqual(actions,[0,0]);assert.deepEqual(s.flow().eligible,[1],"P2's turn starts after P1's chain ends");
  step();assert.equal(s.flow().phase,"enemy","an unanswered window passes the turn");assert.deepEqual(actions,[0,0]);
  step();assert.equal(enemySteps,2);assert.deepEqual(s.flow().eligible,[1],"P2 leads the second wave");
  s.move(1,{x:1,y:0},s.flow().roundId);step();step();step();assert.deepEqual(s.flow().eligible,[0]);assert.deepEqual(actions,[0,0,1]);
  for(const factor of [2,3,4,1]){s.speed(factor);assert.equal(s.flow().duration,1800/factor);}
  s.pause(true);const left=s.timeLeft();time+=10000;s.update();assert.equal(s.timeLeft(),left);s.pause(false);assert.equal(s.timeLeft(),left);
}
{
  let time=0,pending=null;const actions=[],players=[{alive:true},{alive:true}];
  const engine={start(){},players:()=>players,enemyTurn(){},pending:()=>pending,moves:()=>[{x:1,y:0},{x:2,y:0}],act(i){actions.push(i);if(i===0){pending={slot:0,kind:"upgrade"};return{pending:true};}return{retained:false};},choose(){pending=null;return{retained:true,pending:false};}};
  const s=Session.create(engine,()=>{},()=>time);s.start();
  const step=()=>{time=s.flow().deadline;s.update();};
  s.move(0,{x:1,y:0},s.flow().roundId);step();step();
  assert.equal(s.flow().phase,"upgrade");assert.deepEqual(actions,[0]);
  time+=10000;s.update();assert.deepEqual(actions,[0],"P2 waits for P1's reward");
  assert.equal(s.choose(1,0),false);assert.equal(s.choose(0,0),true);
  step();assert.deepEqual(s.flow().eligible,[0],"a promotion that keeps the turn continues P1's chain");
}
{
  let time=0;const players=[{alive:true},{alive:true}];
  const engine={start(){},players:()=>players,enemyTurn(){},pending:()=>null,moves:i=>i===0?[]:[{x:1,y:0}],act(){return{retained:false};}};
  const s=Session.create(engine,()=>{},()=>time);s.start();
  assert.deepEqual(s.flow().eligible,[1],"a player without legal moves is skipped");
}
{
  const {e,S}=setup();S.enemies=[pawn(0,1)];e.turns.forEach(t=>t.grace=0);S.grace=0;
  e.enemyTurn();assert.equal(e.roster[0].alive,false);assert.equal(e.roster[1].alive,true);
  assert.notEqual(S.phase,"coopover");assert.ok(e.moves(1).length);assert.deepEqual(e.moves(0),[]);
  S.enemies=[pawn(4,1)];e.enemyTurn();assert.equal(e.roster[1].alive,false);assert.equal(S.phase,"coopover");
  const final=e.snapshot(),viewer=setup();viewer.e.replay(final,1);
  assert.equal(viewer.h.game.S.phase,"coopreplay");assert.equal(viewer.e.replaying,true);assert.equal(viewer.e.interactive,false);
  assert.equal(viewer.e.focus,1);assert.equal(S.phase,"coopover","replay viewer cannot mutate the authoritative game");
}
{
  let time=0,enemyTurns=0;const players=[{alive:true},{alive:true}];
  const engine={start(){enemyTurns=0;players.forEach(p=>{p.alive=true;delete p.deathReason;});},players:()=>players,moves:()=>[{x:1,y:0}],pending:()=>null,
    enemyTurn(){enemyTurns++;if(enemyTurns===3){players[0].alive=false;players[0].deathReason="P1 captured";}if(enemyTurns===5){players[1].alive=false;players[1].deathReason="P2 captured";}},
    snapshot:()=>({world:{wave:enemyTurns,trail:[{x1:0,y1:0,x2:1,y2:0}],enemyTrail:[{x1:1,y1:1,x2:1,y2:0}]},players:structuredClone(players)})};
  const s=Session.create(engine,()=>{},()=>time);s.start();
  while(enemyTurns<3){time=s.flow().deadline;s.update();}
  assert.equal(s.flow().phase,"planning","one death does not end team game");assert.deepEqual(s.flow().eligible,[1]);
  const frozen=JSON.stringify(s.replays()[0]);assert.equal(s.move(0,{x:1,y:0},s.flow().roundId),false);
  while(enemyTurns<5){time=s.flow().deadline;s.update();}
  assert.equal(s.flow().phase,"over");assert.equal(JSON.stringify(s.replays()[0]),frozen,"first death replay remains frozen while teammate continues");
  for(const record of s.replays()){assert.ok(record.frames.length>=2&&record.frames.length<=11);assert.ok(record.frames.at(-1).game.world.enemyTrail.length);}
  assert.equal(s.replays()[0].frames.at(-1).game.players[1].alive,true);
  assert.equal(s.replays()[1].frames.at(-1).game.players[1].alive,false);
  time+=10000;s.update();assert.equal(enemyTurns,5,"no monster actions after both deaths");
  s.start();assert.deepEqual(s.replays(),[null,null],"new run clears death records");
}
{
  let time=0,turn=0;const players=[{alive:true},{alive:true}];
  const engine={start(){},players:()=>players,pending:()=>null,moves:()=>[],enemyTurn(){if(++turn===15)players.forEach(p=>p.alive=false);},snapshot:()=>({world:{wave:turn,trail:[],enemyTrail:[]},players:structuredClone(players)})};
  const s=Session.create(engine,()=>{},()=>time);s.start();
  while(s.flow().phase!=="over"){time=s.flow().deadline;s.update();}
  for(const record of s.replays()){assert.equal(record.frames.length,11,"ten actions plus the preceding scene");assert.equal(record.frames[0].game.world.wave,5);assert.equal(record.frames.at(-1).game.world.wave,15);}
}
{
  let time=0,turn=0;const players=[{alive:true},{alive:true}];
  const engine={start(){},players:()=>players,pending:()=>null,moves:()=>[],
    enemyTurn(){turn++;if(turn===2){players[1].alive=false;players[1].deathReason="first";}if(turn===3)players[1].alive=true;if(turn===5){players[1].alive=false;players[1].deathReason="second";}},
    snapshot:()=>({world:{wave:turn,trail:[],enemyTrail:[]},players:structuredClone(players)})};
  const s=Session.create(engine,()=>{},()=>time);s.start();
  const until=n=>{while(turn<n){time=s.flow().deadline;s.update();}};
  until(2);assert.equal(s.replays()[1].reason,"first");
  until(3);assert.equal(s.replays()[1],null,"a revive clears the old death record");
  until(5);assert.equal(s.replays()[1].reason,"second","a later death records a fresh replay");
}
console.log("co-op shared runtime/session tests passed: combat/progression, order/retention, camera, survivor continuation, both-dead termination, frozen ten-action replay, reward revive and isolated replay renderer");
