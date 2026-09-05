import { executeHooks } from './hooks.js';

export async function validateSession(sessionId, config, ctx) {
  // 钩子：onSessionValidate
  const result = await executeHooks(config.hooks, 'onSessionValidate', sessionId, ctx.req, ctx);
  if (result === false) {
    ctx.log('warn', 'Session rejected by hook', { sessionId: sessionId.slice(0, 8) });
    return false;
  }
  return true;
}