function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function assertObject(value, label = 'payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${label} must be an object`);
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return value;
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    const error = new Error(`${label} is invalid`);
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return value;
}

function toPositiveNumber(value, fallback = 0, max = 1000000) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(number, max);
}

module.exports = { isEmail, assertObject, assertEnum, toPositiveNumber };
