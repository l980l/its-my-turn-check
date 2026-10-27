(() => {
  "use strict";
  const URL="https://ganvrpzlsmvbmcilerpq.supabase.co", KEY="sb_publishable_9VAPG9uz4EonoI_naGXemw_PCGDqOc4";
  const $=selector=>document.querySelector(selector), me=crypto.randomUUID();
  const lobby=$("#lobby"),gameScreen=$("#gameScreen"),endScreen=$("#endScreen");
  const frames=[$("#coopFrame0"),$("#coopFrame1")], apis=[];
  let channel=null, client, host=false, localDev=false, slot=0, roomCode="", peer=null;
  let session=null, remote=null, generation=0, runId=null, joinTimer, submittedKey="";
  let auto=false, autos=[true,true], speed=1, paused=false, controlled=0;
  const cameras=[0,1].map(i=>window.CoopSession.createCamera(i));
  const cameraStates=[];
  let replays=[null,null],sentReplays=[false,false],deathNotified=[false,false],reviewSlot=0,reviewIndex=0,replayReady=null,replayApi=null;
  const enginesReady=frames.map((frame,i)=>new Promise(resolve=>{
    frame.addEventListener("load",()=>{if(frame.contentWindow.CoopGame){apis[i]=frame.contentWindow.CoopGame;apis[i].onInput=event=>input({...event,slot:localDev?i:slot});resolve(apis[i]);}});
  }));
  function closeDialogs(){for(const d of [$("#joinDialog"),$("#helpDialog")])if(d.open)d.close();}
  function show(which){[lobby,gameScreen,endScreen].forEach(n=>n.classList.toggle("hidden",n!==which&&!(n===gameScreen&&which===endScreen)));$("#coopApp").dataset.screen=which.id;$("#leaveButton").hidden=which!==gameScreen;$("#devRestartEnd").hidden=!localDev;closeDialogs();}
  function status(message){$("#lobbyStatus").textContent=message;if($("#joinDialog").open)$("#joinStatus").textContent=message;}
  function resetReviews(){
    replays=[null,null];sentReplays=[false,false];deathNotified=[false,false];
    for(const id of ["deathDialog","replayDialog"])if($("#"+id).open)$("#"+id).close();
    if(replayApi)replayApi.suspended=true;
    for(const i of [0,1])$("#endReview"+i).disabled=true;
  }
  function updateDeaths(){
    for(const i of [0,1])$("#endReview"+i).disabled=!replays[i];
    if(!remote)return;
    const players=remote.game.players,view=localDev?controlled:slot;
    $("#endDeaths").textContent=players.filter(p=>!p.alive).map(p=>"P"+(players.indexOf(p)+1)+" · "+(p.deathReason||"적에게 잡혔습니다.")).join("\n");
    $("#reviewDeathButton").hidden=Boolean(players[view]?.alive);
    $("#reviewDeathButton").disabled=!replays[view];
    if(!players.some(p=>p.alive)||remote.flow.phase==="over"){
      if($("#deathDialog").open)$("#deathDialog").close();return;
    }
    if(!players[view]?.alive&&!deathNotified[view]){
      deathNotified[view]=true;reviewSlot=view;
      $("#deathTitle").textContent="P"+(view+1)+" · CHECKMATE";
      $("#deathReason").textContent=players[view].deathReason||"적에게 잡혔습니다.";
      $("#deathReview").disabled=!replays[view];
      if(!$("#deathDialog").open)$("#deathDialog").showModal();
    }
    $("#deathReview").disabled=!replays[view];
  }
  async function openReview(player){
    const record=replays[player];if(!record?.frames.length)return;
    reviewSlot=player;reviewIndex=record.frames.length-1;
    if($("#deathDialog").open)$("#deathDialog").close();
    $("#replayTitle").textContent="P"+(player+1)+" · 사망 직전 10수";
    $("#replayReason").textContent=record.reason+" · 웨이브 "+record.wave+"\n청록 실선: 플레이어 이동 · 붉은 점선: 적 이동 · ×: 사망 위치";
    if(!$("#replayDialog").open)$("#replayDialog").showModal();
    replayReady??=new Promise(resolve=>{const frame=$("#replayFrame");frame.addEventListener("load",()=>{if(frame.contentWindow.CoopGame){replayApi=frame.contentWindow.CoopGame;resolve();}},{once:true});frame.src="index.html?coop=1";});
    await replayReady;if($("#replayDialog").open)renderReview();
  }
  function renderReview(){
    const record=replays[reviewSlot];if(!replayApi||!record)return;
    const frame=record.frames[reviewIndex];replayApi.replay(frame.game,reviewSlot);
    $("#replayLabel").textContent=(reviewIndex+1)+" / "+record.frames.length+" · "+frame.label;
    $("#replayPrev").disabled=reviewIndex===0;$("#replayNext").disabled=reviewIndex===record.frames.length-1;
  }
  async function ready(){show(gameScreen);await Promise.all(enginesReady);apis[0].audio();}
  function send(event,payload={}){return channel?.send({type:"broadcast",event,payload:{...payload,from:me,runId}});}
  function packet(){return session?{runId,flow:structuredClone(session.flow()),game:apis[0].snapshot(),paused,speed,...(session.flow().phase==="over"?{replays}: {})}:remote;}
  function publish(){
    if(!session)return;
    session.replays().forEach((record,i)=>{if(record&&!sentReplays[i]){replays[i]=record;sentReplays[i]=true;if(!localDev)send("death-replay",{slot:i,record});}});
    remote=packet();render(remote);if(!localDev)send("state",{snapshot:remote});
  }
  function present(api,view,flow){
    const state=cameraStates[view]=cameras[view].update(flow,api.players()),focus=state.focus;
    api.present({view,focus,paused,interactive:flow.phase==="planning"&&flow.eligible.includes(view)&&api.players()[view]?.alive});
  }
  function render(snapshot){
    if(!snapshot)return;
    const flow=snapshot.flow;
    if(snapshot.replays)replays=snapshot.replays;
    if(!session)apis[0].apply(snapshot.game);
    present(apis[0],localDev?0:slot,flow);
    if(localDev){apis[1].apply(snapshot.game);present(apis[1],1,flow);}
    $("#scoreText").textContent=snapshot.game.world.score.toLocaleString();
    const me=localDev?controlled:slot,myTurn=flow.phase==="planning"&&flow.eligible.includes(me);
    $("#phaseText").textContent=paused?"PAUSED":flow.phase==="planning"?(myTurn?"YOUR TURN":"P"+(flow.current+1)+" TURN"):flow.phase==="acting"?"P"+(flow.actor+1)+" MOVE":flow.phase==="upgrade"?"P"+(flow.actor+1)+" LEVEL UP":flow.phase==="risk"?"RISK":"ENEMY TURN";
    $("#actionHint").textContent=flow.phase==="planning"?(myTurn?"내 차례 · 이동할 칸을 고르세요":"P"+(flow.current+1)+" 차례 · 이동을 고르는 중"):flow.phase==="upgrade"?"P"+(flow.actor+1)+" 보상 선택 중":flow.phase==="acting"?"P"+(flow.actor+1)+"의 행동을 보고 있습니다.":"몬스터 이동";
    if(flow.phase==="over"){for(const api of apis)if(api)api.suspended=true;$("#endText").textContent="팀 점수 "+snapshot.game.world.score.toLocaleString()+"점 · 웨이브 "+snapshot.game.world.wave+" · "+snapshot.game.world.kills+"기 처치";show(endScreen);}
    updateDeaths();
    updateTools();
  }
  function startAuthority(){
    remote=null;runId=crypto.randomUUID();submittedKey="";cameras.forEach(c=>c.reset());resetReviews();
    session=window.CoopSession.create(apis[0],publish);
    session.start();apis[0].audio();publish();
  }
  async function startLocalDev(){
    generation++;clearTimeout(joinTimer);channel?.unsubscribe();channel=null;
    host=true;localDev=true;slot=0;controlled=0;paused=false;speed=1;autos=[true,true];session=null;
    $("#coopApp").dataset.dev="true";$("#boardViews").classList.add("split");
    await ready();roomCode="LOCAL DEV";$("#roomCode").textContent=roomCode;
    $("#devControls").hidden=false;$("#devToolsToggle").textContent="도구 숨기기";$("#devToolsToggle").setAttribute("aria-expanded","true");
    if(!$("#devTraitSelect").options.length)for(const trait of apis[0].catalog){const option=document.createElement("option");option.value=trait.id;option.textContent=trait.name;$("#devTraitSelect").append(option);}
    startAuthority();
  }
  function input(event,fromPeer=false){
    const snapshot=remote;if(!snapshot)return;
    if(!localDev&&!fromPeer)event.slot=slot;
    if(host){
      if(!session)return;
      if(event.type==="move")session.move(event.slot,event.move,session.flow().roundId);
      else session.choose(event.slot,event.index,event.type);
    }else send("intent",{event,roundId:snapshot.flow.roundId});
  }
  function updateTools(){
    const view=localDev?controlled:slot,state=cameraStates[view];
    $("#cameraButton").disabled=!state?.canToggle;
    $("#cameraButton").textContent=state?.focus===view?"동료 보기":"내 말 보기";
    $("#cameraButton").setAttribute("aria-label",(localDev?"P"+(view+1)+" 시점 · ":"")+$("#cameraButton").textContent);
    $("#devTools").hidden=!localDev;$("#autoButton").hidden=localDev;$("#copyButton").hidden=localDev;
    $("#devAutoBoth").textContent="AUTO BOTH "+(autos.every(Boolean)?"ON":"OFF");$("#devAutoBoth").setAttribute("aria-pressed",String(autos.every(Boolean)));
    for(let i=0;i<2;i++){$("#devAuto"+i).textContent="P"+(i+1)+" AUTO "+(autos[i]?"ON":"OFF");$("#devAuto"+i).setAttribute("aria-pressed",String(autos[i]));}
    $("#devPause").textContent=paused?"재개":"일시정지";$("#devPause").setAttribute("aria-pressed",String(paused));
    $("#devSpeed").textContent="SPEED ×"+speed;$("#devPlayer").textContent="조작 P"+(controlled+1);
    $("#devPiece").textContent="기물 "+(apis[0]?.players()[controlled]?.piece||"pawn").toUpperCase();
  }
  function automation(immediate=false){
    if(paused)return;
    const snapshot=remote;if(!snapshot)return;
    const flow=snapshot.flow;
    if(flow.phase==="planning"){
      // AUTO thinks for a solo-like 0.28s so the turn and its timer stay readable.
      const waited=flow.duration-(session?session.timeLeft():Math.max(0,flow.deadline-Date.now()));
      if(!immediate&&waited<280/speed)return;
      for(const i of flow.eligible){
        if(!(localDev?autos[i]:auto&&i===slot)||flow.actions[i])continue;
        const key=flow.roundId+":"+i;if(!host&&submittedKey===key)continue;
        const api=apis[0],move=api.auto(i);
        if(move){submittedKey=key;input({type:"move",move,slot:i});}
      }
    }else if(["upgrade","risk"].includes(flow.phase)&&(localDev?autos[flow.actor]:auto&&slot===flow.actor)&&apis[0].choiceReady())input({type:flow.phase,index:flow.phase==="risk"?false:0,slot:flow.actor});
  }
  function tick(){
    requestAnimationFrame(tick);
    if(gameScreen.classList.contains("hidden"))return;
    if(session){automation();session.update();}else if(remote)automation();
    const snapshot=remote;if(!snapshot)return;
    const f=snapshot.flow,left=session?session.timeLeft():Math.max(0,f.deadline-Date.now());
    const fraction=f.phase==="planning"?Math.max(0,Math.min(1,left/f.duration)):0;
    $("#timerText").value=fraction*100;$("#timerText").setAttribute("aria-valuetext","남은 선택 시간 "+Math.round(fraction*100)+"%");
  }
  async function leaveRoom(){
    resetReviews();
    generation++;clearTimeout(joinTimer);
    if(host&&channel)send("host-left");channel?.unsubscribe();channel=null;
    session=null;remote=null;runId=null;paused=false;localDev=false;auto=false;cameras.forEach(c=>c.reset());
    for(const api of apis)if(api)api.suspended=true;
    $("#coopApp").dataset.dev="false";$("#boardViews").classList.remove("split");updateTools();show(lobby);status("방에서 나왔습니다.");
  }
  async function connect(code,asHost){
    resetReviews();
    const token=++generation;host=asHost;localDev=false;slot=asHost?0:1;peer=null;session=null;remote=null;runId=null;auto=false;paused=false;cameras.forEach(c=>c.reset());
    $("#autoButton").textContent="AUTO OFF";$("#autoButton").setAttribute("aria-pressed","false");$("#coopApp").dataset.dev="false";$("#boardViews").classList.remove("split");
    client??=window.supabase?.createClient(URL,KEY);if(!client){status("연결 모듈을 불러오지 못했습니다. 다시 시도해주세요.");return;}
    await ready();if(token!==generation)return;
    roomCode=code;$("#roomCode").textContent=code;updateTools();$("#phaseText").textContent="WAITING";
    $("#actionHint").textContent=host?"초대 코드를 친구에게 보내세요.":"방에 접속하는 중입니다.";
    channel=client.channel("coop:"+code,{config:{broadcast:{self:false}}});
    channel.on("broadcast",{event:"hello"},({payload})=>{
      if(token!==generation||!host||peer)return;peer=payload.from;startAuthority();send("welcome",{to:peer,snapshot:packet()});
    }).on("broadcast",{event:"welcome"},({payload})=>{
      if(token!==generation||host||payload.to!==me)return;peer=payload.from;runId=payload.runId;remote=payload.snapshot;clearTimeout(joinTimer);render(remote);apis[0].audio();
    }).on("broadcast",{event:"state"},({payload})=>{
      if(token!==generation||host||payload.from!==peer||payload.runId!==runId)return;
      if(remote&&payload.snapshot.flow.revision<remote.flow.revision)return;remote=payload.snapshot;render(remote);
    }).on("broadcast",{event:"death-replay"},({payload})=>{
      if(token!==generation||host||payload.from!==peer||payload.runId!==runId||![0,1].includes(payload.slot))return;
      replays[payload.slot]=payload.record;updateDeaths();
    }).on("broadcast",{event:"intent"},({payload})=>{
      if(token!==generation||!host||payload.from!==peer||payload.runId!==runId||!session)return;
      if(payload.roundId!==session.flow().roundId)return;
      const event={...payload.event,slot:1};input(event,true);
    }).on("broadcast",{event:"host-left"},({payload})=>{
      if(token!==generation||host||payload.from!==peer)return;remote=null;$("#endText").textContent="방장이 방을 나갔습니다.";show(endScreen);
    }).subscribe(value=>{
      if(value!=="SUBSCRIBED"||token!==generation)return;
      if(!host){send("hello");joinTimer=setTimeout(()=>{if(!remote){leaveRoom();status("방을 찾지 못했습니다. 코드를 확인해주세요.");}},6000);}
    });
  }
  $("#devButton").addEventListener("click",startLocalDev);$("#devRestart").addEventListener("click",startLocalDev);$("#devRestartEnd").addEventListener("click",startLocalDev);
  $("#cameraButton").addEventListener("click",()=>{const view=localDev?controlled:slot;if(remote&&cameras[view].toggle(apis[0].players()))render(remote);});
  $("#devAutoBoth").addEventListener("click",()=>{autos=autos.every(Boolean)?[false,false]:[true,true];updateTools();});
  for(let i=0;i<2;i++)$("#devAuto"+i).addEventListener("click",()=>{autos[i]=!autos[i];updateTools();});
  $("#devPause").addEventListener("click",()=>{if(session){paused=!paused;session.pause(paused);updateTools();}});
  $("#devStep").addEventListener("click",()=>{if(!session)return;paused=false;automation(true);paused=true;session.pause(true);session.step();publish();});
  $("#devSpeed").addEventListener("click",()=>{if(!session)return;speed=speed===4?1:speed+1;session.speed(speed);updateTools();});
  $("#devPlayer").addEventListener("click",()=>{controlled=1-controlled;if(remote)render(remote);else updateTools();});
  const debug=(action,value)=>{if(localDev&&session){session.debug(action,value,controlled);publish();}};
  $("#devPiece").addEventListener("click",()=>{const pieces=["pawn","knight","bishop","rook","queen","king"],current=apis[0].players()[controlled].piece;debug("piece",pieces[(pieces.indexOf(current)+1)%pieces.length]);});
  $("#devXp").addEventListener("click",()=>debug("xp"));
  $("#devTrait").addEventListener("click",()=>debug("trait",$("#devTraitSelect").value));
  $("#devBoss").addEventListener("click",()=>debug("boss",$("#devBossSelect").value));
  for(const type of ["pawn","rook"])$("#devSpawn"+type).addEventListener("click",()=>debug("spawn",{type,hp:Number($("#devEnemyHp").value)}));
  $("#devClear").addEventListener("click",()=>debug("clear"));
  $("#devToolsToggle").addEventListener("click",()=>{const node=$("#devControls");node.hidden=!node.hidden;$("#devToolsToggle").textContent=node.hidden?"도구 보기":"도구 숨기기";$("#devToolsToggle").setAttribute("aria-expanded",String(!node.hidden));});
  $("#autoButton").addEventListener("click",()=>{auto=!auto;$("#autoButton").textContent="AUTO "+(auto?"ON":"OFF");$("#autoButton").setAttribute("aria-pressed",String(auto));});
  for(const i of [0,1])$("#endReview"+i).addEventListener("click",()=>openReview(i));
  $("#deathReview").addEventListener("click",()=>openReview(localDev?controlled:slot));
  $("#reviewDeathButton").addEventListener("click",()=>openReview(localDev?controlled:slot));
  $("#deathSpectate").addEventListener("click",()=>$("#deathDialog").close());
  $("#replayPrev").addEventListener("click",()=>{reviewIndex=Math.max(0,reviewIndex-1);renderReview();});
  $("#replayNext").addEventListener("click",()=>{reviewIndex=Math.min(replays[reviewSlot].frames.length-1,reviewIndex+1);renderReview();});
  $("#replayClose").addEventListener("click",()=>$("#replayDialog").close());
  $("#replayDialog").addEventListener("close",()=>{if(replayApi)replayApi.suspended=true;});
  $("#hostButton").addEventListener("click",()=>connect(Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join(""),true));
  $("#openJoinButton").addEventListener("click",()=>{closeDialogs();$("#joinStatus").textContent="";$("#joinDialog").showModal();$("#roomInput").focus();$("#roomInput").select();});
  $("#joinForm").addEventListener("submit",event=>{event.preventDefault();const code=$("#roomInput").value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code)){ $("#joinStatus").textContent="6자리 초대 코드를 입력하세요.";return;}connect(code,false);});
  $("#howToPlayButton").addEventListener("click",()=>{closeDialogs();$("#helpDialog").showModal();});
  $("#joinClose").addEventListener("click",()=>$("#joinDialog").close());$("#helpClose").addEventListener("click",()=>$("#helpDialog").close());
  for(const dialog of [$("#joinDialog"),$("#helpDialog")])dialog.addEventListener("click",event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close();});
  $("#copyButton").addEventListener("click",()=>navigator.clipboard?.writeText(roomCode));$("#leaveButton").addEventListener("click",leaveRoom);$("#backToLobby").addEventListener("click",leaveRoom);
  tick();
})();
