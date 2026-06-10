# AGENTS.md - 智能体协作与前端实现总规约

欢迎。本文档是本项目所有 AI 智能体与协作者的统一执行规范。凡是涉及前端实现、交互设计、组件替换、编辑器体验、后台 UI 调整，必须先遵守这里的定义，再写代码。

---

## 1. 总原则

你应当始终扮演一个具备高审美、重语义、重一致性、重无障碍体验的资深工程师。

核心原则如下：

1. **先理解语义，再写组件**
   - 视觉长什么样是第二层，组件本质是什么是第一层。
   - “可输入” 与 “可选择” 是两类完全不同的交互，不允许混用。
2. **先复用现有组件库，再考虑新增**
   - 本项目已经有一层自己的 UI primitives。
   - 新功能默认必须基于现有 primitives 和 `@headlessui/react` 组合实现。
3. **极简不是简陋**
   - 极简意味着减少噪音、减少冗余说明、减少无意义边框和卡片感。
   - 不是允许手写粗糙控件，也不是允许语义错误。
4. **后台与编辑器是一套设计语言**
   - 不能出现一个弹窗像系统后台，一个下拉像原生输入框，另一个像手写菜单。
   - 同类控件必须共享同类交互骨架、尺寸、圆角、hover、active 与焦点表现。

---

## 2. 强制技术选型

### 2.1 Headless UI 是复杂交互的唯一基底

下列交互必须优先使用 `@headlessui/react`：

- 模态弹窗：`Dialog`
- 下拉菜单：`Listbox` / `Menu`
- 可搜索选择器：基于 `Listbox` 或 `Combobox`，但必须符合本项目语义定义
- 过渡动画：`Transition`

禁止：

- 用 `useState + absolute div + document click` 手搓 dropdown/menu/modal，除非当前场景 Headless UI 明确无法覆盖
- 用原生 `select` 冒充统一组件体系
- 用可编辑 `input` 外观去伪装“选择器”

### 2.2 本项目现有组件层是默认入口

优先复用以下文件中的组件与样式：

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
  - 兼容层，当前内部已统一走 `SelectDropdown`
- `components/Toast.tsx`
  - 全局反馈系统
- `app/globals.css`
  - `.ui-control`
  - `.ui-popover`
  - `.ui-modal-panel`
  - `.editor-quiet-icon-button`
  - `.editor-quiet-chip`
  - `.modal-scrollbar-none`

规则：

- 如果现有 primitives 能表达，不允许重新手写同类 `button`、`textarea`、`panel`
- 如果当前缺少某类控件，应先补到组件层，再被业务页面复用
- 禁止在业务文件里堆出一个“临时 UI 系统”

---

## 3. 交互语义定义

这一节是强制定义，不是建议。

### 3.1 输入框

输入框的定义：

- 用户可以直接输入自由文本
- 内容不是从固定候选集合中选择
- 典型组件：
  - `UiInput`
  - `UiTextarea`

禁止：

- 固定枚举项场景却使用输入框外观
- 关闭态看起来像输入框，但实际只允许选择

### 3.2 真正的下拉框

下拉框的定义：

- 用户从预定义选项中选择一个值
- 关闭态不可直接编辑文本
- 关闭态必须是“触发器”语义，不是“输入”语义
- 展开后使用选项列表进行选择

典型场景：

- 图片比例
- 分辨率
- 发布状态
- 分类
- 主题

必须使用：

- `SelectDropdown`
- 或基于 `Listbox` 的项目级封装

### 3.3 可搜索下拉框

可搜索下拉框的定义：

- 本质仍然是“选择器”，不是自由输入框
- 关闭态仍然必须长得像下拉触发器
- 搜索框只能出现在展开后的面板内部，不能把关闭态做成一个输入框

典型场景：

- 模型选择
- 数量很多的 provider、模板、分类选择

允许：

- 在展开后的 popover 中提供搜索输入

禁止：

- 关闭态直接暴露 `ComboboxInput` 样式
- 让用户误以为这里可以自由输入并提交任意值

### 3.4 模态弹窗

模态弹窗的定义：

- 必须有明确焦点管理
- 必须支持 `Esc` 关闭
- 必须有统一 backdrop、panel、关闭按钮逻辑

必须使用：

- Headless UI `Dialog`
- 配套使用项目中的 `UiButton` / `UiIconButton` / `UiPanel`

### 3.5 Toast

提示反馈的定义：

- `error` / `warning` / `success` / `info` 统一使用顶部 toast
- 不要在编辑器、弹窗、面板中重复造内联红框反馈，除非该反馈必须贴近字段本身

必须使用：

- `components/Toast.tsx`

---

## 4. 视觉语言定义

### 4.1 审美方向

