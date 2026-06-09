import OpenAI from 'openai'
import { normalizeBaseUrl } from '@/lib/ai-provider-profiles'
import { describeAiEditorTools } from '@/lib/ai-editor/agent-tools'
import { normalizeToolCallToAction } from '@/lib/ai-editor/action-schema'
import type {
  EditorAiModelPrompt,
  EditorAiRuntimeCompletedResult,
  EditorAiProviderRunResult,
  EditorAiProviderStreamResult,
  EditorAiRuntimeEvent,
  EditorAiRuntimePreparedInput,
} from '@/lib/ai-editor/runtime-types'
import type { ResolvedConfig } from '@/lib/ai'
import { appendSkillInstructions } from '@/lib/skills/prompt'

function buildPrompt(input: EditorAiRuntimePreparedInput): EditorAiModelPrompt {
  const systemPrompt = appendSkillInstructions(
    describeAiEditorTools(input.context.outline),
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

type DeepSeekToolCall = {
  function?: {
    name?: string
    arguments?: string
  }
}

function emitMessageChunks(text: string): EditorAiRuntimeEvent[] {
  const normalized = String(text || '')
  const chunkSize = 24
  const events: EditorAiRuntimeEvent[] = []

  for (let index = 0; index < normalized.length; index += chunkSize) {
    events.push({
      type: 'assistant_delta',
      delta: normalized.slice(index, index + chunkSize),
    })
  }

  return events
}

function resolveStructuredDeepSeekResult(rawContent: string, fallbackAction: EditorAiRuntimeCompletedResult['action']) {
  const trimmed = rawContent.trim()
  if (!trimmed.startsWith('{')) {
    return {
      message: rawContent,
      action: fallbackAction,
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      message?: unknown
      tool?: {
        name?: string
        payload?: unknown
      } | null
    }

    const action = normalizeToolCallToAction(parsed.tool as never)
    return {
      message: typeof parsed.message === 'string' ? parsed.message : rawContent,
      action,
    }
  } catch {
    return {
      message: rawContent,
      action: fallbackAction,
    }
  }
}

export async function runDeepSeekEditorProvider(
  input: EditorAiRuntimePreparedInput,
  config: Extract<ResolvedConfig, { strategy: 'external-provider' }>,
): Promise<EditorAiProviderStreamResult> {
  const { systemPrompt, userPrompt } = buildPrompt(input)
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeBaseUrl(config.baseURL),
  })

  const stream = await client.chat.completions.create({
    model: config.model,
    stream: true,
    temperature: 0.4,
    max_tokens: Math.min(config.maxTokens, 2400),
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'editor_action',
          description: 'Return the final editor action for this turn.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'payload'],
            properties: {
              name: {
                type: 'string',
                enum: ['reply_only', 'edit_title', 'edit_selection', 'insert_block', 'generate_image'],
              },
              payload: {
                anyOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    additionalProperties: true,
                  },
                ],
              },
            },
          },
        },
      },
    ],
  })

  let resolveCompleted!: (value: EditorAiProviderRunResult) => void
  let rejectCompleted!: (reason?: unknown) => void

  const completed = new Promise<EditorAiProviderRunResult>((resolve, reject) => {
    resolveCompleted = resolve
    rejectCompleted = reject
  })

  const providerStream = (async function* (): AsyncGenerator<EditorAiRuntimeEvent> {
    let message = ''
    let finalToolName = 'reply_only'
    let finalToolPayload: unknown = null
    const toolArgumentBuffers = new Map<number, string>()
    let rawContent = ''
    let structuredContentMode: boolean | null = null

    try {
      yield { type: 'assistant_start' }

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0]
        const delta = choice?.delta
        if (!delta) continue

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          rawContent += delta.content

          if (structuredContentMode == null) {
            const firstVisibleChar = rawContent.trimStart().charAt(0)
            structuredContentMode = firstVisibleChar === '{'
          }

          if (!structuredContentMode) {
            message += delta.content
            yield {
              type: 'assistant_delta',
              delta: delta.content,
            }
          }
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const toolCall of delta.tool_calls as DeepSeekToolCall[]) {
            const functionName = toolCall.function?.name
            const argumentsDelta = toolCall.function?.arguments || ''
            if (functionName === 'editor_action' || argumentsDelta) {
              const nextValue = `${toolArgumentBuffers.get(0) || ''}${argumentsDelta}`
              toolArgumentBuffers.set(0, nextValue)
              if (functionName === 'editor_action') {
                finalToolName = functionName
              }
            }
          }
        }
      }

      const rawArguments = toolArgumentBuffers.get(0) || ''
      if (rawArguments) {
        try {
          const parsed = JSON.parse(rawArguments) as {
            name?: string
            payload?: unknown
          }
          finalToolName = typeof parsed.name === 'string' ? parsed.name : 'reply_only'
          finalToolPayload = parsed.payload ?? null
        } catch {
          finalToolName = 'reply_only'
          finalToolPayload = null
        }
      }

      const action = normalizeToolCallToAction({
        name: finalToolName as never,
        payload: finalToolPayload as never,
      })

      if (structuredContentMode) {
        const structured = resolveStructuredDeepSeekResult(rawContent, action)
        message = structured.message

        resolveCompleted({
          message,
          action: structured.action,
        })

        for (const event of emitMessageChunks(message)) {
          yield event
        }

        yield {
          type: 'action_ready',
          action: structured.action,
        }
        yield {
          type: 'assistant_done',
          message,
          action: structured.action,
        }
        return
      }

      resolveCompleted({
        message,
        action,
      })

      yield {
        type: 'action_ready',
        action,
      }
      yield {
        type: 'assistant_done',
        message,
        action,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DeepSeek provider stream failed'
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
