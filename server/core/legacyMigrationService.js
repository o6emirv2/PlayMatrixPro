const { getProgression } = require('./progressionService');
const LEGACY_FIELDS = ['vip','vipTier','rp','seasonRp','seasonScore','selectedFrameLegacy'];
async function migrateUserProfile(uid, profile = {}, db = null) {
  const xp = Number(profile.xp ?? profile.accountXp ?? 0) || 0;
  const progression = getProgression(xp);
  const patch = { progression, accountXp: progression.currentXp, accountXpExact: progression.currentXpExact, accountLevel: progression.accountLevel, accountLevelProgressPct: progression.accountLevelProgressPct, progressPercent: progression.progressPercent, currentLevelStartXp: progression.currentLevelStartXp, nextLevelXp: progression.nextLevelXp, xpIntoLevel: progression.xpIntoLevel, xpToNextLevel: progression.xpToNextLevel, accountProgressionVersion: progression.accountProgressionVersion, accountLevelCurveMode: progression.accountLevelCurveMode };
  if (profile.selectedFrame === undefined || profile.selectedFrame === null) patch.selectedFrame = 0;
  if (db) await db.collection('users').doc(uid).set(patch, { merge: true });
  return { ...profile, ...patch };
}
module.exports = { LEGACY_FIELDS, migrateUserProfile };
