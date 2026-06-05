# Editor AI System Design

这份文档是编辑器右侧 AI 系统的主设计文档。

后续关于：

- AI 路线图
- 记忆系统
- context 组织
- runtime harness
- 流式执行
- 编辑协作
- 图片生成与插入

都以这份文档为准。

---

## 1. 目标

我们要做的不是“右侧有个聊天框”，而是一个真正参与文章创作的 AI 编辑协作系统。

它必须同时具备 4 种能力：

1. **理解文章**
   - 理解全文主题、结构、当前 section、当前段落
2. **参与编辑**
   - 高质量对话、局部改写、续写、压缩、补例子、补过渡
3. **参与视觉规划**
   - 判断哪里适合配图、应该是什么图、整篇文章的图像节奏如何安排
4. **执行生成与插入**
   - 生成图片、复用风格、插入正确位置、记录图片与正文的关系

一句话定义：

> AI 不是外挂能力，而是文章编辑器的协作执行层。

---

## 2. 核心结论

这套系统必须先做成 4 层，再谈更复杂能力：

1. **Context Layer**
2. **Memory Layer**
3. **Runtime Harness**
4. **Execution Layer**

关系如下：

- Context 决定 AI 这轮看什么
- Memory 决定 AI 长期记住什么
- Harness 决定 AI 这轮怎么跑
- Execution 决定 AI 最终如何改文、生成图、插图

如果这四层不先做清楚：

- 真流式没有意义
- 对话会空泛
- 编辑会跑偏
- 图片会脱离正文
- 长对话会越来越笨

---

## 3. 设计原则

### 3.1 AI 先理解，再行动

AI 不应该默认整篇重写，也不应该看到一个请求就直接调用工具。

正确顺序：

1. 理解意图
2. 选择上下文
3. 判定任务类型
4. 再执行动作

### 3.2 优先局部，不优先全文

大部分编辑任务应该围绕：

- 当前 block
- 当前 section
- 相关召回块

而不是默认吃整篇。

### 3.3 立即落文，但必须有明确动作边界

当前产品方向是：

- 编辑动作可以立即落文
- 不优先做显式 accept/reject
- 也不强依赖 AI 级撤销

因此执行层必须保证：

- 每次动作范围明确
- 不做含糊的整篇覆盖
- 不做多次重复执行

### 3.4 图片是会话原生能力

图片不能只是单独 modal。

AI 必须能够自然参与：

- 配图规划
- 单图生成
- 批量插图
- 封面生成
- 风格延续

### 3.5 底层记忆用结构化，注入层用自然语言

记忆不应做成纯 Markdown 文件。

正确做法：

- **DB / JSON** 作为事实源
- **自然语言摘要** 作为 prompt 注入层

---

## 4. 当前系统现状

项目目前已经具备这些基础：

- 右栏聊天 UI
  - `components/editor/AIPanel.tsx`
- AI 聊天接口
  - `app/api/editor/ai-chat/route.ts`
- 对话线程持久化
  - `app/api/editor/ai-chat/history/route.ts`
  - `lib/repositories/ai-article-threads.ts`
- 基础上下文构建
  - `lib/ai-editor-context.ts`
- 文档 outline 提取
  - `lib/editor-document-outline.ts`
- 编辑器 markdown 回写
  - `lib/editor-markdown.ts`
- 图片生成链路
  - `app/api/editor/ai-image/route.ts`
  - `lib/ai-image.ts`

当前也有明显限制：

1. 上下文太浅
2. 记忆只有历史消息，没有结构化 memory
3. 现在的“流式”是伪流式
4. agent 还是单轮 prompt
5. 图片规划与会话没有深度打通

---

## 5. 路线图

建议路线图不是按 UI 功能排，而是按系统层排。

### Phase 1

**Context + Memory 基础层**

目标：

- 让 AI 每轮知道真正该看什么
- 让 AI 开始积累文章级记忆

### Phase 2

**Runtime Harness**

