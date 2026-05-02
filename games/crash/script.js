'use strict';

const state = { socket:null, roundId:'', timer:null, profile:null };
const $ = (s)=>document.querySelector(s);
function token(){ return localStorage.getItem('pm_token') || ''; }
function toast(message){ const n=document.createElement('div'); n.className='toast'; n.textContent=message; $('#toastRegion').appendChild(n); setTimeout(()=>n.remove(),3800); }
function setStatus(text){ $('#statusText').textContent=text; }
function setBalance(profile){ if(profile){ state.profile=profile; $('#balanceLabel').textContent=`Bakiye: ${Number(profile.balance||0).toLocaleString('tr-TR')} MC`; } }
function startTick(){ clearInterval(state.timer); state.timer=setInterval(()=>{ if(state.roundId) state.socket.emit('round:tick',{roundId:state.roundId}); }, 500); }
function stopTick(){ clearInterval(state.timer); state.timer=null; state.roundId=''; $('#cashoutBtn').disabled=true; $('#startBtn').disabled=false; }
function connect(){
  state.socket=io('/crash',{auth:{token:token()},transports:['websocket','polling']});
  state.socket.on('ready',({user})=>{setBalance(user.profile);setStatus('Bağlandı. Round başlatılabilir.');});
  state.socket.on('round:started',({roundId,stake,profile})=>{state.roundId=roundId;setBalance(profile);$('#startBtn').disabled=true;$('#cashoutBtn').disabled=false;$('#multiplierLabel').textContent='1.00x';setStatus(`${stake} MC bahis backend tarafından işlendi.`);startTick();});
  state.socket.on('round:tick',({multiplier})=>{$('#multiplierLabel').textContent=`${Number(multiplier).toFixed(2)}x`;});
  state.socket.on('round:crashed',({multiplier})=>{stopTick();$('#multiplierLabel').textContent=`${Number(multiplier).toFixed(2)}x`;setStatus('Round patladı.');toast('Round patladı. Ödül işlenmedi.');});
  state.socket.on('round:cashedout',({payout,multiplier,profile})=>{stopTick();setBalance(profile);$('#multiplierLabel').textContent=`${Number(multiplier).toFixed(2)}x`;setStatus(`${payout} MC backend doğrulamasıyla ödendi.`);toast(`Cashout başarılı: ${payout} MC`);});
  state.socket.on('game:error',({message})=>toast(message));
  state.socket.on('connect_error',(err)=>setStatus(`Bağlantı hatası: ${err.message}`));
}
$('#startBtn').addEventListener('click',()=>state.socket.emit('round:start',{stake:Number($('#stakeInput').value)}));
$('#cashoutBtn').addEventListener('click',()=>state.socket.emit('round:cashout',{roundId:state.roundId}));
connect();
