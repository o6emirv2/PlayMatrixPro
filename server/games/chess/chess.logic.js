const { makeId } = require('../../core/security');

function initialBoard() {
  return [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
}

function colorOf(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'white' : 'black';
}

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function pathClear(board, from, to) {
  const dr = Math.sign(to.r - from.r);
  const dc = Math.sign(to.c - from.c);
  let r = from.r + dr;
  let c = from.c + dc;
  while (r !== to.r || c !== to.c) {
    if (board[r][c]) return false;
    r += dr; c += dc;
  }
  return true;
}

function isLegalMove(board, turn, from, to) {
  if (!inBounds(from.r, from.c) || !inBounds(to.r, to.c)) return false;
  const piece = board[from.r][from.c];
  if (!piece || colorOf(piece) !== turn) return false;
  const target = board[to.r][to.c];
  if (target && colorOf(target) === turn) return false;
  const kind = piece.toLowerCase();
  const dr = to.r - from.r;
  const dc = to.c - from.c;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);
  if (kind === 'p') {
    const direction = turn === 'white' ? -1 : 1;
    const start = turn === 'white' ? 6 : 1;
    if (dc === 0 && !target && dr === direction) return true;
    if (dc === 0 && !target && from.r === start && dr === direction * 2 && !board[from.r + direction][from.c]) return true;
    if (adc === 1 && dr === direction && target && colorOf(target) !== turn) return true;
    return false;
  }
  if (kind === 'n') return (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
  if (kind === 'b') return adr === adc && pathClear(board, from, to);
  if (kind === 'r') return (adr === 0 || adc === 0) && pathClear(board, from, to);
  if (kind === 'q') return (adr === adc || adr === 0 || adc === 0) && pathClear(board, from, to);
  if (kind === 'k') return adr <= 1 && adc <= 1;
  return false;
}

function createChessRoom(players) {
  const roomId = makeId('chess');
  return { roomId, game: 'chess', players, board: initialBoard(), turn: 'white', status: 'playing', winner: null, moves: [], createdAt: Date.now() };
}

function applyMove(room, uid, from, to) {
  if (!room || room.status !== 'playing') throw new Error('ROOM_NOT_PLAYING');
  const playerIndex = room.players.findIndex((p) => p.uid === uid);
  if (playerIndex < 0) throw new Error('PLAYER_NOT_IN_ROOM');
  const playerColor = playerIndex === 0 ? 'white' : 'black';
  if (room.turn !== playerColor) throw new Error('NOT_YOUR_TURN');
  if (!isLegalMove(room.board, room.turn, from, to)) throw new Error('ILLEGAL_MOVE');
  const captured = room.board[to.r][to.c];
  room.board[to.r][to.c] = room.board[from.r][from.c];
  room.board[from.r][from.c] = '';
  room.moves.push({ uid, from, to, captured: captured || null, at: Date.now() });
  if (captured && captured.toLowerCase() === 'k') {
    room.status = 'finished';
    room.winner = uid;
  } else {
    room.turn = room.turn === 'white' ? 'black' : 'white';
  }
  return room;
}

module.exports = { createChessRoom, applyMove };
