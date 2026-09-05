import crypto from 'crypto';

export function log(level, message, meta = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...meta };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export function generateId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function getClientIP(req) {
  const xReal = req.headers['x-real-ip'];
  if (xReal) return xReal;
  const xForwarded = req.headers['x-forwarded-for'];
  if (xForwarded) return xForwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function parseCookies(cookieStr) {
  if (!cookieStr) return {};
  return cookieStr.split(';').reduce((obj, pair) => {
    const [key, ...vals] = pair.trim().split('=');
    obj[key] = vals.join('=');
    return obj;
  }, {});
}

export function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}