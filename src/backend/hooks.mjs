export async function executeHooks(hooks, name, ...args) {
  if (!hooks || typeof hooks[name] !== 'function') return undefined;
  try {
    const result = await hooks[name](...args);
    return result;
  } catch (err) {
    // 如果钩子本身抛出错误，调用 onError 钩子（如果存在）
    if (hooks.onError) {
      await hooks.onError(err, ...args);
    }
    // 重新抛出，让上层处理
    throw err;
  }
}