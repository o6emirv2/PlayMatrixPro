const { makeId } = require('../../core/security');

const suits = ['S','H','D','C'];
const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function createDeck() { return shuffle(suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank, id: `${rank}${suit}` })))); }
function deal(deck, count) { return deck.splice(0, count); }
function cardPoints(card) {
  if (!card) return 0;
  if (card.rank === 'A' || card.rank === 'J') return 1;
  if (card.rank === '2' && card.suit === 'C') return 2;
  if (card.rank === '10' && card.suit === 'D') return 3;
  return 0;
}
function capturedPoints(cards) { return cards.reduce((sum, card) => sum + cardPoints(card), 0); }

function createPistiRoom(players, options = {}) {
  const deck = createDeck();
  const table = deal(deck, 4);
  const roomId = makeId('pisti');
  return {
    roomId,
    game: 'pisti',
    players: players.map((p, index) => ({ ...p, seat: index, hand: deal(deck, 4), captured: [], score: 0 })),
    deck,
    table,
    turn: 0,
    status: 'playing',
    bet: Number(options.bet || 0),
    lastCaptureSeat: null,
    createdAt: Date.now()
  };
}

function refillHands(room) {
  if (room.deck.length === 0) return;
  if (room.players.every((p) => p.hand.length === 0)) {
    for (const player of room.players) player.hand = deal(room.deck, 4);
  }
}

function finishIfNeeded(room) {
  if (room.deck.length || room.players.some((p) => p.hand.length)) return room;
  if (room.lastCaptureSeat !== null && room.table.length) {
    room.players[room.lastCaptureSeat].captured.push(...room.table.splice(0));
  }
  for (const player of room.players) player.score = capturedPoints(player.captured) + (player.captured.length > 26 ? 3 : 0);
  room.status = 'finished';
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  room.winner = sorted[0].score === sorted[1].score ? null : sorted[0].uid;
  return room;
}

function playCard(room, uid, cardId) {
  if (!room || room.status !== 'playing') throw new Error('ROOM_NOT_PLAYING');
  const seat = room.players.findIndex((p) => p.uid === uid);
  if (seat < 0) throw new Error('PLAYER_NOT_IN_ROOM');
  if (seat !== room.turn) throw new Error('NOT_YOUR_TURN');
  const player = room.players[seat];
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index < 0) throw new Error('CARD_NOT_IN_HAND');
  const [card] = player.hand.splice(index, 1);
  const top = room.table[room.table.length - 1];
  const captures = top && (card.rank === 'J' || card.rank === top.rank);
  room.table.push(card);
  if (captures) {
    const captured = room.table.splice(0);
    player.captured.push(...captured);
    if (captured.length === 2) player.score += 10;
    room.lastCaptureSeat = seat;
  }
  room.turn = (room.turn + 1) % room.players.length;
  refillHands(room);
  finishIfNeeded(room);
  return room;
}

module.exports = { createPistiRoom, playCard };
