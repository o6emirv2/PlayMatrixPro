const { pushAdminLog, runtimeStore } = require('../core/runtimeStore');

function addAdminRuntimeLog(type, payload = {}) {
  return pushAdminLog({ type, payload });
}

function listAdminRuntimeLogs(limit = 200) {
  return runtimeStore.adminLogs.slice(-limit).reverse();
}

module.exports = { addAdminRuntimeLog, listAdminRuntimeLogs };
