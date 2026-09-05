import { deepMerge, getClientIP, parseCookies, generateId, log } from './utils.js';
import { defaultConfig } from './config.js';
import { executeHooks } from './hooks.js';
import { getRedis, runGetLua, runPostLua } from './redis.js';
import { validateSession } from './session.js';
import { initPusher } from './pusher.js';

export default function createLikes(userConfig = {}) {
  const config = deepMerge(defaultConfig, userConfig);
  const pusher = config.pusher.enabled ? initPusher(config.pusher) : null;
  const redis = getRedis(config);

  return async function handler(req, res) {
    const ctx = {
      config,
      redis,
      pusher,
      startTime: Date.now(),
      req,
      res,
      sessionId: null,
      ip: getClientIP(req),
      requestId: generateId(8),
      log: (level, message, meta) => {
        if (!config.log.enabled) return;
        const logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
        const currentLevel = logLevels[config.log.level] || 1;
        const msgLevel = logLevels[level] || 1;
        if (msgLevel < currentLevel) return;
        log(level, message, { ...meta, requestId: ctx.requestId, ...(config.log.ip && { ip: ctx.ip }), ...(config.log.sessionId && { sessionId: ctx.sessionId }) });
      }
    };

    ctx.log('info', 'Request started', { method: req.method, path: req.url });

    const early = await executeHooks(config.hooks, 'onRequestStart', req, ctx);
    if (early === false) return;

    if (config.security.cors.enabled) {
      res.setHeader('Access-Control-Allow-Origin', config.security.cors.allowOrigin);
      res.setHeader('Access-Control-Allow-Methods', config.security.cors.allowMethods);
      res.setHeader('Access-Control-Allow-Headers', config.security.cors.allowHeaders);
    }

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // 调试：禁用会话
    if (!config.debug.disableSession) {
      const cookie = parseCookies(req.headers.cookie || '');
      let sessionId = cookie[config.cookieName];
      if (!sessionId) {
        sessionId = generateId(16);
        res.setHeader('Set-Cookie', `${config.cookieName}=${sessionId}; HttpOnly; Secure; SameSite=${config.security.cookie.sameSite}; Max-Age=${config.sessionTTL}; Path=/`);
        ctx.isNewSession = true;
        await executeHooks(config.hooks, 'onSessionCreate', sessionId, req, ctx);
        ctx.log('info', 'New session created', { sessionId: sessionId.slice(0, 8) });
      } else {
        const valid = await validateSession(sessionId, config, ctx);
        if (!valid) {
          await executeHooks(config.hooks, 'onSessionDestroy', sessionId, 'invalid', req, ctx);
          sessionId = generateId(16);
          res.setHeader('Set-Cookie', `${config.cookieName}=${sessionId}; HttpOnly; Secure; SameSite=${config.security.cookie.sameSite}; Max-Age=${config.sessionTTL}; Path=/`);
          ctx.isNewSession = true;
          await executeHooks(config.hooks, 'onSessionCreate', sessionId, req, ctx);
          ctx.log('info', 'Session recreated', { sessionId: sessionId.slice(0, 8) });
        }
      }
      ctx.sessionId = sessionId;
    } else {
      ctx.sessionId = 'debug_session';
    }

    if (req.method === 'GET') {
      return await handleGet(req, res, ctx);
    }

    if (req.method === 'POST') {
      return await handlePost(req, res, ctx);
    }

    res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
    await executeHooks(config.hooks, 'onRequestEnd', req, res, ctx);
    ctx.log('warn', 'Method not allowed', { method: req.method });
  };
}

