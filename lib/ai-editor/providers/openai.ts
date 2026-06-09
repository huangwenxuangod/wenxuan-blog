import OpenAI from 'openai'
import type { ResponseStreamEvent } from 'openai/resources/responses/responses'
import { normalizeBaseUrl } from '@/lib/ai-provider-profiles'
import { describeAiEditorTools } from '@/lib/ai-editor/agent-tools'
import { normalizeToolCallToAction } from '@/lib/ai-editor/action-schema'
import type {
  EditorAiModelPrompt,
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

export async function runOpenAiEditorProvider(
  input: EditorAiRuntimePreparedInput,
  config: Extract<ResolvedConfig, { strategy: 'external-provider' }>,
): Promise<EditorAiProviderStreamResult> {
  const { systemPrompt, userPrompt } = buildPrompt(input)
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeBaseUrl(config.baseURL),
  })

  const stream = await client.responses.create({
    model: config.model,
    stream: true,
    instructions: systemPrompt,
    temperature: 0.4,
    max_output_tokens: Math.min(config.maxTokens, 2400),
    input: userPrompt,
    tools: [
      {
        type: 'function',
        name: 'editor_action',
        strict: true,
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
    let functionCallBuffer = ''

    try {
      yield { type: 'assistant_start' }

      for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
        if (event.type === 'response.output_text.delta') {
          message += event.delta
          yield {
            type: 'assistant_delta',
            delta: event.delta,
          }
        }

        if (event.type === 'response.function_call_arguments.delta') {
          functionCallBuffer += event.delta
        }

        if (event.type === 'response.function_call_arguments.done') {
          functionCallBuffer = event.arguments || functionCallBuffer
          try {
            const parsed = JSON.parse(functionCallBuffer) as {
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
      }

      const action = normalizeToolCallToAction({
        name: finalToolName as never,
        payload: finalToolPayload as never,
      })

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
      const message = error instanceof Error ? error.message : 'OpenAI provider stream failed'
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
