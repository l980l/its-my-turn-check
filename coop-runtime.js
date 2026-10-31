(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CoopRuntime = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  const fields = ["chain","displayChain","grace","invincibleBeats","rangeBoostMoves","extendedMoves","traitRerolls","relayMoves","relayBoost"];
  // With teamTraits both players share one XP bar, level and trait set (co-op catalog only).
  const TEAM = ["xp","rank","traits","traitLevels","traitXp","mastered"];
  // Co-op tuning, measured by scripts/simulate-coop-balance.cjs.
  const BALANCE = Object.freeze({spawnScale:1,reviveCooldown:30,teamTraits:true,xpScale:2,traitCatalog:"coop"});
  function create({S, ui, fn, executing}) {
    const clock=()=>fn.now();
    // The game's own RNG, so seeded harness runs stay reproducible.
    const random=()=>fn.random();
    const api = { roster:[], turns:[], view:0, focus:0, interactive:false, onInput:()=>{}, pendingOwner:null, suspended:true, balance:{...BALANCE} };
    const save = slot => { if(slot>=0)api.turns[slot]=Object.fromEntries(fields.map(key=>[key,S[key]])); };
    function use(slot, operation) {
      const previous = api.roster.indexOf(S.player); save(previous);
      S.player=api.roster[slot];Object.assign(S,api.turns[slot]);
      const rank=S.player.rank;
      try { executing(true);return operation(); }
      finally { save(slot); executing(false); shareProgress(slot,rank); if(previous>=0){S.player=api.roster[previous];Object.assign(S,api.turns[previous]);} }
    }
    // The acting player's progress is the team's. The first team level promotes
    // every pawn, since a promotion offers a single random piece anyway.
    function shareProgress(slot,rankBefore) {
      const source=api.roster[slot];if(!api.balance.teamTraits||!source)return;
      for(const p of api.roster){
        if(p===source)continue;
        for(const key of TEAM)p[key]=copy(source[key]??(key==="xp"||key==="rank"?0:{}));
        if(rankBefore===0&&source.rank>0&&p.piece==="pawn"){const pieces=["knight","bishop","rook","queen","king"];p.piece=pieces[Math.floor(random()*pieces.length)];}
      }
    }
    const teamRule = kind => api.balance.teamTraits&&S.player?fn.traits.coopRule(S.player.traits,S.player.traitLevels,kind,S.player.mastered):null;
    const teamSynergy = (p,id) => api.balance.teamTraits&&p&&fn.traits.hasSynergy(p.traits,id);
    const ally = () => api.roster.find(p=>p!==S.player&&p.alive);
    // Where the ally stands, or where it fell: positional team traits keep working alone.
    const anchor = () => S.player?.alive?api.roster.find(p=>p!==S.player)||null:null;
    api.anchor = anchor;
    api.castleTarget = () => { const rule=teamRule("castling"),a=ally();return rule&&a&&(S.coopCastleReady||0)<=S.wave?{x:a.x,y:a.y}:null; };
    api.castle = from => { const rule=teamRule("castling"),a=ally();if(!rule||!a)return null;a.x=from.x;a.y=from.y;S.coopCastleReady=S.wave+rule.cooldown;return a; };
    api.rallyStride = () => { const rule=teamRule("rally"),a=anchor();return rule&&a&&Math.max(Math.abs(a.x-S.player.x),Math.abs(a.y-S.player.y))<=rule.reach?rule.bonus:0; };
    // Join: empty cells next to the ally, offered as extra moves while off cooldown.
    api.joinTargets = () => {
      const rule=teamRule("join"),a=ally();if(!rule||!a||(S.coopJoinReady||0)>S.wave)return [];
      const cells=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=a.x+dx,y=a.y+dy;
        if((dx||dy)&&!(x===S.player.x&&y===S.player.y)&&!fn.terrainAt(x,y)&&!S.enemies.some(e=>e.x===x&&e.y===y))cells.push({x,y});}
      return cells;
    };
    api.join = () => { const rule=teamRule("join");if(rule)S.coopJoinReady=S.wave+rule.cooldown;if(teamSynergy(S.player,"escortJoin"))S.coopGuardReady=0; };
    api.relay = () => {
      const rule=teamRule("relay"),a=ally();if(!rule||!a)return false;
      const t=api.turns[api.roster.indexOf(a)];t.relayMoves=Math.max(t.relayMoves||0,rule.moves);t.relayBoost=rule.boost;return true;
    };
    api.ally = ally;
    function refresh() {
      if(!api.roster.length)return;
      const slot=Math.min(api.view,api.roster.length-1);
      save(api.roster.indexOf(S.player));S.player=api.roster[slot];Object.assign(S,api.turns[slot]);
      fn.moves();fn.hud();
      ui.upgrade.classList.toggle("hidden",S.phase!=="upgrade"||api.pendingOwner!==slot);
      ui.risk.classList.toggle("hidden",S.phase!=="risk"||api.pendingOwner!==slot);
      if(S.phase==="upgrade"&&api.pendingOwner===slot)fn.renderChoices();
    }
    api.players = () => api.roster;
    Object.defineProperty(api,"catalog",{get:()=>!api.balance.teamTraits?fn.catalog:fn.traits.catalogOf(api.balance.traitCatalog).map(t=>({id:t.id,name:t.name}))});
    api.audio = () => fn.audio();
    api.choiceReady = () => clock()>=(S.upgradeLock||0);
    api.request = message => { if(api.interactive||message.type!=="move")api.onInput({...message,slot:api.view}); };
    api.start = () => {
      api.suspended=false;api.replaying=false;
      api.roster=[];api.turns=[];fn.reset();S.coopSpawnCarry=0;S.coopReviveReady=S.coopGuardReady=S.coopCastleReady=S.coopJoinReady=0;S.running=true;S.autoPlay=false;S.dev=false;S.runTicket=null;
      const original=copy(S.player); const defaults=Object.fromEntries(fields.map(key=>[key,S[key]]));
      api.roster=[{...copy(original),x:-2,y:0,alive:true},{...copy(original),x:2,y:0,alive:true}];
      api.turns=[copy(defaults),copy(defaults)];S.player=api.roster[0];api.view=0;api.focus=0;api.pendingOwner=null;
      S.camera={x:-2,y:0};ui.start.classList.add("hidden");ui.over.classList.add("hidden");refresh();
    };
    api.moves = slot => !api.roster[slot]?.alive ? [] : use(slot,()=>{fn.moves();return copy(S.moves);});
    api.act = (slot,move) => {
      if(!api.moves(slot).some(m=>m.x===move.x&&m.y===move.y))return {retained:false,pending:false};
      const result=use(slot,()=>{S.phase="player";fn.playerMove(move);return {retained:S.phase==="player",pending:S.phase==="upgrade"};});
      api.pendingOwner=result.pending?slot:null;refresh();return result;
    };
    api.pending = () => api.pendingOwner==null ? null : {slot:api.pendingOwner,kind:S.phase==="risk"?"risk":"upgrade"};
    api.choose = (slot,index,kind) => {
      if(slot!==api.pendingOwner)return null;
      let accepted=false;
      const result=use(slot,()=>{
        if(S.phase==="risk"&&kind==="risk"){fn.resolveRisk(Boolean(index));accepted=true;}
        else if(S.phase==="upgrade"&&clock()>=(S.upgradeLock||0)){
          if(kind==="reroll")fn.rerollTraits();else if(Number.isInteger(index)&&S.upgradeOptions[index])fn.chooseUpgrade(index);else return null;
          accepted=true;
        }
        return {pending:S.phase==="upgrade",retained:S.phase==="player"};
      });
      if(!accepted)return null;
      if(!result.pending)api.pendingOwner=null;refresh();return result;
    };
    api.auto = slot => use(slot,()=>{
      const previousPhase=S.phase,previousAuto=S.autoPlay,previousInput=api.onInput,previousInteractive=api.interactive;
      let selected=null;api.onInput=m=>{if(m.type==="move")selected={x:m.move.x,y:m.move.y};};
      try { executing(false);api.interactive=true;S.phase="player";S.autoPlay=true;fn.moves();fn.autoMove();return selected; }
      finally {api.onInput=previousInput;api.interactive=previousInteractive;S.phase=previousPhase;S.autoPlay=previousAuto;executing(true);}
    });
    // A revived ally keeps its piece, rank and traits and is briefly uncapturable.
    // After a revive the next one waits balance.reviveCooldown waves.
    const REVIVE_GRACE = 2;
    api.fallenAlly = () => {
      const i=api.roster.findIndex(p=>p!==S.player&&!p.alive);
      return i>=0&&S.player.alive?{slot:i,label:"P"+(i+1),wait:Math.max(0,(S.coopReviveReady||0)-S.wave)}:null;
    };
    api.reviveAlly = () => {
      const fallen=api.fallenAlly();if(!fallen||fallen.wait>0)return null;
      const ally=api.roster[fallen.slot],me=S.player,taken=(x,y)=>fn.terrainAt(x,y)||S.enemies.some(e=>e.x===x&&e.y===y)||(me.x===x&&me.y===y);
      let cell=null;
      for(let r=1;r<=6&&!cell;r++)for(let dy=-r;dy<=r&&!cell;dy++)for(let dx=-r;dx<=r&&!cell;dx++)
        if(Math.max(Math.abs(dx),Math.abs(dy))===r&&!taken(me.x+dx,me.y+dy))cell={x:me.x+dx,y:me.y+dy};
      cell||={x:me.x,y:me.y+4};
      ally.x=cell.x;ally.y=cell.y;ally.alive=true;delete ally.deathReason;
      api.turns[fallen.slot].grace=Math.max(api.turns[fallen.slot].grace||0,REVIVE_GRACE);
      S.coopReviveReady=S.wave+api.balance.reviveCooldown;
      return {slot:fallen.slot,label:fallen.label,x:ally.x,y:ally.y};
    };
    const kill = (slot,reason) => { const p=api.roster[slot];if(!p?.alive)return;p.alive=false;p.deathReason=reason;fn.deathBurst(p.x,p.y); };
    api.enemyTurn = () => {
      save(api.roster.indexOf(S.player));
      S.wave++;S.elapsed=0;S.trail=[];S.enemyTrail=[];S.displayChain=S.chain=0;
      clearTimeout(S.comboStepTimer);clearTimeout(S.comboHideTimer);ui.combo.classList.remove("show");
      S.itemCooldown=Math.max(0,S.itemCooldown-1);S.items=S.items.filter(item=>--item.life>0);
      const hazards=S.emberHazards.filter(h=>h.detonateWave<=S.wave);S.emberHazards=S.emberHazards.filter(h=>h.detonateWave>S.wave);
      const protectedSlots=api.turns.map(t=>t.invincibleBeats>0||t.grace>0);
      api.turns.forEach(t=>{t.chain=t.displayChain=0;t.invincibleBeats=Math.max(0,t.invincibleBeats-1);t.grace=Math.max(0,t.grace-1);});
      Object.assign(S,api.turns[api.roster.indexOf(S.player)]);
      api.roster.forEach((p,i)=>{if(!protectedSlots[i]&&hazards.some(h=>h.x===p.x&&h.y===p.y))kill(i,"잔불 폭발");});
      const live=()=>api.roster.map((p,i)=>({p,i})).filter(({p})=>p.alive);
      const nearest=e=>live().sort((a,b)=>Math.abs(a.p.x-e.x)+Math.abs(a.p.y-e.y)-Math.abs(b.p.x-e.x)-Math.abs(b.p.y-e.y))[0];
      const boss=fn.boss();
      if(boss&&live().length){
        const before=boss.bossPhase,target=nearest(boss);
        // Evaluate a shared telegraph against both players before advancing it once.
        const victims=live().filter(({p})=>before==="telegraph"?fn.bossLineThreat(boss,p):before==="sanctuary"&&boss.safeCells?.length?!boss.safeCells.some(c=>c.x===p.x&&c.y===p.y):false);
        use(target.i,()=>fn.advanceBoss());
        for(const {i} of victims)if(!protectedSlots[i])kill(i,boss.bossName);
        if(victims.length&&["telegraph","sanctuary"].includes(before)){boss.bossPhase="vulnerable";}
      }
      const used=new Set(),team=live()[0]?.p,pair=api.roster;
      // Pin: enemies strictly between two aligned players cannot move this turn.
      const pinned=new Set(api.balance.teamTraits&&team&&pair.length===2?fn.traits.pinned(team.traits,team.traitLevels,pair[0],pair[1],S.enemies,team.mastered):[]);
      const guard=api.balance.teamTraits&&team?fn.traits.coopRule(team.traits,team.traitLevels,"guard",team.mastered):null;
      const credits={};
      // Same order as solo: nearest enemies claim cells first.
      const dist=e=>{const t=nearest(e);return t?Math.abs(t.p.x-e.x)+Math.abs(t.p.y-e.y):0;};
      for(const e of S.enemies.filter(e=>!e.boss).sort((a,b)=>dist(a)-dist(b))){
        const target=nearest(e);if(!target)break;
        const from={x:e.x,y:e.y},next=fn.toward(e,target.p),key=next.x+","+next.y;
        const victim=live().find(({p})=>p.x===next.x&&p.y===next.y);
        if(used.has(key)||pinned.has(e))continue;
        if(victim&&protectedSlots[victim.i])continue;
        // Guard: a nearby ally recaptures the attacker instead of the victim falling.
        const guardian=victim&&guard&&(S.coopGuardReady||0)<=S.wave&&live().find(({p,i})=>i!==victim.i&&Math.max(Math.abs(p.x-victim.p.x),Math.abs(p.y-victim.p.y))<=guard.reach);
        if(guardian){S.enemies=S.enemies.filter(enemy=>enemy!==e);S.coopGuardReady=S.wave+guard.cooldown;credits.guard=(credits.guard||0)+1;if(teamSynergy(team,"ironShift"))S.coopCastleReady=0;S.enemyTrail.push({x1:guardian.p.x,y1:guardian.p.y,x2:from.x,y2:from.y});fn.deathBurst(from.x,from.y);S.coopGuardedAt={x:victim.p.x,y:victim.p.y,wave:S.wave};continue;}
        e.x=next.x;e.y=next.y;used.add(key);
        if(from.x!==e.x||from.y!==e.y)S.enemyTrail.push({x1:from.x,y1:from.y,x2:e.x,y2:e.y,via:e.type==="knight"?fn.knightCorner(from,e):null});
        if(victim)kill(victim.i,e.type.toUpperCase()+"에게 잡힘");
      }
      // Pin and guard earn their mastery here; the team shares it like any other progress.
      if(pinned.size)credits.pin=pinned.size;
      const credited=live()[0];
      if(Object.keys(credits).length&&credited)use(credited.i,()=>fn.updateHiddenGrowth(credits));
      fn.heal();
      const survivors=live();
      if(survivors.length){
        // Original spawn/rank/durability/trait/item/terrain rules, around alternating survivors.
        use(survivors[S.wave%survivors.length].i,()=>{
          // Two-player pressure scales the solo spawn count; the fractional part carries over.
          const base=S.wave%4===0?2:1,scale=survivors.length>1?api.balance.spawnScale:1;
          S.coopSpawnCarry=(S.coopSpawnCarry||0)+base*scale;
          const spawns=Math.floor(S.coopSpawnCarry+1e-9);S.coopSpawnCarry-=spawns;
          for(let i=0;i<spawns;i++)fn.spawn();
          if(S.wave%30===0)fn.spawnBoss();fn.spawnTerrainByWave();
          if(random()<1-Math.pow(.92,base))fn.spawnFieldItem();
          if(S.riskBeats>0)S.riskBeats--;
          if(S.wave%20===0){fn.offerRisk();api.pendingOwner=survivors[0].i;}else S.phase="player";
        });
      }else S.phase="coopover";
      const activeBoss=fn.boss();
      if(activeBoss?.bossPhase==="sanctuary"&&!activeBoss.safeCells.length){
        const cells=[];
        for(const {i} of live())use(i,()=>{fn.moves();fn.chooseSafeCells(activeBoss);cells.push(...activeBoss.safeCells);});
        activeBoss.safeCells=cells.filter((c,i)=>cells.findIndex(q=>q.x===c.x&&q.y===c.y)===i);
      }
      refresh();
    };
    api.snapshot = () => {
      save(api.roster.indexOf(S.player));
      const world=copy(S);for(const key of ["comboStepTimer","comboHideTimer","runTicket","player","camera"])delete world[key];
      return {world,players:copy(api.roster),turns:copy(api.turns),pendingOwner:api.pendingOwner,clock:clock(),rewardLabels:{title:ui.upgradeTitle.textContent,eyebrow:ui.upgradeEyebrow.textContent}};
    };
    api.apply = snapshot => {
      const camera=S.camera;Object.assign(S,copy(snapshot.world));S.camera=camera;
      api.roster=copy(snapshot.players);api.turns=copy(snapshot.turns);api.pendingOwner=snapshot.pendingOwner;
      S.player=api.roster[api.view];Object.assign(S,api.turns[api.view]);
      if(snapshot.rewardLabels){ui.upgradeTitle.textContent=snapshot.rewardLabels.title;ui.upgradeEyebrow.textContent=snapshot.rewardLabels.eyebrow;}
      if(S.phase==="upgrade")S.upgradeLock=clock()+Math.max(0,(snapshot.world.upgradeLock||0)-snapshot.clock);
      refresh();
    };
    api.present = ({view=0,focus=view,interactive=false,paused=false}={}) => {api.suspended=false;api.paused=paused;api.view=view;api.focus=focus;api.interactive=interactive;refresh();};
    api.replay = (snapshot,view) => {
      fn.replayUi?.();
      api.view=view;api.apply(snapshot);S.phase="coopreplay";S.autoPlay=false;
      api.present({view,focus:view,interactive:false,paused:true});
      S.moves=[];S.particles=[];S.effects=[];S.camera={x:S.player.x,y:S.player.y};api.replaying=true;
    };
    api.debug = (action,value,slot=api.view) => use(slot,()=>{
      if(action==="piece"&&["pawn","knight","bishop","rook","queen","king"].includes(value))S.player.piece=value;
      if(action==="xp")fn.devXp();
      if(action==="trait"&&api.catalog.some(t=>t.id===value)){
        if(S.player.traits.includes(value))S.player.traitLevels[value]=Math.min(5,(S.player.traitLevels[value]||1)+1);
        else if(S.player.traits.length<6){S.player.traits.push(value);S.player.traitLevels[value]=1;}
      }
      if(action==="master"&&S.player.traits.includes(value)&&fn.traits.MASTERIES[value]){
        S.player.traitLevels[value]=5;S.player.traitXp[value]=Math.max(S.player.traitXp[value]||0,fn.traits.MASTERIES[value].requiredXp);fn.updateHiddenGrowth();
      }
      if(action==="boss")fn.spawnBoss(value||"rook");
      if(action==="clear")S.enemies=[];
      if(action==="spawn"){
        fn.moves();const m=S.moves.find(m=>!S.enemies.some(e=>e.x===m.x&&e.y===m.y));
        if(m)S.enemies.push({...m,type:value.type,face:{x:0,y:1},hp:value.hp,maxHp:value.hp,enemyTraits:[]});
      }
      if(S.phase==="upgrade"||S.phase==="devpick")api.pendingOwner=slot;
      fn.moves();fn.hud();
    });
    return api;
  }
  return {create, BALANCE};
});
