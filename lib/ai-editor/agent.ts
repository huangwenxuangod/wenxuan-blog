import { resolveConfig, type AIEnv } from '@/lib/ai'
import { normalizeBaseUrl } from '@/lib/ai-provider-profiles'
import { normalizeAiEditorToolCall, type AiEditorToolCall } from './tool-registry'
import type { buildAiEditorContext } from './context'
import type { ActiveSkillInstructions } from '@/lib/skills/prompt'
import {
  buildEditorAgentResponseSchema,
  buildWorkersAiJsonSchemaResponseFormat,
} from '@/lib/workers-ai-json'
import type { EditorAiToolObservation, WorkspaceAgentState } from '@/lib/ai-editor/runtime-types'
import { buildEditorAiModelPrompt } from '@/lib/ai-editor/prompt-builder'

interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RunAiEditorAgentInput {
  userMessage: string
  history: AgentHistoryMessage[]
  context: ReturnType<typeof buildAiEditorContext>
  activeSkill?: ActiveSkillInstructions | null
  agentState?: WorkspaceAgentState | null
  toolObservations?: EditorAiToolObservation[]
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
      tool: normalizeAiEditorToolCall(parsed?.tool ?? null),
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

  const { systemPrompt, userPrompt } = buildEditorAiModelPrompt({
    articleKey: input.context.postSlug || 'workspace',
    userMessage: input.userMessage,
    title: input.context.title,
    postSlug: input.context.postSlug,
    documentText: input.context.fullText,
    history: input.history,
    memoryItems: input.context.retrievedContext.memoryItems,
    activeSkill: input.activeSkill,
    env: input.env,
    db: input.db,
    context: input.context,
    agentState: input.agentState,
    toolObservations: input.toolObservations,
  })

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...input.history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: 'user' as const,
      content: userPrompt,
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

  const { default: OpenAI } = await import('openai')
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
