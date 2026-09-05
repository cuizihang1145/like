// server.js
import createLikes from './src/backend/index.mjs';

// ===== 导出给 Vercel 或 Node.js 使用 =====
export default createLikes({
    // ===== 核心：开启内存模拟，不用装Redis =====
    debug: {
        mockRedis: true,          // ✅ 用内存代替 Redis
        disablePusher: true,      // ✅ 关闭 Pusher 推送
        disableRateLimit: true,   // ✅（可选）关闭限流，随便点
        disableNonce: true,       // ✅（可选）关闭 Nonce，简化请求
        disableSession: false,    // 保持会话开启，用来记录点赞次数
    },
    // 关掉 Pusher
    pusher: {
        enabled: false,
    },
