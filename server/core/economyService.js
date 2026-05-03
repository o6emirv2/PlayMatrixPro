const crypto=require('crypto');
const {initFirebaseAdmin}=require('../config/firebaseAdmin');
const {runtimeStore}=require('./runtimeStore');
const {runOnce}=require('./idempotencyService');
const {getProgression,toBigIntXp}=require('./progressionService');
const DEFAULT_BALANCE=50000;
const DEFAULT_AVATAR='data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http://www.w3.org/2000/svg%27%20viewBox%3D%270%200%20128%20128%27%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27%23111827%27/%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27/%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27/%3E%3C/svg%3E';
function now(){return Date.now();}
function s(v,max=160){return String(v||'').trim().slice(0,max);}
function uidFromReq(req){return s(req.user?.uid||req.headers['x-playmatrix-user']||req.body?.uid||req.query?.uid||'guest',160)||'guest';}
function emailFromReq(req){return s(req.user?.email||req.headers['x-playmatrix-email']||'',200);}
function runtimeProfile(uid,seed={}){
  const existing=runtimeStore.temporary.get(`profile:${uid}`)||{};
  const profile={uid,email:seed.email||existing.email||'',username:seed.username||existing.username||String(uid).slice(0,18),displayName:seed.displayName||existing.displayName||seed.username||String(uid).slice(0,18),avatar:existing.avatar||seed.avatar||DEFAULT_AVATAR,selectedFrame:Number(existing.selectedFrame||0)||0,balance:Number(existing.balance??DEFAULT_BALANCE)||0,xp:String(existing.xp??'0'),ownedMarketItems:existing.ownedMarketItems||{},updatedAt:now()};
  return applyProgression(profile);
}
function applyProgression(profile){const xp=profile.xp??profile.accountXp??0;const p=getProgression(xp);return {...profile,xp:p.xp,accountXp:p.xp,level:p.level,accountLevel:p.level,accountLevelProgressPct:p.progressPercent,progression:p};}
async function getProfile(uid,seed={}){
  uid=s(uid||'guest',160)||'guest';
  const {db}=initFirebaseAdmin();
  if(!db||uid==='guest') return runtimeProfile(uid,seed);
  const ref=db.collection('users').doc(uid);
  const snap=await ref.get();
  let profile=snap.exists?{uid,...snap.data()}:runtimeProfile(uid,seed);
  if(!snap.exists){profile={...profile,balance:DEFAULT_BALANCE,signupBonusClaimed:true,createdAt:now()};await ref.set(profile,{merge:true}).catch(()=>null);}
  return applyProgression(profile);
}
async function adjustBalance(uid,amount,{reason='balance-adjust',idempotencyKey='',meta={}}={}){
  uid=s(uid||'guest',160)||'guest';
  const delta=Math.trunc(Number(amount)||0);
  if(!Number.isFinite(delta)||delta===0) return {ok:true,balance:(await getProfile(uid)).balance,amount:0};
  const key=idempotencyKey||`economy:${uid}:${reason}:${delta}:${crypto.createHash('sha1').update(JSON.stringify(meta||{})).digest('hex')}`;
  const {db}=initFirebaseAdmin();
  const execute=async()=>{
    if(!db||uid==='guest'){
      const current=Number(runtimeStore.temporary.get(`balance:${uid}`)??DEFAULT_BALANCE)||0;
      if(delta<0&&current+delta<0){const e=new Error('INSUFFICIENT_BALANCE');e.statusCode=409;e.balance=current;throw e;}
      const balance=Math.max(0,current+delta);
      runtimeStore.temporary.set(`balance:${uid}`,balance,30*86400000);
      const prof=runtimeStore.temporary.get(`profile:${uid}`)||runtimeProfile(uid);prof.balance=balance;runtimeStore.temporary.set(`profile:${uid}`,prof,30*86400000);
      return {balance,amount:delta};
    }
    const ref=db.collection('users').doc(uid);
    let balance=0;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);const current=Math.max(0,Number((snap.exists?snap.data().balance:DEFAULT_BALANCE)||0));
      if(delta<0&&current+delta<0){const e=new Error('INSUFFICIENT_BALANCE');e.statusCode=409;e.balance=current;throw e;}
      balance=Math.max(0,current+delta);
      tx.set(ref,{balance,updatedAt:now()},{merge:true});
      tx.set(db.collection('audit').doc(`economy_${crypto.randomUUID()}`),{uid,amount:delta,reason,balanceAfter:balance,meta,at:now()},{merge:true});
    });
    return {balance,amount:delta};
  };
  try{const result=await runOnce({key,db,execute});return {ok:true,duplicate:!!result.duplicate,...(result.result||{})};}
  catch(error){if(error.message==='INSUFFICIENT_BALANCE')return {ok:false,error:'INSUFFICIENT_BALANCE',balance:error.balance||0};console.error('[economy:error]',JSON.stringify({message:error.message,reason,uid}));return {ok:false,error:'ECONOMY_ERROR'};}
}
async function addXp(uid,xp,{reason='xp',idempotencyKey='',meta={}}={}){
  uid=s(uid||'guest',160)||'guest';
  const xpAdd=toBigIntXp(xp); if(xpAdd<=0n) return {ok:true,addedXp:'0',profile:await getProfile(uid)};
  const key=idempotencyKey||`xp:${uid}:${reason}:${xpAdd}:${crypto.createHash('sha1').update(JSON.stringify(meta||{})).digest('hex')}`;
  const {db}=initFirebaseAdmin();
  const execute=async()=>{
    if(!db||uid==='guest'){
      const prof=runtimeStore.temporary.get(`profile:${uid}`)||runtimeProfile(uid);const next=(toBigIntXp(prof.xp)+xpAdd).toString();prof.xp=next;runtimeStore.temporary.set(`profile:${uid}`,prof,30*86400000);return {addedXp:xpAdd.toString(),profile:applyProgression(prof)};
    }
    const ref=db.collection('users').doc(uid);let profile=null;
    await db.runTransaction(async tx=>{const snap=await tx.get(ref);const cur=snap.exists?snap.data():{};const next=(toBigIntXp(cur.xp??cur.accountXp??0)+xpAdd).toString();const patch={xp:next,accountXp:next,updatedAt:now()};tx.set(ref,patch,{merge:true});profile=applyProgression({uid,...cur,...patch});tx.set(db.collection('audit').doc(`xp_${crypto.randomUUID()}`),{uid,xp:xpAdd.toString(),reason,meta,at:now()},{merge:true});});
    return {addedXp:xpAdd.toString(),profile};
  };
  const result=await runOnce({key,db,execute});return {ok:true,duplicate:!!result.duplicate,...(result.result||{})};
}
module.exports={DEFAULT_BALANCE,DEFAULT_AVATAR,uidFromReq,emailFromReq,getProfile,adjustBalance,addXp,applyProgression};
