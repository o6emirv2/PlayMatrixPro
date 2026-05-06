export function installHeroSliderGuards(root = document) {
  const viewport = root.getElementById('pmHeroViewport');
  if (viewport) viewport.setAttribute('data-hero-ready', '1');
}
