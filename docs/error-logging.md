# 错误日志与排查

博客和 Chrome Clipper 使用关联 ID 定位同一次操作：

- `errorId`：插件本地错误日志 ID。
- `operationId`：一次完整剪藏操作 ID。
- `requestId`：博客 API 请求 ID，同时写入响应头 `x-request-id` 和 Cloudflare Worker 日志。

日志不会记录 API Token、Authorization、Cookie、文章正文或 Markdown。

## Chrome Clipper

插件会在 `chrome.storage.local` 中保留最近 200 条结构化日志。

查看方式：

1. 打开插件设置。
2. 点击“复制诊断日志”。
3. 错误页可以点击“复制错误”，其中包含错误码、阶段、`errorId` 和服务端 `requestId`。

开发时也可以打开：

```text
chrome://extensions
```

找到浏览器剪藏扩展，点击 Service Worker 的“检查视图”。控制台日志统一以项目剪藏器前缀输出。

常见错误：

- `CONTENT_SCRIPT_UNAVAILABLE`：当前标签页未加载内容脚本，自动注入仍失败。
- `UNSUPPORTED_PAGE`：Chrome 内部页面、扩展页面或应用商店页面不允许读取。
- `POST_CREATE_HTTP_ERROR`：博客 API 返回错误，使用其中的 `requestId` 查服务端日志。
- `POST_CREATE_NETWORK_ERROR`：浏览器无法连接博客 API。

## 博客本地开发

本地运行：

```bash
npm run dev
```

API 日志输出为单行 JSON，包含：

```json
{
  "service": "<worker-name>",
  "event": "POST_CREATE_FAILED",
  "requestId": "...",
  "route": "/api/posts"
}
```

按 `requestId` 搜索终端输出即可还原请求阶段。

## Cloudflare 线上日志

实时查看 Worker 日志：

```bash
npx wrangler tail <worker-name> --format pretty
```

需要机器可读日志时：

```bash
npx wrangler tail <worker-name> --format json
```

复制插件错误中的 `requestId`，在输出中搜索同一个值。

插件相关 API 的关键事件：

- `CATEGORY_LIST_SUCCEEDED`
- `UPLOAD_STARTED`
- `UPLOAD_SUCCEEDED`
- `UPLOAD_FAILED`
- `POST_CREATE_STARTED`
- `POST_CREATE_SUCCEEDED`
- `POST_CREATE_FAILED`

线上响应保持 `{ "error": "..." }` 兼容格式，同时通过响应头返回
`x-request-id`、`x-error-code` 和可选的 `x-error-hint`；完整堆栈只写入 Worker 日志。
