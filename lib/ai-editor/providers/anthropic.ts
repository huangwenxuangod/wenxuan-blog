import { runExternalTextRequest } from '@/lib/ai-runtime/external-text'
import type {
  EditorAiProviderPlanResult,
  EditorAiRuntimePreparedInput,
} from '@/lib/ai-editor/runtime-types'
import type { ResolvedConfig } from '@/lib/ai'
import { buildEditorAiModelPrompt } from '@/lib/ai-editor/prompt-builder'
import { parseStructuredEditorToolCall } from '@/lib/ai-editor/providers/structured-tool'
import { normalizeAiEditorToolCall } from '@/lib/ai-editor/tool-registry'

export async function planAnthropicEditorStep(
  input: EditorAiRuntimePreparedInput,
  config: Extract<ResolvedConfig, { strategy: 'external-provider' }>,
): Promise<EditorAiProviderPlanResult> {
  const { systemPrompt, userPrompt } = buildEditorAiModelPrompt(input)

  const response = await runExternalTextRequest({
    config,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
    maxTokens: Math.min(config.maxTokens, 2400),
    jsonMode: true,
  })

  const parsed = parseStructuredEditorToolCall(response.content)
  if (!parsed.parsed) {
    throw new Error('Anthropic 返回的结构化编辑动作无法解析，请检查提示词或切换兼容接口。')
  }

  return {
    message: parsed.message,
    toolCall: normalizeAiEditorToolCall({
      name: parsed.toolName,
      payload: parsed.toolPayload,
    }),
  }
}
