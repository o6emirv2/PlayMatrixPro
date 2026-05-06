export function normalizeProfileStats(profile = {}) {
  return {
    level: Number(profile.accountLevel || profile.level || 1),
    xp: Number(profile.xp || 0),
    balance: Number(profile.balance || profile.mc || 0),
    activity: Number(profile.monthlyActiveScore || profile.activity || 0)
  };
}
