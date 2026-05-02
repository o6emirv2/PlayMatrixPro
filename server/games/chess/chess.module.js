const express = require('express');
const { runtimeStore } = require('../../core/runtimeStore');
const { createChessRoom } = require('./chess.logic');

function createQuickMatchRoom(players, options = {}) {
  const room = createChessRoom(players, options);
  runtimeStore.rooms.set(`chess:${room.roomId}`, room);
  return room;
}

function createRouter() {
  const router = express.Router();
  router.get('/rooms/:roomId', (req, res) => {
    const room = runtimeStore.rooms.get(`chess:${req.params.roomId}`);
    if (!room) return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
    return res.json({ ok: true, room });
  });
  return router;
}

module.exports = { game: 'chess', createRouter, createQuickMatchRoom };
