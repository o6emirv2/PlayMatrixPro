const { TtlStore } = require('../core/runtimeStore');
const logs = new TtlStore({ ttlMs: 24 * 60 * 60 * 1000, max: 1000 });
function addAdminLog(event, payload = {}) { const row = { id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, event, payload, at: Date.now() }; logs.set(row.id, row); console.log('[admin]', event, payload); return row; }
function listAdminLogs() { return logs.values().sort((a,b)=>b.at-a.at); }
module.exports = { addAdminLog, listAdminLogs };
