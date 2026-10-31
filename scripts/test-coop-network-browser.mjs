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
  await send("Page.addScriptToEvaluateOnNewDocument",{source:`window.supabase={createClient(){return{channel(name){const bus=new BroadcastChannel(name),listeners=[];bus.onmessage=e=>{for(const [event,fn] of listeners)if(event===e.data.event)fn({payload:e.data.payload})};return{on(type,filter,fn){listeners.push([filter.event,fn]);return this},subscribe(fn){setTimeout(()=>fn('SUBSCRIBED'),20);return this},send(message){bus.postMessage(message);return Promise.resolve('ok')},unsubscribe(){bus.close()}}}}}};`});
  await send("Page.navigate",{url:base+"/coop.html"});
  for(let n=0;n<200;n++){if(await ev("Boolean(document.querySelector('#coopFrame0')?.contentWindow?.CoopGame)"))break;await wait(30);}
  return{ev,errors};
}
try{
  const a=await page(),b=await page();
  await a.ev("document.querySelector('#hostButton').click()");
  await wait(200);const code=await a.ev("document.querySelector('#roomCode').textContent");assert.match(code,/^[A-Z2-9]{6}$/);
  await b.ev(`document.querySelector('#roomInput').value=${JSON.stringify(code)};document.querySelector('#joinForm').requestSubmit()`);
  await wait(500);
  const state=p=>p.ev("(()=>{const e=document.querySelector('#coopFrame0').contentWindow.CoopGame;return{view:e.view,players:e.players(),wave:e.snapshot().world.wave}})()");
  let as=await state(a),bs=await state(b);assert.equal(as.view,0);assert.equal(bs.view,1);assert.deepEqual(as.players,bs.players);assert.equal(as.wave,1);
  await a.ev("document.querySelector('#autoButton').click()");await b.ev("document.querySelector('#autoButton').click()");await wait(7500);
  as=await state(a);bs=await state(b);assert.ok(as.wave>=2);assert.deepEqual(as.players,bs.players);assert.equal(as.wave,bs.wave);
  assert.ok(as.players.every((p,i)=>p.x!==[-2,2][i]||p.y!==0),"both clients submit their own core AI moves");
  await a.ev("document.querySelector('#autoButton').click()");await b.ev("document.querySelector('#autoButton').click()");
  await a.ev("document.querySelector('#coopFrame0').contentWindow.CoopGame.players().forEach(p=>{p.alive=false;p.deathReason='network death fixture'})");
  for(let n=0;n<200;n++){if(await b.ev("document.querySelector('#coopApp').dataset.screen==='endScreen'"))break;await wait(40);}
  assert.equal(await b.ev("document.querySelector('#coopApp').dataset.screen"),"endScreen");
  assert.equal(await b.ev("document.querySelector('#endReview0').disabled||document.querySelector('#endReview1').disabled"),false,"both death records arrive at guest");
  await b.ev("document.querySelector('#endReview1').click()");
  for(let n=0;n<200;n++){if(await b.ev("Boolean(document.querySelector('#replayFrame').contentWindow.CoopGame?.replaying)"))break;await wait(30);}
  assert.equal(await b.ev("document.querySelector('#replayFrame').contentWindow.CoopGame.players()[1].alive"),false);
  await b.ev("document.querySelector('#replayClose').click()");
  await a.ev("document.querySelector('#leaveButton').click()");await wait(150);
  assert.equal(await b.ev("document.querySelector('#coopApp').dataset.screen"),"endScreen");
  assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
  console.log("PASS two browser pages: create/join, P1/P2 own view, shared positions/wave, both auto inputs, per-player death replay delivery and guest replay, host departure. Local transport adapter and injected death fixture only.");
}finally{for(const ws of sockets)ws.close();for(const id of targets)await fetch("http://127.0.0.1:9225/json/close/"+id).catch(()=>{});}
