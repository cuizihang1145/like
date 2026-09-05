import { defaultConfig } from './config.js';
import { deepMerge } from '../backend/utils.mjs'; // 复用
import { initStorage, saveLikedIds, loadLikedIds } from './storage.js';
import { updateUI, showToast, getToggleElement, getCountElement } from './dom.js';
import { postLike, fetchLikes } from './api.js';

function KSLikes(userConfig = {}) {
  const config = deepMerge(defaultConfig, userConfig);
  let likedIds = [];
  let counts = {};
  let nonce = '';
  let isProcessing = false;
  let container = config.container || document;

  // 暴露内部方法
  const self = {
    init() {
      // 扫描容器内的按钮
      const toggles = container.querySelectorAll(config.selector);
      const ids = [];
      toggles.forEach(el => {
        const id = el.dataset.index;
        if (id && !ids.includes(id)) ids.push(id);
      });
      if (ids.length === 0) return;

      // 加载本地存储
      loadLikedIds(config.storageKey).then(ids => {
        likedIds = ids || [];
        // 获取所有点赞数
        return fetchLikes(ids, config.apiBase);
      }).then(data => {
        if (data && data.success) {
          counts = data.data || {};
          if (data.nonce) nonce = data.nonce;
          self.refreshUI();
        }
        // 订阅 Pusher
        if (config.pusher.enabled) {
          self.initPusher();
        }
      }).catch(() => {});
    },

    refreshUI() {
      updateUI(counts, likedIds);
    },

    isLiked(id) {
      return likedIds.includes(String(id));
    },

    async toggleLike(id, action) {
      if (isProcessing) {
        showToast(config.messages.processing, 'info');
        return;
      }

      const countEl = getCountElement(id);
      if (!countEl) return;

      const toggleEl = getToggleElement(id);
      if (toggleEl && toggleEl.dataset.loading === 'true') return;

      isProcessing = true;
      if (toggleEl) toggleEl.dataset.loading = 'true';

      // 乐观更新
      const currentText = countEl.textContent;
      const currentCount = parseInt(currentText, 10) || 0;
      const newCount = action === 'like' ? currentCount + 1 : Math.max(0, currentCount - 1);
      countEl.textContent = newCount;
      if (action === 'like') {
        if (!likedIds.includes(id)) likedIds.push(id);
      } else {
        const idx = likedIds.indexOf(id);
        if (idx !== -1) likedIds.splice(idx, 1);
      }
      self.refreshUI();

      try {
        const result = await postLike(id, action, nonce, config.apiBase);
        if (!result.success) {
          throw new Error(result.error || '操作失败');
        }
        // 更新计数
        counts[id] = result.likes;
        if (result.nonce) nonce = result.nonce;
        // 检查是否应取消点赞（计数为0）
        if (parseInt(result.likes, 10) <= 0) {
          const idx = likedIds.indexOf(id);
          if (idx !== -1) likedIds.splice(idx, 1);
        }
        self.refreshUI();
        // 保存本地状态
        saveLikedIds(likedIds, config.storageKey);
        showToast(config.messages.success, 'success');
      } catch (err) {
        // 回滚
        countEl.textContent = currentText;
        if (action === 'like') {
          const idx = likedIds.indexOf(id);
          if (idx !== -1) likedIds.splice(idx, 1);
        } else {
          if (!likedIds.includes(id)) likedIds.push(id);
        }
        self.refreshUI();
        showToast(err.message || config.messages.error, 'error');
      } finally {
        isProcessing = false;
        if (toggleEl) toggleEl.dataset.loading = 'false';
      }
    },

    initPusher() {
      if (typeof window === 'undefined' || !window.Pusher) return;
      const pusher = new window.Pusher(config.pusher.key, {
        cluster: config.pusher.cluster,
        forceTLS: true,
      });
      const channel = pusher.subscribe(config.pusher.channel);
      channel.bind(config.pusher.event, (data) => {
        const id = String(data.id);
        // 防止自己刚刚点过的重复推送（3秒内）
        if (window._lastLocalLikeId === id && Date.now() - window._lastLocalLikeTime < 3000) {
          return;
        }
        counts[id] = data.likes;
        self.refreshUI();
      });
    },

    fetchLikes(ids) {
      return fetchLikes(ids, config.apiBase);
    },

    getNonce() {
      return nonce;
    }
  };

  // 自动初始化
  if (config.autoInit) {
    setTimeout(() => self.init(), 0);
  }

  return self;
}

// 导出单例模式（全局使用）
let instance = null;
export default function init(userConfig = {}) {
  if (!instance) {
    instance = new KSLikes(userConfig);
  }
  return instance;
}

// 兼容 script 标签
if (typeof window !== 'undefined') {
  window.KSLikes = init;
}