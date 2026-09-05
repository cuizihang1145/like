export interface BackendConfig {
  /** 数据隔离命名空间，不同应用用不同值，数据互不干扰 */
  scope: string;
  /** Redis 所有 Key 的统一前缀，方便管理 */
  redisPrefix: string;
  /** 会话 Cookie 的名称 */
  cookieName: string;
  /** 会话有效期，单位秒 */
  sessionTTL: number;
  /** 单个会话允许的最大点赞次数 */
  sessionLimit: number;
  /** 用于校验 ID 格式的正则表达式 */
  idPattern: string;
  /** ID 的最小长度限制 */
  minIdLength: number;
  /** ID 的最大长度限制 */
  maxIdLength: number;
  /** 是否允许点赞数减到负数，false 则最低为 0 */
  allowNegativeCount: boolean;
  /** 点赞数允许的最小值 */
  countMinValue: number;
  /** 点赞数允许的最大值 */
  countMaxValue: number;

  /** 限流相关配置 */
  rateLimit: {
    /** 限流功能总开关 */
    enabled: boolean;
    /** 按 IP 限流 */
    perIp: {
      /** 是否启用 IP 限流 */
      enabled: boolean;
      /** 统计窗口大小，单位毫秒 */
      window: number;
      /** 窗口内允许的最大请求数 */
      maxRequests: number;
      /** 触发限流后封禁该 IP 的时长，单位毫秒 */
      blockDuration: number;
    };
    /** 按会话限流 */
    perSession: {
      /** 是否启用会话限流 */
      enabled: boolean;
      /** 两次操作之间的最小间隔，单位毫秒，防手抖 */
      cooldown: number;
      /** 窗口内允许的最大操作次数 */
      maxPerWindow: number;
      /** 统计窗口大小，单位秒 */
      window: number;
    };
    /** 按内容 ID 限流 */
    perId: {
      /** 是否启用按 ID 限流 */
      enabled: boolean;
      /** 单 ID 每日最大点赞数 */
      maxPerDay: number;
    };
    /** 全局限流 */
    global: {
      /** 是否启用全局限流 */
      enabled: boolean;
      /** 每秒最大请求数 */
      maxPerSecond: number;
      /** 每分钟最大请求数 */
      maxPerMinute: number;
      /** 每小时最大请求数 */
      maxPerHour: number;
    };
    /** 白名单，不受限流限制 */
    whitelist: {
      /** 是否启用白名单 */
      enabled: boolean;
      /** 白名单 IP 列表 */
      ips: string[];
      /** 白名单 CIDR 网段列表 */
      cidrs: string[];
    };
  };

  /** Nonce 一次性令牌配置 */
  nonce: {
    /** Nonce 有效期，单位秒 */
    ttl: number;
    /** 单个会话允许续期 Nonce 的次数 */
    renewLimit: number;
    /** 续期计数器的时间窗口，单位秒 */
    renewWindow: number;
  };

  /** 安全相关配置 */
  security: {
    /** 跨域资源共享配置 */
    cors: {
      /** 是否启用 CORS */
      enabled: boolean;
      /** 允许的源，* 表示全部 */
      allowOrigin: string;
      /** 允许的 HTTP 方法 */
      allowMethods: string;
      /** 允许的请求头 */
      allowHeaders: string;
      /** 允许客户端访问的响应头 */
      exposeHeaders: string;
      /** 预检请求的缓存时间，单位秒 */
      maxAge: number;
    };
    /** User-Agent 校验 */
    userAgent: {
      /** 是否启用 UA 校验 */
      enabled: boolean;
      /** UA 字符串最小长度，过短视为非法 */
      minLength: number;
      /** 黑名单，包含这些关键字的 UA 将被拒绝 */
      blockList: string[];
      /** 白名单，只有包含这些关键字的 UA 才允许，空表示全部允许 */
      allowList: string[];
    };
    /** Cookie 安全属性 */
    cookie: {
      /** 是否仅在 HTTPS 下传输 */
      secure: boolean;
      /** 是否禁止 JavaScript 读取 */
      httpOnly: boolean;
      /** SameSite 策略 */
      sameSite: 'Strict' | 'Lax' | 'None';
    };
  };

  /** 请求与响应配置 */
  request: {
    /** 允许的 HTTP 方法列表 */
    allowedMethods: string[];
    /** GET 请求的限次阈值 */
    getLimit: number;
    /** GET 限次的统计窗口，单位秒 */
    getWindow: number;
    /** POST 请求体最大字节数 */
    bodySizeLimit: number;
  };

  /** 性能优化配置 */
  performance: {
    /** Redis 相关 */
    redis: {
      /** 是否启用 Pipeline 批量操作 */
      pipeline: boolean;
      /** 是否使用 Lua 脚本（关掉则降级为普通命令） */
      luaEnabled: boolean;
      /** Redis 操作失败时的重试次数 */
      retryAttempts: number;
      /** 重试间隔，单位毫秒 */
      retryDelay: number;
      /** Redis 操作超时时间，单位毫秒 */
      timeout: number;
    };
    /** 本地缓存 */
    cache: {
      /** 是否启用本地缓存 */
      enabled: boolean;
      /** 缓存有效期，单位秒 */
      ttl: number;
      /** 最大缓存条目数 */
      maxItems: number;
    };
    /** 异步处理 */
    async: {
      /** 是否启用异步处理（Pusher 等） */
      enabled: boolean;
      /** 是否启用 Pusher 推送 */
      pusherEnabled: boolean;
      /** Pusher 推送超时时间，单位毫秒 */
      pusherTimeout: number;
      /** 异步队列大小限制 */
      queueSize: number;
    };
    /** 是否启用响应压缩 */
    compressionEnabled: boolean;
    /** 是否启用 Keep-Alive */
    keepAliveEnabled: boolean;
  };

  /** Pusher 实时推送配置 */
  pusher: {
    /** 是否启用 Pusher */
    enabled: boolean;
    /** Pusher App ID，从环境变量读取 */
    appId: string;
    /** Pusher Key，从环境变量读取 */
    key: string;
    /** Pusher Secret，从环境变量读取 */
    secret: string;
    /** Pusher 集群位置 */
    cluster: string;
    /** 是否使用 TLS */
    useTLS: boolean;
    /** 推送频道名称 */
    channel: string;
    /** 推送事件名称 */
    event: string;
  };

  /** 日志配置 */
  log: {
    /** 日志总开关 */
    enabled: boolean;
    /** 日志级别：debug / info / warn / error */
    level: string;
    /** 输出格式：json / text */
    format: string;
    /** 是否在终端输出颜色 */
    colorize: boolean;
    /** 是否记录时间戳 */
    timestamp: boolean;
    /** 是否记录请求 ID */
    requestId: boolean;
    /** 是否记录客户端 IP */
    ip: boolean;
    /** 是否记录会话 ID */
    sessionId: boolean;
    /** 是否记录请求体 */
    body: boolean;
    /** 是否记录请求头 */
    headers: boolean;
    /** 是否记录 Redis 操作 */
    redis: boolean;
    /** 是否记录性能指标 */
    performance: boolean;
  };

  /** 调试配置 */
  debug: {
    /** 调试总开关 */
    enabled: boolean;
    /** 运行模式：development / production */
    mode: string;
    /** 是否模拟 Redis，不真实连接 */
    mockRedis: boolean;
    /** 是否禁用所有限流 */
    disableRateLimit: boolean;
    /** 是否禁用 Nonce 校验 */
    disableNonce: boolean;
    /** 是否禁用会话机制 */
    disableSession: boolean;
    /** 是否禁用 Pusher */
    disablePusher: boolean;
    /** 是否强制模拟报错，用于测试 */
    forceError: boolean;
    /** 发生错误时是否抛出异常而非返回 JSON */
    throwOnError: boolean;
    /** 是否启用性能分析 */
    profile: boolean;
  };

  /** 所有钩子函数，用户可自定义 */
  hooks: {
    /** 请求开始时触发，可用于鉴权、注入上下文 */
    onRequestStart?: (req: any, ctx: any) => void | Promise<void>;
    /** 请求结束时触发，可用于清理、审计日志 */
    onRequestEnd?: (req: any, res: any, ctx: any) => void | Promise<void>;
    /** 请求发生错误时触发 */
    onRequestError?: (err: Error, req: any, ctx: any) => void | Promise<void>;
    /** 新会话创建时触发 */
    onSessionCreate?: (sessionId: string, req: any, ctx: any) => void | Promise<void>;
    /** 会话校验时触发，返回 false 视为无效 */
    onSessionValidate?: (sessionId: string, req: any, ctx: any) => boolean | Promise<boolean>;
    /** 会话销毁时触发 */
    onSessionDestroy?: (sessionId: string, reason: string, req: any, ctx: any) => void | Promise<void>;
    /** 触发限流时触发 */
    onRateLimitHit?: (type: string, key: string, req: any, ctx: any) => void | Promise<void>;
    /** IP 被封禁时触发 */
    onIpBlock?: (ip: string, reason: string, req: any, ctx: any) => void | Promise<void>;
    /** Nonce 校验时触发，返回 false 视为无效 */
    onNonceValidate?: (nonce: string, req: any, ctx: any) => boolean | Promise<boolean>;
    /** Nonce 成功续期时触发 */
    onNonceRenew?: (oldNonce: string, newNonce: string, req: any, ctx: any) => void | Promise<void>;
    /** Nonce 过期或被使用时触发 */
    onNonceExpired?: (nonce: string, req: any, ctx: any) => void | Promise<void>;
    /** 点赞操作执行前触发，返回 false 可取消本次操作 */
    beforeLike?: (id: string, req: any, ctx: any) => boolean | Promise<boolean>;
    /** 点赞成功后触发 */
    afterLike?: (id: string, newCount: number, req: any, ctx: any) => void | Promise<void>;
    /** 取消点赞操作执行前触发，返回 false 可取消本次操作 */
    beforeUnlike?: (id: string, req: any, ctx: any) => boolean | Promise<boolean>;
    /** 取消点赞成功后触发 */
    afterUnlike?: (id: string, newCount: number, req: any, ctx: any) => void | Promise<void>;
    /** 计数变更前触发，可修改增量值 */
    beforeCountUpdate?: (id: string, delta: number, currentCount: number, req: any, ctx: any) => number | Promise<number>;
    /** 计数变更后触发 */
    afterCountUpdate?: (id: string, newCount: number, delta: number, req: any, ctx: any) => void | Promise<void>;
    /** Redis 命令执行前触发，可修改命令或参数 */
    beforeRedisCommand?: (command: string, args: any[], req: any, ctx: any) => void | Promise<void>;
    /** Redis 命令执行后触发，可修改返回结果 */
    afterRedisCommand?: (command: string, result: any, req: any, ctx: any) => any | Promise<any>;
    /** Redis 操作失败时触发 */
    onRedisError?: (err: Error, command: string, args: any[], req: any, ctx: any) => void | Promise<void>;
    /** Pusher 推送前触发，返回 null 可取消本次推送 */
    beforePusherTrigger?: (channel: string, event: string, data: any, req: any, ctx: any) => any | null | Promise<any | null>;
    /** Pusher 推送成功后触发 */
    afterPusherTrigger?: (channel: string, event: string, data: any, response: any, req: any, ctx: any) => void | Promise<void>;
    /** Pusher 推送失败时触发 */
    onPusherError?: (err: Error, channel: string, event: string, data: any, req: any, ctx: any) => void | Promise<void>;
    /** 响应数据组装前触发，可修改返回数据 */
    beforeResponse?: (data: any, req: any, ctx: any) => any | Promise<any>;
    /** 响应发送后触发 */
    afterResponse?: (req: any, res: any, ctx: any) => void | Promise<void>;
    /** 发生错误时触发，可自定义错误响应 */
    onError?: (err: Error, req: any, ctx: any) => void | Promise<void>;
  };
}

