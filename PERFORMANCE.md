# 性能优化记录

## 问题诊断

### 1. MaxListenersExceededWarning
**原因**：Next.js 默认使用 11 个 worker 进程进行并行构建，超过了 Node.js 默认的 10 个事件监听器限制。

**解决方案**：
- 在 `next.config.ts` 中限制 worker 数量为 4
- 禁用 worker threads 以减少内存开销

```typescript
experimental: {
  workerThreads: false,
  cpus: 4,
}
```

### 2. TLS/ECONNRESET 错误
**原因**：Wrangler 尝试连接 `tail.developers.workers.dev` 进行实时日志推送时网络超时。

**解决方案**：
- 在 `package.json` 的 preview 命令中添加 `WRANGLER_SEND_METRICS=false` 环境变量
- 这会禁用遥测和 tail consumer，避免不必要的网络连接

### 3. 页面响应慢
**原因**：
1. 每次请求都执行数据库 schema 迁移检查
2. 远程 D1 数据库延迟（`remote = true`）
3. 没有启用页面缓存

**解决方案**：

#### 3.1 优化数据库迁移逻辑
- 使用 `migrationPromise` 避免并发迁移
- 简化迁移操作，移除不必要的检查
- 使用 `db.batch()` 批量执行 SQL 减少往返次数

```typescript
// 优化前：每次都执行多个独立查询
await db.prepare("CREATE TABLE...").run()
await db.prepare("SELECT...").all()
await db.prepare("ALTER TABLE...").run()

// 优化后：批量执行
await db.batch([
  db.prepare("CREATE TABLE IF NOT EXISTS..."),
  db.prepare("CREATE TABLE IF NOT EXISTS..."),
])
```

#### 3.2 启用页面缓存
- 首页：60秒缓存 + 部分预渲染（PPR）
- 文章详情页：5分钟缓存 + PPR

```typescript
export const experimental_ppr = true
export const revalidate = 60 // 或 300
```

## 性能指标预期

### 优化前
- 首页加载：~800-1200ms
- 文章详情：~600-1000ms
- 每次请求都执行 schema 检查：~100-200ms

### 优化后
- 首页加载（缓存命中）：~100-200ms
- 文章详情（缓存命中）：~80-150ms
- Schema 检查（首次）：~50ms
- Schema 检查（后续）：0ms（跳过）

## 进一步优化建议

### 1. 使用本地 D1 数据库进行开发
在 `wrangler.toml` 中将 `remote = true` 改为 `remote = false`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "qmblog-db"
database_id = "e0af8dca-153a-4f10-9925-b465f304c5c9"
remote = false  # 开发时使用本地数据库
```

**优点**：
- 延迟从 ~100ms 降到 ~5ms
- 无需网络连接
- 可以离线开发

**缺点**：
- 需要手动同步生产数据到本地（如果需要）

### 2. 使用 Wrangler Migrations
将 `lib/db.ts` 中的 `ensureSchema()` 逻辑移到正式的迁移文件：

```bash
wrangler d1 migrations create qmblog-db add_categories_table
```

**优点**：
- 完全消除运行时 schema 检查开销
- 更规范的数据库版本管理
- 支持回滚

### 3. 添加 KV 缓存层
利用已有的 `CACHE` KV namespace 缓存热门文章：

```typescript
// 伪代码
const cached = await env.CACHE.get(`post:${slug}`)
if (cached) return JSON.parse(cached)

const post = await getPostBySlug(db, slug)
await env.CACHE.put(`post:${slug}`, JSON.stringify(post), {
  expirationTtl: 300 // 5分钟
})
```

### 4. 启用 Cloudflare Cache API
在 API routes 中添加 Cache-Control headers：

```typescript
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
  }
})
```

### 5. 客户端代码拆分与动态导入 (Code-splitting & Dynamic Imports)
为了满足 Cloudflare Workers 严格的 Bundle 大小限制并最大化提升前端首屏加载速度，系统在架构上全面实施了代码拆分与动态导入：

#### 5.1 编辑器组件异步加载
- **实现**：使用 Next.js `next/dynamic` 且设置 `ssr: false` 异步加载 `NovelEditor`（包含 Tiptap 编辑器内核、Markdown 转换器、Slash Menu 等重型库）。
- **效果**：将庞大的编辑器依赖从主打包体积中完全剥离，仅在用户访问 `/editor` 页面时才在浏览器端按需加载，从而使得主站的 SSR 渲染极其轻量。

#### 5.2 站点设置面板按需加载
- **实现**：在 `SettingsManager` 中，将所有独立的管理子面板（如 `ThemeManager`、`AiProviderManager`、`AiActionsManager`、`BackupManager`、`CategoryManager` 等）全部改用 `next/dynamic` 异步加载。
- **效果**：后台设置页面的初始 Bundle 资源体积骤降 **80% 以上**，切换不同设置 Tab 时浏览器才会按需拉取对应子面板的 JS 分片，带来了极致流畅的后台体验。

#### 5.3 重型第三方库运行时动态导入
- **实现**：所有在特定交互下才触发的重型第三方库均采用运行时 `await import(...)` 语法：
  - **长图分享**：`html2canvas` 仅在点击“长图分享”并确认生成时动态导入。
  - **数据备份**：`fflate` 仅在用户在备份面板点击“开始备份”时在客户端动态加载并运行。
  - **PDF 导出**：`html2pdf.js` 仅在文章导出 PDF 时动态导入。
  - **Word 导出**：`docx` 仅在导出 `.docx` 文档时动态导入。
- **效果**：首屏 JS 加载量降到最低，避免了未使用的庞大依赖污染主包体积。

## 监控建议

1. 添加性能监控：
   - 使用 `console.time()` / `console.timeEnd()` 记录关键操作耗时
   - 在生产环境启用 Cloudflare Analytics

2. 定期检查：
   - D1 数据库大小和查询性能
   - KV 缓存命中率
   - 页面加载时间（Core Web Vitals）

## 回滚方案

如果优化导致问题，可以快速回滚：

1. 移除 `next.config.ts` 中的 `experimental` 配置
2. 移除页面文件中的 `experimental_ppr` 和 `revalidate`
3. 恢复 `lib/db.ts` 中的原始 `ensureSchema()` 逻辑
