export function installLeaderboardGuards(root = document) {
  const area = root.getElementById('leaderboardList');
  if (area) area.setAttribute('data-leaderboard-ready', '1');
}
