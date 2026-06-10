# 文轩博客 Open Source

[English](README.md) | 简体中文

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/huangwenxuangod/wenxuan-blog)
[![Use this template](https://img.shields.io/badge/GitHub-Use%20this%20template-111111?logo=github)](https://github.com/huangwenxuangod/wenxuan-blog/generate)

如果你也想拥有一个真正属于自己的学习、写作、分享阵地，而不是把内容完全寄托在平台算法上，这个项目就是为此做的。

文轩博客不是一个只会渲染 Markdown 的静态模板，而是一套完整的博客系统：前后台双编辑器、AI 写作辅助、AI 生图、主题系统、全文检索、API Token、外部发布生态都已经接好，目标就是让你更容易持续写下去。

- 在线示例：部署后补充
- 介绍文章：部署后补充
- 当前仓库：<https://github.com/huangwenxuangod/wenxuan-blog>

## 为什么值得做成自己的站

- 自媒体账号可能被封，平台流量也可能波动，但自己的站点不会
- 写作系统应该足够轻，打开就能写，而不是被后台流程打断
- AI 最该服务的是摘要、标签、封面、slug、生图这些重复工作
- 博客不该只是展示页，还应该是你的长期知识资产

## 你会得到什么

- 前台、后台都能编辑，所见即所得，接近飞书 / Notion 的写作体验
- 四套首页主题，移动端友好，开箱即用
- **全新编辑器目录导轨 (Table of Contents)**：实时解析文档结构，自动生成带层级编号的目录，支持双向滚动高亮与平滑锚点跳转，状态持久化保存
- **全新重构的编辑器“分享”下拉菜单与长图分享卡片**：将右上角“更新/发布”分裂按钮升级为单一精致的“分享 (Share)”下拉按钮。提供**长图分享**功能，支持三大美学主题（羊皮纸、简约白、深邃黑）、字体切换（古典宋体、极简黑体）以及跨域安全的自动生成二维码，一键极速下载 2x 视网膜级超清长图。
- **“未分类”全面清理与默认“AI”分类**：全站彻底移除无语义的“未分类”分类，系统默认分类及 fallback 彻底变更为“AI”，引导内容高质归集。
- **极致的客户端代码拆分与动态加载**：所有后台设置子面板和重型第三方依赖（`html2canvas`、`fflate`、`html2pdf.js`、`docx`）全部采用 `next/dynamic` 与运行时 `await import` 异步按需加载，首包体积剧减 80% 以上，完美适配 Cloudflare Workers 的体积限制。
- **100% 数据归属权与一键多格式备份**：支持一键将全站所有文章（含全文 Markdown 内容）、分类和后台配置，打包导出为 **Markdown ZIP (带 YAML 元数据，完美兼容 Obsidian/Hugo)**、**JSON 完整数据库备份**、以及 **CSV 属性列表表格**（带 UTF-8 BOM，Excel 双击打开不乱码）
- **基于 Headless UI 的无障碍交互重构**：所有下拉菜单、弹窗、弹出层均采用 Headless UI 重构，提供顺滑的过渡动画、完美的键盘导航和焦点管理
- **全局触觉交互规范 (Tactile Hover Feedback)**：框架级注入 Hover 指针规则，全站所有按钮、下拉菜单、选项列表、模拟按钮在悬停时自动展现 `cursor: pointer` 手势，禁用状态自动切换为 `cursor: not-allowed`，提供极佳的物理操控感
- **智能品牌图标引擎 (Smart Brand Icons)**：导航栏智能检测 GitHub 和 Twitter/X 链接（支持大小写不敏感的标签名或 URL），全自动渲染为像素级完美、100% 视觉重量一致的现代 inline SVG 品牌图标
- **Claude 极简美学设计规范**：深度定制的温暖羊皮纸色调、Anthropic Serif 衬线体字形与极简环形投影，带来静谧、专注的写作与阅读体验
- **文章批量操作系统 (Bulk Actions)**：支持在后台文章列表多选，一键进行批量改分类、批量发布/设为草稿、批量置顶/取消置顶、批量隐藏/取消隐藏（unlisted 状态）、批量软删除与恢复、以及批量清除密码等原子化事务。
- **全新重构的 AI 协作与元数据生成系统 (AI Post Generator)**：采用 Context 层、Memory 层、Harness 层与 Execution 层的工业级设计，提供对文章摘要、标签、SEO 英文 slug、以及基于 Flux-1 等生图模型的 Editorial 概念封面图的模块化生成与管理。
- **后台非阻塞异步任务队列 (Background Jobs)**：支持长耗时 AI 任务在后台静默执行，极速响应 HTTP 请求，彻底规避 Cloudflare Workers 超时限制。
- Bubble Menu + Ask AI，选中文本就能改写、润色、扩写、翻译
- AI 自动处理摘要、标签、SEO slug、封面图
- AI 生图模型和模板配置、最近生成记录、插入和替换工作流
- 图片右键菜单：下载、设为封面、对齐、裁剪、参考生图
- 发布状态：公开、草稿、密码访问、链接访问
- 默认初始化配置：主题、导航、字体、AI 文本模型模板、AI 生图模型模板
- Cloudflare Workers + D1 + R2 部署，不需要自己维护服务器 and CDN

## 前端实现约定

为了避免后台和编辑器出现语义错误或风格漂移，项目对组件和交互有明确约定。

完整协作规范见：

- `AGENTS.md`
- `CLAUDE.md`

### 组件分层

- `components/ui/primitives.ts`
  - `UiButton`
  - `UiIconButton`
  - `UiInput`
  - `UiTextarea`
  - `UiPanel`
  - `cx`
- `components/SelectDropdown.tsx`
  - 统一的真实下拉选择器
- `components/Dropdown.tsx`
  - 历史兼容入口，当前内部已统一走 `SelectDropdown`
- `components/Toast.tsx`
  - 全局顶部提示

### 交互语义定义

- 自由文本输入：必须使用输入框
- 固定候选项选择：必须使用真正的下拉框
- 可搜索选择器：本质仍然是下拉框，搜索框只能出现在展开后的面板中

这意味着：

- “图片比例”“分辨率”“发布状态”“分类”“主题” 都应该是下拉框
- 不能把关闭态做成一个像输入框的 `ComboboxInput`
- 不能用手写 DOM 菜单替代 Headless UI 交互骨架

### Headless UI 约定

复杂交互默认使用 `@headlessui/react`：

- `Dialog`：模态弹窗
- `Listbox`：真实下拉选择器
- `Menu`：菜单
- `Transition`：过渡动画

### 视觉约定

本项目的后台与编辑器遵循同一套极简语言：

- 克制
- 温暖
- 低噪音
- 低卡片感
- 强一致性

不鼓励：

- 默认 Tailwind 灰阶 SaaS 风
- 关闭态像输入框的伪下拉
- 同页混用多套按钮、弹窗、下拉风格
- 通过冗余说明文字制造层级

## 截图预览

### 四套首页主题

![四套首页主题](docs/screenshots/home-themes.webp)

### 编辑器与所见即所得写作

![编辑器总览](docs/screenshots/editor-overview.webp)

### Ask AI / Bubble Menu

![Ask AI](docs/screenshots/ask-ai.png)

### 后台设置与主题、代码、API Token 管理

![后台设置](docs/screenshots/admin-settings.webp)

### 多种发布状态

![发布状态](docs/screenshots/publish-states.png)

### AI 模型与生图配置

![图片模型配置](docs/screenshots/image-provider.png)

## 配套生态也一起开源了

这个仓库不只开源博客主站，也把外部发布工具一起放进来了。你可以把“写作入口”放在最顺手的地方，但最终都回到同一个博客后台。

- [`ecosystem/chrome-clipper`](ecosystem/chrome-clipper/README.md)：浏览器网页剪藏，直接进入博客草稿箱
- [`ecosystem/obsidian-publisher`](ecosystem/obsidian-publisher/README.md)：从 Obsidian 一键发布到博客
- [`ecosystem/qiaomu-blog-publish-skill`](ecosystem/qiaomu-blog-publish-skill/README.md)：通过 Claude Skill / 命令工作流直接发布
- [`ecosystem/README.md`](ecosystem/README.md)：生态工具总览

## 一键部署到 Cloudflare

直接点击上面的 `Deploy to Cloudflare` 按钮即可。

这个模板已经补好了适合 Deploy Button 的配置：

- Cloudflare 会读取仓库里的 Worker 配置
- 自动创建需要的 `D1` / `R2` 绑定
- 使用仓库里的自定义 deploy script
- 部署时自动应用数据库 schema 和模板默认配置

部署时建议准备这些值：

- `NEXT_PUBLIC_SITE_URL`
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SALT`
- `AI_CONFIG_ENCRYPTION_SECRET`
- `AI_API_KEY`（可选）

如果你更想手动掌控 Cloudflare 资源，也可以走 CLI：

```bash
npm install
cp .env.example .env.local
npx wrangler login
npm run cf:init -- --site-url=https://your-domain.com
npm run build
npm run deploy
```

## 本地开发

```bash
git clone https://github.com/huangwenxuangod/wenxuan-blog.git
cd wenxuan-blog
npm install
cp .env.example .env.local
npm run dev
```

常用入口：

- 首页：`/`
- 后台：`/admin`
- 编辑器：`/editor`

如果你要在 Worker 运行时本地预览：

```bash
npm run preview
```

## 默认初始化内容

首次初始化后，模板会自动带上这些基础能力：

- 默认导航
- 默认主题与字体
- 默认分类
- AI 文本模型配置模板
- AI 生图模型配置模板
- 文章摘要、标签、slug、封面生成器
- 编辑器 Ask AI 预设动作

所有 API Key 都不会进入仓库，首次部署时通过 Cloudflare secret 或后台配置补齐。

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4 (新一代高速样式引擎)
- Headless UI (@headlessui/react 无障碍交互组件)
- OpenNext for Cloudflare
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Novel / Tiptap

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Next.js 本地开发 |
| `npm run build` | 构建应用 |
| `npm run verify:quick` | 跑 lint、test、build |
| `npm run verify` | 跑完整验证链路 |
| `npm run cf:init` | 初始化 Cloudflare 资源和模板默认设置 |
| `npm run preview` | Worker 运行时预览 |
| `npm run deploy` | 部署到 Cloudflare Workers |

## 作者

- 文轩
- GitHub：<https://github.com/huangwenxuangod>
- X / Twitter：<https://x.com/hungxun254458>
- Blog：部署后补充
