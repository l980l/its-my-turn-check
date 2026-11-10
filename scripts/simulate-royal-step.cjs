// Usage: node scripts/simulate-royal-step.cjs [sourceRoot] <piece> [seeds]. Run from a source copy.
// Paired solo AUTO survival: start with Royal Step Lv1 on a fixed piece.
const path=require("path");const root=process.argv[2]||path.resolve(__dirname,"..");const piece=process.argv[3];const N=+(process.argv[4]||48);const CAP=+(process.env.WAVE_CAP||300);
const {createGameHarness}=require(path.join(root,"scripts/game-harness.cjs"));
const out=[];
for(let i=0;i<N;i++){const seed=20261026+i*7919;
  const h=createGameHarness({withUpgradeUi:true,withHeldUi:true,seed});const g=h.game,S=g.S;
  g.reset();S.running=true;S.autoPlay=true;Object.assign(S.player,{piece,traits:["royalStep"],traitLevels:{royalStep:1}});
  let royalMoves=0;
  for(let step=0;step<CAP*60&&S.wave<CAP;step++){
    if(S.phase==="enemy"){S.elapsedPlaySeconds=S.wave*3.34;g.enemyBeat();}
    else if(S.phase==="player"){g.moves();if(!S.moves.length)S.phase="enemy";else g.autoMove();}
    else if(S.phase==="upgrade"||S.phase==="risk"){h.advance(1000);const b=JSON.stringify([S.phase,S.upgradeMode,S.upgradeOptions]);
      if(S.phase==="risk")g.resolveRisk(false);else{for(const k of[0,1,2]){g.chooseUpgrade(k);if(JSON.stringify([S.phase,S.upgradeMode,S.upgradeOptions])!==b)break;}}
      if(JSON.stringify([S.phase,S.upgradeMode,S.upgradeOptions])===b)S.phase="player";}
    else break;}
  out.push(S.wave);}
console.log(JSON.stringify(out));
