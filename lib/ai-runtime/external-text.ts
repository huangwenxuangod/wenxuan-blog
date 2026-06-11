import { getExternalAssistantPayload, getWorkersAiAssistantPayload } from '@/lib/ai-post-generator/parsers'
import { isWorkersAiBaseUrl, normalizeBaseUrl } from '@/lib/ai-provider-profiles'
import { createChatCompletion } from '@/lib/openai-fetch'

export interface ExternalTextMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ExternalTextResponse {
  content: string
  reasoning: string
  finishReason: string
}

export interface ExternalTextRequest {
  config: {
    apiKey: string
    providerType: 'openai_compatible' | 'anthropic'
    baseURL: string
    model: string
  }
  messages: ExternalTextMessage[]
  temperature: number
  maxTokens: number
  jsonMode?: boolean
  requestOptions?: Record<string, unknown>
  timeoutMs?: number
}

function getTimeoutSignal(timeoutMs: number) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs)
  }
  return undefined
}

function extractErrorMessage(rawBody: string, fallbackStatus: number) {
  try {
    const parsed = rawBody ? JSON.parse(rawBody) as {
      errors?: Array<{ message?: string }>
      error?: { message?: string } | string
      message?: string
    } : null

    const firstError = parsed?.errors?.find((item) => typeof item?.message === 'string' && item.message.trim())
    if (firstError?.message) {
      return firstError.message.trim()
    }
    if (typeof parsed?.error === 'object' && parsed.error?.message) {
      return parsed.error.message.trim()
    }
    if (typeof parsed?.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim()
    }
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim()
    }
  } catch {
    // ignore invalid JSON bodies and fall through
  }

  return rawBody.trim() || `AI 文本生成失败：HTTP ${fallbackStatus}`
}

function looksLikeUnsupportedJsonMode(message: string) {
  return /response_format|json_object|json schema|json_schema|unsupported/i.test(message)
}

function extractAnthropicAssistantPayload(response: unknown): ExternalTextResponse {
  const payload = response as {
    content?: Array<{
      type?: string
      text?: string
      input?: unknown
    }>
    stop_reason?: string | null
  }

  const blocks = Array.isArray(payload?.content) ? payload.content : []
  const text = blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text || '')
    .join('')
    .trim()

  const toolInput = blocks
    .filter((block) => block?.type === 'tool_use' && block.input !== undefined)
    .map((block) => JSON.stringify(block.input))
    .join('\n')
    .trim()

  return {
    content: text || toolInput,
    reasoning: '',
    finishReason: typeof payload?.stop_reason === 'string' ? payload.stop_reason : '',
  }
}

function buildOpenAiCompatibleBody(input: ExternalTextRequest, includeJsonMode: boolean) {
  return {
    model: input.config.model,
    messages: input.messages,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    ...(includeJsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    ...(input.requestOptions || {}),
  }
}

async function runWorkersCompatibleRequest(input: ExternalTextRequest): Promise<ExternalTextResponse> {
  const normalizedBaseUrl = normalizeBaseUrl(input.config.baseURL)
  const requestBodies = input.jsonMode
    ? [
        buildOpenAiCompatibleBody(input, true),
        buildOpenAiCompatibleBody(input, false),
      ]
    : [buildOpenAiCompatibleBody(input, false)]

  let lastError: Error | null = null

  for (let index = 0; index < requestBodies.length; index += 1) {
    const response = await fetch(`${normalizedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBodies[index]),
      signal: getTimeoutSignal(input.timeoutMs || 30000),
    })

    const rawBody = await response.text().catch(() => '')
    if (!response.ok) {
      const errorMessage = extractErrorMessage(rawBody, response.status)
      lastError = new Error(errorMessage)

      if (index === 0 && input.jsonMode && looksLikeUnsupportedJsonMode(errorMessage)) {
        continue
      }

      throw lastError
    }

    const parsed = rawBody ? JSON.parse(rawBody) : null
    return getWorkersAiAssistantPayload(parsed)
  }

  throw lastError || new Error('AI 文本生成失败')
}

async function runOpenAiCompatibleRequest(input: ExternalTextRequest): Promise<ExternalTextResponse> {
  const auth = { apiKey: input.config.apiKey, baseURL: normalizeBaseUrl(input.config.baseURL) }

  const requestBodies = input.jsonMode
    ? [
        buildOpenAiCompatibleBody(input, true),
        buildOpenAiCompatibleBody(input, false),
      ]
    : [buildOpenAiCompatibleBody(input, false)]

  let lastError: Error | null = null

  for (let index = 0; index < requestBodies.length; index += 1) {
    try {
      const response = await createChatCompletion(auth, requestBodies[index])
      return getExternalAssistantPayload(response)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (index === 0 && input.jsonMode && looksLikeUnsupportedJsonMode(lastError.message)) {
        continue
      }
      throw lastError
    }
  }

  throw lastError || new Error('AI 文本生成失败')
}

async function runAnthropicRequest(input: ExternalTextRequest): Promise<ExternalTextResponse> {
  const systemPrompt = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n')

  const response = await fetch(`${normalizeBaseUrl(input.config.baseURL)}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.config.model,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: input.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    }),
    signal: getTimeoutSignal(input.timeoutMs || 30000),
  })

  const rawBody = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(extractErrorMessage(rawBody, response.status))
  }

  const parsed = rawBody ? JSON.parse(rawBody) : null
  return extractAnthropicAssistantPayload(parsed)
}

export async function runExternalTextRequest(input: ExternalTextRequest): Promise<ExternalTextResponse> {
  if (input.config.providerType === 'anthropic') {
    return runAnthropicRequest(input)
  }

  if (isWorkersAiBaseUrl(input.config.baseURL)) {
    return runWorkersCompatibleRequest(input)
  }

  return runOpenAiCompatibleRequest(input)
}
