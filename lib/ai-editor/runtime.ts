import { normalizeToolCallToAction } from '@/lib/ai-editor/action-schema'
import { buildAiEditorContext } from '@/lib/ai-editor/context'
import { deriveAiEditorMemoryCandidates } from '@/lib/ai-editor/memory'
import { runEditorAiProvider } from '@/lib/ai-editor/provider'
import { classifyEditorAiTask } from '@/lib/ai-editor/task-classifier'
import type {
  EditorAiRuntimeInput,
  EditorAiRuntimePreparedInput,
  EditorAiRuntimeResult,
} from '@/lib/ai-editor/runtime-types'

function prepareEditorAiRuntimeInput(input: EditorAiRuntimeInput): EditorAiRuntimePreparedInput {
  const context = buildAiEditorContext({
    title: input.title,
    documentText: input.documentText,
    documentJson: (input.documentJson as never) || null,
    postSlug: input.postSlug,
    userMessage: input.userMessage,
    history: input.history,
    memoryItems: input.memoryItems,
    activeBlockIndex: input.activeBlockIndex,
    selectionText: input.selectionText,
  })

  return {
    ...input,
    context,
  }
}

export async function runEditorAiRuntime(input: EditorAiRuntimeInput): Promise<EditorAiRuntimeResult> {
  const prepared = prepareEditorAiRuntimeInput(input)
  const taskType = classifyEditorAiTask(prepared)

  const providerResult = await runEditorAiProvider(prepared)

  return {
    taskType,
    context: prepared.context,
    stream: providerResult.stream,
    completed: providerResult.completed.then((completed) => ({
      message: completed.message,
      action: completed.action,
      error: completed.error,
      memoryCandidates: deriveAiEditorMemoryCandidates({
        userMessage: prepared.userMessage,
        assistantMessage: completed.message,
        tool: null,
      }),
    })),
  }
}
