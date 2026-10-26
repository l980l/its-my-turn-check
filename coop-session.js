(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CoopSession = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  // Transport-independent authority. Combat, rewards and legal moves belong to
  // the existing single-player runtime; this module only orders two players.
  function create(engine, changed = () => {}, now = () => Date.now()) {
    let flow, speed = 1, paused = false, remaining = 0, round = 0, history=[], deaths=[null,null];
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
      engine.players().forEach((p,i)=>{if(!p.alive&&!deaths[i])deaths[i]={reason:p.deathReason||"적에게 잡혔습니다",wave:game.world.wave,frames:structuredClone(history)};});
    }
    function planning(slots, resume = false) {
      flow.phase = "planning"; flow.actor = null; flow.eligible = slots.filter(i => engine.players()[i].alive);
      flow.roundId = ++round; flow.resume = resume;
      for (const i of flow.eligible) delete flow.actions[i];
      schedule(1800); notify();
    }
    function afterEnemy() {
      if (!alive().length) { flow.phase = "over"; notify(); return; }
      if (engine.pending()?.kind === "risk") { flow.phase = "risk"; flow.actor = engine.pending().slot; notify(); return; }
      planning(alive());
    }
    function enemy() { flow.actions = {}; flow.next = []; engine.enemyTurn();remember("적 이동");afterEnemy(); }
    function next() {
      while (flow.queue.length) {
        const slot = flow.queue.shift();
        if (!engine.players()[slot]?.alive || !flow.actions[slot]) continue;
        const move = flow.actions[slot];
        if (!engine.moves(slot).some(m => m.x === move.x && m.y === move.y)) {
          if (!engine.moves(slot).length) continue;
          flow.queue.unshift(slot); planning([slot], true); return;
        }
        flow.actor = slot; flow.phase = "acting"; flow.stage = "focus"; schedule(220); notify(); return;
      }
      if (flow.next.length) { const slots = [...new Set(flow.next)]; flow.next = []; planning(slots); }
      else { flow.phase = "enemy"; flow.actor = null; schedule(420); notify(); }
    }
    function completed(result) {
      if (result.retained) flow.next.push(flow.actor);
      flow.phase = "acting"; flow.stage = "follow"; schedule(340); notify();
    }
    function update(time = now()) {
      if (!flow || paused || time < flow.deadline) return;
      if (flow.phase === "planning") {
        if (!flow.resume) flow.queue = [...flow.eligible].sort((a, b) => a-b);
        next();
      } else if (flow.phase === "acting") {
        if (flow.stage === "focus") {
          const result = engine.act(flow.actor, flow.actions[flow.actor]);
          remember("P"+(flow.actor+1)+" 이동",flow.actor);
          if (result.pending) { flow.phase = "upgrade"; notify(); }
          else completed(result);
        } else next();
      } else if (flow.phase === "enemy") enemy();
    }
    return {
      start() { flow = { phase:"waiting", revision:0, actor:null, eligible:[], actions:{}, queue:[], next:[], roundId:0, deadline:0, duration:1800 }; speed=1;paused=false;round=0;history=[];deaths=[null,null];engine.start();remember("시작");enemy(); },
      flow: () => flow,
      replays: () => deaths,
      move(slot, move, roundId) {
        if (!flow || flow.phase !== "planning" || roundId !== flow.roundId || !flow.eligible.includes(slot) || (!paused && now() >= flow.deadline)) return false;
        if (!move || !engine.moves(slot).some(m => m.x === move.x && m.y === move.y)) return false;
        flow.actions[slot] = {x:move.x,y:move.y}; notify(); return true;
      },
      choose(slot, index, kind = "upgrade") {
        if (!flow || flow.actor !== slot || !["upgrade","risk"].includes(flow.phase)) return false;
        const result = engine.choose(slot, index, kind);
        if (!result) return false;
        if (flow.phase === "risk") afterEnemy();
        else if (result.pending) notify();
        else if (flow.debugPending) {flow.debugPending=false;planning(alive());}
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