本项目的方向不是花哨的 SaaS 卡片风，也不是默认 Tailwind 风，而是：

- 克制
- 安静
- 温暖
- 轻卡片化
- 低装饰密度
- 强一致性

### 4.2 视觉上什么叫“正确”

正确的视觉通常具备这些特征：

- 非必要说明文字被删除
- 非必要边框被弱化
- 非必要背景块被移除
- 面板层级主要依赖微弱背景差、细线、轻阴影来区分
- 文字层级清晰，但不会靠大面积彩色块来制造层级
- 同类控件高度、圆角、左右内边距一致

### 4.3 视觉上什么叫“违规”

以下都算违规实现：

- 关闭态下拉框长得像普通输入框
- 同一页混用多套按钮风格
- 同一页混用多套弹窗风格
- 为了“显眼”而新增大面积背景、边框、说明文案
- 把多个局部容器都做成厚卡片，导致页面像拼贴面板
- 在后台管理区保留过多冗余标签、提示语、计数文案

---

## 5. 组件选型速查

遇到以下需求时，直接按此表执行：

| 需求 | 必须优先使用 |
| :--- | :--- |
| 主按钮 / 次按钮 | `UiButton` |
| 图标按钮 | `UiIconButton` |
| 单行文本输入 | `UiInput` |
| 多行文本输入 | `UiTextarea` |
| 面板容器 | `UiPanel` |
| 普通下拉选择 | `SelectDropdown` |
| 历史兼容下拉调用 | `Dropdown` |
| 模态弹窗 | Headless UI `Dialog` + primitives |
| 顶部提示 | `Toast` |
| 类名组合 | `cx` |

如果你发现业务代码里还在直接手写这些基础控件，优先考虑替换回上表组件。

---

## 6. 实现方法规范

### 6.1 写 UI 之前

先回答这三个问题：

1. 这个控件本质上是输入、选择、触发、还是展示？
2. 现有组件库里有没有对应基底？
3. 这次改动是在新增组件层能力，还是在业务里重复造轮子？

只要第二个问题答案是“有”，就不应该继续手写。

### 6.2 写 UI 时

必须遵守：

- 优先套 primitives，再补局部样式
- 相同语义复用相同交互骨架
- 先保证关闭态语义正确，再优化展开态细节
- 所有交互元素 hover 时必须是 `cursor: pointer`，禁用态必须是 `cursor: not-allowed`
- 禁用态必须明确表现为不可操作
- **焦点状态与 Outline 消除**：为防止弹窗关闭（如 `Esc` 键）或点击交互后，浏览器激活键盘导航模式默认的高对比度黑色粗边框/轮廓，全局在 `app/globals.css` 中移除了 `button`, `a`, `select`, `role="button"` 等交互元素的默认 `:focus` / `:focus-visible` 轮廓线（`outline: none !important; box-shadow: none !important`）。在实现自定义交互组件时，也应避免使用浏览器默认的 outline 边框。

### 6.3 写完之后

至少自查以下问题：

- 这个“下拉框”在关闭态是否仍然像下拉框，而不是输入框
- 这个 modal 是否仍然在走统一的 `Dialog` 体系
- 是否引入了新的手写按钮/手写输入框/手写弹层
- 是否新增了不必要的说明文字
- 是否破坏了后台与编辑器的统一视觉
- **涉及 TypeScript 组件接口、事件处理器签名、回调参数、动态导入 props、设置面板 tab 跳转等改动后，不能只看 diff 或只跑 lint，必须至少运行一次完整 `npx tsc --noEmit`**
- **如果改动跨越编辑器、设置弹窗、API 请求链路或运行时 provider 选择，提交前还必须补跑 `npm run build`，避免 `MouseEvent` / props 签名不兼容这类仅在完整类型检查或生产构建阶段暴露的问题**

---

## 7. 当前前端架构约定

### 7.1 编辑器目录导轨

- 位置：`components/editor/EditorTocRail.tsx`、`lib/editor-toc.ts`
- 数据来源：Novel / Tiptap 的 `documentJson`
- 约定：
  - 目录项来自 heading 节点
  - 当前阅读位置需要双向高亮同步
  - 点击目录项需要平滑跳转与选区同步

### 7.2 统一下拉体系

当前项目已经明确分层：

- `SelectDropdown`：真实选择器基底
- `Dropdown`：兼容入口，内部复用 `SelectDropdown`
- `CategorySelector` / `PublishStatusDropdown` / 业务设置页下拉：都应逐步统一到这一套语义

以后新增“选择器”时，不要再从头造。

### 7.3 统一反馈体系

- 全局消息使用 `Toast`
- 面板内部仅在字段校验必须贴身展示时才使用内联提示

### 7.4 数据备份与导出系统

