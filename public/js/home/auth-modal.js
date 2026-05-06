export function installAuthModalGuards(root = document) {
  root.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.setAttribute('type', 'button');
  });
}
