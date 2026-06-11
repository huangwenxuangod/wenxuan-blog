// ⚡ 轻量 openai SDK 替代 — 原生 fetch + 类型 + 重试 + 错误格式化
// 零 npm 依赖，替换 openai SDK 节省 ~300KB bundle

// ---- 类型定义 ----

export interface OpenAIAuth {
  apiKey: string
  baseURL: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionResponse {
  id: string
  choices: Array<{
    message: { role: string; content: string | null }
    finish_reason: string | null
  }>
}

export interface ChatCompletionChunk {
  choices?: Array<{
    delta: { content?: string | null }
    finish_reason: string | null
  }>
}

export interface ImageGenerationParams {
  model: string
  prompt: string
  n?: number
  size?: string
  quality?: string
  output_format?: string
  background?: string
}

export interface ImageGenerationResponse {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string
  }>
}

// ---- 错误格式化 ----

export class OpenAIError extends Error {
  status: number
  type: string
  constructor(status: number, body: { error?: { message?: string; type?: string } }) {
    const msg = body?.error?.message || `OpenAI API 返回 ${status}`
    super(`[${status}] ${msg}`)
    this.name = 'OpenAIError'
    this.status = status
    this.type = body?.error?.type || 'unknown'
  }
}

// ---- 重试逻辑 ----

interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
}

const DEFAULT_RETRY: RetryConfig = { maxRetries: 3, baseDelayMs: 1000 }

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retry: RetryConfig = DEFAULT_RETRY,
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    try {
      const res = await fetch(url, init)

      if (res.ok) return res

      const body = await res.json().catch(() => ({})) as Record<string, unknown>
      lastError = new OpenAIError(res.status, body as { error?: { message?: string; type?: string } })

      if (!isRetryable(res.status)) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      // Network errors (fetch throws) = retryable
    }

    if (attempt < retry.maxRetries) {
      const waitMs = retry.baseDelayMs * Math.pow(2, attempt)
      await delay(waitMs)
    }
  }

  throw lastError || new Error('OpenAI API 请求失败（已达最大重试次数）')
}

// ---- Chat Completions ----

export async function createChatCompletion(
  auth: OpenAIAuth,
  body: Record<string, unknown>,
): Promise<ChatCompletionResponse> {
  const res = await fetchWithRetry(`${auth.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  return res.json() as Promise<ChatCompletionResponse>
}

export async function* createChatCompletionStream(
  auth: OpenAIAuth,
  body: Record<string, unknown>,
): AsyncIterable<ChatCompletionChunk> {
  const res = await fetchWithRetry(`${auth.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.apiKey}`,
    },
    body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: false } }),
  })

  const reader = res.body?.getReader()
  if (!reader) throw new Error('Streaming response body 不可读')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data) as ChatCompletionChunk
        yield parsed
      } catch {
        // skip malformed chunks
      }
    }
  }
}

// ---- Image Generation ----

export async function createImageGeneration(
  auth: OpenAIAuth,
  params: ImageGenerationParams,
): Promise<ImageGenerationResponse> {
  const res = await fetchWithRetry(`${auth.baseURL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.apiKey}`,
    },
    body: JSON.stringify(params),
  })

  return res.json() as Promise<ImageGenerationResponse>
}

export async function createImageEdit(
  auth: OpenAIAuth,
  formData: FormData,
): Promise<ImageGenerationResponse> {
  const res = await fetchWithRetry(`${auth.baseURL}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.apiKey}` },
    body: formData,
  })

  return res.json() as Promise<ImageGenerationResponse>
}
