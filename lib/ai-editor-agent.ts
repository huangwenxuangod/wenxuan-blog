import OpenAI from 'openai'
import { resolveConfig, type AIEnv } from '@/lib/ai'
import { normalizeBaseUrl } from '@/lib/ai-provider-profiles'
import { describeAiEditorTools, type AiEditorToolCall } from '@/lib/ai-editor-agent-tools'
import type { buildAiEditorContext } from '@/lib/ai-editor-context'

interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RunAiEditorAgentInput {
  userMessage: string
  history: AgentHistoryMessage[]
  context: ReturnType<typeof buildAiEditorContext>
  env?: AIEnv
  db?: D1Database
}

interface AgentModelOutput {
  message: string
  tool?: AiEditorToolCall | null
}

function safeParseAgentOutput(raw: string): AgentModelOutput {
  try {
    const parsed = JSON.parse(raw) as AgentModelOutput
    return {
      message: typeof parsed?.message === 'string' ? parsed.message.trim() : '',
      tool: parsed?.tool ?? null,
    }
  } catch {
    return {
      message: raw.trim(),
      tool: {
        name: 'reply_only',
        payload: null,
      },
    }
  }
}

export async function runAiEditorAgent(input: RunAiEditorAgentInput): Promise<AgentModelOutput> {
  const config = await resolveConfig(input.env, input.db)
  if (config.strategy === 'disabled') {
    throw new Error(config.reason)
  }

  const systemPrompt = describeAiEditorTools(input.context.outline)
  const contextPrompt = [
    input.context.title ? `文章标题：${input.context.title}` : '',
    input.context.fullText ? `文章全文：\n${input.context.fullText.slice(0, 12000)}` : '',
    input.context.outlineText ? `文章结构：\n${input.context.outlineText}` : '',
  ].filter(Boolean).join('\n\n')

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...input.history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: 'user' as const,
      content: `${contextPrompt}\n\n用户当前请求：${input.userMessage.trim()}`,
    },
  ]

  if (config.strategy === 'workers-ai') {
    const result = await config.binding.run(config.model, {
      messages,
      max_tokens: Math.min(config.maxTokens, 2400),
      temperature: 0.4,
      response_format: {
        type: 'json_object',
      },
    })

    const raw = typeof result === 'string'
      ? result
      : JSON.stringify(result)

    return safeParseAgentOutput(raw)
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeBaseUrl(config.baseURL),
  })

  const response = await client.chat.completions.create({
    model: config.model,
    messages,
    temperature: 0.4,
    max_tokens: Math.min(config.maxTokens, 2400),
    response_format: { type: 'json_object' },
  })

  const raw = response.choices?.[0]?.message?.content || ''
  return safeParseAgentOutput(raw)
}
