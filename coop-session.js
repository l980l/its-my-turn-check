(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CoopSession = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  // Transport-independent authority. Combat, rewards and legal moves belong to
  // the existing single-player runtime; this module only orders two players.
  // Players take turns: each gets its own selection window, keeps it through
  // kill chains like solo, and the lead alternates every wave.
  const PLAN_MS = 1800;
  function create(engine, changed = () => {}, now = () => Date.now()) {
    let flow, speed = 1, paused = false, remaining = 0, round = 0, waves = 0, history=[], deaths=[null,null];
    const alive = () => engine.players().map((p, i) => p.alive ? i : -1).filter(i => i >= 0);
    const notify = () => { flow.revision++; changed(); };
    const schedule = (duration) => { flow.duration = duration / speed; flow.deadline = now() + flow.duration; remaining = flow.duration; };
    function remember(label,actor=null) {
      if(!engine.snapshot)return;
      const game=engine.snapshot();
      // Replays retain board state and paths, not transient particles/timers.
      game.world.particles=[];game.world.effects=[];
      if(!game.world.trail?.length&&history.length)game.world.trail=structuredClone(history.at(-1).game.world.trail||[]);
      history.push({label,actor,game});
      if(history.length>11)history.shift(); // ten resolved actions plus their preceding scene
      engine.players().forEach((p,i)=>{
        if(!p.alive&&!deaths[i])deaths[i]={reason:p.deathReason||"적에게 잡혔습니다",wave:game.world.wave,frames:structuredClone(history)};
        else if(p.alive&&deaths[i])deaths[i]=null; // revived: a later death records a fresh replay
      });
    }
    function planning(slot) {
      flow.phase = "planning"; flow.actor = null; flow.current = slot; flow.eligible = [slot];
      flow.roundId = ++round; delete flow.actions[slot];
      schedule(PLAN_MS); notify();
    }
    function nextTurn() {
      while (flow.queue.length) {
        const slot = flow.queue.shift();
        if (engine.players()[slot]?.alive && engine.moves(slot).length) { planning(slot); return; }
      }
      flow.phase = "enemy"; flow.actor = null; flow.current = null; flow.eligible = []; schedule(420); notify();
    }
    function afterEnemy() {
      if (!alive().length) { flow.phase = "over"; notify(); return; }
      if (engine.pending()?.kind === "risk") { flow.phase = "risk"; flow.actor = engine.pending().slot; notify(); return; }
      flow.queue = [flow.lead, 1 - flow.lead]; nextTurn();
    }
    function enemy() { flow.actions = {}; flow.lead = waves++ % 2; engine.enemyTurn();remember("적 이동");afterEnemy(); }
    function completed(result) {
      flow.retained = Boolean(result.retained);
      flow.phase = "acting"; flow.stage = "follow"; schedule(340); notify();
    }
    function update(time = now()) {
      if (!flow || paused || time < flow.deadline) return;
      if (flow.phase === "planning") {
        const slot = flow.current, move = flow.actions[slot];
        if (!move) nextTurn(); // timed out: the turn passes without a move
        else if (!engine.moves(slot).some(m => m.x === move.x && m.y === move.y)) planning(slot);
        else { flow.actor = slot; flow.phase = "acting"; flow.stage = "focus"; schedule(220); notify(); }
      } else if (flow.phase === "acting") {
        if (flow.stage === "focus") {
          const result = engine.act(flow.actor, flow.actions[flow.actor]);
          remember("P"+(flow.actor+1)+" 이동",flow.actor);
          if (result.pending) { flow.phase = "upgrade"; notify(); }
          else completed(result);
        } else if (flow.retained) planning(flow.actor);
        else nextTurn();
      } else if (flow.phase === "enemy") enemy();
    }
    return {
      start() { flow = { phase:"waiting", revision:0, actor:null, current:null, lead:0, eligible:[], actions:{}, queue:[], roundId:0, deadline:0, duration:PLAN_MS }; speed=1;paused=false;round=0;waves=0;history=[];deaths=[null,null];engine.start();remember("시작");enemy(); },
      flow: () => flow,
      replays: () => deaths,
      move(slot, move, roundId) {
        if (!flow || flow.phase !== "planning" || roundId !== flow.roundId || !flow.eligible.includes(slot) || (!paused && now() >= flow.deadline)) return false;
        if (!move || !engine.moves(slot).some(m => m.x === move.x && m.y === move.y)) return false;
        // A submitted move resolves at once; the rest of the window is not waited out.
        flow.actions[slot] = {x:move.x,y:move.y}; flow.deadline = now(); remaining = 0; notify(); return true;
      },
      choose(slot, index, kind = "upgrade") {
        if (!flow || flow.actor !== slot || !["upgrade","risk"].includes(flow.phase)) return false;
        const result = engine.choose(slot, index, kind);
        if (!result) return false;
        if (flow.phase === "risk") afterEnemy();
        else if (result.pending) notify();
        else if (flow.debugPending) {flow.debugPending=false;if(flow.current!=null)planning(flow.current);else nextTurn();}
        else completed(result);
        return true;
      },
      update,
      debug(action,value,slot) { engine.debug(action,value,slot); if(engine.pending()){flow.phase="upgrade";flow.actor=slot;flow.debugPending=true;}delete flow.actions[slot];notify(); },
      pause(value) { if (!flow || paused===value) return; if(value) remaining=Math.max(0,flow.deadline-now()); else flow.deadline=now()+remaining; paused=value;notify(); },
      paused: () => paused,
      speed(value) { if(![1,2,3,4].includes(value)||!flow)return;remaining=(paused?remaining:Math.max(0,flow.deadline-now()))*speed/value;flow.duration*=speed/value;speed=value;flow.deadline=now()+remaining;notify(); },
      timeLeft: () => paused ? remaining : Math.max(0,(flow?.deadline||0)-now()),
      step() { if(!flow)return;const was=paused;paused=false;update(flow.deadline);paused=was;remaining=flow.duration; },
    };
  }
  // Local-only camera preference: never part of the authoritative room state.
  function createCamera(view) {
    let focus=view, manual=null, selecting=false;
    return {
      update(flow,players) {
        const canSelect=flow.phase==="planning"&&flow.eligible.includes(view)&&players[view]?.alive;
        if(canSelect&&!selecting)manual=null;
        selecting=Boolean(canSelect);
        if(manual!=null&&!players[manual]?.alive)manual=null;
        if(manual!=null)focus=manual;
        else if(selecting)focus=view;
        else if(flow.actor!=null&&players[flow.actor]?.alive)focus=flow.actor;
        else if(flow.phase==="planning")focus=flow.eligible.find(i=>players[i]?.alive)??view;
        else if(!players[focus]?.alive)focus=players.findIndex(p=>p.alive);
        if(focus<0)focus=view;
        return {focus,selecting,canToggle:Boolean(players[view]?.alive&&players[1-view]?.alive)};
      },
      toggle(players) {if(!players[view]?.alive||!players[1-view]?.alive)return false;manual=focus===view?1-view:view;focus=manual;return true;},
      reset() {focus=view;manual=null;selecting=false;},
    };
  }
  return {create,createCamera};
});