export interface FrontendConfig {
  /** 扫描按钮的容器元素，默认 document */
  container: Element;
  /** 按钮的选择器，默认 '.like-toggle' */
  selector: string;
  /** 计数元素的选择器，默认 '.like-count' */
  countSelector: string;
  /** 图标元素的选择器，默认 'i' */
  iconSelector: string;
  /** API 基础路径，默认 '/api' */
  apiBase: string;
  /** 是否自动初始化，默认 true */
  autoInit: boolean;
  /** 是否启用乐观更新，默认 true */
  optimisticUpdate: boolean;
  /** 本地存储的 key，默认 'liked_ids' */
  storageKey: string;

  /** Pusher 实时推送配置 */
  pusher: {
    /** 是否启用 Pusher */
    enabled: boolean;
    /** Pusher Key，从环境变量或用户传入 */
    key: string;
    /** Pusher 集群 */
    cluster: string;
    /** 订阅频道名 */
    channel: string;
    /** 事件名 */
    event: string;
  };

  /** Toast 提示配置 */
  toast: {
    /** 是否启用 Toast */
    enabled: boolean;
    /** 显示时长，单位毫秒 */
    duration: number;
    /** Toast 位置 */
    position: string;
    /** 成功提示文案 */
    success: string;
    /** 错误提示文案 */
    error: string;
    /** 处理中提示文案 */
    processing: string;
  };

