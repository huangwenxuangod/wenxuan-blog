import { normalizeToolCallToAction } from '@/lib/ai-editor/action-schema'
import { runExternalTextRequest } from '@/lib/ai-runtime/external-text'
import type {
  EditorAiModelPrompt,
  EditorAiProviderRunResult,
  EditorAiProviderStreamResult,
  EditorAiRuntimeEvent,
  EditorAiRuntimePreparedInput,
} from '@/lib/ai-editor/runtime-types'
import type { ResolvedConfig } from '@/lib/ai'
import { appendSkillInstructions } from '@/lib/skills/prompt'
import { describeAiEditorTools } from '@/lib/ai-editor/agent-tools'
import { parseStructuredEditorToolCall } from '@/lib/ai-editor/providers/structured-tool'

function buildPrompt(input: EditorAiRuntimePreparedInput): EditorAiModelPrompt {
  const systemPrompt = appendSkillInstructions(
    `${describeAiEditorTools(input.context.outline)}

请始终只返回一个 JSON 对象，格式为：
{
  "message": "给用户看的简短回复",
  "tool": {
    "name": "reply_only | edit_title | edit_selection | insert_block | generate_image",
    "payload": null 或对象
  }
}

不要输出 Markdown 代码块，不要输出解释文字。`,
    input.activeSkill,
  )
  const focusedBlocks = [
    ...input.context.focusedContext.previousBlocks,
    ...(input.context.focusedContext.activeBlock ? [input.context.focusedContext.activeBlock] : []),
    ...input.context.focusedContext.nextBlocks,
  ]
  const retrievedBlocks = input.context.retrievedContext.relevantBlocks
  const supportingBlocks = input.context.retrievedContext.supportingBlocks

  const userPrompt = [
    input.context.title ? `文章标题：${input.context.title}` : '',
    `文档快照：\n${JSON.stringify(input.context.documentSnapshot, null, 2)}`,
    input.context.memorySummary ? `结构化记忆摘要：\n${input.context.memorySummary}` : '',
    input.context.threadContext.threadSummary ? `最近对话：\n${input.context.threadContext.threadSummary}` : '',
    focusedBlocks.length > 0
      ? `当前聚焦区域：\n${focusedBlocks.map((block) => `- #${block.index} [${block.type}] ${block.text.slice(0, 220) || '(空块)'}`).join('\n')}`
      : '',
    retrievedBlocks.length > 0
      ? `相关召回块：\n${retrievedBlocks.map((block) => `- #${block.index} [${block.type}] ${block.text.slice(0, 220) || '(空块)'}`).join('\n')}`
      : '',
    supportingBlocks.length > 0
      ? `辅助上下文：\n${supportingBlocks.map((block) => `- #${block.index} [${block.type}] ${block.text.slice(0, 180) || '(空块)'}`).join('\n')}`
      : '',
    input.context.retrievedContext.memoryItems.length > 0
      ? `本轮相关记忆：\n${input.context.retrievedContext.memoryItems.map((item) => `- [${item.kind}] ${item.summary}`).join('\n')}`
      : '',
    input.context.outlineText ? `文章结构：\n${input.context.outlineText}` : '',
    input.context.fullText ? `文章全文（截断）：\n${input.context.fullText.slice(0, 8000)}` : '',
    `用户当前请求：${input.userMessage.trim()}`,
  ].filter(Boolean).join('\n\n')

  return {
    systemPrompt,
    userPrompt,
  }
}

export async function runAnthropicEditorProvider(
  input: EditorAiRuntimePreparedInput,
  config: Extract<ResolvedConfig, { strategy: 'external-provider' }>,
): Promise<EditorAiProviderStreamResult> {
  const { systemPrompt, userPrompt } = buildPrompt(input)

  let resolveCompleted!: (value: EditorAiProviderRunResult) => void
  let rejectCompleted!: (reason?: unknown) => void

  const completed = new Promise<EditorAiProviderRunResult>((resolve, reject) => {
    resolveCompleted = resolve
    rejectCompleted = reject
  })

  const providerStream = (async function* (): AsyncGenerator<EditorAiRuntimeEvent> {
    try {
      yield { type: 'assistant_start' }

      const response = await runExternalTextRequest({
        config,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        maxTokens: Math.min(config.maxTokens, 2400),
        jsonMode: true,
      })

      const parsed = parseStructuredEditorToolCall(response.content)
      if (!parsed.parsed) {
        throw new Error('Anthropic 返回的结构化编辑动作无法解析，请检查提示词或切换兼容接口。')
      }
      const action = normalizeToolCallToAction({
        name: parsed.toolName as never,
        payload: parsed.toolPayload as never,
      })

      if (parsed.message) {
        yield {
          type: 'assistant_delta',
          delta: parsed.message,
        }
      }

      resolveCompleted({
        message: parsed.message,
        action,
      })

      yield {
        type: 'action_ready',
        action,
      }
      yield {
        type: 'assistant_done',
        message: parsed.message,
        action,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Anthropic provider stream failed'
      yield {
        type: 'assistant_error',
        error: message,
      }
      rejectCompleted(error)
      throw error
    }
  })()

  return {
    stream: providerStream,
    completed,
  }
}