目标：

- 把当前单轮 agent 升级成“有流程的执行器”
- 接入真流式

### Phase 3

**编辑执行层**

目标：

- 高质量编辑对话
- 稳定的局部改写 / 续写 / 补充逻辑

### Phase 4

**图片会话化**

目标：

- 配图规划
- 图像生成
- 图像插入
- 风格延续

### Phase 5

**质量增强层**

目标：

- thread summary
- reflection / self-check
- 长会话稳定性

---

## 6. Context Layer 设计

## 6.1 目标

Context Layer 的职责是：

- 为当前请求挑选最有用的信息
- 不默认把全文粗暴塞给模型
- 兼顾全局、局部、相关性、历史状态

## 6.2 结构

每轮上下文拆成 4 组：

### A. document_snapshot

作用：

- 给模型全局感

建议字段：

- `title`
- `postSlug`
- `wordCount`
- `articleSummary`
- `outline`
- `topHeadings`
- `dominantTopics`

### B. focused_context

作用：

- 给模型当前最重要的编辑区域

建议字段：

- `activeBlock`
- `activeHeadingPath`
- `selectionText`
- `previousBlocks`
- `nextBlocks`
- `currentSectionBlocks`

### C. retrieved_context

作用：

- 给模型和当前请求最相关的补充信息

建议字段：

- `relevantBlocks`
- `supportingBlocks`
- `relatedExamples`
- `visualCandidateBlocks`

### D. thread_context

作用：

- 给模型当前会话状态

建议字段：

- `recentMessages`
- `threadSummary`
- `acceptedDecisions`
- `pendingTasks`
- `activeImageStyle`

## 6.3 当前焦点怎么确定

右栏 AI 必须支持“编辑器焦点感知”。

后续应补充这些来源：

- 当前 selection
- 当前光标所在 block
- 当前 section
- 最近一次用户点中的块

如果拿不到 selection，则降级到：

- 当前标题
- 当前会话最近讨论块

## 6.4 召回策略

不要默认把全文前 12000 字塞给模型。

第一版可采用轻量召回：

1. 当前 block / section 优先
2. 相邻 block 次优先
3. 用关键词或简单语义匹配召回 top-k 相关块

后续再升级 embedding 检索。

---

## 7. Memory Layer 设计

## 7.1 目标

Memory Layer 不是存所有聊天，而是沉淀高价值、跨轮有效的信息。

它要解决的问题：

- 用户偏好会丢失
- 文章目标会漂移
- 图片风格无法延续
- 长对话没有状态

## 7.2 基本结论

底层存储用 **DB / JSON**，不是纯 md。

原因：

- 编辑动作和图片动作都需要结构化定位
- 文章场景的记忆天然是结构化的
- 后续还需要检索、筛选、去重、治理

## 7.3 推荐数据模型

建议新增：

`ai_article_memory_items`

建议字段：

- `id`
- `article_key`
- `scope`
- `kind`
- `title`
- `summary`
- `payload_json`
- `source_message_id`
- `source_tool_name`
- `confidence`
- `pinned`
- `archived`
- `created_at`
- `updated_at`

### scope

- `article`
- `thread`
- `user`
- `workspace`

### kind

- `fact`
- `preference`
- `decision`
- `plan`
- `style`
- `image_style`
- `open_task`
- `completed_task`

## 7.4 应该记什么

### 写作类

- 这篇文章的写作目标
- 用户偏好的语气与风格
- 已经接受的结构决策
- 当前还没完成的编辑任务
- 已重点修改过的 section

### 图片类

- 这篇文章整体视觉方向
- 某个 section 是否适合配图
- 最近一次成功图片的风格摘要
- 当前文章的封面 / 插图约束

## 7.5 不该记什么

- 所有普通闲聊
- 全文原文拷贝
- 每次失败尝试的原始 prompt
- 低价值、一次性噪音

## 7.6 注入层

Memory 不直接整表塞给模型。

每轮应生成一段短摘要：