- **后端接口**：`app/api/admin/backup/route.ts` 负责安全拉取 `posts`（含 Markdown 内容与 HTML）、`categories`、`site_settings` 三张表的完整数据，并在成功时直接返回原始 JSON 结构。
- **前端组件**：`app/admin/(protected)/settings/BackupManager.tsx` 负责在客户端执行多格式一键打包：
  - **Markdown (ZIP)**：通过 `fflate` 纯前端打包所有文章为单独的 `.md` 文件，头部注入规范的 YAML Front Matter 头部（完美兼容 Obsidian / Hugo 等），并附带 `manifest.json` 导出清单。
  - **JSON 数据库备份**：导出全站数据库快照，便于全站无缝迁移或数据恢复。
  - **CSV 数据表**：打包导出文章属性列表，自动写入 UTF-8 BOM 字节序，确保 Microsoft Excel 双击打开中文字符 100% 不乱码。
- **集成入口**：已集成到后台“设置管理”的“数据备份”选项卡下，各导出按钮统一包裹自研传送门式 `Tooltip` 气泡。

### 7.5 文章批量操作系统 (Bulk Actions)

- **前端核心**：`app/admin/(protected)/posts/PostsTableClient.tsx` 负责表格行勾选、全选、分页、搜索、过滤以及状态管理。当有行被勾选时，会在页面底部/顶部呼出 `BulkActionsBar.tsx`。
- **批量操作栏**：`app/admin/(protected)/posts/BulkActionsBar.tsx` 提供了统一的批量操作入口，支持：
  - **批量改分类**：下拉选择并一键更新。
  - **批量转状态**：一键转为草稿、批量发布。
  - **批量置顶/取消置顶**：切换 `is_pinned` 属性。
  - **批量隐藏/取消隐藏**：切换 `is_hidden` 属性（控制 unlisted 状态）。
  - **批量删除/恢复**：支持软删除（进入回收站）与恢复。
  - **批量清除密码**：一键解密文章。
- **后端接口**：`app/api/admin/posts/bulk/route.ts` 负责原子化接收 slugs 数组与 action 类型，在 D1 数据库中执行高效的批量更新事务。

### 7.6 AI 协作与元数据生成系统 (AI Post Generator)

- **系统设计**：详见 `docs/editor-ai-system-design.md`。系统分为 Context 层、Memory 层、Runtime Harness 和 Execution 层。
- **元数据生成核心**：`lib/ai-post-generator/generate.ts` 与 `lib/ai-post-generator/storage.ts` 提供了模块化的 AI 元数据生成框架：
  - **摘要生成 (summary)**：基于文章内容自动提炼 160 字内的高密度摘要。
  - **标签提取 (tags)**：提取 3-6 个最具区分度的主题词。
  - **Slug 生成 (slug)**：生成符合 SEO 规范的英文 kebab-case 格式 slug。
  - **封面生成 (cover)**：自动调用生图模型（如 Flux-1）为文章生成高完成度的 editorial illustration 概念插图。
- **API 接口**：`app/api/editor/ai-post-metadata/route.ts` 是编辑器右侧 Rail 及元数据面板请求 AI 辅助的统一入口。

### 7.7 后台异步任务系统 (Background Jobs)

- **核心实现**：`lib/background-jobs.ts` 提供了一个非阻塞的后台任务队列，用于处理生图、大文本处理等耗时较长的异步 AI 任务，避免 Workers 超时并提升 HTTP 响应速度。
- **模型发现**：`app/api/admin/workers-ai-models/route.ts` 支持动态查询 Cloudflare Workers AI 的可用模型列表，提供模型发现与配置同步。

### 7.8 分类清理与默认 AI 分类 (Category Cleanup & Defaults)

- **移除未分类**：全站彻底移除了无语义的“未分类 (Uncategorized)”分类，避免内容无序堆积。
- **AI 默认分类**：在 `components/CategorySelector.tsx` 及 `components/NovelEditor.tsx` 中，系统默认分类及 fallback 彻底变更为“AI”，引导内容生产在初始态即具备清晰的主题归属。

### 7.9 编辑器分享下拉菜单与高保真长图分享卡片 (Share Dropdown & Long Image Share Card)

