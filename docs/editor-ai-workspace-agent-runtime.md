# Editor AI Workspace Agent Runtime

这份文档是编辑器右栏 AI 的最终执行层设计。

目标已经确定：

- 右栏 AI 不再只是“当前文章助手”
- 右栏 AI 直接升级为“全站后台文章 agent”
- 工作区边界只包含后台文章 `posts`
- 不拆第二种 UI 模式，仍然使用当前右栏消息流

这份文档定义：

- canonical tools
- agent loop
- runtime state
- 上下文优先级
- 工具 schema
- stop condition
- 与当前仓库代码的映射

后续实现以这份文档为准。

当前仓库落地状态（2026-06-11）：

- 已落地 bounded workspace loop
- 已接通 `list_posts / search_posts / get_post / create_post / update_post`
- 已保留并接通当前文章叶子工具 `edit_title / edit_selection / insert_block / generate_images`
- 已支持工具事件流式回传，并把中间检索步骤写入线程历史
- 已支持创建/更新结果在右栏中直接打开目标文章
- 已补齐 `generate_images` 的前端完成态闭环，并把执行结果回写线程历史

---

## 1. Building

我们要构建的是一个 `workspace article agent`。

它不是只围绕当前文章做改写，也不是一个纯问答聊天框，而是一个可以：

- 搜索全站文章
- 读取任意已有文章
- 基于一篇或多篇文章生成新草稿
- 修改任意已有文章
- 对当前打开文章继续做块级编辑
- 生成并插入封面或插图

的统一 agent。

一句话定义：

> 当前右栏 AI = 以当前文章为焦点、但拥有全站后台文章操作能力的 bounded workspace agent。

---

## 2. Not Building

本阶段明确不做：

- 本地代码文件 / `docs` / `skills` / 任意工作区文件的读写
- R2 素材文件系统级 agent
- Shell / 命令执行 agent
- 独立的第二套 AI 模式切换 UI
- 无限自治 loop
- 单独的 `fork_post` 专用工具

说明：

- “基于现有文章创建新文章”由 `get_post + create_post` 组合完成
- 工作区边界先严格限定为 D1 里的 `posts`

---

## 3. Approach

采用一套统一 runtime，分两层工具：

第一层是 workspace-level article tools。

- `list_posts`
- `search_posts`
- `get_post`
- `create_post`
- `update_post`

第二层是 current-editor leaf tools。

- `edit_title`
- `edit_selection`
- `insert_block`
- `generate_images`

核心原则：

- 全站文章能力负责“找什么、读什么、写到哪里”
- 当前编辑器能力负责“如何在打开的这篇文章里立即落文”
- 当前已有的文章内编辑动作不废弃，降级成叶子执行器
- 新 runtime 统一调度两层工具，不再存在两个平行 AI 系统

不单独做 `fork_post`。

原因：

- `fork_post` 只是 `get_post + create_post` 的 workflow alias
- 单独做会增加 schema、维护和 prompt 复杂度
- 当前阶段更重要的是把 runtime loop 和 workspace tools 建立起来

---

## 4. Open Source References

本方案吸收三类实现思路，但不照搬其 UI。

### Hermes

参考重点：

- tool registry
- memory 与 skills 分离
- 结构化 memory，不直接把全部历史塞给模型

对本项目的结论：

- memory 存事实、偏好、任务状态
- tools 存原子能力
- skills 只作为 prompt / procedure 增强，不替代 tool schema

### pi

参考重点：

- until-done loop
- goal / state / continue-or-stop 判断

对本项目的结论：

- 需要 bounded loop
- 需要显式 runtime state
- 需要 stop condition，而不是单轮拍脑袋结束

### OpenClaw

参考重点：

- workspace 边界
- session 边界
- tool visibility

对本项目的结论：

- workspace = 后台文章库
- session = 当前右栏对话线程
- tools visibility = 文章 tools + 当前编辑器 tools + 生图工具

---

## 5. Canonical Tools

最终保留 9 个 canonical tools。

### 5.1 Workspace Article Tools

