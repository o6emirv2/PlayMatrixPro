async function listFriends(db, uid) { if (!db) return []; const snap = await db.collection('friendships').where('members','array-contains',uid).limit(100).get(); return snap.docs.map(d => ({ id: d.id, ...d.data() })); }
async function requestFriend(db, fromUid, toUid) { if (!db) return { ok: true, memoryOnly: true }; const id = [fromUid,toUid].sort().join('_'); await db.collection('friendships').doc(id).set({ members:[fromUid,toUid], fromUid, toUid, status:'pending', updatedAt:Date.now() }, { merge:true }); return { ok:true }; }
module.exports = { listFriends, requestFriend };