- **分享下拉按钮**：编辑器右上角原“更新/发布”分裂按钮重构为单一且精致的“分享 (Share)”按钮，带有分享图标、无加号，点击即可唤出包含发布状态管理、草稿保存、以及长图分享的下拉面板。
- **长图分享弹窗**：`components/ShareLongImageModal.tsx` 采用动态加载 `html2canvas`，可在客户端直接渲染出设计极其考究的长图卡片：
  - **三大视觉主题**：羊皮纸（Classic Parchment `#f5f4ed`）、简约白（Minimalist White `#ffffff`）、深邃黑（Midnight Dark `#121212`）。
  - **字体排版**：支持“古典宋体”与“极简黑体”一键切换。
  - **跨域安全二维码**：通过在外部二维码 API 图片上声明 `crossOrigin="anonymous"`，彻底杜绝 Canvas 受污染（Tainted）引发的 `SecurityError` 安全报错。
  - **2x 高清下载**：以 2 倍视网膜缩放比例（Scale: 2）生成，确保文字在手机端分享、长按保存时依然清晰锐利。

### 7.10 客户端代码拆分与动态导入 (Code-splitting & Dynamic Imports)

- **设置面板路由拆分**：在 `SettingsManager.tsx` 中，将所有独立的管理子面板（如 `ThemeManager`、`AiProviderManager`、`BackupManager` 等）全部改用 `next/dynamic` 异步加载，首屏首包体积剧减 80% 以上。
- **重型依赖运行时导入**：`html2canvas`、`fflate`、`html2pdf.js` 与 `docx` 等重型底层库全部采用运行时 `await import(...)` 按需异步导入，确保用户不使用对应功能时，绝对不下载任何相关字节，完美适配 Cloudflare Workers 的体积限制。

### 7.11 编辑器与系统设置分类管理联动同步 (Category Selector Sync)

- **动态重新挂载**：在编辑器中，顶部的文章分类下拉选择器（`CategorySelector`）支持通过声明式 `key={categoryRefreshKey}` 进行重新挂载。
- **联动刷新**：当用户在编辑器内置的“系统设置” Modal 中新增、修改或删除了分类，关闭 Modal 的瞬间会自动递增 `categoryRefreshKey`。这会强制分类下拉选择器重新挂载并向 API 发起请求，确保在不刷新页面的情况下，最新的分类配置 100% 实时同步到编辑器中。

### 7.12 Home 键双向折叠侧边栏快捷键 (Home Key Dual-Sidebar Toggle Shortcuts)

- **极客组合键**：在编辑器页面，支持通过 Home 组合键实现双向侧边栏的极致流畅折叠与展开：
  - **折叠/展开左栏 (TOC)**：按住键盘左侧修饰键（`左 Alt` / `左 Ctrl` / `左 Shift`）或 `左方向键` + `Home` 键。
  - **折叠/展开右栏 (AI 助手)**：按住键盘右侧修饰键（`右 Alt` / `右 Ctrl` / `右 Shift`）或 `右方向键` + `Home` 键。
- **独立偏好配置**：我们在系统设置中新增了独立的“偏好设置 (Preferences)”标签页，提供了一键开启或关闭该快捷键的开关，并支持在关闭设置 Modal 后即时热加载更新，无需重新加载页面。

### 7.13 极致的后台路由代码拆分 (Extreme Admin Route Code-splitting)

- **Server Components 动态导入**：为了使后台首屏加载以及服务端渲染（SSR）性能达到极限，我们在 `/admin/posts`、`/admin/settings` 和 `/admin/categories` 路由的 Next.js Server Components 中，将重型的 Client Components（如 `PostsTableClient`、`SettingsManager`、`CategoryManager`）全部通过 `next/dynamic` 动态导入。
- **按需打包与瞬间加载**：该方案避免了将繁重的交互逻辑和表格控制组件混入初始页面主包中，将后台首包体积压缩到了极限，完美适配 Cloudflare Workers 的体积和响应速度约束。

---

## 8. 常用开发与校验命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动 Next.js 本地开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run lint` | 运行 ESLint |
| `npx tsc --noEmit` | 完整 TypeScript 类型检查；涉及组件 props、事件处理器、回调签名、动态导入组件接口时必须运行 |
| `npm run test` | 启动 Vitest 交互式测试 |
| `npm run test:run` | 单次运行测试 |
| `npm run verify:quick` | 快速验证链路 |
| `npm run verify` | 完整验证链路 |
| `npm run cf:init` | 初始化 Cloudflare 资源 |
| `npm run cf-typegen` | 重新生成 Cloudflare 类型 |
| `npm run preview` | 本地 Worker 预览 |
| `npm run deploy` | 部署到 Cloudflare Workers |

---

## 9. 一句话执行标准

如果一个控件的视觉、语义、交互方式和它本来的类型不一致，这个实现就不合格。

如果一个页面为了“快点做完”绕过了现有组件库，这个实现就不合格。

如果一个改动让后台和编辑器看起来像来自两个产品，这个实现就不合格。

如果一次 review 或修复没有跑完整 `npx tsc --noEmit`，却对涉及 props、事件签名、回调参数的前端改动给出“没问题”的结论，这个 review 就不合格。
