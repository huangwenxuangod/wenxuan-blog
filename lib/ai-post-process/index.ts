import { buildAutoDescription } from '@/lib/post-utils'
import {
  getAiRuntimeEnv,
  resolveConfig,
  type AIEnv,
} from '@/lib/ai-runtime'
import { runExternalTextRequest } from '@/lib/ai-runtime/external-text'
import {
  buildPostProcessResponseSchema,
  buildWorkersAiJsonSchemaResponseFormat,
} from '@/lib/workers-ai-json'

export interface AIProcessResult {
  category: string
  description: string
  tags: string[]
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

async function runWorkersAiText(
  config: Extract<Awaited<ReturnType<typeof resolveConfig>>, { strategy: 'workers-ai' }>,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  response_format?: ReturnType<typeof buildWorkersAiJsonSchemaResponseFormat>,
): Promise<string> {
  const result = await config.binding.run(config.model, {
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    ...(response_format ? { response_format } : {}),
  })

  return extractWorkersAiText(result)
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

export async function processPost(
  title: string,
  content: string,
  env?: AIEnv,
  retries = 2,
  db?: D1Database,
): Promise<AIProcessResult | null> {
  let lastError: Error | null = null
  const resolved = db ? await resolveConfig(env, db) : await resolveConfig(env)

  if (resolved.strategy === 'disabled') {
    return null
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        {
          role: 'system',
          content: `分析文章，返回 JSON 格式：
{
  "category": "从【技术、生活、读书、思考、旅行】中选择最合适的",
  "description": "生成 120-160 字符的 SEO 描述",
  "tags": ["提取 3-5 个关键标签"]
}`,
        },
        {
          role: 'user',
          content: `标题：${title}\n\n内容：${content.slice(0, 2000)}`,
        },
      ]

      let resultText = ''

      if (resolved.strategy === 'workers-ai') {
        resultText = await runWorkersAiText(
          {
            ...resolved,
            temperature: 0.5,
            maxTokens: Math.min(resolved.maxTokens, 2000),
          },
          messages,
          buildWorkersAiJsonSchemaResponseFormat(buildPostProcessResponseSchema()),
        )
      } else {
        const response = await runExternalTextRequest({
          config: resolved,
          messages,
          temperature: 0.5,
          maxTokens: Math.min(resolved.maxTokens, 2000),
          jsonMode: resolved.providerType !== 'anthropic',
        })

        resultText = response.content || ''
      }

      const result = parseJsonObject(resultText) || {}

      return {
        category: typeof result.category === 'string' && result.category.trim() ? result.category : '技术',
        description:
          typeof result.description === 'string' && result.description.trim()
            ? result.description
            : buildAutoDescription(content),
        tags: Array.isArray(result.tags) ? result.tags.map((item) => String(item)).filter(Boolean) : [],
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.error(`AI processing error (attempt ${attempt + 1}/${retries + 1}):`, lastError)

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }
  }

  console.error('AI processing failed after all retries:', lastError)
  return null
}

export { getAiRuntimeEnv }
