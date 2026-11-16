// Run against a local server and a disposable headless Chrome on CDP port 9225.
// Co-op lobby and result screen at phone sizes: lobby text is at least 12px,
// the result panel fits without scrolling (메인 화면 / 새 방 stay on screen),
// and the ranking name input has an accessible name.
import assert from "node:assert/strict";
const base = process.argv[2] || "http://localhost:8000";
const wait = ms => new Promise(r => setTimeout(r, ms));
const pages = await (await fetch("http://127.0.0.1:9225/json/list")).json();
const ws = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let serial = 0; const pending = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
try {
  await send("Page.enable"); await send("Network.enable"); await send("Network.clearBrowserCache");
  await send("Network.setBlockedURLs", { urls: ["*cdn.jsdelivr.net*", "*supabase.co*"] });
  for (const [w, h] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 || h < 500 });
    await send("Page.navigate", { url: base + "/coop.html" });
    for (let i = 0; i < 100; i++) { if (await ev("Boolean(document.querySelector('#endScreen')) && document.readyState === 'complete'")) break; await wait(30); }
    await ev("document.fonts.ready");
    const small = await ev("[...document.querySelectorAll('#lobby *, header *')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>[e.textContent.trim().slice(0,24),parseFloat(getComputedStyle(e).fontSize)]).filter(x=>x[1]<12)");
    assert.deepEqual(small, [], `${w}x${h} lobby text under 12px`);
    // Worst case result: both reviews, the ranking form, and the extra local-test button.
    for (const dev of [false, true]) {
      await ev(`(()=>{const q=s=>document.querySelector(s);q('#lobby').classList.add('hidden');q('#endScreen').classList.remove('hidden');q('#coopApp').dataset.screen='endScreen';q('#endText').textContent='팀 점수 12,345 × 1.5 = 18,518점 · 웨이브 14 · 37기 처치';q('#endDeaths').textContent='P1 · 룩에게 잡혔습니다.\\nP2 · 비숍에게 잡혔습니다.';q('#endReview0').disabled=false;q('#endReview1').disabled=false;q('#rankForm').hidden=false;q('#devRestartEnd').hidden=${!dev}})()`);
      await wait(150);
      const m = await ev(`(()=>{const p=document.querySelector('#endScreen .solo-panel');const vis=s=>[...document.querySelectorAll(s)].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{id:e.id||e.textContent.trim(),top:r.top,bottom:r.bottom,w:r.width,h:r.height,hit:e.contains(hit)}});return{scroll:p.scrollHeight-p.clientHeight,controls:vis('#endScreen .result-actions > *, #endScreen .end-reviews button, #rankName, #rankSubmit'),overflow:[...p.querySelectorAll('button,a')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent)}})()`);
      assert.ok(m.scroll <= 1, `${w}x${h}${dev ? " dev" : ""} result panel scrolls by ${m.scroll}px`);
      assert.deepEqual(m.overflow, [], `${w}x${h} button text clipped`);
      for (const c of m.controls) assert.ok(c.top >= 0 && c.bottom <= h && c.hit && c.w >= 24 && c.h >= 24, `${w}x${h}${dev ? " dev" : ""} control on screen: ${JSON.stringify(c)}`);
    }
    const ax = await send("Accessibility.getPartialAXTree", { backendNodeId: (await send("DOM.describeNode", { objectId: (await send("Runtime.evaluate", { expression: "document.querySelector('#rankName')" })).result.objectId })).node.backendNodeId, fetchRelatives: false });
    assert.equal(ax.nodes[0].name?.value, "내 이름", "ranking input has an accessible name");
  }
  console.log("PASS 4 viewports: co-op lobby text >= 12px; result panel fits without scrolling (with and without the local-test button); ranking input named.");
} finally { ws.close(); }
