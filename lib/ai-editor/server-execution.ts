import { convertActionToLegacyTool } from '@/lib/ai-editor/action-schema'
import type {
  EditorAiAction,
  EditorAiRuntimeCompletedResult,
  EditorAiRuntimeEvent,
} from '@/lib/ai-editor/runtime-types'
import { appendAiArticleMessage } from '@/lib/repositories/ai-article-threads'
import { upsertAiArticleMemoryItem } from '@/lib/repositories/ai-article-memory'

type ImageBucket = {
  put: (
    key: string,
    value: File | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: {
        contentType?: string
        cacheControl?: string
      }
      customMetadata?: Record<string, string>
    }
  ) => Promise<void>
}

export interface FinalizedEditorAiResponse {
  message: string
  action: EditorAiAction
  error?: string
  tool: Record<string, unknown>
  generatedImages: Array<{
    blockIndex: number
    reason: string
    alt: string
    image: {
      url: string
      alt: string
    }
  }>
}

interface FinalizeEditorAiCompletionOptions {
  articleKey: string
  articleTitle?: string
  db: D1Database
  env: Record<string, string | undefined>
  images?: ImageBucket
  threadId: number
  completed: EditorAiRuntimeCompletedResult
  generateEditorImage: (input: {
    action: 'custom'
    userPrompt: string
    articleTitle?: string
    contextText?: string
    aspectRatio?: string
    resolution?: string
    db: D1Database
    env: Record<string, string | undefined>
    images: ImageBucket
  }) => Promise<{
    url: string
    alt: string
  }>
}

export async function finalizeEditorAiCompletion({
  articleKey,
  articleTitle,
  db,
  env,
  images,
  threadId,
  completed,
  generateEditorImage,
}: FinalizeEditorAiCompletionOptions): Promise<FinalizedEditorAiResponse> {
  const legacyTool = convertActionToLegacyTool(completed.action)
  let responsePayload: Record<string, unknown> = {
    message: completed.message,
    tool: legacyTool,
  }
  let generatedImages: FinalizedEditorAiResponse['generatedImages'] = []

  if (completed.action.type === 'plan_article_images') {
    if (!images) {
      responsePayload = {
        ...responsePayload,
        error: '图片存储未配置，无法自动插图',
      }
    } else {
      const plannedImages = Array.isArray(completed.action.images)
        ? completed.action.images
        : []

      generatedImages = []
      for (const item of plannedImages.slice(0, 6)) {
        const generated = await generateEditorImage({
          action: 'custom',
          userPrompt: item.prompt,
          articleTitle,
          contextText: item.reason,
          aspectRatio: item.aspectRatio,
          resolution: item.resolution,
          db,
          env,
          images,
        })

        generatedImages.push({
          blockIndex: item.blockIndex,
          reason: item.reason,
          alt: item.alt || generated.alt,
          image: generated,
        })
      }

      responsePayload = {
        ...responsePayload,
        tool: {
          ...legacyTool,
          payload: {
            ...(legacyTool.payload as Record<string, unknown> || {}),
            generatedImages,
          },
        },
      }
    }
  }

  await appendAiArticleMessage(db, {
    threadId,
    role: 'assistant',
    content: String(responsePayload.message || ''),
  })

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

  return {
    message: String(responsePayload.message || ''),
    action: completed.action,
    error: typeof responsePayload.error === 'string' ? responsePayload.error : undefined,
    tool: (responsePayload.tool as Record<string, unknown>) || { name: 'reply_only', payload: null },
    generatedImages,
  }
}

export async function* buildEditorAiRouteEvents(
  stream: AsyncIterable<EditorAiRuntimeEvent>,
  completion: Promise<FinalizedEditorAiResponse>,
) {
  for await (const event of stream) {
    if (event.type === 'action_ready' && event.action.type === 'plan_article_images') {
      yield {
        type: 'tool_pending' as const,
        tool: 'plan_article_images',
        payload: {
          count: event.action.images.length,
        },
      }
      yield event
      continue
    }

    if (event.type === 'assistant_done') {
      try {
        const finalized = await completion
        if (finalized.generatedImages.length > 0) {
          yield {
            type: 'tool_result' as const,
            tool: 'plan_article_images',
            payload: {
              generatedImages: finalized.generatedImages,
            },
          }
        }
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
