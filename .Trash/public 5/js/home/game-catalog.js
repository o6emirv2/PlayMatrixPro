export function installGameRouteNormalizer(root = document) {
  root.querySelectorAll('[data-game-route]').forEach((element) => {
    const route = element.getAttribute('data-game-route');
    if (!route) return;
    element.setAttribute('data-route-ready', '1');
  });
}
