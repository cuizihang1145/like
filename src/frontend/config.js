export const defaultConfig = {
  container: document,            // 扫描容器
  selector: '.like-toggle',       // 按钮选择器
  countSelector: '.like-count',   // 计数元素选择器
  iconSelector: 'i',              // 图标元素选择器
  apiBase: '/api',                // API 基础路径
  autoInit: true,                 // 自动初始化
  optimisticUpdate: true,
  storageKey: 'liked_ids',        // localStorage/indexedDB key
  pusher: {
    enabled: true,
    key: process.env.PUSHER_KEY || '011cb37208751f810834',
    cluster: 'ap3',
    channel: 'shuoshuo-channel',
    event: 'like-event',
  },
  toast: {
    enabled: true,
    duration: 2000,
    position: 'bottom-center',
    success: '👍 操作成功',
    error: '❌ 操作失败',
    processing: '⏳ 处理中...',
  },
  icon: {
    liked: 'fas fa-heart',
    unliked: 'far fa-heart',
    likedText: '❤️',
    unlikedText: '🤍',
  },
  animation: {
    enabled: true,
    type: 'scale', // scale, pulse, bounce
    duration: 200,
  },
  // 钩子（用户可定义）
  hooks: {
    onLike: null,
    onUnlike: null,
    onError: null,
    beforeRequest: null,
    afterRequest: null,
  }
};