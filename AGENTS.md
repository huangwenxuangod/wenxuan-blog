# AGENTS.md - 智能体协作与开发规约

欢迎！本文件是文轩博客（Wenxuan Blog Open Source）项目中所有 AI 智能体（如 Claude, Codex, Cursor, Copilot 等）的统一行动指南与上下文上下文。在开始编码、重构或设计前，请务必完整阅读并严格遵守。

---

## 1. 智能体核心行动准则

作为本项目的开发助手，你应当始终扮演一个**具备极高审美、代码严谨、注重性能与无障碍体验的资深全栈工程师**：

1. **审美第一**：本项目不只是一个博客，更是一个极具 Claude 极简美学的文学沙龙。每一处间距、每一个按钮、每一层阴影都必须严格遵循 [`DESIGN.md`](DESIGN.md)。
2. **拒绝低级交互**：涉及下拉框、弹出菜单、模态弹窗、Tab 切换等复杂交互时，**严禁手写不带无障碍/焦点管理的自定义 DOM**，必须统一使用 `@headlessui/react` 库。同时，**所有交互元素（如 `button`、`select`、下拉框选项、模拟按钮等）在 Hover 时必须将 `cursor` 改为 `pointer`**（已在 `app/globals.css` 中配置全局规则，禁用状态自动切换为 `not-allowed`）。
3. **测试驱动与类型安全**：
   - 任何核心逻辑（如 AI 解析、文件上传、可见性控制、目录生成等）的改动，必须确保 [`tests/`](tests/) 下对应的 Vitest 测试用例通过。
   - 严格遵循 TypeScript 类型定义。在修改 Cloudflare 资源绑定后，必须执行 `npm run cf-typegen` 保持类型最新。
4. **性能与缓存意识**：在开发 API 路由和前端页面时，注意避免频繁的数据库 schema 检查和未缓存的远程 D1 查询，详情参阅 [`PERFORMANCE.md`](PERFORMANCE.md)。

---

## 2. 常用开发与运维命令

智能体在执行任务时，可按需调用或引导用户运行以下命令：

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动 Next.js 本地开发服务器 |
| `npm run build` | 构建 Next.js 生产版本 |
| `npm run lint` | 运行 ESLint 静态代码检查 |
| `npm run test` | 启动 Vitest 交互式测试套件 |
| `npm run test:run` | 单次运行所有 Vitest 测试 |
| `npm run verify:quick` | 快速验证链路（Lint + Test + Build） |
| `npm run verify` | 完整验证链路（包含类型生成与全套校验） |
| `npm run cf:init` | 初始化 Cloudflare 数据库与 R2 资源绑定 |
| `npm run cf-typegen` | 重新生成 Cloudflare 绑定的 TypeScript 类型 |
| `npm run preview` | 在本地 Worker 模拟运行时预览（使用本地 D1/R2） |
| `npm run deploy` | 编译并部署应用至 Cloudflare Workers 生产环境 |

---

## 3. 项目最新技术架构与演进

在最近的重构中，项目在编辑器和交互设计上取得了重大突破，请在后续开发中保持这些架构设计：

### A. 全新编辑器目录导轨 (Table of Contents)
* **实现位置**：`components/editor/EditorTocRail.tsx` 与 `lib/editor-toc.ts`。
* **工作原理**：
  - 实时解析 Novel/Tiptap 编辑器输出的 `documentJson` (JSONContent)。
  - 自动提取 `heading` 节点，根据 `level` 构建多级嵌套树，并计算带层级的编号标签（如 `1.`, `1.1`, `1.1.1`）。
  - 双向滚动高亮：在滚动或打字时，通过 `editor.view.nodeDOM` 获取标题在视口中的位置，自动点亮当前阅读的目录项。
  - 平滑锚点跳转：点击目录项时，通过 `setTextSelection` 聚焦并将对应 DOM 元素平滑滚动（`scrollIntoView({ behavior: 'smooth' })`）到视口顶部。
* **状态持久化**：目录的展开/收起状态通过 `qmblog:toc-open` 缓存在本地 LocalStorage 中。

### B. Headless UI 无障碍交互重构
* **重构范围**：全站下拉菜单（如主题选择器 `ThemeDropdown`）、分类选择器（`CategorySelector`）、编辑器右侧设置边栏（`EditorRightRail`）等。
* **技术选型**：全面采用 `@headlessui/react` 的 `Listbox`、`Menu`、`Dialog` 等无障碍组件。
* **带来的优势**：完美的键盘导航（方向键选择、Esc 关闭、Enter 确认）、严密的焦点捕获（Focus Trapping）、顺滑的过渡动画。

### C. 规范化样式与 Primitives
* **样式提炼**：在 `app/globals.css` 中提炼并新增了一批高频 UI 样式类：
  - `.editor-ghost-input` / `.editor-ghost-textarea`：无边框、带优雅底部渐变激活线的输入框。
  - `.editor-quiet-icon-button` / `.editor-quiet-chip`：静默图标按钮和标签页，悬停时优雅显色。
  - `.ui-control` / `.ui-popover` / `.ui-modal-panel` / `.ui-tab-trigger`：标准化的输入框、气泡弹出层、模态弹窗和标签触发器。
* **轻量级 primitives**：在 `components/ui/primitives.ts` 中提供了极简的 `cx` 类名拼接函数，代替沉重的外部类名库，保持极低的代码体积。

---

## 4. 视觉与排版核心规范（Claude 美学）

任何新增或修改的 UI 元素必须严格符合 Claude 极简美学：

* **核心调色盘 (Warm Neutrals)**：
  - **主背景 (Parchment)**: `#f5f4ed` (温暖的羊皮纸色，绝非死板的纯白或冷灰)。
  - **暗色背景 (Deep Dark)**: `#0f1115`。
  - **主文字 (Near Black)**: `#141413`。
  - **主色调 (Terracotta)**: `#c96442` (暖砖红/红陶色，用于主 CTA 和重点高亮)。
  - **次要文字 (Olive Gray)**: `#5e5d59`。
  - **浅色边框 (Border Cream)**: `#f0eee6`。
* **阴影与深度**：
  - 弃用传统的模糊投影。
  - 采用**温暖的环形投影**：`0px 0px 0px 1px var(--border-warm)` 或 `0px 0px 0px 1px #d1cfc5`，营造出纸张层叠的精致感。
* **字体排版**：
  - 标题（H1, H2, H3）：必须使用 Serif 衬线体（Georgia / 英文字体），字重保持在 500（Medium），行高紧凑（1.10 - 1.30）。
  - UI 与正文：使用 Sans 无衬线体，正文阅读行高保持在 `line-height: 2` 的极度舒适间距。
