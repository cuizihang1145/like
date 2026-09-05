import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { executeHooks } from './hooks.js';

let kv = null;
let mockStore = {};

// GET 的 Lua 脚本
const GET_LUA = `
  local countKey = KEYS[1]
  local nonceKey = KEYS[2]
  local ttl = tonumber(ARGV[#ARGV])
  redis.call('SET', nonceKey, 'valid', 'EX', ttl)
  for i = 1, #ARGV - 1 do
    local id = ARGV[i]
    redis.call('HSETNX', countKey, id, '0')
  end
  return redis.call('HGETALL', countKey)
`;

// POST 的 Lua 脚本
const POST_LUA = `
  local shortKey = KEYS[1]
  local sessionKey = KEYS[2]
  local countKey = KEYS[3]
  local nonceKey = KEYS[4]
  local renewKey = KEYS[5]
  local now = tonumber(ARGV[1])
  local delta = tonumber(ARGV[2])
  local rateLimitMs = tonumber(ARGV[3])
  local sessionLimit = tonumber(ARGV[4])
  local renewLimit = tonumber(ARGV[5])
  local renewWindow = tonumber(ARGV[6])
  local field = ARGV[7]
  local nonce = ARGV[8]
  local disableNonce = tonumber(ARGV[9] or 0)
  local disableRateLimit = tonumber(ARGV[10] or 0)

  if disableNonce == 0 then
    if redis.call('GET', nonceKey) == false then
      return {0, 'invalid_nonce', 0}
    end
    redis.call('DEL', nonceKey)
  end

  if disableRateLimit == 0 then
    local shortVal = redis.call('GET', shortKey)
    if shortVal then
      local lastTime = tonumber(shortVal)
      if (now - lastTime) < rateLimitMs then
        return {0, 'rate', 0}
      end
    end
    local sessionVal = redis.call('GET', sessionKey)
    if sessionVal then
      local count = tonumber(sessionVal)
      if count >= sessionLimit then
        return {0, 'limit', 0}
      end
    end
    redis.call('SET', shortKey, now, 'PX', rateLimitMs)
    redis.call('INCR', sessionKey)
    redis.call('EXPIRE', sessionKey, 300)
  end

  local newVal = redis.call('HINCRBY', countKey, field, delta)
  if newVal < 0 then
    newVal = 0
    redis.call('HSET', countKey, field, 0)
  end

  local shouldRenew = 0
  if disableNonce == 0 then
    local renewCount = redis.call('INCR', renewKey)
    if renewCount == 1 then
      redis.call('EXPIRE', renewKey, renewWindow)
    end
    if renewCount <= renewLimit then
      shouldRenew = 1
    end
  end

  return {newVal, 'ok', shouldRenew}
`;

// ===== Mock Redis 实现 =====
function createMockRedis(config) {
  const log = config.log?.enabled ? console.warn : () => {};
  return {
    async eval(script, keys, args) {
      log('⚠️ Mock: eval', script.slice(0, 30), keys, args);
      // 简单的 mock 返回值
      if (script.includes('HGETALL')) return {};
      return [0, 'ok', 1];
    },
    async set(key, value, opts) {
      mockStore[key] = value;
      log('⚠️ Mock: set', key);
      return 'OK';
    },
    async get(key) {
      log('⚠️ Mock: get', key);
      return mockStore[key] || null;
    },
    async incr(key) {
      mockStore[key] = (mockStore[key] || 0) + 1;
      log('⚠️ Mock: incr', key, '→', mockStore[key]);
      return mockStore[key];
    },
    async expire(key, seconds) {
      log('⚠️ Mock: expire', key, seconds);
      return 1;
    },
    async del(key) {
      delete mockStore[key];
      log('⚠️ Mock: del', key);
      return 1;
    },
    async hset(key, field, value) {
      if (!mockStore[key]) mockStore[key] = {};
      mockStore[key][field] = value;
      return 1;
    },
    async hincrby(key, field, delta) {
      if (!mockStore[key]) mockStore[key] = {};
      mockStore[key][field] = (mockStore[key][field] || 0) + delta;
      return mockStore[key][field];
    },
    async hgetall(key) {
      log('⚠️ Mock: hgetall', key);
      return mockStore[key] || {};
    },
    async hsetnx(key, field, value) {
      if (!mockStore[key]) mockStore[key] = {};
      if (mockStore[key][field] !== undefined) return 0;
      mockStore[key][field] = value;
      return 1;
    }
  };
}

export function getRedis(config) {
  // ===== 调试：Mock Redis =====
  if (config.debug.mockRedis) {
    return createMockRedis(config);
  }

  if (!kv) {
    const options = {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    };

    // ===== performance.redis.timeout =====
    if (config.performance.redis.timeout) {
      options.timeout = config.performance.redis.timeout;
    }

    // ===== performance.redis.retryAttempts + retryDelay =====
    if (config.performance.redis.retryAttempts > 0) {
      options.retry = {
        attempts: config.performance.redis.retryAttempts,
        backoff: (attempt) => {
          const delay = config.performance.redis.retryDelay || 100;
          return Math.min(delay * Math.pow(2, attempt - 1), 5000);
        }
      };
    }

    kv = new Redis(options);
  }
  return kv;
}

