import { resolveConfig } from '@/lib/ai'
import type { EditorAiProviderPlanExecution, EditorAiRuntimePreparedInput } from '@/lib/ai-editor/runtime-types'
import { planWorkersEditorStep } from '@/lib/ai-editor/providers/workers'
import { planOpenAiEditorStep } from '@/lib/ai-editor/providers/openai'
import { planAnthropicEditorStep } from '@/lib/ai-editor/providers/anthropic'

export async function planEditorAiStep(input: EditorAiRuntimePreparedInput): Promise<EditorAiProviderPlanExecution> {
  const config = await resolveConfig(
    input.env,
    input.db,
    Number.isFinite(input.textProfileId) && Number(input.textProfileId) > 0
      ? Number(input.textProfileId)
      : undefined,
  )

  if (config.strategy === 'disabled') {
    throw new Error(config.reason)
  }

  if (config.strategy === 'workers-ai') {
    const completed = planWorkersEditorStep(input, config)
    return { completed }
  }

  if (config.providerType === 'anthropic') {
    const completed = planAnthropicEditorStep(input, config)
    return { completed }
  }

  return planOpenAiEditorStep(input, config)
}
