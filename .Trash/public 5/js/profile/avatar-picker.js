export function createAvatarPicker(options = {}) {
  const avatars = Array.isArray(options.avatars) ? options.avatars : [];
  return { avatars, selected: options.selected || '', destroy() {} };
}
