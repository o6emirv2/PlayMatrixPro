(() => {
  const token = localStorage.getItem('pm_token') || '';
  const app = document.querySelector('#app');
  const status = document.querySelector('#status');
  let socket; let roomId = new URLSearchParams(location.search).get('room'); let current = null;
  function render() {
    if (!token) { app.innerHTML = '<h1>Giriş gerekli</h1><p class="muted">Pişti için ana sayfadan giriş yap.</p>'; return; }
    if (!roomId) { app.innerHTML = '<div class="grid"><h1>Pişti</h1><p class="muted">Pişti hızlı eşleşme Render in-memory queue ile çalışır.</p><button id="quick">Hızlı Eşleş</button></div>'; document.querySelector('#quick').onclick = quick; return; }
    if (!current) { app.innerHTML = '<p class="muted">Oda yükleniyor...</p>'; return; }
    const me = current.players.find((p) => Array.isArray(p.hand));
    app.innerHTML = `<div class="grid"><h1>Pişti Odası</h1><p class="muted">Durum: ${current.status} • Sıra: ${current.turn + 1}. oyuncu • Deste: ${current.deck.count}</p><div><strong>Masa</strong><div class="hand">${current.table.map(cardHtml).join('') || '<span class="muted">Boş</span>'}</div></div><div><strong>Elin</strong><div class="hand">${(me?.hand||[]).map((card)=>`<button class="card" data-card="${card.id}">${card.rank}${card.suit}</button>`).join('')}</div></div><div class="row">${current.players.map((p)=>`<span class="ghost card">${p.displayName||p.uid}: ${p.score}</span>`).join('')}</div><a class="ghost" href="/">Oyundan Çık</a></div>`;
    document.querySelectorAll('[data-card]').forEach((button)=>button.onclick=()=>socket.emit('pisti:play-card',{ roomId, cardId: button.dataset.card }));
  }
  function cardHtml(card){ return `<span class="card">${card.rank}${card.suit}</span>`; }
  function connect() {
    if (!token) return render();
    socket = io({ auth: { token } });
    socket.on('connect', () => { status.textContent = 'Bağlandı'; if (roomId) socket.emit('pisti:join', { roomId }); });
    socket.on('quick-match:queued', () => status.textContent = 'Pişti eşleşme aranıyor');
    socket.on('quick-match:found', (data) => { location.href = data.path; });
    socket.on('pisti:state', (room) => { current = room; render(); });
    socket.on('pisti:error', (e) => { status.textContent = e.error; });
    socket.on('connect_error', (e) => { status.textContent = e.message; });
    render();
  }
  function quick() { socket.emit('quick-match:join', { game: 'pisti', bet: 0, mode: 'classic' }); }
  connect();
})();
