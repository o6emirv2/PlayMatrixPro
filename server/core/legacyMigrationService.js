const { getProgression } = require('./progressionService');
const CLEANUP_FIELD_GROUP = Object.freeze(['legacyAccessFlags','legacyGameRanks','legacyVisualDefaults']);
async function migrateUserProfile(uid, profile = {}, db = null) {
  const xp = profile.xp ?? profile.accountXp ?? '0';
  const progression = getProgression(xp);
  const patch = { xp: progression.xp, accountXp: progression.xp, accountLevel: progression.level, level: progression.level, accountLevelProgressPct: progression.progressPercent, progression };
  if (profile.selectedFrame === undefined || profile.selectedFrame === null) patch.selectedFrame = 0;
  if (db && uid) await db.collection('users').doc(uid).set(patch, { merge: true });
  return { ...profile, ...patch };
}
module.exports = { CLEANUP_FIELD_GROUP, migrateUserProfile };
