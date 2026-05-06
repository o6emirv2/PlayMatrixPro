const { TtlStore } = require('../core/runtimeStore');
const globalChat = new TtlStore({ ttlMs: 7 * 86400000, max: 500 });
const localChat = new TtlStore({ ttlMs: 7 * 86400000, max: 500 });
const dm = new TtlStore({ ttlMs: 14 * 86400000, max: 1000 });
const presence = new TtlStore({ ttlMs: 180000, max: 10000 });
module.exports = { globalChat, localChat, dm, presence };
