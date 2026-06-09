import OpenAI from 'openai'
import { resolveConfig, type AIEnv } from '@/lib/ai'
import { normalizeBaseUrl } from '@/lib/ai-provider-profiles'
import { describeAiEditorTools, type AiEditorToolCall } from './agent-tools'
import type { buildAiEditorContext } from './context'
import { appendSkillInstructions, type ActiveSkillInstructions } from '@/lib/skills/prompt'
import {
  buildEditorAgentResponseSchema,
  buildWorkersAiJsonSchemaResponseFormat,
} from '@/lib/workers-ai-json'

interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RunAiEditorAgentInput {
  userMessage: string
  history: AgentHistoryMessage[]
  context: ReturnType<typeof buildAiEditorContext>
  activeSkill?: ActiveSkillInstructions | null
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

  const contextPrompt = [
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
      response_format: buildWorkersAiJsonSchemaResponseFormat(buildEditorAgentResponseSchema()),
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
