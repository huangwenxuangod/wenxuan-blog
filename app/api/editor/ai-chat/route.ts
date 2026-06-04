import {
  appendAiArticleMessage,
  getOrCreateAiArticleThread,
  listAiArticleMessages,
} from '@/lib/db'
import { runAiEditorAgent } from '@/lib/ai-editor-agent'
import { buildAiEditorContext } from '@/lib/ai-editor-context'
import { generateEditorImage } from '@/lib/ai-image'
import { getAiRuntimeEnv } from '@/lib/ai'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import {
  ensureAuthenticatedRequest,
  jsonError,
  parseJsonBody,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'

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

interface ChatRequestBody {
  articleKey?: string
  postSlug?: string
  title?: string
  message?: string
  documentText?: string
  documentJson?: unknown
}

function createNdjsonStream(payload: {
  message: string
  tool: Record<string, unknown>
  error?: string
}) {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const text = String(payload.message || '')
      const chunkSize = 24

      controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'assistant_start' })}\n`))

      for (let index = 0; index < text.length; index += chunkSize) {
        const delta = text.slice(index, index + chunkSize)
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'assistant_delta', delta })}\n`))
        await new Promise((resolve) => setTimeout(resolve, 12))
      }

      controller.enqueue(encoder.encode(`${JSON.stringify({
        type: 'assistant_done',
        message: text,
        tool: payload.tool,
        error: payload.error,
      })}\n`))
      controller.close()
    },
  })
}

export async function POST(req: NextRequest) {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  const images = env?.IMAGES as ImageBucket | undefined

  if (!db) {
    return jsonError('DB unavailable', 500)
  }

  const authError = await ensureAuthenticatedRequest(req, db)
  if (authError) {
    return authError
  }

  const body = await parseJsonBody<ChatRequestBody>(req)
  const userMessage = (body.message || '').trim()
  if (!userMessage) {
    return jsonError('消息不能为空', 400)
  }

  const thread = await getOrCreateAiArticleThread(db, {
    articleKey: body.articleKey,
    postSlug: body.postSlug,
    title: body.title,
  })
  const history = await listAiArticleMessages(db, thread.id, 30)

  await appendAiArticleMessage(db, {
    threadId: thread.id,
    role: 'user',
    content: userMessage,
  })

  const context = buildAiEditorContext({
    title: body.title || '',
    documentText: body.documentText || '',
    documentJson: (body.documentJson as never) || null,
    postSlug: body.postSlug,
  })

  const result = await runAiEditorAgent({
    userMessage,
    history: history
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({
        role: item.role,
        content: item.content,
      })),
    context,
    env: getAiRuntimeEnv(env),
    db,
  })

  let responsePayload: Record<string, unknown> = {
    message: result.message,
    tool: result.tool || { name: 'reply_only', payload: null },
  }

  if (result.tool?.name === 'plan_article_images') {
    if (!images) {
      responsePayload = {
        ...responsePayload,
        error: '图片存储未配置，无法自动插图',
      }
    } else {
      const plannedImages = Array.isArray(result.tool.payload?.images)
        ? result.tool.payload.images
        : []

      const generatedImages = []
      for (const item of plannedImages.slice(0, 6)) {
        const generated = await generateEditorImage({
          action: 'custom',
          prompt: item.prompt,
          articleTitle: body.title,
          contextText: item.reason,
          aspectRatio: item.aspectRatio,
          resolution: item.resolution,
          db,
          env: env as Record<string, string | undefined>,
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
          ...result.tool,
          payload: {
            ...result.tool.payload,
            generatedImages,
          },
        },
      }
    }
  }

  await appendAiArticleMessage(db, {
    threadId: thread.id,
    role: 'assistant',
    content: String(responsePayload.message || ''),
  })

  if (result.tool && result.tool.name !== 'reply_only') {
    await appendAiArticleMessage(db, {
      threadId: thread.id,
      role: 'tool',
      content: result.tool.name,
      toolName: result.tool.name,
      toolPayload: JSON.stringify(responsePayload.tool?.payload || null),
    })
  }

  return new Response(createNdjsonStream({
    message: String(responsePayload.message || ''),
    tool: (responsePayload.tool as Record<string, unknown>) || { name: 'reply_only', payload: null },
    error: typeof responsePayload.error === 'string' ? responsePayload.error : undefined,
  }), {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
