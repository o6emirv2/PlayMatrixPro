export function createFramePicker(options = {}) {
  const level = Math.max(1, Math.min(100, Number(options.level) || 1));
  return { level, selected: Number(options.selected || 0), destroy() {} };
}
