(() => {
  const token = localStorage.getItem('pm_token') || '';
  const app = document.querySelector('#app');
  const status = document.querySelector('#status');
  let socket; let roomId = new URLSearchParams(location.search).get('room'); let selected = null; let current = null;
  const pieces = { k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟', K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙' };
  function render() {
    if (!token) { app.innerHTML = '<h1>Giriş gerekli</h1><p class="muted">Satranç için ana sayfadan giriş yap.</p>'; return; }
    if (!roomId) { app.innerHTML = '<div class="grid"><h1>Satranç</h1><p class="muted">Hızlı eşleşme ile oda oluştur.</p><button id="quick">Hızlı Eşleş</button></div>'; document.querySelector('#quick').onclick = quick; return; }
    if (!current) { app.innerHTML = '<p class="muted">Oda yükleniyor...</p>'; return; }
    app.innerHTML = `<div class="grid"><h1>Satranç Odası</h1><p class="muted">Sıra: ${current.turn} • Durum: ${current.status}</p><div class="board">${current.board.flatMap((row,r)=>row.map((piece,c)=>`<button class="cell ${selected?.r===r&&selected?.c===c?'selected':''}" data-r="${r}" data-c="${c}">${pieces[piece]||''}</button>`)).join('')}</div><div class="row"><button class="ghost" id="resign">Pes Et</button><a class="ghost" href="/">Oyundan Çık</a></div></div>`;
    document.querySelectorAll('.cell').forEach((cell)=>cell.onclick=()=>clickCell(Number(cell.dataset.r),Number(cell.dataset.c)));
    document.querySelector('#resign').onclick = () => socket.emit('chess:resign', { roomId });
  }
  function connect() {
    if (!token) return render();
    socket = io({ auth: { token } });
    socket.on('connect', () => { status.textContent = 'Bağlandı'; if (roomId) socket.emit('chess:join', { roomId }); });
    socket.on('quick-match:queued', () => status.textContent = 'Eşleşme aranıyor');
    socket.on('quick-match:found', (data) => { location.href = data.path; });
    socket.on('chess:state', (room) => { current = room; render(); });
    socket.on('chess:error', (e) => { status.textContent = e.error; });
    socket.on('connect_error', (e) => { status.textContent = e.message; });
    render();
  }
  function quick() { socket.emit('quick-match:join', { game: 'chess', bet: 0, mode: 'classic' }); }
  function clickCell(r,c){ if(!selected){ selected={r,c}; render(); return; } socket.emit('chess:move',{ roomId, from:selected, to:{r,c} }); selected=null; }
  connect();
})();
