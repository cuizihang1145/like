export function getToggleElement(id) {
  return document.querySelector(`.like-toggle[data-index="${id}"]`);
}

export function getCountElement(id) {
  return document.getElementById(`like-count-${id}`);
}

export function updateUI(counts, likedIds) {
  // 更新计数
  Object.keys(counts).forEach(id => {
    const el = getCountElement(id);
    if (el) el.textContent = counts[id];
  });
  // 更新图标
  document.querySelectorAll('.like-toggle[data-index]').forEach(el => {
    const id = el.dataset.index;
    const icon = el.querySelector('i');
    if (icon) {
      const liked = likedIds.includes(String(id));
      icon.className = liked ? 'fas fa-heart' : 'far fa-heart';
    }
  });
}

export function showToast(message, type = 'info') {
  if (typeof document === 'undefined') return;
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 16px;border-radius:20px;font-size:14px;opacity:0;transition:opacity 0.3s;z-index:9999;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
}