export async function runGetLua(ctx, ids, disableNonce = false) {
  const { config, sessionId, redis } = ctx;
  const nonce = crypto.randomBytes(16).toString('hex');
  const idArray = ids.split(',').filter(id => id.match(new RegExp(config.idPattern)));
  const args = [...idArray, String(config.nonce.ttl)];
  const keys = [
    `${config.redisPrefix}:counts:${config.scope}`,
    `nonce:${nonce}`,
  ];

  ctx.log('debug', 'GET Lua', { keys, args: args.slice(0, 5) });

  // ===== performance.redis.luaEnabled =====
  let result;
  if (config.performance.redis.luaEnabled) {
    await executeHooks(config.hooks, 'beforeRedisCommand', 'EVAL', [GET_LUA, keys, args], ctx);
    result = await redis.eval(GET_LUA, keys, args);
    await executeHooks(config.hooks, 'afterRedisCommand', 'EVAL', result, ctx);
  } else {
    // 降级：逐个 hsetnx
    ctx.log('warn', 'Lua disabled, fallback to multi-command');
    await executeHooks(config.hooks, 'beforeRedisCommand', 'HSETNX', keys, args, ctx);
    const countKey = keys[0];
    for (const id of idArray) {
      await redis.hsetnx(countKey, id, '0');
    }
    result = await redis.hgetall(countKey);
    await executeHooks(config.hooks, 'afterRedisCommand', 'HGETALL', result, ctx);
    // 还要设置 nonce
    await redis.set(`nonce:${nonce}`, 'valid', { ex: config.nonce.ttl });
  }

  const data = {};
  for (let i = 0; i < result.length; i += 2) {
    data[result[i]] = result[i+1];
  }
  return { data, nonce: disableNonce ? null : nonce };
}

export async function runPostLua(ctx, id, action, nonce, disableRateLimit = false, disableNonce = false) {
  const { config, sessionId, ip, redis } = ctx;
  const delta = action === 'like' ? 1 : -1;
  const now = Date.now();

  const shortKey = `rate:short:${ip}:${id}`;
  const sessionKey = `rate:session:${sessionId}`;
  const countKey = `${config.redisPrefix}:counts:${config.scope}`;
  const nonceKey = `nonce:${nonce}`;
  const renewKey = `renew:count:${sessionId}`;

  const args = [
    String(now),
    String(delta),
    String(config.rateLimit.perSession.cooldown),
    String(config.sessionLimit),
    String(config.nonce.renewLimit),
    String(config.nonce.renewWindow),
    id,
    nonce,
    String(disableNonce ? 1 : 0),
    String(disableRateLimit ? 1 : 0),
  ];
  const keys = [shortKey, sessionKey, countKey, nonceKey, renewKey];

  ctx.log('debug', 'POST Lua', { keys, args: args.slice(0, 5) });

  // ===== performance.redis.luaEnabled =====
  let result;
  if (config.performance.redis.luaEnabled) {
    await executeHooks(config.hooks, 'beforeRedisCommand', 'EVAL', [POST_LUA, keys, args], ctx);
    try {
      result = await redis.eval(POST_LUA, keys, args);
    } catch (err) {
      await executeHooks(config.hooks, 'onRedisError', err, 'EVAL', [POST_LUA, keys, args], ctx);
      throw err;
    }
    await executeHooks(config.hooks, 'afterRedisCommand', 'EVAL', result, ctx);
  } else {
    // 降级：普通命令
    ctx.log('warn', 'Lua disabled, fallback to multi-command');
    let status = 'ok';
    let newVal = 0;
    let shouldRenew = 0;

    // Nonce 校验
    if (!disableNonce) {
      const nonceVal = await redis.get(nonceKey);
      if (!nonceVal) {
        return { error: 'invalid_nonce' };
      }
      await redis.del(nonceKey);
    }

    // 限流
    if (!disableRateLimit) {
      const shortVal = await redis.get(shortKey);
      if (shortVal && (now - parseInt(shortVal, 10)) < config.rateLimit.perSession.cooldown) {
        return { error: 'rate' };
      }
      const sessionVal = await redis.get(sessionKey);
      if (sessionVal && parseInt(sessionVal, 10) >= config.sessionLimit) {
        return { error: 'limit' };
      }
      await redis.set(shortKey, String(now), { px: config.rateLimit.perSession.cooldown });
      await redis.incr(sessionKey);
      await redis.expire(sessionKey, 300);
    }

    // 更新计数
    newVal = await redis.hincrby(countKey, id, delta);
    if (newVal < 0) {
      newVal = 0;
      await redis.hset(countKey, id, '0');
    }

    // Nonce 续期
    if (!disableNonce) {
      const renewCount = await redis.incr(renewKey);
      if (renewCount === 1) await redis.expire(renewKey, config.nonce.renewWindow);
      if (renewCount <= config.nonce.renewLimit) shouldRenew = 1;
    }

    result = [newVal, status, shouldRenew];
  }

  const [newVal, status, shouldRenew] = result;
  if (status !== 'ok') {
    return { error: status };
  }

  let newNonce = null;
  if (!disableNonce && shouldRenew === 1) {
    newNonce = crypto.randomBytes(16).toString('hex');
    await redis.set(`nonce:${newNonce}`, 'valid', { ex: config.nonce.ttl });
    await executeHooks(config.hooks, 'onNonceRenew', nonce, newNonce, ctx);
    ctx.log('debug', 'Nonce renewed', { old: nonce.slice(0, 8), new: newNonce.slice(0, 8) });
  }
  return { newVal, newNonce };
}