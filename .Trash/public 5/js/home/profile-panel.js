export function installProfilePanelGuards(root = document) {
  const panel = root.getElementById('accountDrawer');
  if (panel) panel.setAttribute('data-profile-panel-ready', '1');
}
