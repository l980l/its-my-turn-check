// Run against a local server and a disposable headless Chrome on CDP port 9225.
// No app hooks: drive the actual page with pointer input, blocking the remote SDK.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:8000";
const pages = await (await fetch("http://127.0.0.1:9225/json/list")).json();
const ws = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener("open", resolve, { once: true }));
let serial = 0;
const pending = new Map(), errors = [], records = [];
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
const ev = async expression => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function click(selector) {
  const pos = await ev(`(()=>{const e=document.querySelector('${selector}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e};})()`);
  assert.ok(pos.hit, "click target is visible: " + selector);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
  await wait(40);
}
const text = id => ev(`document.querySelector('#${id}').textContent`);
try {
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*cdn.jsdelivr.net*", "*supabase.co*"] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.channelCalls=0;window.supabase={createClient(){channelCalls++;throw new Error('Local DEV must not initialize networking')}};" });
  for (const [width, height] of [[320,568], [390,844], [844,390], [768,1024], [1440,900]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 621 });
    await send("Page.navigate", { url: base + "/coop.html" });
    for (let i=0; i<100; i++) { if (await ev("Boolean(document.querySelector('#devButton')) && document.readyState !== 'loading'")) break; await wait(30); }
    await ev("document.fonts.ready");
    await click("#devButton");
    for(let i=0;i<200;i++){if(await ev("document.querySelector('#coopFrame0').contentWindow.CoopGame?.players().length===2"))break;await wait(30);}
    await wait(100);
    assert.equal(await ev("document.querySelector('#coopApp').dataset.screen"), "gameScreen");
    assert.equal(await text("roomCode"), "LOCAL DEV");
    assert.equal(await text("devAutoBoth"), "AUTO BOTH ON");
    assert.equal(await ev("document.querySelector('#timerText').tagName"), "PROGRESS");
    // AUTO answers within 0.28s, so watch an unanswered 1.8s turn window instead.
    await click("#devAutoBoth"); assert.equal(await text("devAutoBoth"), "AUTO BOTH OFF");
    for (let i=0; i<200; i++) { if (/TURN$/.test(await text("phaseText")) && await ev("document.querySelector('#timerText').value") > 40) break; await wait(20); }
    const initialBar = await ev("document.querySelector('#timerText').value");
    await wait(200);
    assert.ok(await ev("document.querySelector('#timerText').value") < initialBar, "remaining-time bar decreases during a turn");
    assert.equal(await text("timerText"), "", "seconds are not rendered");
    await click("#devPause");
    const frozen = await text("actionHint"), frozenBar = await ev("document.querySelector('#timerText').value"); await wait(300);
    assert.equal(await text("actionHint"), frozen, "paused state is stable");
    assert.equal(await ev("document.querySelector('#timerText').value"), frozenBar, "bar freezes while paused");
    await click("#devAutoBoth"); assert.equal(await text("devAutoBoth"), "AUTO BOTH ON");
    const m = await ev(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};const root=document.querySelector('#gameScreen'),canvas=document.querySelector('#boardViews'),tools=document.querySelector('#devTools');return {width:innerWidth,height:innerHeight,canvas:box(canvas),tools:box(tools),overflow:root.scrollWidth>root.clientWidth+1,textOverflow:[...root.querySelectorAll('button,strong,small')].filter(e=>e.getBoundingClientRect().height&&e.scrollWidth>e.clientWidth+1).map(e=>e.id),channelCalls,controls:[...tools.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height).map(e=>({id:e.id,rect:box(e)}))}})()`);
    assert.equal(m.width, width); assert.equal(m.height, height);
    assert.equal(m.overflow, false); assert.deepEqual(m.textOverflow, []);
    assert.ok(m.canvas[3] > 100 && m.tools[1]+m.tools[3] <= height+1, JSON.stringify(m));
    assert.equal(m.channelCalls, 0);
    for (const control of m.controls) assert.ok(control.rect[2]>=24 && control.rect[3]>=24);
    records.push(m);
    if ([320,390,1440].includes(width)) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`/tmp/coop-dev-${width}.png`, Buffer.from(shot.data, "base64"));
    }
    await click("#devAutoBoth"); assert.equal(await text("devAuto0"), "P1 AUTO OFF"); assert.equal(await text("devAuto1"), "P2 AUTO OFF");
    await click("#devAutoBoth"); assert.equal(await text("devAuto1"), "P2 AUTO ON");
    await click("#devStep"); await click("#devStep");
    assert.equal(await ev("document.querySelector('#cameraButton').disabled"),false);
    const otherFocus=await ev("document.querySelector('#coopFrame1').contentWindow.CoopGame.focus");
    const oldFocus=await ev("document.querySelector('#coopFrame0').contentWindow.CoopGame.focus");
    await click("#cameraButton");
    assert.equal(await ev("document.querySelector('#coopFrame0').contentWindow.CoopGame.focus"),1-oldFocus,"camera button switches local spectator view");
    assert.equal(await ev("document.querySelector('#coopFrame1').contentWindow.CoopGame.focus"),otherFocus,"switching does not affect the other player's camera");
    for (const factor of [2,3,4,1]) { await click("#devSpeed"); assert.equal(await text("devSpeed"), "SPEED ×"+factor); }
    await click("#devPlayer"); assert.equal(await text("devPlayer"), "조작 P2");
    await click("#devPiece"); assert.equal(await text("devPiece"), "기물 KNIGHT");
    await click("#devSpawnrook"); await click("#devClear");
    await click("#devToolsToggle"); assert.equal(await ev("document.querySelector('#devControls').hidden"), true);
    await click("#devToolsToggle");
    await click("#devRestart"); assert.equal(await text("devSpeed"), "SPEED ×1");
    await wait(5000);
    assert.ok(await ev("document.querySelector('#coopFrame0').contentWindow.CoopGame.snapshot().world.wave>=2"),"real core engine progresses beyond the initial enemy turn");
    const views=await ev("[...document.querySelectorAll('#boardViews iframe')].map(f=>{const e=f.contentWindow.CoopGame;return{view:e.view,players:e.players(),wave:e.snapshot().world.wave}})");
    assert.equal(views[0].view,0);assert.equal(views[1].view,1);assert.deepEqual(views[0].players,views[1].players);
    // Split halves can be ~120px tall: reward cards must be on screen without scrolling the panel.
    await click("#devAutoBoth"); assert.equal(await text("devAutoBoth"), "AUTO BOTH OFF");
    const openPanel = "[...document.querySelectorAll('#boardViews iframe')].findIndex(f=>!f.contentDocument.querySelector('#upgradeScreen').classList.contains('hidden'))";
    for (let i=0; i<8 && await ev(openPanel) < 0; i++) { await click("#devXp"); await wait(150); }
    await wait(400);
    const cards = await ev(`(()=>{const f=document.querySelectorAll('#boardViews iframe')[${await ev(openPanel)}],d=f.contentDocument;return [...d.querySelectorAll('.upgrade-choice')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect(),hit=d.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{top:r.top,bottom:r.bottom,height:f.clientHeight,hit:b.contains(hit)}})})()`);
    assert.ok(cards.length > 0, "reward panel opens in split view");
    for (const c of cards) assert.ok(c.top >= 0 && c.bottom <= c.height + 1 && c.hit, "reward card fully visible in split view: " + JSON.stringify(c));
    await click("#leaveButton");
    assert.equal(await ev("document.querySelector('#coopApp').dataset.screen"), "lobby");
    assert.equal(await ev("window.channelCalls"), 0);
  }
  assert.deepEqual(errors, []);
  const hashes = Object.fromEntries(["coop.js","coop.html","coop.css","scripts/test-coop-dev-browser.mjs"].map(file=>[file,createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));
  fs.writeFileSync("/tmp/coop-dev-browser-results.json", JSON.stringify({ timestamp:new Date().toISOString(),unit:"css_px",records,errors,hashes },null,2));
  console.log("PASS 5 viewports: pointer DEV start, both AUTO, pause/step/resume by restart, speed, player/piece, spawn/clear, hide/show, real-time rounds and exit. No SDK initialization; no runtime exceptions.");
} finally { ws.close(); }
