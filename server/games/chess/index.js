const express = require('express');
const crypto = require('crypto');
const { Chess } = require('chess.js');
const { runtimeStore } = require('../../core/runtimeStore');
const router = express.Router();
const MAX_ROOM_MS = 3 * 60 * 60 * 1000;
function now(){ return Date.now(); }
function clean(v='', max=80){ return String(v||'').trim().slice(0,max); }
function safeNum(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
function profile(p={}){ return { uid: clean(p.uid,160), username: clean(p.username || p.displayName || (p.uid ? `Oyuncu-${String(p.uid).slice(0,5)}` : 'Oyuncu'),48), avatar: clean(p.avatar,1000), selectedFrame: Math.max(0,Math.min(18,Math.floor(safeNum(p.selectedFrame,0)))) }; }
function createRoom({ hostProfile = {}, guestProfile = null } = {}){
  const game = new Chess();
  const id = `chess_${now()}_${crypto.randomBytes(4).toString('hex')}`;
  const host = profile(hostProfile);
  const room = { id, roomId:id, hostUid: host.uid, host: { ...host, color:'w' }, guest: guestProfile ? { ...profile(guestProfile), color:'b' } : null, guestUid: guestProfile?.uid || '', fen: game.fen(), pgn:'', turn:'w', status: guestProfile ? 'playing' : 'waiting', winner:'', createdAt: now(), updatedAt: now(), stateVersion: 1, clock: { w: 10*60*1000, b: 10*60*1000 } };
  runtimeStore.rooms.set(`chess:${id}`, room, MAX_ROOM_MS);
  return room;
}
function getRoom(id){ return runtimeStore.rooms.get(`chess:${clean(id,160)}`); }
function saveRoom(room){ room.updatedAt=now(); runtimeStore.rooms.set(`chess:${room.id}`, room, MAX_ROOM_MS); return room; }
function lobbyRoom(room){ return { id: room.id, roomId: room.id, hostUid: room.host.uid, guestUid: room.guest?.uid || '', host: room.host.username, guest: room.guest?.username || 'Bilinmeyen', status: room.status, createdAt: room.createdAt, updatedAt: room.updatedAt }; }
function joinRoom(room, guestProfile){ if(!room) throw new Error('ROOM_NOT_FOUND'); if(room.status !== 'waiting') throw new Error('ROOM_FULL'); room.guest={...profile(guestProfile), color:'b'}; room.guestUid=room.guest.uid; room.status='playing'; room.stateVersion+=1; return saveRoom(room); }
function publicRoom(room){ return room || null; }
function applyMove(room, { uid, from, to, promotion='q', move=null } = {}){
  if(!room) throw new Error('ROOM_NOT_FOUND');
  if(room.status !== 'playing') throw new Error('ROOM_NOT_PLAYING');
  const color = room.host?.uid === uid ? 'w' : (room.guest?.uid === uid ? 'b' : '');
  if(!color) throw new Error('PLAYER_NOT_IN_ROOM');
  if(room.turn !== color) throw new Error('NOT_YOUR_TURN');
  const game = new Chess(room.fen);
  const moved = game.move(move || { from, to, promotion });
  if(!moved) throw new Error('ILLEGAL_MOVE');
  room.fen = game.fen(); room.pgn = game.pgn(); room.turn = game.turn(); room.stateVersion += 1;
  if(game.in_checkmate && game.in_checkmate()){ room.status='finished'; room.winner = color === 'w' ? 'white' : 'black'; room.resultSummary={gameType:'chess',outcome:'win',message:'Şah mat backend tarafından doğrulandı.'}; }
  else if((game.in_draw && game.in_draw()) || (game.in_stalemate && game.in_stalemate())){ room.status='finished'; room.winner='draw'; room.resultSummary={gameType:'chess',outcome:'draw',message:'Beraberlik backend tarafından doğrulandı.'}; }
  return saveRoom(room);
}
router.get('/rooms/:id',(req,res)=>res.json({ok:true,room:publicRoom(getRoom(req.params.id))}));
router.post('/rooms',(req,res)=>res.status(201).json({ok:true,room:createRoom({hostProfile:req.body.hostProfile||{uid:req.body.uid||req.headers['x-playmatrix-user'],username:req.body.username}})}));
router.post('/rooms/:id/move',(req,res)=>{try{const room=applyMove(getRoom(req.params.id),{uid:req.body.uid||req.headers['x-playmatrix-user'],from:req.body.from,to:req.body.to,promotion:req.body.promotion,move:req.body.move});res.json({ok:true,room});}catch(e){res.status(400).json({ok:false,error:e.message});}});
module.exports = { router, createRoom, getRoom, saveRoom, publicRoom, lobbyRoom, joinRoom, applyMove };
