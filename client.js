// client.js
import KSLikes from './src/frontend/index.js';
export default KSLikes;
// 也挂载到全局（如果通过 script 标签引入）
if (typeof window !== 'undefined') {
  window.KSLikes = KSLikes;
}