  /** 图标配置 */
  icon: {
    /** 已点赞的 CSS 类名 */
    liked: string;
    /** 未点赞的 CSS 类名 */
    unliked: string;
    /** 已点赞的文本符号 */
    likedText: string;
    /** 未点赞的文本符号 */
    unlikedText: string;
  };

  /** 动画配置 */
  animation: {
    /** 是否启用动画 */
    enabled: boolean;
    /** 动画类型：scale / pulse / bounce */
    type: string;
    /** 动画时长，单位毫秒 */
    duration: number;
  };

  /** 前端钩子 */
  hooks: {
    /** 点赞成功时触发 */
    onLike?: (id: string, count: number) => void;
    /** 取消点赞成功时触发 */
    onUnlike?: (id: string, count: number) => void;
    /** 发生错误时触发 */
    onError?: (err: Error, id: string) => void;
    /** 请求发送前触发 */
    beforeRequest?: (id: string, action: string) => void;
    /** 请求返回后触发 */
    afterRequest?: (id: string, action: string, success: boolean) => void;
  };
}

export function createLikes(config?: Partial<BackendConfig>): (req: any, res: any) => Promise<void>;

export function initLikes(config?: Partial<FrontendConfig>): {
  init: () => void;
  refreshUI: () => void;
  isLiked: (id: string) => boolean;
  toggleLike: (id: string, action: 'like' | 'unlike') => Promise<void>;
  fetchLikes: (ids: string[]) => Promise<any>;
  getNonce: () => string;
};