async function handleGet(req, res, ctx) {
  const { config, sessionId, requestId, ip, redis } = ctx;
  try {
    // ===== GET 限流 =====
    const getLimitKey = `get:limit:${sessionId}`;
    const count = await redis.incr(getLimitKey);
    if (count === 1) {
      await redis.expire(getLimitKey, config.request.getWindow);
    }
    if (count > config.request.getLimit) {
      await executeHooks(config.hooks, 'onRateLimitHit', 'get', sessionId, req, ctx);
      ctx.log('warn', 'GET rate limit exceeded', { count, max: config.request.getLimit });
      return res.status(429).json({ success: false, error: 'TOO_MANY_REQUESTS' });
    }

    // ===== 调试：禁用 Nonce =====
    const disableNonce = config.debug.disableNonce;

    const { data, nonce } = await runGetLua(ctx, req.query.ids || '', disableNonce);
    res.status(200).json({ success: true, data, nonce });
    ctx.log('info', 'GET success', { ids: req.query.ids || '' });
  } catch (err) {
    await executeHooks(config.hooks, 'onRequestError', err, req, ctx);
    await executeHooks(config.hooks, 'onError', err, req, ctx);
    ctx.log('error', 'GET error', { error: err.message });
    if (config.debug.throwOnError) throw err;
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
  await executeHooks(config.hooks, 'onRequestEnd', req, res, ctx);
}

async function handlePost(req, res, ctx) {
  const { config, sessionId, requestId, ip, redis, pusher } = ctx;

  // ===== 调试：强制报错 =====
  if (config.debug.forceError) {
    throw new Error('Force error for testing');
  }

  try {
    // ===== 调试：禁用限流 =====
    const disableRateLimit = config.debug.disableRateLimit;

    // ===== 白名单检查 =====
    if (config.rateLimit.whitelist.enabled) {
      const whitelisted = config.rateLimit.whitelist.ips.includes(ip) ||
        config.rateLimit.whitelist.cidrs.some(cidr => {
          // 简单的 CIDR 匹配（仅 /32 和 /24 简化版）
          if (cidr.endsWith('/32')) {
            return ip === cidr.replace('/32', '');
          }
          if (cidr.endsWith('/24')) {
            return ip.startsWith(cidr.replace('/24', ''));
          }
          return false;
        });
      if (whitelisted) {
        ctx.log('debug', 'IP whitelisted', { ip });
      }
    }

    // ===== User-Agent 校验 =====
    if (config.security.userAgent.enabled) {
      const ua = req.headers['user-agent'] || '';
      if (ua.length < config.security.userAgent.minLength) {
        ctx.log('warn', 'UA too short', { ua });
        return res.status(403).json({ success: false, error: 'FORBIDDEN' });
      }
      if (config.security.userAgent.allowList.length > 0) {
        const allowed = config.security.userAgent.allowList.some(k => ua.includes(k));
        if (!allowed) {
          ctx.log('warn', 'UA not in allowlist', { ua });
          return res.status(403).json({ success: false, error: 'FORBIDDEN' });
        }
      }
      const blocked = config.security.userAgent.blockList.some(k => ua.includes(k));
      if (blocked) {
        ctx.log('warn', 'UA blocked', { ua });
        return res.status(403).json({ success: false, error: 'FORBIDDEN' });
      }
    }

    const { id, action } = req.body || {};
    const nonceHeader = req.headers['x-nonce'];

    if (!id || !action) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }
    if (!['like', 'unlike'].includes(action)) {
      return res.status(400).json({ success: false, error: 'INVALID_ACTION' });
    }
    if (!new RegExp(config.idPattern).test(String(id))) {
      ctx.log('warn', 'Invalid ID format', { id });
      return res.status(400).json({ success: false, error: 'INVALID_ID' });
    }

    // ===== 调试：禁用 Nonce =====
    const disableNonce = config.debug.disableNonce;
    if (!disableNonce && !nonceHeader) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }
    const nonce = disableNonce ? 'debug_nonce' : nonceHeader;

    // ===== 钩子：onNonceValidate =====
    if (!disableNonce) {
      const nonceValid = await executeHooks(config.hooks, 'onNonceValidate', nonce, req, ctx);
      if (nonceValid === false) {
        ctx.log('warn', 'Nonce rejected by hook', { nonce: nonce.slice(0, 8) });
        return res.status(403).json({ success: false, error: 'INVALID_NONCE' });
      }
    }

    // ===== IP 限流（perIp） =====
    if (!disableRateLimit && config.rateLimit.perIp.enabled) {
      const ipKey = `rate:ip:${ip}`;
      const ipCount = await redis.incr(ipKey);
      if (ipCount === 1) {
        await redis.expire(ipKey, Math.ceil(config.rateLimit.perIp.window / 1000));
      }
      if (ipCount > config.rateLimit.perIp.maxRequests) {
        await executeHooks(config.hooks, 'onIpBlock', ip, 'rate_limit', req, ctx);
        await executeHooks(config.hooks, 'onRateLimitHit', 'ip', ip, req, ctx);
        // 封禁 IP
        const blockKey = `block:ip:${ip}`;
        await redis.set(blockKey, '1', { ex: Math.ceil(config.rateLimit.perIp.blockDuration / 1000) });
        ctx.log('warn', 'IP rate limit exceeded', { ip, count: ipCount });
        return res.status(429).json({ success: false, error: 'IP_RATE_LIMIT' });
      }
    }

    // ===== 全局限流 =====
    if (!disableRateLimit && config.rateLimit.global.enabled) {
      const now = Date.now();
      const secKey = `rate:global:sec:${Math.floor(now / 1000)}`;
      const minKey = `rate:global:min:${Math.floor(now / 60000)}`;
      const hourKey = `rate:global:hour:${Math.floor(now / 3600000)}`;

      const secCount = await redis.incr(secKey);
      if (secCount === 1) await redis.expire(secKey, 2);
      if (secCount > config.rateLimit.global.maxPerSecond) {
        await executeHooks(config.hooks, 'onRateLimitHit', 'global_sec', 'global', req, ctx);
        ctx.log('warn', 'Global rate limit (sec)', { count: secCount });
        return res.status(429).json({ success: false, error: 'GLOBAL_RATE_LIMIT' });
      }

      const minCount = await redis.incr(minKey);
      if (minCount === 1) await redis.expire(minKey, 61);
      if (minCount > config.rateLimit.global.maxPerMinute) {
        await executeHooks(config.hooks, 'onRateLimitHit', 'global_min', 'global', req, ctx);
        ctx.log('warn', 'Global rate limit (min)', { count: minCount });
        return res.status(429).json({ success: false, error: 'GLOBAL_RATE_LIMIT' });
      }

      const hourCount = await redis.incr(hourKey);
      if (hourCount === 1) await redis.expire(hourKey, 3601);
      if (hourCount > config.rateLimit.global.maxPerHour) {
        await executeHooks(config.hooks, 'onRateLimitHit', 'global_hour', 'global', req, ctx);
        ctx.log('warn', 'Global rate limit (hour)', { count: hourCount });
        return res.status(429).json({ success: false, error: 'GLOBAL_RATE_LIMIT' });
      }
    }

    // ===== 按 ID 限流 =====
    if (!disableRateLimit && config.rateLimit.perId.enabled) {
      const idKey = `rate:id:${id}`;
      const idCount = await redis.incr(idKey);
      if (idCount === 1) {
        await redis.expire(idKey, 86400);
      }
      if (idCount > config.rateLimit.perId.maxPerDay) {
        await executeHooks(config.hooks, 'onRateLimitHit', 'id', id, req, ctx);
        ctx.log('warn', 'ID rate limit exceeded', { id, count: idCount });
        return res.status(429).json({ success: false, error: 'ID_RATE_LIMIT' });
      }
    }

    // ===== 钩子：beforeLike / beforeUnlike =====
    const hookName = action === 'like' ? 'beforeLike' : 'beforeUnlike';
    const should = await executeHooks(config.hooks, hookName, id, req, ctx);
    if (should === false) {
      ctx.log('warn', 'Operation cancelled by hook', { id, action });
      return res.status(403).json({ success: false, error: 'HOOK_CANCELLED' });
    }

    // ===== 执行 Lua =====
    const result = await runPostLua(ctx, id, action, nonce, disableRateLimit, disableNonce);

    if (result.error) {
      if (result.error === 'invalid_nonce') {
        await executeHooks(config.hooks, 'onNonceExpired', nonce, req, ctx);
        ctx.log('warn', 'Invalid nonce', { nonce: nonce.slice(0, 8) });
        return res.status(403).json({ success: false, error: 'INVALID_NONCE' });
      }
      if (result.error === 'rate') {
        await executeHooks(config.hooks, 'onRateLimitHit', 'cooldown', id, req, ctx);
        ctx.log('warn', 'Cooldown rate limit', { id });
        return res.status(429).json({ success: false, error: 'OPERATION_TOO_FAST' });
      }
      if (result.error === 'limit') {
        await executeHooks(config.hooks, 'onRateLimitHit', 'session', id, req, ctx);
        ctx.log('warn', 'Session limit exceeded', { sessionId: sessionId.slice(0, 8), id });
        return res.status(429).json({ success: false, error: 'SESSION_LIMIT_EXCEEDED' });
      }
      throw new Error(result.error);
    }

    // ===== 钩子：beforeCountUpdate / afterCountUpdate =====
    let delta = action === 'like' ? 1 : -1;
    const currentCount = result.newVal - delta;
    const modifiedDelta = await executeHooks(config.hooks, 'beforeCountUpdate', id, delta, currentCount, req, ctx);
    if (typeof modifiedDelta === 'number' && modifiedDelta !== delta) {
      // 如果钩子修改了 delta，需要重新计算
      ctx.log('debug', 'Delta modified by hook', { original: delta, modified: modifiedDelta });
    }
    await executeHooks(config.hooks, 'afterCountUpdate', id, result.newVal, delta, req, ctx);

    // ===== Pusher 推送（带钩子） =====
    if (config.pusher.enabled && pusher) {
      let pushData = { id, likes: result.newVal, action };
      const hookResult = await executeHooks(config.hooks, 'beforePusherTrigger', config.pusher.channel, config.pusher.event, pushData, req, ctx);
      if (hookResult === null) {
        ctx.log('debug', 'Pusher push cancelled by hook');
      } else if (hookResult && typeof hookResult === 'object') {
        pushData = hookResult;
        setTimeout(async () => {
          try {
            const timeoutMs = config.performance.async.pusherTimeout || 3000;
            await Promise.race([
              pusher.trigger(config.pusher.channel, config.pusher.event, pushData),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Pusher timeout')), timeoutMs))
            ]);
            await executeHooks(config.hooks, 'afterPusherTrigger', config.pusher.channel, config.pusher.event, pushData, null, req, ctx);
          } catch (err) {
            await executeHooks(config.hooks, 'onPusherError', err, config.pusher.channel, config.pusher.event, pushData, req, ctx);
            ctx.log('warn', 'Pusher error', { error: err.message });
          }
        }, 0);
      }
    }

    // ===== 钩子：afterLike / afterUnlike =====
    const afterHook = action === 'like' ? 'afterLike' : 'afterUnlike';
    await executeHooks(config.hooks, afterHook, id, result.newVal, req, ctx);

    // ===== 响应组装 =====
    const responseData = {
      success: true,
      id,
      likes: result.newVal,
      nonce: result.newNonce || null,
    };
    const modifiedResponse = await executeHooks(config.hooks, 'beforeResponse', responseData, req, ctx);
    const finalData = modifiedResponse || responseData;

    await executeHooks(config.hooks, 'afterResponse', req, res, ctx);
    ctx.log('info', 'Like/unlike success', { id, action, likes: result.newVal });
    res.status(200).json(finalData);

  } catch (err) {
    await executeHooks(config.hooks, 'onRequestError', err, req, ctx);
    await executeHooks(config.hooks, 'onError', err, req, ctx);
    ctx.log('error', 'POST error', { error: err.message, stack: err.stack });
    if (config.debug.throwOnError) throw err;
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
  await executeHooks(config.hooks, 'onRequestEnd', req, res, ctx);
}