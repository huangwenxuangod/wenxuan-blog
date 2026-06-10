import {
  getWorkersAiAssistantPayload,
  shouldRetryAssistantPayload,
} from '@/lib/ai-post-generator/parsers'
import {
  getAiRuntimeEnv,
  resolveConfig,
  type AIEnv,
} from '@/lib/ai-runtime'
import { runExternalTextRequest } from '@/lib/ai-runtime/external-text'

export interface TransformOptions {
  customPrompt?: string
  actionPrompt?: string
  temperature?: number
  profileId?: number
  db?: D1Database
  env?: AIEnv
}

function extractWorkersAiPayload(result: unknown): unknown {
  if (result && typeof result === 'object') {
    const payload = result as {
      response?: unknown
      result?: { response?: unknown } | unknown
      choices?: Array<{ message?: { content?: unknown } }>
    }

    if (payload.response !== undefined) return payload.response
    if (payload.result && typeof payload.result === 'object' && 'response' in payload.result) {
      return (payload.result as { response?: unknown }).response
    }
    const firstChoice = payload.choices?.[0]?.message?.content
    if (firstChoice !== undefined) return firstChoice
  }

  return result
}

function extractWorkersAiText(result: unknown): string {
  const payload = extractWorkersAiPayload(result)

  if (typeof payload === 'string') return payload.trim()
  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text || '')
        }
        return ''
      })
      .join('')
      .trim()
  }
  if (payload && typeof payload === 'object') {
    return JSON.stringify(payload)
  }
  return payload == null ? '' : String(payload).trim()
}

function createTextStream(output: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(output))
      controller.close()
    },
  })
}

export async function transformEditorSelectionStream(
  text: string,
  action: string,
  options: TransformOptions,
): Promise<ReadableStream<Uint8Array>> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('没有可处理的选中文本')

  const config = await resolveConfig(options.env, options.db, options.profileId)
  if (config.strategy === 'disabled') {
    throw new Error(config.reason)
  }

  let systemPrompt: string
  let temperature: number

  if (action === 'custom') {
    if (!options.customPrompt?.trim()) throw new Error('请输入指令')
    systemPrompt = '你是专业的写作助手。用户给你一段文字和一个处理指令，请严格按指令处理并直接返回结果，不要添加任何说明或解释。'
    temperature = config.temperature
  } else if (options.actionPrompt) {
    systemPrompt = options.actionPrompt
    temperature = options.temperature ?? config.temperature
  } else {
    throw new Error('无效操作')
  }

  const userContent = action === 'custom'
    ? `指令：${options.customPrompt}\n\n文字内容：\n${trimmed}`
    : trimmed

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userContent },
  ]
  const retryMessages = messages.map((message, index) => (
    index === 0
      ? {
          ...message,
          content: `${message.content}\n\nDo not output reasoning, thinking, or analysis. Return only the final answer.`,
        }
      : message
  ))

  if (config.strategy === 'workers-ai') {
    const primaryRaw = await config.binding.run(config.model, {
      messages,
      max_tokens: config.maxTokens,
      temperature,
    })
    const primary = getWorkersAiAssistantPayload(primaryRaw)
    if (primary.content) {
      return createTextStream(primary.content)
    }

    if (shouldRetryAssistantPayload(primary)) {
      const retriedRaw = await config.binding.run(config.model, {
        messages: retryMessages,
        max_tokens: Math.min(Math.max(config.maxTokens * 3, 512), 2048),
        temperature,
      })
      const retried = getWorkersAiAssistantPayload(retriedRaw)
      if (retried.content) {
        return createTextStream(retried.content)
      }
    }

    const output = extractWorkersAiText(primaryRaw)
    return createTextStream(output)
  }

  const primary = await runExternalTextRequest({
    config,
    messages,
    temperature,
    maxTokens: config.maxTokens,
  })
  if (primary.content) {
    return createTextStream(primary.content)
  }

  if (shouldRetryAssistantPayload(primary)) {
    const retried = await runExternalTextRequest({
      config,
      messages: retryMessages,
      temperature,
      maxTokens: Math.min(Math.max(config.maxTokens * 3, 512), 2048),
    })
    if (retried.content) {
      return createTextStream(retried.content)
    }
  }

  return createTextStream('')
}

export { getAiRuntimeEnv }
