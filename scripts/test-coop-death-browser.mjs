// Real renderer and controls; deterministic enemy fixtures injected through the runtime snapshot API.
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
const captures=[];
const pages=await(await fetch("http://127.0.0.1:9225/json/list")).json();
const ws=new WebSocket(pages.find(p=>p.type==="page").webSocketDebuggerUrl);
await new Promise(resolve=>ws.onopen=resolve);let id=0;const pending=new Map(),errors=[];
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
const ev=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression){for(let n=0;n<200;n++){if(await ev(expression))return;await wait(30);}throw Error("timeout: "+expression);}
async function click(selector){
  const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()`);
  assert.ok(p.hit,"visible pointer target "+selector);
  for(const type of ["mousePressed","mouseReleased"])await send("Input.dispatchMouseEvent",{type,x:p.x,y:p.y,button:"left",clickCount:1});await wait(40);
}
const core="document.querySelector('#coopFrame0').contentWindow.CoopGame";
async function capture(id,root,width,height){
  const screenshot=`/tmp/coop-${id}-${width}.png`;
  fs.writeFileSync(screenshot,Buffer.from((await send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  const measured=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(root)}),box=e=>{const b=e.getBoundingClientRect();return[b.x,b.y,b.width,b.height]},visible=e=>e.getBoundingClientRect().height&&!e.hidden;return{width:innerWidth,height:innerHeight,controls:[...r.querySelectorAll('button,a')].filter(visible).map(e=>{const b=box(e);return{id:e.id||e.textContent,label:e.textContent,role:e.tagName==='A'?'link':'button',rect:b,enabled:!e.disabled,center_hit:e.contains(document.elementFromPoint(b[0]+b[2]/2,b[1]+b[3]/2))}}),texts:[...r.querySelectorAll('h2,p,button,a')].filter(visible).map(e=>({id:e.id||e.textContent,text:e.textContent,rect:box(e),font_px:parseFloat(getComputedStyle(e).fontSize),overflow:e.scrollWidth>e.clientWidth+1,inactive:Boolean(e.disabled),background_status:'unresolved'}))}})()`);
  captures.push({id:id+width,language:"ko",context:id,requested_width:width,requested_height:height,screenshot,...measured});
}
async function fixture(victim){
  await ev(`(()=>{const e=${core},s=e.snapshot();s.world.enemies=[{x:${victim===0?0:4},y:1,type:'pawn',hp:1,maxHp:1,face:{x:0,y:-1},enemyTraits:[]}];s.world.items=[];s.world.terrain=[];s.world.emberHazards=[];s.players[0].x=0;s.players[0].y=0;s.players[1].x=4;s.players[1].y=0;s.turns.forEach(t=>{t.grace=0;t.invincibleBeats=0});e.apply(s)})()`);
}
async function stepUntil(expression){for(let n=0;n<10;n++){if(await ev(expression))return;await click("#devStep");}throw Error("step timeout: "+expression);}
try{
  await send("Runtime.enable");await send("Page.enable");await send("Network.enable");
  await send("Network.setBlockedURLs",{urls:["*cdn.jsdelivr.net*","*supabase.co*"]});
  for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<621});
    await send("Page.navigate",{url:(process.argv[2]||"http://localhost:8000")+"/coop.html"});
    await until("Boolean(document.querySelector('#coopFrame0')?.contentWindow?.CoopGame)");
    await click("#devButton");await until(`${core}.players().length===2`);
    await click("#devPause");await click("#devAutoBoth");
    if(width===390){
      await ev(`(()=>{const f=document.querySelector('#coopFrame0'),w=f.contentWindow,e=w.CoopGame,g=f.contentDocument.querySelector('canvas').getContext('2d');w.allyDraws=[];const fill=g.fillText.bind(g),arc=g.arc.bind(g);g.fillText=function(t,...args){if(t==='P2')w.allyDraws.push({text:t,color:this.fillStyle,shadow:this.shadowColor,blur:this.shadowBlur});return fill(t,...args)};g.arc=function(x,y,r,...args){if(r===13)w.allyDraws.push({ring:r,shadow:this.shadowColor,blur:this.shadowBlur});return arc(x,y,r,...args)};e.roster[1].x=e.roster[0].x+2;e.roster[1].y=e.roster[0].y})()`);
      await wait(150);
      assert.ok(await ev("document.querySelector('#coopFrame0').contentWindow.allyDraws.some(r=>r.text==='P2'&&r.blur===30&&r.shadow==='#f1ffff')"),"visible teammate has white bloom and player label");
      await ev(`${core}.roster[1].x=80`);await wait(150);
      assert.ok(await ev("document.querySelector('#coopFrame0').contentWindow.allyDraws.some(r=>r.ring===13&&r.shadow==='#f1ffff'&&r.blur>0)"),"offscreen teammate has circular white glowing border");
      fs.writeFileSync('/tmp/coop-ally-390.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    }
    await fixture(0);await stepUntil(`${core}.players()[0].alive===false`);
    assert.equal(await ev(`${core}.players()[1].alive`),true);
    assert.equal(await ev("document.querySelector('#coopApp').dataset.screen"),"gameScreen");
    assert.equal(await ev("document.querySelector('#deathDialog').open"),true);
    await capture("personal-death","#deathDialog",width,height);
    await click("#deathReview");await until("Boolean(document.querySelector('#replayFrame').contentWindow.CoopGame?.replaying)");
    const label=await ev("document.querySelector('#replayLabel').textContent");
    assert.equal(await ev("document.querySelector('#replayNext').disabled"),true);
    await click("#replayPrev");assert.notEqual(await ev("document.querySelector('#replayLabel').textContent"),label);
    await click("#replayNext");assert.equal(await ev("document.querySelector('#replayLabel').textContent"),label);
    assert.equal(await ev("document.querySelector('#replayFrame').contentWindow.CoopGame.snapshot().players[0].alive"),false);
    await click("#replayClose");assert.equal(await ev(`${core}.players()[1].alive`),true);
    // While a replay is open, the authority is not replaced or paused by it.
    await click("#reviewDeathButton");await until("document.querySelector('#replayDialog').open");
    const before=await ev(`${core}.snapshot().world.wave`);
    await ev("document.querySelector('#devStep').click();document.querySelector('#devStep').click();document.querySelector('#devStep').click();document.querySelector('#devStep').click()");
    assert.ok(await ev(`${core}.snapshot().world.wave`)>before,"live survivor game advances independently of replay");
    await click("#replayClose");
    await fixture(1);await stepUntil(`${core}.players()[1].alive===false`);
    assert.equal(await ev("document.querySelector('#coopApp').dataset.screen"),"endScreen");
    await capture("death","#endScreen",width,height);
    assert.match(await ev("document.querySelector('#endDeaths').textContent"),/P1.*\nP2/);
    for(const i of [0,1]){
      assert.equal(await ev(`document.querySelector('#endReview${i}').disabled`),false);
      await click("#endReview"+i);await until("document.querySelector('#replayFrame').contentWindow.CoopGame.replaying");
      assert.equal(await ev("document.querySelector('#replayFrame').contentWindow.CoopGame.view"),i);
      assert.equal(await ev(`document.querySelector('#replayFrame').contentWindow.CoopGame.players()[${i}].alive`),false);
      if(i===1)assert.ok(await ev("document.querySelector('#replayFrame').contentWindow.CoopGame.snapshot().world.enemyTrail.length")>0);
      if(i===1)await capture("replay","#replayDialog",width,height);
      await click("#replayClose");
    }
    await click("#backToLobby");assert.equal(await ev("document.querySelector('#coopApp').dataset.screen"),"lobby");
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('/tmp/coop-death-ui-results.json',JSON.stringify({schema_version:1,unit:'css_px',evidence:{timestamp:new Date().toISOString(),source_hashes:Object.fromEntries(['coop.js','coop.css','coop.html','coop-session.js','game.js','scripts/test-coop-death-browser.mjs'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))},captures},null,2));
  console.log("PASS mobile/desktop: one-dead continues, personal death dialog, previous/next replay, isolated live survivor progression, both-dead results, separate P1/P2 replay, enemy paths and lobby return. Deterministic injected board fixtures.");
}finally{ws.close();}
