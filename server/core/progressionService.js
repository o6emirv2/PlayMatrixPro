const MAX_LEVEL=100;
const BASE_XP=250n;
const RANGES=[
  {from:1,to:10,num:135n,den:100n},
  {from:10,to:30,num:145n,den:100n},
  {from:30,to:60,num:155n,den:100n},
  {from:60,to:80,num:170n,den:100n},
  {from:80,to:95,num:190n,den:100n},
  {from:95,to:100,num:225n,den:100n}
];
function ceilMul(value,num,den){return (value*num+den-1n)/den;}
function multiplierForTransition(level){return RANGES.find(r=>level>=r.from&&level<r.to)||RANGES[RANGES.length-1];}
function buildTable(){
  const transition=[0n,BASE_XP];
  const total=[0n,0n];
  let step=BASE_XP;
  for(let level=1;level<MAX_LEVEL;level+=1){
    transition[level]=step;
    total[level+1]=(total[level]||0n)+step;
    const m=multiplierForTransition(level);
    step=ceilMul(step,m.num,m.den);
  }
  return {transition,total};
}
const TABLE=buildTable();
function toBigIntXp(value){
  if(typeof value==='bigint') return value>0n?value:0n;
  if(typeof value==='number'&&Number.isFinite(value)) return BigInt(Math.max(0,Math.floor(value)));
  const raw=String(value??'').replace(/[^0-9]/g,'');
  return raw?BigInt(raw):0n;
}
function fmtBig(v){return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');}
function getProgression(xpValue=0){
  const xp=toBigIntXp(xpValue);
  let level=1;
  for(let l=1;l<=MAX_LEVEL;l+=1){ if(xp>=(TABLE.total[l]||0n)) level=l; else break; }
  const currentLevelStartXp=TABLE.total[level]||0n;
  const nextLevelXp=level>=MAX_LEVEL?currentLevelStartXp:(TABLE.total[level+1]||currentLevelStartXp);
  const xpIntoLevel=xp>currentLevelStartXp?xp-currentLevelStartXp:0n;
  const xpToNextLevel=level>=MAX_LEVEL?0n:(nextLevelXp>xp?nextLevelXp-xp:0n);
  const span=nextLevelXp>currentLevelStartXp?nextLevelXp-currentLevelStartXp:1n;
  const progressPercent=level>=MAX_LEVEL?100:Number((xpIntoLevel*10000n/span))/100;
  return {
    level,accountLevel:level,xp:xp.toString(),currentXp:xp.toString(),accountXp:xp.toString(),
    currentLevelStartXp:currentLevelStartXp.toString(),nextLevelXp:nextLevelXp.toString(),
    xpIntoLevel:xpIntoLevel.toString(),xpToNextLevel:xpToNextLevel.toString(),
    progressPercent,accountLevelProgressPct:progressPercent,isMaxLevel:level>=MAX_LEVEL,
    formattedXp:fmtBig(xp),formattedNextLevelXp:fmtBig(nextLevelXp),formattedXpToNextLevel:fmtBig(xpToNextLevel),version:'v7-balanced'
  };
}
function normalizeXp(value){return Number(toBigIntXp(value));}
const THRESHOLDS=TABLE.total.map(v=>Number(v<=BigInt(Number.MAX_SAFE_INTEGER)?v:BigInt(Number.MAX_SAFE_INTEGER)));
module.exports={MAX_LEVEL,BASE_XP,TABLE,THRESHOLDS,getProgression,normalizeXp,toBigIntXp,fmtBig};
