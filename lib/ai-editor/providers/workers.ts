import type { EditorAiProviderPlanResult, EditorAiRuntimePreparedInput } from '@/lib/ai-editor/runtime-types'
import type { ResolvedConfig } from '@/lib/ai'
import { runAiEditorAgent } from '@/lib/ai-editor/agent'
import { normalizeAiEditorToolCall } from '@/lib/ai-editor/tool-registry'

export async function planWorkersEditorStep(
  input: EditorAiRuntimePreparedInput,
  config: Extract<ResolvedConfig, { strategy: 'workers-ai' }>,
): Promise<EditorAiProviderPlanResult> {
  const result = await runAiEditorAgent({
    userMessage: input.userMessage,
    history: input.history,
    context: input.context,
    activeSkill: input.activeSkill,
    agentState: input.agentState,
    toolObservations: input.toolObservations,
    env: {
      WORKERS_AI: config.binding,
      WORKERS_AI_MODEL: config.model,
      ENABLE_WORKERS_AI: 'true',
    },
    db: input.db,
  })

  return {
    message: result.message,
    toolCall: normalizeAiEditorToolCall(result.tool),
  }
}
