import { isDeepSeekBaseUrl, resolveConfig } from '@/lib/ai'
import type { EditorAiProviderStreamResult, EditorAiRuntimePreparedInput } from '@/lib/ai-editor/runtime-types'
import { runDeepSeekEditorProvider } from '@/lib/ai-editor/providers/deepseek'
import { runWorkersEditorProvider } from '@/lib/ai-editor/providers/workers'
import { runOpenAiEditorProvider } from '@/lib/ai-editor/providers/openai'

export async function runEditorAiProvider(input: EditorAiRuntimePreparedInput): Promise<EditorAiProviderStreamResult> {
  const config = await resolveConfig(input.env, input.db)

  if (config.strategy === 'disabled') {
    throw new Error(config.reason)
  }

  if (config.strategy === 'workers-ai') {
    return runWorkersEditorProvider(input, config)
  }

  if (isDeepSeekBaseUrl(config.baseURL)) {
    return runDeepSeekEditorProvider(input, config)
  }

  return runOpenAiEditorProvider(input, config)
}
