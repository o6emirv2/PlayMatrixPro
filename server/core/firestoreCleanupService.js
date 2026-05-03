const env = require('../config/env');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');
const LEGACY_FIELDS = ['vip','vipTier','rp','season','seasonScore','seasonLevel','seasonRank','party','partyId','chessElo','pistiElo','crashState','oldLevelProgress','seasonProgress','nameplate','banner','theme'];
async function runSafeFirestoreCleanup({ db, dryRun = env.cleanup.dryRun } = {}) {
  const report = { ok: true, dryRun, enabled: env.cleanup.enabled, fields: LEGACY_FIELDS, scanned: 0, updated: 0, skippedCritical: true, at: Date.now() };
  const fb = initFirebaseAdmin();
  db = db || fb.db;
  if (!db) return { ...report, ok: true, reason: 'FIREBASE_DISABLED' };
  if (!env.cleanup.enabled && dryRun !== true) return { ...report, dryRun: true, reason: 'PHYSICAL_DELETE_DISABLED' };
  try {
    const snap = await db.collection('users').limit(env.cleanup.batchSize).get();
    const batch = db.batch();
    snap.forEach(doc => {
      report.scanned += 1;
      const data = doc.data() || {};
      const patch = {};
      for (const f of LEGACY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(data, f)) patch[f] = fb.admin.firestore.FieldValue.delete();
      }
      if (Object.keys(patch).length) {
        report.updated += 1;
        if (!dryRun) batch.set(doc.ref, patch, { merge: true });
      }
    });
    if (!dryRun && report.updated) await batch.commit();
    console.info('[firestore-cleanup]', JSON.stringify({ dryRun, scanned: report.scanned, updated: report.updated }));
    return report;
  } catch (error) {
    console.error('[firestore-cleanup:error]', JSON.stringify({ message: error.message }));
    return { ok: false, error: error.message, ...report };
  }
}
module.exports = { runSafeFirestoreCleanup, LEGACY_FIELDS };
