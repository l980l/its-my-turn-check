(() => {
  const URL = "https://ganvrpzlsmvbmcilerpq.supabase.co";
  const KEY = "sb_publishable_9VAPG9uz4EonoI_naGXemw_PCGDqOc4";
  const $ = (s) => document.querySelector(s);
  const lobby = $("#lobby"), gameScreen = $("#gameScreen"), endScreen = $("#endScreen"), canvas = $("#coopCanvas"), ctx = canvas.getContext("2d");
  const ui = { host: $("#hostButton"), join: $("#joinButton"), roomInput: $("#roomInput"), status: $("#lobbyStatus"), room: $("#roomCode"), copy: $("#copyButton"), leave: $("#leaveButton"), phase: $("#phaseText"), timer: $("#timerText"), score: $("#scoreText"), hint: $("#actionHint"), end: $("#endText"), back: $("#backToLobby") };
  const client = window.supabase?.createClient(URL, KEY), me = crypto.randomUUID();
  let channel, roomCode, isHost = false, slot, state, timer, joinTimeout, joined = false;
  const PLAN_MS = 1800, COLS = 15, ROWS = 11;

  function code() { return Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join(""); }
  function send(type, payload = {}) { return channel?.send({ type: "broadcast", event: type, payload: { ...payload, from: me } }); }
  function show(which) { [lobby, gameScreen, endScreen].forEach((n) => n.classList.toggle("hidden", n !== which)); ui.leave.hidden = which !== gameScreen; }
  function emptyState() { return { tick: 0, phase: "waiting", deadline: 0, score: 0, players: [], enemies: [], actions: {}, nextEnemy: 1 }; }
  function makePlayers() { return [ { id: me, slot: 0, x: 4, y: 5, piece: "knight", color: "#53f0e4", alive: true, bonus: 0, name: "HOST" }, { id: null, slot: 1, x: 10, y: 5, piece: "bishop", color: "#d66efd", alive: true, bonus: 0, name: "GUEST" } ]; }
  function startHost() { state = emptyState(); state.players = makePlayers(); slot = 0; joined = true; broadcastState(); }
  function broadcastState() { send("state", { state }); }
  function beginPlanning() { if (!state || state.phase === "over") return; state.tick++; state.phase = "planning"; state.deadline = Date.now() + PLAN_MS; state.actions = {}; broadcastState(); clearTimeout(timer); timer = setTimeout(resolveTurn, PLAN_MS + 20); }
  function validMoves(player) { const dirs = player.piece === "knight" ? [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]] : [[1,1],[1,-1],[-1,1],[-1,-1]].flatMap(([x,y]) => [1,2,3].map(n => [x*n,y*n])); return dirs.map(([x,y]) => ({ x: player.x+x,y:player.y+y })).filter(p => p.x >= 0 && p.x < COLS && p.y >= 0 && p.y < ROWS); }
  function resolveTurn() {
    if (!isHost || !state || state.phase !== "planning") return;
    state.phase = "resolve";
    let used = new Set();
    for (const p of state.players.filter(p => p.alive)) {
      const actions = state.actions[p.id] || [];
      const action = actions[0];
      if (!action) continue;
      const allowed = validMoves(p).some(m => m.x === action.x && m.y === action.y);
      const key = action.x + "," + action.y;
      if (!allowed || used.has(key)) continue;
      used.add(key); p.x = action.x; p.y = action.y;
      const targets = state.enemies.filter(e => e.x === p.x && e.y === p.y);
      for (const e of targets) { e.hp--; if (e.hp <= 0) { state.enemies.splice(state.enemies.indexOf(e), 1); state.score += 100; p.bonus = 1; } }
    }
    moveEnemies();
    if (state.players.every(p => !p.alive)) { state.phase = "over"; broadcastState(); return; }
    if (state.tick % 2 === 0 || state.enemies.length < 3) spawnEnemy();
    broadcastState(); setTimeout(beginPlanning, 420);
  }
  function moveEnemies() {
    const occupied = new Set();
    for (const e of state.enemies) {
      const targets = state.players.filter(p => p.alive).sort((a,b) => Math.abs(a.x-e.x)+Math.abs(a.y-e.y)-Math.abs(b.x-e.x)-Math.abs(b.y-e.y));
      const target = targets[0]; if (!target) return;
      let dx = Math.sign(target.x-e.x), dy = Math.sign(target.y-e.y);
      if (e.type === "rook" && (e.x === target.x || e.y === target.y)) { const d = Math.min(3, Math.max(Math.abs(target.x-e.x), Math.abs(target.y-e.y))); dx *= d; dy *= d; }
      let next = { x: e.x + dx, y: e.y + dy }, key = next.x + "," + next.y;
      if (!occupied.has(key)) { e.x = next.x; e.y = next.y; occupied.add(key); }
      for (const p of state.players) if (p.alive && p.x === e.x && p.y === e.y) p.alive = false;
    }
  }
  function spawnEnemy() { const edge = Math.floor(Math.random()*4), n = state.nextEnemy++; let x = edge < 2 ? (edge ? COLS-1 : 0) : Math.floor(Math.random()*COLS), y = edge < 2 ? Math.floor(Math.random()*ROWS) : (edge === 2 ? 0 : ROWS-1); if (state.players.some(p => p.x===x&&p.y===y)) return; state.enemies.push({ id:n, x,y,type: state.tick > 8 && n % 4 === 0 ? "rook" : "pawn", hp: state.tick > 10 && n % 3 === 0 ? 2 : 1 }); }
  function submit(m) { if (!state || state.phase !== "planning" || !slot && slot !== 0) return; const p = state.players[slot]; if (!p?.alive || !validMoves(p).some(v => v.x === m.x && v.y === m.y)) return; if (isHost) { state.actions[me] = [m]; broadcastState(); } else send("intent", { tick: state.tick, move:m }); }
  function enterGame() { show(gameScreen); ui.room.textContent = roomCode; ui.hint.textContent = isHost ? "초대 코드를 친구에게 보내세요. 참가하면 시작됩니다." : "방 상태를 동기화하는 중입니다."; }
  function connect(codeValue, host) {
    if (!client) { ui.status.textContent = "실시간 연결 모듈을 불러오지 못했습니다."; return; }
    roomCode = codeValue; isHost = host; channel = client.channel("coop:" + roomCode, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "hello" }, ({ payload }) => { if (isHost && state && !state.players[1].id) { state.players[1].id = payload.from; state.players[1].name = "ALLY"; send("welcome", { to: payload.from, state }); beginPlanning(); } })
      .on("broadcast", { event: "welcome" }, ({ payload }) => { if (!isHost && payload.to === me) { state = payload.state; slot = 1; joined = true; clearTimeout(joinTimeout); } })
      .on("broadcast", { event: "state" }, ({ payload }) => { if (!isHost) state = payload.state; })
      .on("broadcast", { event: "host-left" }, () => { if (!isHost && state) { clearTimeout(timer); state.phase = "over"; ui.end.textContent = "방장이 방을 나갔습니다. 새 방을 만들어 다시 시작하세요."; show(endScreen); } })
      .on("broadcast", { event: "intent" }, ({ payload }) => { if (isHost && state?.phase === "planning" && payload.tick === state.tick && state.players.some(p => p.id === payload.from && p.alive)) { state.actions[payload.from] = [payload.move]; broadcastState(); } })
      .subscribe((status) => { if (status !== "SUBSCRIBED") return; enterGame(); if (isHost) startHost(); else { send("hello"); joinTimeout = setTimeout(() => { if (!joined) { channel?.unsubscribe(); channel = null; show(lobby); ui.status.textContent = "방을 찾지 못했습니다. 코드를 확인하거나 방장에게 다시 열어 달라고 하세요."; } }, 6000); } });
  }
  function draw() {
    requestAnimationFrame(draw); if (!state || gameScreen.classList.contains("hidden")) return;
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), cw = Math.floor(rect.width*dpr), ch = Math.floor(rect.height*dpr); if (canvas.width !== cw || canvas.height !== ch) { canvas.width=cw; canvas.height=ch; }
    ctx.setTransform(dpr,0,0,dpr,0,0); const w=rect.width,h=rect.height, cell=Math.min(w/COLS,h/ROWS), ox=(w-COLS*cell)/2,oy=(h-ROWS*cell)/2;
    ctx.clearRect(0,0,w,h); ctx.fillStyle="#0b0d22";ctx.fillRect(0,0,w,h);
    for(let x=0;x<=COLS;x++){ctx.strokeStyle="#41416b";ctx.globalAlpha=.42;ctx.beginPath();ctx.moveTo(ox+x*cell,oy);ctx.lineTo(ox+x*cell,oy+ROWS*cell);ctx.stroke();} for(let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(ox,oy+y*cell);ctx.lineTo(ox+COLS*cell,oy+y*cell);ctx.stroke();} ctx.globalAlpha=1;
    const active=state.players?.[slot]; if(state.phase==="planning"&&active?.alive){for(const m of validMoves(active)){ctx.fillStyle="rgba(83,240,228,.18)";ctx.fillRect(ox+m.x*cell+3,oy+m.y*cell+3,cell-6,cell-6);}}
    for(const e of state.enemies||[]){piece(e.x,e.y,e.type==="rook"?"♜":"♟","#ff4d6d",e.hp,ox,oy,cell);}
    for(const p of state.players||[]){if(p.alive)piece(p.x,p.y,p.piece==="knight"?"♞":"♝",p.color,p.bonus?"+1":"",ox,oy,cell);}
    ui.score.textContent=(state.score||0).toLocaleString(); if(state.phase==="over"){ui.end.textContent="팀 점수 "+state.score.toLocaleString()+"점 · 다음 수는 더 멀리 보세요."; show(endScreen); return;} if(state.phase==="waiting"){ui.phase.textContent="WAITING";ui.timer.textContent="…";} else {const left=Math.max(0,state.deadline-Date.now());ui.phase.textContent=state.phase==="planning"?"CHOOSE TOGETHER":"RESOLVING";ui.timer.textContent=(left/1000).toFixed(1)+"s"; const mine=state.actions?.[me];ui.hint.textContent=mine?"수 선택 완료 — 동료를 기다리는 중입니다.":"빛나는 칸 하나를 선택하세요.";}
  }
  function piece(x,y,glyph,color,mark,ox,oy,cell){const cx=ox+(x+.5)*cell,cy=oy+(y+.5)*cell;ctx.save();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=18;ctx.font="700 "+Math.max(22,cell*.58)+"px Georgia";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(glyph,cx,cy);if(mark){ctx.font="700 "+Math.max(9,cell*.16)+"px monospace";ctx.fillText(mark,cx,cy+cell*.33)}ctx.restore();}
  canvas.addEventListener("pointerdown", (ev)=>{if(!state||state.phase!=="planning")return;const r=canvas.getBoundingClientRect(),cell=Math.min(r.width/COLS,r.height/ROWS),ox=(r.width-COLS*cell)/2,oy=(r.height-ROWS*cell)/2;submit({x:Math.floor((ev.clientX-r.left-ox)/cell),y:Math.floor((ev.clientY-r.top-oy)/cell)});});
  async function leaveRoom(message = "방에서 나왔습니다.") { clearTimeout(timer); clearTimeout(joinTimeout); if (isHost && channel) { await send("host-left"); await new Promise((resolve) => setTimeout(resolve, 90)); } channel?.unsubscribe(); channel = null; state = null; show(lobby); ui.status.textContent = message; }
  ui.host.addEventListener("click",()=>{ joined = false; slot = null; connect(code(),true); }); ui.join.addEventListener("click",()=>{const value=ui.roomInput.value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(value)){ui.status.textContent="6자리 초대 코드를 입력하세요.";return;}joined = false; slot = null; connect(value,false);}); ui.copy.addEventListener("click",async()=>{await navigator.clipboard?.writeText(roomCode);ui.copy.textContent="COPIED";setTimeout(()=>ui.copy.textContent="COPY",900);}); ui.leave.addEventListener("click",()=>leaveRoom()); ui.back.addEventListener("click",()=>leaveRoom("새 방을 만들 준비가 됐습니다.")); draw();
})();
