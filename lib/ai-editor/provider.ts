import { resolveConfig } from '@/lib/ai'
import type { EditorAiProviderStreamResult, EditorAiRuntimePreparedInput } from '@/lib/ai-editor/runtime-types'
import { runWorkersEditorProvider } from '@/lib/ai-editor/providers/workers'
import { runOpenAiEditorProvider } from '@/lib/ai-editor/providers/openai'
import { runAnthropicEditorProvider } from '@/lib/ai-editor/providers/anthropic'

export async function runEditorAiProvider(input: EditorAiRuntimePreparedInput): Promise<EditorAiProviderStreamResult> {
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
    return runWorkersEditorProvider(input, config)
  }

  if (config.providerType === 'anthropic') {
    return runAnthropicEditorProvider(input, config)
  }

  return runOpenAiEditorProvider(input, config)
}
