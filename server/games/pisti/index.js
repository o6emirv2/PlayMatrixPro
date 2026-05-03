const express = require('express');
const crypto = require('crypto');
const { runtimeStore } = require('../../core/runtimeStore');
const router = express.Router();
const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const MAX_ROOM_MS = 2 * 60 * 60 * 1000;
function now() { return Date.now(); }
function clean(value = '', max = 80) { return String(value || '').trim().slice(0, max); }
function safeNum(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function cardScore(code = '') { const rank = String(code).replace(/\|.*$/, '').slice(0, -1); const suit = String(code).replace(/\|.*$/, '').slice(-1); if (rank === 'A') return 1; if (rank === 'J') return 1; if (rank === '2' && suit === 'C') return 2; if (rank === '10' && suit === 'D') return 3; return 0; }
function rankOf(code = '') { return String(code).replace(/\|.*$/, '').slice(0, -1); }
function makeDeck() { const cards = []; for (const s of SUITS) for (const r of RANKS) cards.push(`${r}${s}|${crypto.randomBytes(3).toString('hex')}`); for (let i = cards.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(0, i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; } return cards; }
function publicProfile(p = {}) { return { uid: clean(p.uid, 160), username: clean(p.username || p.displayName || (p.uid ? `Oyuncu-${String(p.uid).slice(0, 5)}` : 'Oyuncu'), 48), avatar: clean(p.avatar, 1000), selectedFrame: Math.max(0, Math.min(18, Math.floor(safeNum(p.selectedFrame, 0)))) }; }
function createPlayer(profile, hand = []) { return { ...publicProfile(profile), hand, score: 0, collected: 0, connected: true, opponentCardCount: 0 }; }
function refreshOpponentCounts(room) { for (const p of room.players) p.opponentCardCount = Array.isArray(p.hand) ? p.hand.length : 0; }
function createRoom({ hostProfile = {}, guestProfile = null, mode = '2P', bet = 0, isPrivate = false, roomName = '', password = '' } = {}) {
  const deck = makeDeck();
  const tableCards = deck.splice(0, 4);
  const host = createPlayer(hostProfile, deck.splice(0, 4));
  const useBot = guestProfile !== false;
  const guest = useBot ? createPlayer(guestProfile || { uid: 'bot', username: 'PlayMatrix Bot' }, deck.splice(0, 4)) : { uid: '', username: 'Bekleniyor', avatar: '', selectedFrame: 0, hand: [], score: 0, collected: 0, connected: false, opponentCardCount: 0 };
  const id = `pisti_${now()}_${crypto.randomBytes(4).toString('hex')}`;
  const room = { id, roomId: id, roomName: clean(roomName, 48) || `${host.username} Masası`, hostName: host.username, mode: clean(mode, 12) || '2P', bet: Math.max(0, Math.floor(safeNum(bet, 0))), isPrivate: !!isPrivate, password: clean(password, 48), maxPlayers: 2, currentPlayers: guest.uid && guest.uid !== 'bot' ? 2 : 1, players: [host, guest], turn: 0, tableCards, deck, deckCount: deck.length, status: guest.uid === 'bot' ? 'playing' : 'waiting', winner: [], createdAt: now(), updatedAt: now(), stateVersion: 1, lastEvent: null };
  refreshOpponentCounts(room);
  runtimeStore.rooms.set(`pisti:${id}`, room, MAX_ROOM_MS);
  return room;
}
function getRoom(id) { return runtimeStore.rooms.get(`pisti:${clean(id, 160)}`); }
function saveRoom(room) { room.updatedAt = now(); room.deckCount = room.deck.length; refreshOpponentCounts(room); runtimeStore.rooms.set(`pisti:${room.id}`, room, MAX_ROOM_MS); return room; }
function publicRoom(room, viewerUid = '') {
  if (!room) return null;
  const uid = clean(viewerUid, 160);
  const clone = { ...room, deck: undefined, password: undefined, players: room.players.map((p) => ({ ...p, hand: p.uid === uid ? [...p.hand] : [] })) };
  clone.currentPlayers = room.players.filter(p => p.uid && p.uid !== 'bot').length || 1;
  clone.deckCount = room.deck.length;
  return clone;
}
function lobbyRoom(room) { return { id: room.id, roomId: room.id, roomName: room.roomName, hostName: room.hostName, mode: room.mode, bet: room.bet, currentPlayers: room.currentPlayers, maxPlayers: room.maxPlayers, isPrivate: room.isPrivate, status: room.status, createdAt: room.createdAt, updatedAt: room.updatedAt }; }
function joinRoom(room, profile = {}) { if (!room) throw new Error('ROOM_NOT_FOUND'); if (room.status !== 'waiting') throw new Error('ROOM_FULL'); const p = room.players[1]; Object.assign(p, createPlayer(profile, p.hand && p.hand.length ? p.hand : room.deck.splice(0, 4))); room.currentPlayers = 2; room.status = 'playing'; room.stateVersion += 1; return saveRoom(room); }
function maybeDeal(room) { if (!room.players.every(p => p.hand.length === 0)) return; if (room.deck.length <= 0) { finishRoom(room); return; } for (const p of room.players) p.hand = room.deck.splice(0, 4); room.stateVersion += 1; }
function finishRoom(room) { room.status = 'finished'; const scores = room.players.map(p => p.score); const best = Math.max(...scores); room.winner = room.players.filter(p => p.score === best).map(p => p.uid); room.finishReason = 'normal'; room.resultSummary = { gameType: 'pisti', settledAt: now(), outcome: room.winner.length > 1 ? 'draw' : 'finished', title: room.winner.length > 1 ? 'BERABERE' : 'OYUN BİTTİ', message: 'Pişti sonucu backend tarafından doğrulandı.' }; }
function botMoveIfNeeded(room) { const botIndex = room.players.findIndex(p => p.uid === 'bot'); if (botIndex < 0 || room.status !== 'playing' || room.turn !== botIndex) return; const bot = room.players[botIndex]; const card = bot.hand[0]; if (card) play(room, 'bot', card, { skipBot: true }); }
function play(room, uid, cardToken, options = {}) {
  if (!room) throw new Error('ROOM_NOT_FOUND');
  if (room.status !== 'playing') throw new Error('ROOM_NOT_PLAYING');
  const playerIndex = room.players.findIndex(p => p.uid === clean(uid, 160));
  if (playerIndex < 0) throw new Error('PLAYER_NOT_IN_ROOM');
  if (room.turn !== playerIndex) throw new Error('NOT_YOUR_TURN');
  const player = room.players[playerIndex];
  const idx = player.hand.findIndex(c => c === cardToken || c.split('|')[0] === String(cardToken).split('|')[0]);
  if (idx < 0) throw new Error('CARD_NOT_IN_HAND');
  const [card] = player.hand.splice(idx, 1);
  const tableBefore = [...room.tableCards];
  const top = room.tableCards[room.tableCards.length - 1];
  const capture = !!top && (rankOf(top) === rankOf(card) || rankOf(card) === 'J');
  let gained = cardScore(card);
  let eventType = 'play';
  if (capture) {
    gained += room.tableCards.reduce((a, c) => a + cardScore(c), 0);
    const pisti = room.tableCards.length === 1;
    if (pisti) gained += rankOf(card) === 'J' ? 20 : 10;
    player.score += gained;
    player.collected += room.tableCards.length + 1;
    room.tableCards = [];
    eventType = pisti ? 'pisti' : 'capture';
  } else {
    room.tableCards.push(card);
  }
  room.lastEvent = { type: eventType, uid: player.uid, card, tableBefore, gained, ts: now() };
  room.turn = (playerIndex + 1) % room.players.length;
  maybeDeal(room);
  room.stateVersion += 1;
  saveRoom(room);
  if (!options.skipBot) botMoveIfNeeded(room);
  return { captured: capture, pisti: eventType === 'pisti', room };
}
router.get('/rooms/:id', (req, res) => res.json({ ok: true, room: publicRoom(getRoom(req.params.id), req.query.uid || req.headers['x-playmatrix-user']) }));
router.post('/rooms', (req, res) => { const room = createRoom({ hostProfile: req.body.hostProfile || { uid: req.body.uid || req.headers['x-playmatrix-user'], username: req.body.username }, mode: req.body.mode, bet: req.body.bet, isPrivate: req.body.isPrivate, roomName: req.body.roomName, password: req.body.password }); res.status(201).json({ ok: true, room: publicRoom(room, req.body.uid || req.headers['x-playmatrix-user']) }); });
router.post('/rooms/:id/play', (req, res) => { try { const room = getRoom(req.params.id); const out = play(room, req.body.uid || req.headers['x-playmatrix-user'], req.body.cardToken || req.body.cardId); res.json({ ok: true, room: publicRoom(out.room, req.body.uid || req.headers['x-playmatrix-user']), captured: out.captured, pisti: out.pisti }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } });
module.exports = { router, createRoom, getRoom, saveRoom, publicRoom, lobbyRoom, joinRoom, play };
