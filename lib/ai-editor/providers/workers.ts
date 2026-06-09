import { normalizeToolCallToAction } from '@/lib/ai-editor/action-schema'
import type { EditorAiProviderStreamResult, EditorAiRuntimePreparedInput } from '@/lib/ai-editor/runtime-types'
import type { ResolvedConfig } from '@/lib/ai'
import { runAiEditorAgent } from '@/lib/ai-editor/agent'

export async function runWorkersEditorProvider(
  input: EditorAiRuntimePreparedInput,
  config: Extract<ResolvedConfig, { strategy: 'workers-ai' }>,
): Promise<EditorAiProviderStreamResult> {
  const result = await runAiEditorAgent({
    userMessage: input.userMessage,
    history: input.history,
    context: input.context,
    activeSkill: input.activeSkill,
    env: {
      WORKERS_AI: config.binding,
      WORKERS_AI_MODEL: config.model,
      ENABLE_WORKERS_AI: 'true',
    },
    db: input.db,
  })

  const action = normalizeToolCallToAction(result.tool)
  const events = [
    { type: 'assistant_start' as const },
    { type: 'assistant_delta' as const, delta: result.message },
    { type: 'action_ready' as const, action },
    { type: 'assistant_done' as const, message: result.message, action },
  ]

  return {
    stream: (async function* () {
      for (const event of events) {
        yield event
      }
    })(),
    completed: Promise.resolve({
      message: result.message,
      action,
    }),
  }
}
