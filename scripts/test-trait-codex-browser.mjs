// Run against a local server and a disposable headless Chrome on CDP port 9225.
// Trait codex: at five viewports and every level, each entry's text stays inside its box.
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
  for (const [w, h] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1440, 900]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 || h < 500 });
    await send("Page.navigate", { url: base + "/index.html" });
    for (let i = 0; i < 100; i++) { if (await ev("document.readyState === 'complete' && Boolean(document.querySelector('#traitCodexButton'))")) break; await wait(30); }
    await ev("document.fonts.ready");
    await ev("document.querySelector('#traitCodexButton').click()"); await wait(200);
    for (const level of [1, 2, 3, 4, 5]) {
      const tab = await ev(`(()=>{const t=document.querySelector('#traitLevelFilter [data-level="${level}"]');t.click();const b=t.getBoundingClientRect(),g=t.parentElement.getBoundingClientRect();return{checked:[...t.parentElement.children].filter(x=>x.getAttribute('aria-checked')==='true').map(x=>x.dataset.level),fits:b.left>=g.left-0.5&&b.right<=g.right+0.5&&t.scrollWidth<=t.clientWidth+1,width:b.width}})()`); await wait(80);
      assert.deepEqual(tab.checked, [String(level)], "exactly the clicked level tab is selected");
      assert.ok(tab.fits && tab.width >= 44, `${w}x${h} Lv.${level} tab fits its row and stays tappable`);
      const r = await ev(`(()=>{const entries=[...document.querySelectorAll('.trait-codex-entry')];return{count:entries.length,level:entries[0]?.dataset.level,spill:entries.flatMap(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('h3,p')].filter(n=>{const q=n.getBoundingClientRect();return q.right>b.right+0.5||q.bottom>b.bottom+0.5||n.scrollWidth>n.clientWidth+1}).map(n=>e.querySelector('h3').textContent+': '+n.textContent.slice(0,20))})}})()`);
      assert.equal(r.count, 13, "13 traits listed"); assert.equal(r.level, String(level));
      assert.deepEqual(r.spill, [], `${w}x${h} Lv.${level} codex text stays inside its entry`);
    }
  }
  console.log("PASS 5 viewports × Lv. 1–5: trait codex text stays inside every entry.");
} finally { ws.close(); }
