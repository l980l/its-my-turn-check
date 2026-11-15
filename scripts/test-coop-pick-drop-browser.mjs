// Two browser pages on the local BroadcastChannel transport: a partner who
// vanishes or closes the page while both are still picking start pieces.
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
const join=async(a,b)=>{
  await a.ev("document.querySelector('#hostButton').click()");
  for(let n=0;n<100&&!/^[A-Z2-9]{6}$/.test(await a.ev("document.querySelector('#roomCode').textContent"));n++)await wait(50);
  const code=await a.ev("document.querySelector('#roomCode').textContent");
  await b.ev(`document.querySelector('#roomInput').value=${JSON.stringify(code)};document.querySelector('#joinForm').requestSubmit()`);
  for(let n=0;n<100&&!(await rows(a))[1]?.includes("고르는 중");n++)await wait(50);
};
const rows=p=>p.ev("[...document.querySelectorAll('#pickPlayers li')].map(li=>li.textContent)");
const lobby=p=>p.ev("({screen:document.querySelector('#coopApp').dataset.screen,status:document.querySelector('#lobbyStatus').textContent})");
try{
  // Silent drop while picking: both sides notice through the room beats.
  let a=await page(),b=await page();
  await join(a,b);
  assert.match((await rows(a))[1],/^P2 · /,"the guest is in the room");
  await b.ev("window.__offline=true");await wait(6500);
  assert.equal((await rows(a))[1],"P2 · 참가 대기 중","the host frees the seat of a guest who went silent");
  assert.deepEqual(await lobby(b),{screen:"lobby",status:"방장 연결이 끊겨 방이 닫혔습니다."},"a guest cut off from the host leaves the room");
  // Closing the page tells the partner at once.
  a=await page();b=await page();
  await join(a,b);
  await b.ev("dispatchEvent(new Event('pagehide'))");await wait(400);
  assert.equal((await rows(a))[1],"P2 · 참가 대기 중","a guest closing the page frees the seat at once");
  a=await page();b=await page();
  await join(a,b);
  await a.ev("dispatchEvent(new Event('pagehide'))");await wait(400);
  assert.deepEqual(await lobby(b),{screen:"lobby",status:"방장이 나가서 방이 닫혔습니다."},"a host closing the page closes the room at once");
  console.log("PASS co-op pick-screen drops: silent guest and host noticed by beats, page close sent as leave. Local transport adapter only.");
}finally{for(const ws of sockets)ws.close();for(const id of targets)await fetch("http://127.0.0.1:9225/json/close/"+id).catch(()=>{});}
