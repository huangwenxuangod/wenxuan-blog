import type { EditorAiModelPrompt, EditorAiRuntimePreparedInput } from '@/lib/ai-editor/runtime-types'
import { describeAiEditorTools } from '@/lib/ai-editor/tool-registry'
import { appendSkillInstructions } from '@/lib/skills/prompt'

function serializeObservationPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return ''

  const normalized = JSON.stringify(payload, null, 2)
  if (!normalized) return ''

  return normalized.length > 4000
    ? `${normalized.slice(0, 4000)}\n...`
    : normalized
}

export function chunkAssistantMessage(message: string) {
  const normalized = String(message || '').replace(/\r/g, '').trim()
  if (!normalized) return []

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  return paragraphs.length > 0
    ? paragraphs.map((part, index) => `${index > 0 ? '\n\n' : ''}${part}`)
    : [normalized]
}

export function buildEditorAiModelPrompt(input: EditorAiRuntimePreparedInput): EditorAiModelPrompt {
  const hasTavily = !!(input.appEnv?.TAVILY_API_KEY || process.env.TAVILY_API_KEY)

  const baseTools = describeAiEditorTools(input.context.outline)
  const webToolDescription = hasTavily
    ? '\n- web_search: 用搜索引擎搜索互联网获取实时信息。payload: { "query": "...", "maxResults"?: 5 }\n  你在需要实时数据、最新新闻、外部知识、事实核查时优先使用'
    : ''
  const toolsDescription = `${baseTools}${webToolDescription}`
  const webToolNameHint = hasTavily ? ' | web_search' : ''

  const systemPrompt = appendSkillInstructions(
    `${toolsDescription}

===== 工作区规则 =====
你是一个全局 AI 工作区助手，可以同时与多篇文章交互。

用户当前正在编辑的文章：
  标题: 《${input.context.title}》
  slug: ${input.context.postSlug || '(无)'}

规则：
1. 用户不指定文章时，默认指"当前正在编辑的文章"
2. 用户消息前的 [当前文章: xxx] 标记了该消息的上下文文章
3. 你可以跨文章检索、创建和修改
4. 历史对话摘要（如有）在消息列表最上方

请始终只返回一个 JSON 对象，格式为：
{
  "message": "给用户看的简短回复",
  "tool": {
    "name": "reply_only | list_posts | search_posts | get_post | create_post | update_post | edit_title | edit_selection | insert_block | generate_images${webToolNameHint}",
    "payload": null 或对象
  }
}

要求：
1. message 必须使用简洁 Markdown，可用小标题、项目符号、加粗。
2. 优先输出短结构，不要返回大段连续正文。
3. 如果这一步只是为了检索或读取资料，message 可以非常短，但 tool 必须准确。
4. 如果用户要求插图、配图、封面图或基于文章生成多张图，优先返回 generate_images，最多 5 张。
5. 不要输出 Markdown 代码块，不要输出 JSON 以外的解释文字。`,
    input.activeSkill,
  )

  const focusedBlocks = [
    ...input.context.focusedContext.previousBlocks,
    ...(input.context.focusedContext.activeBlock ? [input.context.focusedContext.activeBlock] : []),
    ...input.context.focusedContext.nextBlocks,
  ]
  const retrievedBlocks = input.context.retrievedContext.relevantBlocks
  const supportingBlocks = input.context.retrievedContext.supportingBlocks
  const workingSet = input.agentState?.workingSet || []
  const observations = input.toolObservations || []

  const userPrompt = [
    input.context.title ? `当前打开文章标题：${input.context.title}` : '',
    input.context.postSlug ? `当前打开文章 slug：${input.context.postSlug}` : '',
    `文档快照：\n${JSON.stringify(input.context.documentSnapshot, null, 2)}`,
    input.context.memorySummary ? `结构化记忆摘要：\n${input.context.memorySummary}` : '',
    input.context.threadContext.threadSummary ? `最近对话：\n${input.context.threadContext.threadSummary}` : '',
    input.context.threadContext.acceptedDecisions.length > 0
      ? `已确认规则：\n${input.context.threadContext.acceptedDecisions.map((item) => `- ${item}`).join('\n')}`
      : '',
    input.context.threadContext.pendingTasks.length > 0
      ? `当前待继续事项：\n${input.context.threadContext.pendingTasks.map((item) => `- ${item}`).join('\n')}`
      : '',
    input.context.threadContext.activeImageStyle
      ? `当前视觉方向：\n- ${input.context.threadContext.activeImageStyle}`
      : '',
    input.agentState
      ? [
          `当前 agent 状态：`,
          `- iteration: ${input.agentState.iteration}/${input.agentState.maxIterations}`,
          `- intent: ${input.agentState.intent}`,
          `- currentPostSlug: ${input.agentState.currentPostSlug || '(none)'}`,
          input.agentState.pendingAction ? `- pendingAction: ${input.agentState.pendingAction}` : '',
        ].filter(Boolean).join('\n')
      : '',
    workingSet.length > 0
      ? `当前 working set：\n${workingSet.map((item) => `- ${item.slug}: ${item.title} (${item.reason})`).join('\n')}`
      : '',
    observations.length > 0
      ? `前序工具观察：\n${observations.map((item) => `- [${item.toolName}] ${item.summary}`).join('\n')}`
      : '',
    observations.some((item) => item.payload)
      ? `前序工具详情：\n${observations
          .filter((item) => item.payload)
          .map((item) => `### ${item.toolName}\n${serializeObservationPayload(item.payload || null)}`)
          .join('\n\n')}`
      : '',
    observations.length > 0
      ? '约束：如果前序工具观察里已经有你需要的信息，不要重复调用同一个 tool 读取同一个目标；直接进入下一步。'
      : '',
    focusedBlocks.length > 0
      ? `当前聚焦区域：\n${focusedBlocks.map((block) => `- #${block.index} [${block.type}] ${block.text.slice(0, 220) || '(空块)'}`).join('\n')}`
      : '',
    retrievedBlocks.length > 0
      ? `相关召回块：\n${retrievedBlocks.map((block) => `- #${block.index} [${block.type}] ${block.text.slice(0, 220) || '(空块)'}`).join('\n')}`
      : '',
    supportingBlocks.length > 0
      ? `辅助上下文：\n${supportingBlocks.map((block) => `- #${block.index} [${block.type}] ${block.text.slice(0, 180) || '(空块)'}`).join('\n')}`
      : '',
    input.context.retrievedContext.visualCandidateBlocks.length > 0
      ? `视觉候选块：\n${input.context.retrievedContext.visualCandidateBlocks.map((block) => `- #${block.index} [${block.type}] ${block.text.slice(0, 180) || '(空块)'}`).join('\n')}`
      : '',
    input.context.retrievedContext.memoryItems.length > 0
      ? `本轮相关记忆：\n${input.context.retrievedContext.memoryItems.map((item) => `- [${item.kind}] ${item.summary}`).join('\n')}`
      : '',
    [
      '执行约束：',
      '- 已确认规则优先于你临时生成的新偏好。',
      '- 如果当前待继续事项已覆盖用户本轮要求，优先沿着该事项继续，不要重新发明任务。',
      '- 如果已有当前视觉方向，生成图片时优先延续，不要无故换风格。',
      '- 如果前序工具观察里已经有目标文章 slug、正文或检索结果，不要重复调用同一个 lookup tool。',
    ].join('\n'),
    input.context.outlineText ? `当前文章结构：\n${input.context.outlineText}` : '',
    input.context.fullText ? `当前文章全文（截断）：\n${input.context.fullText.slice(0, 8000)}` : '',
    `用户当前请求：${input.userMessage.trim()}`,
  ].filter(Boolean).join('\n\n')

  return {
    systemPrompt,
    userPrompt,
  }
}
