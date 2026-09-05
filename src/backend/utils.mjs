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
  if (!source || typeof source !== 'object') return target;
  const result = { ...target };
  const seen = new WeakSet();

  function merge(dest, src) {
    for (const key in src) {
      const value = src[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (seen.has(value)) continue;
        seen.add(value);
        if (!dest[key] || typeof dest[key] !== 'object' || Array.isArray(dest[key])) {
          dest[key] = {};
        }
        merge(dest[key], value);
      } else {
        dest[key] = value;
      }
    }
  }

  merge(result, source);
  return result;
}