- `memory_summary`

内容建议包括：

- 当前文章目标
- 当前文章风格
- 已接受决定
- 当前视觉方向
- 未完成任务

---

## 8. Runtime Harness 设计

Harness 是整套 AI 的大脑调度层。

它不负责最终 UI，不负责底层模型，不直接等于工具协议。

它负责：

- 每轮收集输入
- 组装上下文
- 执行流式运行
- 协调编辑与图片能力
- 同步记忆

## 8.1 每轮运行流程

### Step 1: 收集输入

输入包括：

- 用户当前消息
- 当前文档快照
- 焦点上下文
- 最近消息
- 结构化记忆

### Step 2: 选择上下文

根据请求确定本轮真正需要的上下文。

### Step 3: 判定任务类型

建议内部 task type：

- `chat`
- `rewrite`
- `expand`
- `compress`
- `outline_fix`
- `image_plan`
- `image_generate`
- `image_insert`

### Step 4: 运行模型

这里必须升级成 **真流式**。

### Step 5: 执行动作

如果是编辑任务：

- 立即落文

如果是图片任务：

- 规划
- 生成
- 插图

### Step 6: 同步历史与记忆

写入：

- 消息历史
- memory candidate

## 8.2 Loop 约束

为了避免失控，runtime 必须有 guard：

- `max_iterations = 3`
- 不允许重复对同一 block 连续执行相同动作
- 不允许重复触发同一图片生成任务
- 问答任务不得偷偷改文
- 大范围改写优先降级为建议

---

## 9. 真流式设计

## 9.1 当前问题

现在的流式是伪流式：

- 模型先完整返回
- 服务端再把文本切块
- 前端只是看起来在滚字

这不能算真正流式。

## 9.2 目标

目标是：

- AI 说明文字真流式
- 首字延迟下降
- 图片任务支持状态流
- 编辑动作在最终阶段立即落文

## 9.3 事件协议

建议统一 NDJSON 事件：

- `assistant_start`
- `assistant_delta`
- `tool_pending`
- `tool_ready`
- `tool_result`
- `assistant_done`
- `assistant_error`

## 9.4 关键策略

当前产品方向下，最稳的方式不是“边流边改文”，而是：

- 文本 explanation 真流式输出
- 最终 action 在末尾一次性定稿
- 收到 `assistant_done` 后立即落文

这样实现简单，行为稳定，也符合当前需求。

## 9.5 OpenAI 路径

OpenAI SDK 已支持真流式。

因此第一版建议：

- 先把 OpenAI 路径做成真流式
- Workers AI 暂时允许降级

---

## 10. Execution Layer 设计

Execution Layer 负责把模型输出变成真正的文档变化。

它分成两支：

1. 编辑执行
2. 图片执行

## 10.1 编辑执行

### 目标

让 AI 立即改文，但范围清楚、动作明确。

### 支持的内部 action

- `rewrite_block`
- `rewrite_selection`
- `expand_block`
- `compress_block`
- `add_example_after_block`
- `add_transition_between_blocks`
- `append_new_section`

### 执行原则

- 优先 block 级
- 再 section 级
- 最后才是全文级建议

## 10.2 图片执行

### 目标

让 AI 不只是“会生图”，而是会基于文章上下文生成并插入正确图片。

### 支持的内部 action

- `generate_cover_image`
- `generate_inline_image_for_block`
- `generate_image_from_selection`
- `plan_visual_story`
- `replace_existing_image`
- `regenerate_with_same_style`

---

## 11. AI 如何参与编辑

AI 参与编辑应该分层：

### Level 1: 解释

只回答，不改文。

### Level 2: 建议

先分析问题，给修改建议。

### Level 3: 局部改写

直接改当前 block / 当前 section。

### Level 4: 结构调整

提出新增 section、合并 section、重排逻辑等建议。

当前系统优先落地 Level 1-3。

---

## 12. AI 如何参与图片生成

图片能力应分三层：

