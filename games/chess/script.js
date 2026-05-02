'use strict';

const state = { socket: null, roomId: '', user: null, game: null };
const $ = (s) => document.querySelector(s);

function token() { return localStorage.getItem('pm_token') || ''; }
function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  $('#toastRegion').appendChild(node);
  setTimeout(() => node.remove(), 3800);
}
function setStatus(text) { $('#statusText').textContent = text; }

function renderBoard() {
  const board = $('#board');
  const cells = [];
  for (let r = 8; r >= 1; r -= 1) {
    for (const f of 'abcdefgh') cells.push(`<div class="cell ${(r + f.charCodeAt(0)) % 2 ? 'dark' : 'light'}">${f}${r}</div>`);
  }
  board.innerHTML = cells.join('');
  $('#pgnBox').textContent = state.game ? `FEN: ${state.game.fen}\n\nHamleler:\n${(state.game.moves || []).join(' ')}` : 'Oyun verisi yok.';
}

function connect() {
  state.socket = io('/chess', { auth: { token: token() }, transports: ['websocket', 'polling'] });
  state.socket.on('ready', ({ user }) => { state.user = user; setStatus('Bağlandı. Hızlı eşleşme hazır.'); });
  state.socket.on('quickmatch:waiting', () => setStatus('Rakip aranıyor.'));
  state.socket.on('quickmatch:matched', ({ roomId, state: gameState }) => {
    state.roomId = roomId;
    state.game = gameState;
    $('#roomText').textContent = `Oda: ${roomId}`;
    setStatus('Eşleşme bulundu. Oyun başladı.');
    renderBoard();
  });
  state.socket.on('game:state', ({ roomId, state: gameState }) => {
    state.roomId = roomId;
    state.game = gameState;
    $('#roomText').textContent = `Oda: ${roomId}`;
    const turn = gameState.turnUid === (state.user && state.user.uid) ? 'Sıra sende.' : 'Rakip hamlesi bekleniyor.';
    setStatus(turn);
    renderBoard();
  });
  state.socket.on('game:error', ({ message }) => toast(message));
  state.socket.on('connect_error', (err) => setStatus(`Bağlantı hatası: ${err.message}`));
}

$('#quickMatchBtn').addEventListener('click', () => state.socket.emit('quickmatch:join'));
$('#sendMoveBtn').addEventListener('click', () => {
  const move = $('#moveInput').value.trim();
  if (!state.roomId) return toast('Önce eşleşme bulunmalı.');
  state.socket.emit('move', { roomId: state.roomId, move });
  $('#moveInput').value = '';
});
renderBoard();
connect();
