export function installStatsGuards(root = document) {
  const modal = root.getElementById('accountStatsModal');
  if (modal) modal.setAttribute('data-stats-ready', '1');
}
