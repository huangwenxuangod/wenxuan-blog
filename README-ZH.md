# 面向 Cloudflare 的 AI 博客 CMS

[English](README.md) | 简体中文

这个仓库是一个基于 `Next.js 16 + OpenNext + Cloudflare Workers` 的 AI 辅助博客 CMS，覆盖公开博客、后台编辑器、AI 写作工作流、图片生成、微信公众号导出/发布，以及可选的浏览器剪藏生态。

## 项目范围

它不是一个只渲染 Markdown 的静态模板，而是一套完整内容系统，包含：

- 公开博客前台与多套首页主题
- 后台管理与鉴权编辑器
- 富文本编辑、目录导轨、右侧 AI 导轨
- AI 对话、改写、标题生成、元数据生成、生图
- 微信预览、导出、发布桥接
- 基于 ZIP 的 Skills 系统
- 浏览器剪藏器，将外部内容写入草稿
- 基于 `D1` 和 `R2` 的 Cloudflare 原生存储

## 当前架构

- Runtime：`Cloudflare Workers`
- 应用框架：`Next.js 16` + `OpenNext`
- 数据库：`D1`
- 对象存储：`R2`
- 编辑器：`Novel / Tiptap`
- UI 基础组件：`components/ui/primitives.ts`
- 复杂交互骨架：`@headlessui/react`

核心实现文档：

- [DEPLOY.md](DEPLOY.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- [docs/editor-ai-system-design.md](docs/editor-ai-system-design.md)
- [docs/skills-system.md](docs/skills-system.md)
- [docs/error-logging.md](docs/error-logging.md)
- [AGENTS.md](AGENTS.md)
- [CLAUDE.md](CLAUDE.md)

## 主要能力

- 所见即所得编辑器与自动保存
- 左侧文章导轨与标题 TOC 导轨
- 右侧 AI 对话 / 编辑导轨
- AI 元数据生成：摘要、标签、slug、封面
- AI 生图与插入 / 替换工作流
- 微信预览与导出：`Markdown`、`PDF`、`DOCX`
- 可选的微信发布桥
- Skills 上传、启用、禁用、编辑器挂载
- 长图分享卡片生成
- 多种发布模式：公开、草稿、密码、链接访问
- 全文检索
- 后台备份与系统设置

## 仓库结构

```text
app/          Next.js 路由
components/   UI、编辑器、后台和弹窗组件
lib/          编辑器运行时、AI、存储、仓库层与工具函数
db/           schema 与 migrations
docs/         聚焦实现细节的开发文档
ecosystem/    可选的外部发布 / 剪藏工具
tests/        Vitest 测试
```

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

常用本地入口：

- `/`
- `/admin`
- `/editor`

如果要在 Worker 运行时本地预览：

```bash
npm run preview
```

## Cloudflare 部署

最小部署流程：

```bash
npx wrangler login
npm run cf:init -- --site-url=https://your-domain.com
npm run build
npm run deploy
```

至少需要设置这些 secrets：

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SALT`
- `AI_CONFIG_ENCRYPTION_SECRET`

按功能可选补充：

- `AI_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

完整步骤见 [DEPLOY.md](DEPLOY.md)。

## Skills 系统

编辑器每轮 AI 请求最多挂载一个上传 Skill；Skill 以 ZIP 包形式保存，元数据进入 `D1`，文件资产进入私有 `R2` bucket `SKILLS`。

详见 [docs/skills-system.md](docs/skills-system.md)。

## 截图资源

- `docs/screenshots/home-themes.webp`
- `docs/screenshots/editor-overview.webp`
- `docs/screenshots/admin-settings.webp`
- `docs/screenshots/image-provider.png`

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Next.js 本地开发 |
| `npm run build` | 生产构建 |
| `npm run test:run` | 单次测试 |
| `npm run verify:quick` | 快速校验 |
| `npm run verify` | 完整校验 |
| `npm run preview` | Worker 运行时预览 |
| `npm run deploy` | 部署到 Cloudflare |

## 说明

- 仓库文档默认不提交 secrets、真实线上域名和个人部署信息。
- 如果你基于这个项目继续发布，请替换站点元数据、品牌文案和运行时配置为你自己的版本。
