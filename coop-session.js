(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CoopSession = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  // Transport-independent authority. Combat, rewards and legal moves belong to
  // the existing single-player runtime; this module only orders two players.
  // Players take turns, P1 then P2 every wave, and keep the turn through kill
  // chains like solo. Rooms are played with friends, so a turn has no
  // time limit by default (planMs 0); a player who drops is moved by AUTO.
  // planMs > 0 restores a selection window that passes the turn when it runs out.
  const PLAN_MS = 0;
  function create(engine, changed = () => {}, now = () => Date.now(), { planMs = PLAN_MS } = {}) {
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
      engine.players().forEach((p,i)=>{
        if(!p.alive&&!deaths[i])deaths[i]={reason:p.deathReason||"적에게 잡혔습니다",wave:game.world.wave,frames:structuredClone(history)};
        else if(p.alive&&deaths[i])deaths[i]=null; // revived: a later death records a fresh replay
      });
    }
    function planning(slot) {
      flow.phase = "planning"; flow.actor = null; flow.current = slot; flow.eligible = [slot];
      flow.roundId = ++round; delete flow.actions[slot]; flow.hint = null;
      schedule(planMs); notify();
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
      // The risk contract is a team vote: every survivor answers, and it is
      // accepted only when all of them accept.
      if (engine.pending()?.kind === "risk") { flow.phase = "risk"; flow.actor = engine.pending().slot; flow.voters = alive(); flow.votes = {}; notify(); return; }
      flow.queue = [0, 1]; nextTurn();
    }
    function enemy() { flow.actions = {}; flow.lead = 0; engine.enemyTurn();remember("적 이동");afterEnemy(); }
    function vote(slot, accept) {
      if (!flow.voters.includes(slot)) return false;
      flow.votes[slot] = Boolean(accept);
      if (!flow.voters.every(i => i in flow.votes)) { notify(); return true; }
      const accepted = flow.voters.every(i => flow.votes[i]);
      flow.voters = []; flow.votes = {};
      if (!engine.choose(flow.actor, accepted, "risk")) return false;
      afterEnemy(); return true;
    }
    function completed(result) {
      flow.retained = Boolean(result.retained);
      flow.phase = "acting"; flow.stage = "follow"; schedule(340); notify();
    }
    function update(time = now()) {
      if (!flow || paused || time < flow.deadline) return;
      if (flow.phase === "planning") {
        const slot = flow.current, move = flow.actions[slot];
        // Timed out, or the player fell meanwhile: the turn passes. Untimed: keep waiting.
        if (!move) { if (flow.duration || !engine.players()[slot]?.alive) nextTurn(); return; }
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
      start(pieces) { flow = { phase:"waiting", revision:0, actor:null, current:null, lead:0, eligible:[], actions:{}, queue:[], roundId:0, deadline:0, duration:planMs, voters:[], votes:{}, hint:null }; speed=1;paused=false;round=0;history=[];deaths=[null,null];engine.start(pieces);remember("시작");enemy(); },
      // Take over authority from the last state another device published, e.g.
      // when the host left. Moves in flight are re-planned; replay frames restart.
      resume(saved, savedDeaths = [null,null]) {
        flow = structuredClone(saved); flow.actions ||= {}; flow.voters ||= []; flow.votes ||= {}; speed=1;paused=false;round=flow.roundId;history=[];deaths=structuredClone(savedDeaths);
        remember("이어받음");
        if (flow.phase === "planning") planning(flow.current);
        else if (flow.phase === "acting") { if (flow.stage === "follow" && !flow.retained) nextTurn(); else planning(flow.actor); }
        else if (flow.phase === "enemy") { schedule(420); notify(); }
        else notify();
      },
      flow: () => flow,
      replays: () => deaths,
      move(slot, move, roundId) {
        if (!flow || flow.phase !== "planning" || roundId !== flow.roundId || !flow.eligible.includes(slot) || (!paused && flow.duration && now() >= flow.deadline)) return false;
        if (!move || !engine.moves(slot).some(m => m.x === move.x && m.y === move.y)) return false;
        // A submitted move resolves at once; the rest of the window is not waited out.
        flow.actions[slot] = {x:move.x,y:move.y}; flow.deadline = now(); remaining = 0; notify(); return true;
      },
      choose(slot, index, kind = "upgrade") {
        if (flow?.phase === "risk") return kind === "risk" && vote(slot, index);
        if (!flow || flow.actor !== slot || flow.phase !== "upgrade") return false;
        const result = engine.choose(slot, index, kind);
        if (!result) return false;
        if (result.pending) notify();
        else if (flow.debugPending) {flow.debugPending=false;if(flow.current!=null)planning(flow.current);else nextTurn();}
        else completed(result);
        return true;
      },
      // The watching teammate's tap on a reward card, shown to the chooser.
      recommend(slot, index) {
        if (!flow || flow.phase !== "upgrade" || flow.actor === slot || !engine.recommend?.(slot, index)) return false;
        notify(); return true;
      },
      // The watching teammate taps one of the planner's moves as a suggestion; the
      // same cell again withdraws it. It lapses when the planner's turn ends.
      hint(slot, move, roundId) {
        if (!flow || flow.phase !== "planning" || roundId !== flow.roundId || flow.current === slot || !move) return false;
        if (!engine.moves(flow.current).some(m => m.x === move.x && m.y === move.y)) return false;
        flow.hint = flow.hint?.slot === slot && flow.hint.x === move.x && flow.hint.y === move.y ? null : {slot, x:move.x, y:move.y};
        notify(); return true;
      },
      update,
      // A move already resolving stays: engine.act rechecks it against the new board.
      debug(action,value,slot) { engine.debug(action,value,slot); if(engine.pending()){flow.phase="upgrade";flow.actor=slot;flow.debugPending=true;}if(flow.phase!=="acting")delete flow.actions[slot];notify(); },
      pause(value) { if (!flow || paused===value) return; if(value) remaining=Math.max(0,flow.deadline-now()); else flow.deadline=now()+remaining; paused=value;notify(); },
      paused: () => paused,
      speed(value) { if(![1,2,4,8,16].includes(value)||!flow)return;remaining=(paused?remaining:Math.max(0,flow.deadline-now()))*speed/value;flow.duration*=speed/value;speed=value;flow.deadline=now()+remaining;notify(); },
      timeLeft: () => paused ? remaining : Math.max(0,(flow?.deadline||0)-now()),
      // DEV "다음 단계": an untimed turn nobody has answered is passed on.
      step() { if(!flow)return;if(flow.phase==="planning"&&!flow.duration&&!flow.actions[flow.current]){nextTurn();return;}const was=paused;paused=false;update(flow.deadline);paused=was;remaining=flow.duration; },
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