#### `list_posts`

用途：

- 列出最近文章或按条件筛选文章

典型场景：

- “看看我最近写了什么”
- “列出 AI工具 分类的文章”

输入：

```ts
{
  limit?: number
  category?: string
  status?: 'draft' | 'published' | 'deleted'
  includeHidden?: boolean
  includeEncrypted?: boolean
}
```

返回：

```ts
{
  posts: Array<{
    slug: string
    title: string
    category?: string
    status?: string
    updatedAt?: number | null
  }>
}
```

#### `search_posts`

用途：

- 全站按关键词搜索文章

典型场景：

- “找出我写过 Agent 的文章”
- “搜一下关于 Claude Code 的旧文章”

输入：

```ts
{
  query: string
  limit?: number
  includeDrafts?: boolean
  includeHidden?: boolean
  includeEncrypted?: boolean
  includeDeleted?: boolean
}
```

返回：

```ts
{
  posts: Array<{
    slug: string
    title: string
    category?: string
    description?: string | null
    excerpt?: string
  }>
}
```

#### `get_post`

用途：

- 读取指定文章的完整编辑信息

典型场景：

- “基于这篇文章重写一版”
- “把那篇文章翻成中文”

输入：

```ts
{
  slug: string
}
```

返回：

```ts
{
  post: {
    slug: string
    title: string
    content: string
    html?: string
    category?: string
    description?: string | null
    tags?: string[]
    status?: string
    coverImage?: string | null
  }
}
```

#### `create_post`

用途：

- 新建文章草稿或直接发布文章

典型场景：

- “基于这篇生成一篇新的公众号稿”
- “把这些内容整理成一篇新文章”

输入：

```ts
{
  title: string
  content: string
  category?: string
  slug?: string
  description?: string
  tags?: string[]
  status?: 'draft' | 'published'
  coverImage?: string | null
}
```

返回：

```ts
{
  success: true
  slug: string
  id: number
}
```

#### `update_post`

用途：

- 修改已有文章

典型场景：

- “把 slug=xxx 的文章改短一点”
- “把那篇 AI工具 分类文章改成学习分类”

输入：

```ts
{
  slug: string
  updates: {
    title?: string
    content?: string
    category?: string
    description?: string
    tags?: string[]
    status?: 'draft' | 'published' | 'deleted'
    coverImage?: string | null
    newSlug?: string
  }
}
```

返回：

```ts
{
  success: true
  slug: string
}
```

### 5.2 Current Editor Leaf Tools

#### `edit_title`

用途：

- 仅修改当前打开文章标题

#### `edit_selection`

用途：

- 修改当前选区或当前 block

#### `insert_block`

用途：

- 在当前文章某个 block 前后或文末插入 markdown

#### `generate_images`

用途：

- 为当前文章或指定段落规划并生成图片

说明：

- `generate_images` 仍是 canonical tool
- 真正的图像执行链路可以继续复用当前图片 API

---

## 6. Legacy Alias Policy

当前仓库里已经存在一些历史动作名：

- `insert_text`
- `rewrite_block`
- `append_section`
- `plan_article_images`

这些不再作为新的 public canonical tools 扩散。

处理策略：

- runtime 内部允许继续兼容解析
- 最终统一归一化到 9 个 canonical tools
- 文档、prompt、schema、frontend 只暴露 canonical set

---

## 7. Runtime Model

采用一个 bounded agent loop。

不是单轮 prompt，不是无限自治，而是最多执行若干步、每步只做一件事的 loop。

### 7.1 Runtime Input

每轮运行的输入由四部分组成：

- 当前用户消息
- 当前打开文章上下文
- 当前线程历史与 memory summary
- workspace article index 能力

### 7.2 Runtime State

建议新增运行态对象：

```ts
type WorkspaceAgentState = {
  goal: string
  intent:
    | 'reply'
    | 'edit_current_post'
    | 'create_new_post'
    | 'update_existing_post'
    | 'research_then_create'
    | 'research_then_update'
    | 'generate_images'
  iteration: number
  maxIterations: number
  currentPostSlug: string | null
  workingSet: Array<{
    slug: string
    title: string
    reason: string
  }>
  observations: string[]
  pendingAction: string | null
  completed: boolean
  completionReason: string | null
}
```

