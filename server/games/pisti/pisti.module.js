const express = require('express');
const { runtimeStore } = require('../../core/runtimeStore');
const { createPistiRoom } = require('./pisti.logic');

function createQuickMatchRoom(players, options = {}) {
  const room = createPistiRoom(players, options);
  runtimeStore.rooms.set(`pisti:${room.roomId}`, room);
  return room;
}

function createRouter() {
  const router = express.Router();
  router.get('/rooms/:roomId', (req, res) => {
    const room = runtimeStore.rooms.get(`pisti:${req.params.roomId}`);
    if (!room) return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
    return res.json({ ok: true, room });
  });
  return router;
}

module.exports = { game: 'pisti', createRouter, createQuickMatchRoom };
