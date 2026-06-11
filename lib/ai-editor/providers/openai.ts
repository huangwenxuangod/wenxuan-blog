import OpenAI from 'openai'
import type {
  EditorAiProviderPlanExecution,
  EditorAiProviderPlanResult,
  EditorAiRuntimePreparedInput,
} from '@/lib/ai-editor/runtime-types'
import type { ResolvedConfig } from '@/lib/ai'
import { buildEditorAiModelPrompt } from '@/lib/ai-editor/prompt-builder'
import { parseStructuredEditorToolCall } from '@/lib/ai-editor/providers/structured-tool'
import { StreamingJsonMessageExtractor } from '@/lib/ai-editor/providers/streaming-json-message'
import { normalizeBaseUrl } from '@/lib/ai-provider-profiles'
import { normalizeAiEditorToolCall } from '@/lib/ai-editor/tool-registry'

export async function planOpenAiEditorStep(
  input: EditorAiRuntimePreparedInput,
  config: Extract<ResolvedConfig, { strategy: 'external-provider' }>,
): Promise<EditorAiProviderPlanExecution> {
  const { systemPrompt, userPrompt } = buildEditorAiModelPrompt(input)
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeBaseUrl(config.baseURL),
  })

  const requestBodies = [
    buildOpenAiPlanRequestBody(config.model, systemPrompt, userPrompt, Math.min(config.maxTokens, 2400), true),
    buildOpenAiPlanRequestBody(config.model, systemPrompt, userPrompt, Math.min(config.maxTokens, 2400), false),
  ]

  let resolveCompleted!: (value: EditorAiProviderPlanResult) => void
  let rejectCompleted!: (reason?: unknown) => void

  const completed = new Promise<EditorAiProviderPlanResult>((resolve, reject) => {
    resolveCompleted = resolve
    rejectCompleted = reject
  })

  const stream = (async function* () {
    let lastError: Error | null = null

    for (let index = 0; index < requestBodies.length; index += 1) {
      const requestBody = requestBodies[index]
      const rawParts: string[] = []
      const messageExtractor = new StreamingJsonMessageExtractor()

      try {
        const response = (await client.chat.completions.create({
          ...(requestBody as Record<string, unknown>),
          stream: true,
        } as never) as unknown) as AsyncIterable<{
          choices?: Array<{
            delta?: {
              content?: string | null
            }
          }>
        }>

        for await (const chunk of response) {
          const delta = chunk.choices?.[0]?.delta?.content || ''
          if (!delta) continue

          rawParts.push(delta)
          const visibleDelta = messageExtractor.feed(delta)
          if (visibleDelta) {
            yield visibleDelta
          }
        }

        const parsed = parseStructuredEditorToolCall(rawParts.join(''))
        if (!parsed.parsed) {
          throw new Error('OpenAI 兼容接口返回的结构化编辑动作无法解析，请重试。')
        }

        resolveCompleted({
          message: parsed.message,
          toolCall: normalizeAiEditorToolCall({
            name: parsed.toolName,
            payload: parsed.toolPayload,
          }),
        })
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (index === 0 && looksLikeUnsupportedJsonMode(lastError.message)) {
          continue
        }

        rejectCompleted(lastError)
        throw lastError
      }
    }

    const finalError = lastError || new Error('OpenAI 兼容接口返回失败')
    rejectCompleted(finalError)
    throw finalError
  })()

  return {
    completed,
    stream,
  }
}

function buildOpenAiPlanRequestBody(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  includeJsonMode: boolean,
) {
  return {
    model,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: maxTokens,
    ...(includeJsonMode ? { response_format: { type: 'json_object' as const } } : {}),
  }
}

function looksLikeUnsupportedJsonMode(message: string) {
  return /response_format|json_object|json schema|json_schema|unsupported/i.test(message)
}