说明：

- `currentPostSlug` 表示当前正在编辑页打开的文章
- `workingSet` 表示本轮选中的参考文章集合
- `observations` 用于压缩保存每一步工具结果

### 7.3 Loop

每轮 loop 固定走 5 步：

1. `plan`
2. `select_tool`
3. `execute_tool`
4. `observe`
5. `continue_or_stop`

伪流程：

```text
start
  -> classify intent
  -> if enough information:
       choose one tool
       execute
       write observation
       decide continue?
  -> else:
       ask user or reply_only
stop
```

### 7.4 Stop Condition

满足任一条件即停止：

- 产出了最终用户回复且不需要再调用工具
- 已成功 `create_post`
- 已成功 `update_post`
- 已成功返回当前文章编辑动作
- 达到 `maxIterations`
- 命中无法继续的缺参或目标歧义

### 7.5 Loop Guardrails

硬约束：

- `maxIterations = 4`
- 单轮最多 `get_post` 3 篇
- 单轮最多 `create_post` 1 次
- 单轮最多 `update_post` 1 次
- 单轮最多 `generate_images` 1 次
- 当目标文章不明确时，不允许执行 `update_post`

行为约束：

- 用户要求“基于一篇生成新文章”时，优先 `get_post -> create_post`
- 用户要求“综合多篇生成新文章”时，优先 `search_posts -> get_post* -> create_post`
- 用户只是问问题时，不强行调用工具
- 当前打开文章的小修改，优先叶子工具，不要先 `get_post -> update_post`

---

## 8. Context Priority

右栏升级为 workspace agent 后，上下文优先级调整为：

1. 当前用户消息
2. 当前打开文章的 focused context
3. 当前线程 memory summary
4. workspace working set
5. 全站文章检索能力

关键原则：

- 当前文章仍然是默认焦点
- 全站文章不是默认全文注入，而是按需 tool retrieval
- 绝不默认把全部文章正文塞进 prompt

---

## 9. Tool Selection Rules

### 9.1 何时用 Current Editor Tools

满足任一情况优先用当前文章叶子工具：

- 用户明确说“改这篇”
- 用户意图是当前文章块级编辑
- 操作目标就是编辑器里打开的这篇文章

对应：

- 改标题 -> `edit_title`
- 改当前段 -> `edit_selection`
- 插一段 -> `insert_block`
- 给当前文配图 -> `generate_images`

### 9.2 何时用 Workspace Article Tools

满足任一情况优先用 workspace tools：

- 用户提到“其它文章”
- 用户要求“参考旧文章”
- 用户要求“基于现有文章生成一篇新的”
- 用户要求“全站搜索 / 汇总 / 综述”
- 用户要改的不是当前打开文章

对应：

- 找文章 -> `list_posts` / `search_posts`
- 读文章 -> `get_post`
- 新建文章 -> `create_post`
- 修改其它文章 -> `update_post`

---

## 10. Message and Event Contract

沿用当前 NDJSON 事件流，保持前端兼容：

- `assistant_start`
- `assistant_delta`
- `tool_pending`
- `tool_result`
- `action_ready`
- `assistant_done`
- `assistant_error`

事件语义调整：

- workspace article tools 返回时也要进入 `tool_result`
- `action_ready` 不再只代表当前文章 block 动作，也可以代表文章级动作

建议新增 action 类型：

```ts
type WorkspaceAction =
  | { type: 'reply_only' }
  | { type: 'create_post'; slug: string; title: string }
  | { type: 'update_post'; slug: string; changedFields: string[] }
  | { type: 'edit_title'; title: string }
  | { type: 'edit_selection'; markdown: string; blockIndex?: number }
  | { type: 'insert_block'; anchorBlockIndex?: number; position?: 'before' | 'after' | 'end'; markdown: string }
  | { type: 'generate_images'; images: Array<...> }
```

