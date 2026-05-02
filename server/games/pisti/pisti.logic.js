'use strict';

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(`${rank}${suit}`);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function rank(card) {
  return String(card || '').replace(/[SHDC]$/, '');
}

function createGameState(players) {
  const deck = createDeck();
  const hands = {};
  for (const player of players) hands[player.uid] = deck.splice(0, 4);
  const table = deck.splice(0, 4);
  return {
    players,
    deck,
    hands,
    table,
    captured: Object.fromEntries(players.map((p) => [p.uid, []])),
    scores: Object.fromEntries(players.map((p) => [p.uid, 0])),
    turnUid: players[0].uid,
    status: 'active',
    lastCaptureUid: null,
    round: 1,
    winnerUid: null
  };
}

function dealIfNeeded(state) {
  const empty = state.players.every((player) => (state.hands[player.uid] || []).length === 0);
  if (!empty || state.deck.length === 0) return;
  for (const player of state.players) state.hands[player.uid] = state.deck.splice(0, 4);
  state.round += 1;
}

function cardScore(cards, isPisti) {
  let score = isPisti ? 10 : 0;
  for (const card of cards) {
    if (rank(card) === 'A' || rank(card) === 'J') score += 1;
    if (card === '10D') score += 3;
    if (card === '2C') score += 2;
  }
  return score;
}

function finishIfNeeded(state) {
  const noCards = state.deck.length === 0 && state.players.every((player) => (state.hands[player.uid] || []).length === 0);
  if (!noCards) return;
  if (state.table.length && state.lastCaptureUid) {
    state.captured[state.lastCaptureUid].push(...state.table);
    state.scores[state.lastCaptureUid] += cardScore(state.table, false);
    state.table = [];
  }
  const [a, b] = state.players;
  const aCards = state.captured[a.uid].length;
  const bCards = state.captured[b.uid].length;
  if (aCards > bCards) state.scores[a.uid] += 3;
  if (bCards > aCards) state.scores[b.uid] += 3;
  state.status = 'finished';
  state.winnerUid = state.scores[a.uid] === state.scores[b.uid] ? null : (state.scores[a.uid] > state.scores[b.uid] ? a.uid : b.uid);
}

function playCard(state, uid, card) {
  if (!state || state.status !== 'active') return { ok: false, error: 'Oyun aktif değil.' };
  if (state.turnUid !== uid) return { ok: false, error: 'Sıra bu oyuncuda değil.' };
  const hand = state.hands[uid] || [];
  const index = hand.indexOf(card);
  if (index === -1) return { ok: false, error: 'Kart elde bulunmuyor.' };
  hand.splice(index, 1);

  const top = state.table[state.table.length - 1];
  const captures = top && (rank(top) === rank(card) || rank(card) === 'J');
  if (captures) {
    const pile = [...state.table, card];
    const isPisti = state.table.length === 1 && rank(top) === rank(card);
    state.captured[uid].push(...pile);
    state.scores[uid] += cardScore(pile, isPisti);
    state.table = [];
    state.lastCaptureUid = uid;
  } else {
    state.table.push(card);
  }

  const playerIndex = state.players.findIndex((player) => player.uid === uid);
  state.turnUid = state.players[playerIndex === 0 ? 1 : 0].uid;
  dealIfNeeded(state);
  finishIfNeeded(state);
  return { ok: true, state: publicPistiState(state, uid) };
}

function publicPistiState(state, viewerUid = null) {
  return {
    players: state.players.map((player) => ({ uid: player.uid, displayName: player.displayName })),
    deckCount: state.deck.length,
    handCounts: Object.fromEntries(state.players.map((player) => [player.uid, (state.hands[player.uid] || []).length])),
    hand: viewerUid ? (state.hands[viewerUid] || []) : [],
    table: state.table,
    scores: state.scores,
    turnUid: state.turnUid,
    status: state.status,
    round: state.round,
    winnerUid: state.winnerUid
  };
}

module.exports = { createGameState, playCard, publicPistiState };
