'use strict';

let ChessCtor = null;
try {
  const chessModule = require('chess.js');
  ChessCtor = chessModule.Chess || chessModule;
} catch (_) {
  ChessCtor = null;
}

function createGameState(players) {
  const chess = ChessCtor ? new ChessCtor() : null;
  return {
    players,
    turnUid: players[0].uid,
    fen: chess && typeof chess.fen === 'function' ? chess.fen() : 'startpos',
    pgn: '',
    status: 'active',
    winnerUid: null,
    moves: [],
    engine: chess ? chess : null
  };
}

function applyMove(state, uid, moveInput) {
  if (!state || state.status !== 'active') return { ok: false, error: 'Oyun aktif değil.' };
  if (state.turnUid !== uid) return { ok: false, error: 'Sıra bu oyuncuda değil.' };
  const clean = String(moveInput || '').trim();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(clean)) return { ok: false, error: 'Hamle formatı geçersiz. Örnek: e2e4' };

  if (state.engine) {
    const move = state.engine.move({ from: clean.slice(0, 2), to: clean.slice(2, 4), promotion: clean[4] || 'q' });
    if (!move) return { ok: false, error: 'Geçersiz satranç hamlesi.' };
    state.fen = state.engine.fen();
    state.pgn = state.engine.pgn();
    state.moves.push(clean);
    if (state.engine.game_over && state.engine.game_over()) {
      state.status = 'finished';
      state.winnerUid = state.engine.in_checkmate && state.engine.in_checkmate() ? uid : null;
    }
  } else {
    state.moves.push(clean);
    state.fen = `fallback:${state.moves.join(',')}`;
  }

  const index = state.players.findIndex((player) => player.uid === uid);
  state.turnUid = state.players[index === 0 ? 1 : 0].uid;
  return { ok: true, state: publicChessState(state) };
}

function publicChessState(state) {
  return {
    players: state.players.map((player, index) => ({ uid: player.uid, displayName: player.displayName, color: index === 0 ? 'white' : 'black' })),
    turnUid: state.turnUid,
    fen: state.fen,
    pgn: state.pgn,
    status: state.status,
    winnerUid: state.winnerUid,
    moves: state.moves.slice(-30)
  };
}

module.exports = { createGameState, applyMove, publicChessState };
