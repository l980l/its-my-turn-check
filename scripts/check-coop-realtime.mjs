// Manual check against the real Supabase Realtime project (not part of the test suite).
// Usage: node scripts/check-coop-realtime.mjs http://127.0.0.1:8010 [game|pick]
// Needs headless Chrome on CDP port 9225 and network access. Two tabs create and
// join a room, play with AUTO, then lose and regain the network on each side.
// Edge Function calls are faked, so no ranking ticket or row is written to the DB.
const base = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function page(name) {
  const target = await (await fetch("http://127.0.0.1:9225/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let serial = 0; const pending = new Map(), errs = [];
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
    if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails.exception?.description?.slice(0, 200)); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? "EXC " + r.exceptionDetails.exception?.description?.slice(0, 150) : r.result.value; };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable"); await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `{const real=window.fetch;window.fetch=async(url,o)=>String(url).includes("/functions/v1/")?new Response(JSON.stringify({runId:"real-check-"+Math.random(),runToken:"t",ok:true}),{status:200}):real(url,o);}` });
  await send("Page.navigate", { url: base + "/coop.html" });
  for (let i = 0; i < 200; i++) { if (await ev("Boolean(window.supabase&&document.querySelector('#coopFrame0')?.contentWindow?.CoopGame)")) break; await wait(50); }
  const offline = v => send("Network.emulateNetworkConditions", { offline: v, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const state = () => ev(`(()=>{const n=document.querySelector('#netStatus'),e=document.querySelector('#coopFrame0').contentWindow.CoopGame;return {screen:document.querySelector('#coopApp').dataset.screen,net:n.hidden?null:n.textContent,phase:document.querySelector('#phaseText').textContent,hint:document.querySelector('#actionHint').textContent.slice(0,40),wave:e.snapshot?.().world?.wave,lobby:document.querySelector('#lobbyStatus').textContent,pick:document.querySelector('#pickScreen').hidden?null:[...document.querySelectorAll('#pickPlayers li')].map(l=>l.textContent).join(" / ")}})()`);
  return { name, ev, send, offline, state, errs, close: () => fetch("http://127.0.0.1:9225/json/close/" + target.id) };
}
const show = async (...ps) => { for (const p of ps) log(p.name, JSON.stringify(await p.state())); };
async function join(a, b) {
  await a.ev("document.querySelector('#hostButton').click()");
  for (let i = 0; i < 200 && !/^[A-Z2-9]{6}$/.test(await a.ev("document.querySelector('#roomCode').textContent")); i++) await wait(50);
  const code = await a.ev("document.querySelector('#roomCode').textContent"); log("room", code);
  await wait(800);
  await b.ev(`document.querySelector('#roomInput').value='${code}';document.querySelector('#joinForm').requestSubmit()`);
  // Joined once the guest has the host's room reply and its ready button is live.
  for (let i = 0; i < 160 && await b.ev("document.querySelector('#pickReady').disabled"); i++) await wait(50);
  return code;
}
const scenario = process.argv[3] || "game";
const a = await page("A(host)"), b = await page("B(guest)");
try {
  if (scenario === "pick") {
    await join(a, b); await show(a, b);
    log("guest offline in pick"); await b.offline(true); await wait(7000); await show(a, b);
    await b.offline(false); await wait(3000); await show(a, b);
  } else {
    const t0 = Date.now(); await join(a, b); log("joined in", Date.now() - t0, "ms"); await show(a, b);
    for (const p of [a, b]) { await p.ev("document.querySelector('.pick-choice').click()"); await wait(700); }
    log("ready buttons", JSON.stringify(await Promise.all([a, b].map(p => p.ev("({disabled:document.querySelector('#pickReady').disabled,text:document.querySelector('#pickReady').textContent})")))));
    for (const p of [a, b]) { await p.ev("document.querySelector('#pickReady').click()"); await wait(1200); }
    for (let i = 0; i < 100 && (await a.state()).pick; i++) await wait(100);
    log("run started:", !(await a.state()).pick); await show(a, b); for (const p of [a, b]) await p.ev("document.querySelector('#autoButton').click()");
    await wait(8000); await show(a, b);
    log("guest offline 10s"); await b.offline(true); await wait(10000); await show(a, b);
    log("guest back online"); await b.offline(false); await wait(10000); await show(a, b);
    log("host offline 10s"); await a.offline(true); await wait(10000); await show(a, b);
    log("host back online"); await a.offline(false); await wait(12000); await show(a, b);
  }
  log("errors", JSON.stringify([a.errs, b.errs]));
} finally { await a.close(); await b.close(); process.exit(0); }