### 1. Visual Planning

判断：

- 哪些段落适合配图
- 每张图起什么作用
- 整篇文章的视觉节奏

### 2. Prompt Construction

prompt 至少由这些信息构成：

- 标题
- 当前 block 内容
- 所在 section 标题
- 图片用途
- 全文视觉风格
- 历史图片风格记忆

### 3. Generation + Insertion

生成图后：

- 给出 alt
- 给出生成原因
- 插入正确位置
- 更新记忆

---

## 13. AI 如何参与图片插入

插图不能只是“塞在后面”。

应该明确插入角色：

- 当前 block 后
- 当前 section 末尾
- section hero
- 封面图

每张图最好带这些元信息：

- `sourceBlockIndex`
- `sourceHeadingPath`
- `generationReason`
- `visualRole`
- `alt`
- `styleFingerprint`

这样后续才能：

- 风格延续
- 批量替换
- 图像追踪

---

## 14. 最重要的 3 个工作流

## Flow A：润色当前段落

用户说：

“把这段改得更克制一点”

系统应：

1. 定位当前 block
2. 读取 section 上下文
3. 读取相关记忆
4. 流式输出分析
5. 最终生成 block 改写
6. 立即落文
7. 更新 memory

## Flow B：给当前 section 配图

用户说：

“这一节配一张图”

系统应：

1. 定位当前 section
2. 判断是否适合配图
3. 确定图片 role
4. 流式输出规划理由
5. 生成图片
6. 插到合理位置
7. 更新 image memory

## Flow C：给全文规划三张图

用户说：

“给这篇文章规划三张图”

系统应：

1. 扫描全文结构
2. 找到最适合配图的 3 个 section / block
3. 为每张图分配作用
4. 流式输出规划
5. 执行生成
6. 分段插入
7. 记录整篇视觉方案

---

## 15. 第一版实现顺序

不要一次性全做，建议按这个顺序：

### Step 1

重构 Context Layer

重点文件：

- `lib/editor-document-outline.ts`
- `lib/ai-editor-context.ts`

### Step 2

补 Memory Layer

重点文件：

- 新增 `lib/ai-editor-memory.ts`
- 新增 memory 表与读写逻辑

### Step 3

重构 Runtime Harness

重点文件：

- 新增 `lib/ai-editor-runtime.ts`
- 改 `app/api/editor/ai-chat/route.ts`

### Step 4

接入真流式

重点文件：

- `lib/ai-editor-agent.ts`
- `app/api/editor/ai-chat/route.ts`
- `components/editor/AIPanel.tsx`

### Step 5

编辑动作稳定化

重点文件：

- `lib/editor-markdown.ts`
- `components/editor/AIPanel.tsx`

### Step 6

图片能力会话化

重点文件：

- `lib/ai-image.ts`
- `app/api/editor/ai-image/route.ts`
- 新增图片 planner / insertion helpers

---

## 16. 文件规划

### 保留并增强

- `lib/ai-editor-context.ts`
- `lib/ai-editor-agent.ts`
- `lib/editor-document-outline.ts`
- `app/api/editor/ai-chat/route.ts`
- `components/editor/AIPanel.tsx`
- `lib/repositories/ai-article-threads.ts`

### 建议新增

- `lib/ai-editor-memory.ts`
- `lib/ai-editor-retrieval.ts`
- `lib/ai-editor-runtime.ts`
- `lib/ai-editor-image-planner.ts`
- `lib/ai-editor-stream.ts`

---

## 17. 最终判断

这套系统最关键的不是先加多少按钮，而是先把 AI 的底层组织起来。

真正正确的建设顺序是：

**Context -> Memory -> Harness -> Streaming -> Editing -> Images**

只要这条顺序不乱，右栏 AI 最终就会从：

- “一个会聊天的面板”

升级成：

- “真正理解文章、会参与编辑、会规划并插入图片的协作执行层”

这就是本项目 Editor AI 的完整目标形态。
