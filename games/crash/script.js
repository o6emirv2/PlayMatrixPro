(() => {
  const token = localStorage.getItem('pm_token') || '';
  const app = document.querySelector('#app');
  const status = document.querySelector('#status');
  let socket; let round = null; let timer = null;
  function render(multiplier = 1) {
    if (!token) { app.innerHTML = '<h1>Giriş gerekli</h1><p class="muted">Crash için ana sayfadan giriş yap.</p>'; return; }
    app.innerHTML = `<div class="grid"><h1>Crash</h1><p class="metric">${multiplier.toFixed(2)}x</p><p class="muted">Kazanç backend cashout doğrulamasıyla işlenir.</p><div class="row"><input id="bet" type="number" min="1" max="100000" value="100"><button id="start">Bahis Yap</button><button class="ghost" id="cashout" ${round?'':'disabled'}>Cashout</button><a class="ghost" href="/">Oyundan Çık</a></div><p id="msg" class="muted"></p></div>`;
    document.querySelector('#start').onclick = () => socket.emit('crash:bet', { bet: Number(document.querySelector('#bet').value) });
    document.querySelector('#cashout').onclick = () => round && socket.emit('crash:cashout', { roundId: round.roundId });
  }
  function connect(){
    if(!token) return render();
    socket=io({auth:{token}});
    socket.on('connect',()=>{status.textContent='Bağlandı';render();});
    socket.on('crash:round',(data)=>{round=data;tick();});
    socket.on('crash:result',(result)=>{clearInterval(timer);round=null;render(result.multiplier);document.querySelector('#msg').textContent=`Sonuç: ${result.payout} MC`;});
    socket.on('crash:error',(e)=>{status.textContent=e.error;});
    socket.on('connect_error',(e)=>{status.textContent=e.message;});
  }
  function tick(){
    clearInterval(timer);
    timer=setInterval(()=>{ if(!round) return; const m=Math.min(round.crashAt,1+(Date.now()-round.startedAt)/4000); render(m); if(m>=round.crashAt){clearInterval(timer);round=null;} },250);
  }
  connect();
})();
