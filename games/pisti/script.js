'use strict';

const state = { socket: null, roomId: '', user: null, game: null };
const $ = (s) => document.querySelector(s);
function token(){ return localStorage.getItem('pm_token') || ''; }
function toast(message){ const n=document.createElement('div'); n.className='toast'; n.textContent=message; $('#toastRegion').appendChild(n); setTimeout(()=>n.remove(),3800); }
function setStatus(text){ $('#statusText').textContent=text; }
function cardView(card){ return `<button class="card" data-card="${card}" type="button"><strong>${card.replace(/[SHDC]$/, '')}</strong><span>${card.slice(-1)}</span></button>`; }
function render(){
  const game = state.game;
  $('#tableCards').innerHTML = game ? (game.table.length ? game.table.map(cardView).join('') : '<p class="muted">Masa boş</p>') : '<p class="muted">Oyun bekleniyor</p>';
  $('#handCards').innerHTML = game ? (game.hand.length ? game.hand.map(cardView).join('') : '<p class="muted">El boş</p>') : '';
  $('#scoreBox').innerHTML = game ? Object.entries(game.scores).map(([uid,score])=>`<div><span>${uid===state.user?.uid?'Sen':'Rakip'}</span><strong>${score}</strong></div>`).join('') : '';
  document.querySelectorAll('#handCards .card').forEach((button)=>button.addEventListener('click',()=>{
    if (!state.roomId) return toast('Oda bulunamadı.');
    state.socket.emit('card:play', { roomId: state.roomId, card: button.dataset.card });
  }));
}
function connect(){
  state.socket = io('/pisti', { auth: { token: token() }, transports: ['websocket','polling'] });
  state.socket.on('ready', ({user})=>{ state.user=user; setStatus('Bağlandı. Pişti hızlı eşleşme hazır.'); });
  state.socket.on('quickmatch:waiting',()=>setStatus('Rakip aranıyor.'));
  state.socket.on('quickmatch:matched',({roomId})=>{ state.roomId=roomId; $('#roomText').textContent=`Oda: ${roomId}`; setStatus('Eşleşme bulundu. Kartlar dağıtılıyor.'); });
  state.socket.on('game:state',({roomId,state:gameState})=>{ state.roomId=roomId; state.game=gameState; $('#roomText').textContent=`Oda: ${roomId}`; setStatus(gameState.turnUid===state.user?.uid?'Sıra sende.':'Rakip oynuyor.'); render(); });
  state.socket.on('game:finished',({winnerUid,scores})=>{ setStatus(winnerUid===state.user?.uid?'Kazandın. Ödül backend tarafından işlendi.':'Oyun bitti.'); toast(`Oyun bitti. Skor: ${JSON.stringify(scores)}`); });
  state.socket.on('game:error',({message})=>toast(message));
  state.socket.on('connect_error',(err)=>setStatus(`Bağlantı hatası: ${err.message}`));
}
$('#quickMatchBtn').addEventListener('click',()=>state.socket.emit('quickmatch:join'));
connect(); render();
