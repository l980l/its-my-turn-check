// Two real browser pages, isolated local BroadcastChannel transport adapter.
// Validates room protocol, not Supabase availability, latency or billing.
import assert from "node:assert/strict";
const base=process.argv[2]||"http://localhost:8000";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const sockets=[],targets=[];
async function page(){
  const browser=await(await fetch("http://127.0.0.1:9225/json/version")).json();
  const control=new WebSocket(browser.webSocketDebuggerUrl);await new Promise(r=>control.onopen=r);
  const created=await new Promise(resolve=>{control.onmessage=e=>resolve(JSON.parse(e.data).result);control.send(JSON.stringify({id:1,method:"Target.createTarget",params:{url:"about:blank",newWindow:true}}));});control.close();targets.push(created.targetId);
  const target=(await(await fetch("http://127.0.0.1:9225/json/list")).json()).find(p=>p.id===created.targetId);
  const ws=new WebSocket(target.webSocketDebuggerUrl);sockets.push(ws);
  await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();const errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  const ev=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send("Runtime.enable");await send("Page.enable");await send("Network.enable");
  // Headless windows start hidden, and Chrome then delays every timer to about once a second.
  await send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await send("Network.setBlockedURLs",{urls:["*cdn.jsdelivr.net*","*supabase.co*"]});
  // Fake leaderboard function: tickets and submissions are kept in this origin's localStorage.
  await send("Page.addScriptToEvaluateOnNewDocument",{source:`{const real=window.fetch;window.fetch=async(url,options)=>{if(!String(url).includes("/functions/v1/leaderboard"))return real(url,options);const body=JSON.parse(options.body),ok=v=>new Response(JSON.stringify(v),{status:200});if(body.action==="start"){const fail=Number(localStorage.getItem("failStarts")||0);localStorage.setItem("fakeStarts",String(Number(localStorage.getItem("fakeStarts")||0)+1));if(fail>0){localStorage.setItem("failStarts",String(fail-1));return new Response(JSON.stringify({error:"offline"}),{status:503});}return ok({runId:"run-"+Math.random(),runToken:"token"});}const list=JSON.parse(localStorage.getItem("fakeSubmits")||"[]");list.push(body);localStorage.setItem("fakeSubmits",JSON.stringify(list));return ok({ok:true});};}`});
  await send("Page.addScriptToEvaluateOnNewDocument",{source:`window.supabase={createClient(){return{channel(name){const bus=new BroadcastChannel(name),listeners=[];bus.onmessage=e=>{if(window.__offline)return;for(const [event,fn] of listeners)if(event===e.data.event)fn({payload:e.data.payload})};return{on(type,filter,fn){listeners.push([filter.event,fn]);return this},subscribe(fn){setTimeout(()=>fn('SUBSCRIBED'),20);return this},send(message){if(!window.__offline)bus.postMessage(message);return Promise.resolve('ok')},unsubscribe(){bus.close()}}}}}};`});
  await send("Page.navigate",{url:base+"/coop.html"});
  for(let n=0;n<200;n++){if(await ev("Boolean(document.querySelector('#coopFrame0')?.contentWindow?.CoopGame)"))break;await wait(30);}
  return{ev,errors};
}
try{
  const a=await page(),b=await page();
  // The first ranking ticket request fails; the host retries it during the run.
  await a.ev("localStorage.setItem('failStarts','1');localStorage.setItem('fakeStarts','0')");
  await a.ev("document.querySelector('#hostButton').click()");
  for(let n=0;n<100&&!/^[A-Z2-9]{6}$/.test(await a.ev("document.querySelector('#roomCode').textContent"));n++)await wait(50);
  const code=await a.ev("document.querySelector('#roomCode').textContent");assert.match(code,/^[A-Z2-9]{6}$/);
  // The picker covers the match bar, so the host still needs the code inside it.
  const pickRoom=await a.ev("(()=>{const b=document.querySelector('#pickRoomCode'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:b.textContent,shown:!document.querySelector('#pickScreen').hidden,top:hit===b||b.contains(hit)}})()");
  assert.deepEqual(pickRoom,{text:code,shown:true,top:true},"the waiting host sees the room code on the piece picker");
  await b.ev(`document.querySelector('#roomInput').value=${JSON.stringify(code)};document.querySelector('#joinForm').requestSubmit()`);
  await wait(500);
  // Both players pick a start piece in the room; the run starts once both are ready.
  const pick=(p,piece)=>p.ev(`document.querySelector('.pick-choice[data-piece="${piece}"]').click()`);
  const picked=p=>p.ev("({open:!document.querySelector('#pickScreen').hidden,rows:[...document.querySelectorAll('#pickPlayers li')].map(li=>li.textContent),ready:document.querySelector('#pickReady').textContent})");
  assert.equal((await picked(a)).open,true,"the host waits in the piece picker");assert.equal((await picked(b)).open,true,"the guest joins the piece picker");
  await pick(a,"rook");await pick(b,"king");await wait(300);
  assert.deepEqual((await picked(b)).rows,["P1 · 룩","P2 (나) · 킹"],"the guest sees the host's piece");
  assert.deepEqual((await picked(a)).rows,["P1 (나) · 룩","P2 · 킹"],"the host sees the guest's piece");
  await a.ev("document.querySelector('#pickReady').click()");await wait(300);
  assert.equal((await picked(b)).rows[0],"P1 · 룩 · 준비 완료");assert.equal((await picked(a)).open,true,"one ready player does not start the run");
  await b.ev("document.querySelector('#pickReady').click()");await wait(500);
  assert.equal((await picked(a)).open,false);assert.equal((await picked(b)).open,false,"both ready starts the run");
  const state=p=>p.ev("(()=>{const e=document.querySelector('#coopFrame0').contentWindow.CoopGame;return{view:e.view,players:e.players(),wave:e.snapshot().world.wave}})()");
  let as=await state(a),bs=await state(b);assert.equal(as.view,0);assert.equal(bs.view,1);assert.deepEqual(as.players,bs.players);assert.equal(as.wave,1);
  assert.deepEqual(as.players.map(p=>p.piece),["rook","king"],"each player starts as the chosen piece");
  await a.ev("document.querySelector('#autoButton').click()");await b.ev("document.querySelector('#autoButton').click()");await wait(7500);
  as=await state(a);bs=await state(b);assert.ok(as.wave>=2);assert.deepEqual(as.players,bs.players);assert.equal(as.wave,bs.wave);
  assert.ok(as.players.every((p,i)=>p.x!==[-2,2][i]||p.y!==0),"both clients submit their own core AI moves");
  // Host handoff. The host goes silent (backgrounded app): the guest takes over and keeps playing.
  const wave=p=>p.ev("document.querySelector('#coopFrame0').contentWindow.CoopGame.snapshot().world.wave");
  // Keep both pieces alive through the handoff checks: a natural game over would end the run first.
  await a.ev("document.querySelector('#coopFrame0').contentWindow.CoopGame.turns.forEach(t=>t.grace=1e6)");await wait(300);
  // A silent player's turn times out after the 3 s selection window, so one wave can take ~3.5 s.
  await a.ev("window.__offline=true");await wait(6500);const w1=await wave(b);await wait(5000);
  assert.ok(await wave(b)>w1,"the guest continues the run as the new authority");
  // The old host comes back, follows the newer authority and keeps its own player.
  await a.ev("window.__offline=false");await wait(3000);
  as=await state(a);bs=await state(b);assert.equal(as.view,0);assert.deepEqual(as.players,bs.players);assert.equal(as.wave,bs.wave);
  await wait(4500);assert.ok(await wave(a)>as.wave,"the returned host follows the shared run");
  assert.doesNotMatch(await b.ev("document.querySelector('#actionHint').textContent"),/AUTO가 대신/,"the new authority seats the returned player again");
  // The current authority leaves explicitly: the other takes over at once, and the leaver rejoins by code.
  await b.ev("document.querySelector('#leaveButton').click()");await wait(2500);
  assert.equal(await a.ev("document.querySelector('#coopApp').dataset.screen"),"gameScreen","the remaining player keeps playing");
  assert.match(await a.ev("document.querySelector('#actionHint').textContent"),/AUTO가 대신/,"the absent player is shown as played by AUTO");
  await b.ev(`document.querySelector('#roomInput').value=${JSON.stringify(code)};document.querySelector('#joinForm').requestSubmit()`);await wait(1500);
  as=await state(a);bs=await state(b);assert.equal(bs.view,1,"the rejoining player gets its own piece back");assert.equal((await picked(b)).open,false,"a rejoin mid-run skips the piece picker");assert.deepEqual(as.players,bs.players);assert.equal(as.wave,bs.wave);
  await a.ev("document.querySelector('#autoButton').click()");await b.ev("document.querySelector('#autoButton').click()");
  await a.ev("document.querySelector('#coopFrame0').contentWindow.CoopGame.players().forEach(p=>{p.alive=false;p.deathReason='network death fixture'})");
  const rawScore=await a.ev("document.querySelector('#coopFrame0').contentWindow.CoopGame.snapshot().world.score");
  for(let n=0;n<200;n++){if(await b.ev("document.querySelector('#coopApp').dataset.screen==='endScreen'"))break;await wait(40);}
  assert.equal(await b.ev("document.querySelector('#coopApp').dataset.screen"),"endScreen");
  assert.equal(await b.ev("document.querySelector('#endReview0').disabled||document.querySelector('#endReview1').disabled"),false,"both death records arrive at guest");
  await b.ev("document.querySelector('#endReview1').click()");
  for(let n=0;n<200;n++){if(await b.ev("Boolean(document.querySelector('#replayFrame').contentWindow.CoopGame?.replaying)"))break;await wait(30);}
  assert.equal(await b.ev("document.querySelector('#replayFrame').contentWindow.CoopGame.players()[1].alive"),false);
  await b.ev("document.querySelector('#replayClose').click()");
  // Co-op ranking: each player enters a name; the authority submits the team score once.
  await a.ev("localStorage.removeItem('fakeSubmits')");
  const enter=(p,name)=>p.ev(`document.querySelector('#rankName').value=${JSON.stringify(name)};document.querySelector('#rankForm').requestSubmit()`);
  await enter(a,"Alpha");await wait(400);
  assert.match(await b.ev("document.querySelector('#rankStatus').textContent"),/P2의 이름을 기다리는/,"the authority waits for the partner's name");
  await enter(b,"Beta");await wait(800);
  const submits=JSON.parse(await a.ev("localStorage.getItem('fakeSubmits')||'[]'"));
  assert.ok(Number(await a.ev("localStorage.getItem('fakeStarts')"))>=2,"a failed ticket request is retried");
  assert.equal(submits.length,1,"the team score is submitted once");assert.deepEqual(submits[0].names,["Alpha","Beta"]);assert.ok(submits[0].pieces.length===2&&submits[0].pieces.every(p=>["pawn","knight","bishop","rook","queen","king"].includes(p)),"each player's piece is submitted");assert.ok(submits[0].score>0&&submits[0].runToken==="token");
  assert.equal(submits[0].score,Math.round(rawScore*1.75),"the team score carries the mean of rook ×1.5 and king ×2.0");
  assert.match(await b.ev("document.querySelector('#endText').textContent"),/× 1\.75 = /,"the result shows the team multiplication");
  assert.match(await b.ev("document.querySelector('#rankStatus').textContent"),/등록했어요/);assert.equal(await b.ev("document.querySelector('#rankSubmit').disabled"),true);
  await b.ev("document.querySelector('#rankSubmit').disabled=false");await enter(b,"Again");await wait(600);
  assert.equal(JSON.parse(await a.ev("localStorage.getItem('fakeSubmits')")).length,1,"a run is never submitted twice");
  await a.ev("document.querySelector('#leaveButton').click()");await wait(150);
  assert.equal(await b.ev("document.querySelector('#coopApp').dataset.screen"),"endScreen");
  assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
  console.log("PASS two browser pages: create/join, P1/P2 own view, shared positions/wave, both auto inputs, host handoff on silence and on leave, old host standing down, rejoin by code, per-player death replay delivery and guest replay, two-name co-op ranking submission, host departure. Local transport adapter and injected death fixture only.");
}finally{for(const ws of sockets)ws.close();for(const id of targets)await fetch("http://127.0.0.1:9225/json/close/"+id).catch(()=>{});}
