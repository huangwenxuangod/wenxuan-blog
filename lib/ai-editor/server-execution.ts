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
  generatedImage?: {
    url: string
    alt: string
    usage: 'inline' | 'cover'
    anchorBlockIndex?: number
  }
}

interface FinalizeEditorAiCompletionOptions {
  articleKey: string
  articleTitle?: string
  imageProfileId?: number | null
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
    profileId?: number | null
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
  imageProfileId,
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
  let generatedImage: FinalizedEditorAiResponse['generatedImage'] | undefined

  if (completed.action.type === 'generate_image') {
    if (!images) {
      responsePayload = {
        ...responsePayload,
        error: '图片存储未配置，无法自动插图',
      }
    } else {
      const generated = await generateEditorImage({
        action: 'custom',
        userPrompt: completed.action.prompt,
        articleTitle,
        contextText: completed.message,
        aspectRatio: completed.action.aspectRatio || (completed.action.usage === 'cover' ? '5:2' : undefined),
        resolution: completed.action.resolution,
        profileId: imageProfileId ?? completed.action.imageProfileId ?? null,
        db,
        env,
        images,
      })

      generatedImage = {
        url: generated.url,
        alt: completed.action.alt || generated.alt,
        usage: completed.action.usage,
        anchorBlockIndex: completed.action.anchorBlockIndex,
      }

      responsePayload = {
        ...responsePayload,
        tool: {
          ...legacyTool,
          payload: {
            ...(legacyTool.payload as Record<string, unknown> || {}),
            generatedImage: generatedImage
              ? {
                  url: generatedImage.url,
                  alt: generatedImage.alt,
                }
              : undefined,
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
    generatedImage,
  }
}

export async function* buildEditorAiRouteEvents(
  stream: AsyncIterable<EditorAiRuntimeEvent>,
  completion: Promise<FinalizedEditorAiResponse>,
) {
  for await (const event of stream) {
    if (event.type === 'action_ready' && event.action.type === 'generate_image') {
      yield {
        type: 'tool_pending' as const,
        tool: 'generate_image',
        payload: {
          usage: event.action.usage,
        },
      }
      yield event
      continue
    }

    if (event.type === 'assistant_done') {
      try {
        const finalized = await completion
        if (finalized.generatedImage) {
          yield {
            type: 'tool_result' as const,
            tool: 'generate_image',
            payload: {
              generatedImage: finalized.generatedImage,
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
