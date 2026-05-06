export function installSocialEntryGuards(root = document) {
  const modal = root.getElementById('socialModal');
  if (modal) modal.setAttribute('data-social-ready', '1');
}