---

## 11. Safety and Target Resolution

你已经明确要求“权限全部允许”，所以这里不做权限阉割。

但仍然保留目标解析约束，避免误改文章：

- `update_post` 必须有明确 `slug`
- 如果用户说“改那篇文章”但系统无法唯一定位，必须先澄清
- `search_posts` 返回多篇相似文章时，不允许直接选第一篇就改

这不是权限控制，而是目标解析正确性控制。

---

## 12. Memory Policy

workspace agent 的 memory 仍然只记高价值信息，不记全文。

建议继续使用当前结构化 memory 表，但增加两类沉淀：

- `workspace_preference`
  - 用户偏好如何使用旧文章
- `working_pattern`
  - 例如“用户偏好先找旧稿，再融合成新稿”

不新增“整篇文章全文记忆”。

全文应该通过 `get_post` 读取，而不是写进 memory。

---

## 13. File Mapping

实施时主要涉及这些文件。

### 保留并重构

- `app/api/editor/ai-chat/route.ts`
- `lib/ai-editor/runtime.ts`
- `lib/ai-editor/runtime-types.ts`
- `lib/ai-editor/action-schema.ts`
- `lib/ai-editor/server-execution.ts`
- `components/editor/AIPanel.tsx`

### 建议新增

- `lib/ai-editor/workspace-tools.ts`
- `lib/ai-editor/workspace-loop.ts`
- `lib/ai-editor/tool-registry.ts`
- `lib/ai-editor/workspace-action-schema.ts`

### 复用现有数据能力

- `app/api/posts/route.ts`
- `app/api/admin/posts/route.ts`
- `app/api/admin/posts/[slug]/route.ts`
- `lib/repositories/search.ts`

---

## 14. Implementation Order

按下面顺序推进。

### Step 1

先把 9 个 canonical tools 定死，并从现有 runtime 中抽出 registry。

交付结果：

- `agent-tools.ts` 不再只描述当前文章工具
- canonical schema 与 legacy alias 分离

### Step 2

新增 workspace article tools 执行层。

交付结果：

- `list_posts`
- `search_posts`
- `get_post`
- `create_post`
- `update_post`

### Step 3

把 `runtime.ts` 升级成 bounded loop。

交付结果：

- 支持多步 `search -> get -> create`
- 支持多步 `search -> get -> update`

### Step 4

把当前文章叶子工具接入统一 registry。

交付结果：

- 当前文章编辑和全站文章操作共用一个 runtime

### Step 5

更新右栏消息流渲染和 action 回显。

交付结果：

- 用户能看到“创建了哪篇文章”
- 用户能看到“更新了哪篇文章”
- 用户能看到“当前文章哪里被改了”

---

## 15. Verification

实现完成后至少验证这些路径。

### Happy Paths

- 基于当前文章生成一篇新草稿
- 搜索两篇相关文章并融合生成一篇新草稿
- 修改非当前打开文章
- 修改当前打开文章标题
- 修改当前选区
- 生成当前文章封面

### Error Paths

- 搜索无结果
- `get_post` 指向不存在 slug
- `create_post` slug 冲突
- `update_post` 目标文章不明确
- 达到 `maxIterations` 后自动收敛

### Commands

```bash
npx tsc --noEmit
npm run build
```

---

## 16. Final Recommendation

最终结论只有一句：

> 当前右栏 AI 应该升级成一个统一的 workspace article agent，而不是继续堆更多“当前文章内的小工具”。

9 个 tools 足够作为第一版的完整原子能力集合：

- `list_posts`
- `search_posts`
- `get_post`
- `create_post`
- `update_post`
- `edit_title`
- `edit_selection`
- `insert_block`
- `generate_images`

这套组合可以覆盖：

- 当前文章编辑
- 跨文章检索
- 基于旧文生成新文
- 修改任意文章
- 图片生成与插入

后续如果要继续扩展，优先扩 loop、state 和 memory，不优先扩更多工具名。
