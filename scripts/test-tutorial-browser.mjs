// Run against a local server and a disposable headless Chrome on CDP port 9225.
// Pages through HOW TO PLAY and checks the panel keeps one size and button layout.
import assert from "node:assert/strict";
const base = process.argv[2] || "http://localhost:8000";
const target = await (await fetch("http://127.0.0.1:9225/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener("open", resolve, { once: true }));
let serial = 0;
const pending = new Map(), errors = [];
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
const layout = () => ev(`(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return [b.x,b.y,b.width,b.height].map(Math.round).join(",")};
  return {title:document.querySelector('#tutorialTitle').textContent,panel:r('.tutorial-panel'),buttons:['#tutorialPrev','#tutorialSkip','#tutorialNext'].map(r).join(" "),
  order:[...document.querySelectorAll('.tutorial-actions button')].map(b=>b.id).join(","),next:document.querySelector('#tutorialNext').disabled,
  scenes:[...document.querySelectorAll('[data-tutorial-scene]')].map(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let lit=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>300)lit++;return lit})}})()`);
try {
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Network.setBlockedURLs", { urls: ["*supabase.co*"] });
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 621 });
    await send("Page.navigate", { url: base + "/index.html" });
    for (let i = 0; i < 100; i++) { if (await ev("document.readyState==='complete'")) break; await wait(50); }
    await ev("document.fonts.ready");
    await ev("document.querySelector('#tutorialButton').click()"); await wait(100);
    const pages = [];
    for (let i = 0; i < 6; i++) {
      pages.push(await layout());
      await ev("document.querySelector('#tutorialNext').click()"); await wait(50);
    }
    const tag = width + "x" + height;
    pages.forEach((page, i) => {
      assert.equal(page.order, "tutorialPrev,tutorialSkip,tutorialNext", tag + " buttons read 이전 · 닫기 · 다음");
      assert.equal(page.panel, pages[0].panel, tag + " panel keeps its size on page " + (i + 1));
      assert.equal(page.buttons, pages[0].buttons, tag + " buttons stay put on page " + (i + 1));
      assert.ok(!/(요|다|세요)$/.test(page.title), tag + " title is a noun phrase: " + page.title);
      page.scenes.forEach((lit, n) => assert.ok(lit > 20, tag + " board scene " + n + " on page " + (i + 1) + " is drawn"));
    });
    assert.equal(pages[3].scenes.length, 5, "every field item is shown on the board");
    assert.equal(pages[5].scenes.length, 4, "every terrain type is shown on the board");
    assert.ok(pages[5].next, "다음 is disabled on the last page when the guide was opened from the menu");
    assert.equal(await ev("document.querySelector('#tutorialScreen').classList.contains('hidden')"), false, "disabled 다음 keeps the guide open");
  }
  assert.deepEqual(errors, []);
  console.log("tutorial browser ok");
} finally {
  await fetch("http://127.0.0.1:9225/json/close/" + target.id);
  ws.close();
}
