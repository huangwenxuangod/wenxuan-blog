import { convertActionToLegacyTool } from '@/lib/ai-editor/action-schema'
import type { EditorAiAction, EditorAiRuntimeCompletedResult, EditorAiRuntimeEvent } from '@/lib/ai-editor/runtime-types'
import { appendAiArticleMessage, updateAiArticleMessageContent } from '@/lib/repositories/ai-article-threads'
import { upsertAiArticleMemoryItem } from '@/lib/repositories/ai-article-memory'
import { refreshAiArticleSummaryFromTurn } from '@/lib/repositories/ai-article-summary'

export interface FinalizedEditorAiResponse {
  message: string
  action: EditorAiAction
  error?: string
  tool: Record<string, unknown>
}

function shouldPersistIntermediateTool(toolName: string) {
  return toolName === 'list_posts' || toolName === 'search_posts' || toolName === 'get_post'
}

interface FinalizeEditorAiCompletionOptions {
  articleKey: string
  db: D1Database
  threadId: number
  assistantMessageId?: number | null
  title?: string | null
  userMessage?: string | null
  completed: EditorAiRuntimeCompletedResult
}

export async function finalizeEditorAiCompletion({
  articleKey,
  db,
  threadId,
  assistantMessageId,
  title,
  userMessage,
  completed,
}: FinalizeEditorAiCompletionOptions): Promise<FinalizedEditorAiResponse> {
  const legacyTool = convertActionToLegacyTool(completed.action)
  const responsePayload: Record<string, unknown> = {
    message: completed.message,
    tool: legacyTool,
  }

  if (assistantMessageId) {
    await updateAiArticleMessageContent(db, {
      id: assistantMessageId,
      threadId,
      content: String(responsePayload.message || ''),
    })
  } else {
    await appendAiArticleMessage(db, {
      threadId,
      role: 'assistant',
      content: String(responsePayload.message || ''),
    })
  }

  if (legacyTool.name !== 'reply_only') {
    const toolPayload = responsePayload.tool && typeof responsePayload.tool === 'object' && 'payload' in responsePayload.tool
      ? (responsePayload.tool as { payload?: unknown }).payload
      : null
    await appendAiArticleMessage(db, {
      threadId,
      role: 'tool',
      content: legacyTool.name,
      toolName: legacyTool.name,
      toolPayload: JSON.stringify(toolPayload || null),
    })
  }

  for (const candidate of completed.memoryCandidates) {
    await upsertAiArticleMemoryItem(db, articleKey, {
      ...candidate,
      sourceToolName: legacyTool.name || null,
    })
  }

  await refreshAiArticleSummaryFromTurn(db, articleKey, {
    userMessage: userMessage || '',
    assistantMessage: String(responsePayload.message || ''),
    actionType: completed.action?.type || legacyTool.name || null,
    title: title || null,
  })

  const { refreshWorkspaceSessionSummary } = await import('@/lib/repositories/ai-article-summary')
  await refreshWorkspaceSessionSummary(db, {
    userMessage: userMessage || '',
    assistantMessage: String(responsePayload.message || ''),
    actionType: completed.action?.type || legacyTool.name || null,
    currentArticleSlug: articleKey.replace('post:', '') || null,
  })

  return {
    message: String(responsePayload.message || ''),
    action: completed.action,
    error: typeof responsePayload.error === 'string' ? responsePayload.error : undefined,
    tool: (responsePayload.tool as Record<string, unknown>) || { name: 'reply_only', payload: null },
  }
}

export async function* buildEditorAiRouteEvents(
  stream: AsyncIterable<EditorAiRuntimeEvent>,
  completion: Promise<FinalizedEditorAiResponse>,
  options?: {
    db?: D1Database
    threadId?: number
  },
) {
  for await (const event of stream) {
    if (event.type === 'action_ready' && event.action.type === 'generate_images') {
      yield {
        type: 'tool_pending' as const,
        tool: 'generate_images',
        payload: {
          count: event.action.images.length,
        },
      }
      yield event
      continue
    }

    if (event.type === 'tool_result' && shouldPersistIntermediateTool(event.tool) && options?.db && options.threadId) {
      await appendAiArticleMessage(options.db, {
        threadId: options.threadId,
        role: 'tool',
        content: event.tool,
        toolName: event.tool,
        toolPayload: JSON.stringify(event.payload ?? null),
      })
    }

    if (event.type === 'assistant_done') {
      try {
        const finalized = await completion
        yield {
          type: 'assistant_done' as const,
          message: finalized.message,
          action: finalized.action,
          error: finalized.error,
          tool: finalized.tool,
        }
      } catch (error) {
        yield {
          type: 'assistant_error' as const,
          error: error instanceof Error ? error.message : 'AI 响应收尾失败',
        }
      }
      continue
    }

    yield event
  }
}
