import {
  buildEditorAiRouteEvents,
  finalizeEditorAiCompletion,
} from '@/lib/ai-editor/server-execution'
import { createEditorAiEventStream } from '@/lib/ai-editor/stream'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { normalizeArticleKey } from '@/lib/repositories/ai-article-threads'
import {
  appendAiArticleMessage,
  getOrCreateAiArticleThread,
  listAiArticleMessages,
  updateAiArticleMessageContent,
} from '@/lib/repositories/ai-article-threads'
import { listAiArticleMemoryItems } from '@/lib/repositories/ai-article-memory'
import {
  ensureAuthenticatedRequest,
  parseJsonBody,
  AppError,
  withRouteErrorHandling,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'
import { getEnabledSkillInstructions } from '@/lib/skills/repository'

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
  activeBlockIndex?: number
  selectionText?: string
  skillId?: number | null
  textProfileId?: number | null
  imageProfileId?: number | null
}

function safeParseMemoryPayload(payloadJson: string | null): Record<string, unknown> | null {
  if (!payloadJson) return null

  try {
    const parsed = JSON.parse(payloadJson) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export const POST = withRouteErrorHandling(async (req: NextRequest) => {
  const env = await getAppCloudflareEnv()
  const db = env?.DB as D1Database | undefined
  const images = env?.IMAGES as ImageBucket | undefined

  if (!db) {
    throw AppError.dbUnavailable()
  }

  const authError = await ensureAuthenticatedRequest(req, db)
  if (authError) {
    throw AppError.unauthorized()
  }

  const body = await parseJsonBody<ChatRequestBody>(req)
  const userMessage = (body.message || '').trim()
  if (!userMessage) {
    throw AppError.badRequest('消息不能为空')
  }

  const articleKey = normalizeArticleKey(body.articleKey, body.postSlug)
  let activeSkill = null
  if (Number.isInteger(body.skillId) && Number(body.skillId) > 0) {
    const storedSkill = await getEnabledSkillInstructions(db, Number(body.skillId))
    if (storedSkill) {
      activeSkill = {
        name: storedSkill.name,
        description: storedSkill.description,
        instructions: storedSkill.instructions,
      }
    }
  }
  const thread = await getOrCreateAiArticleThread(db, {
    articleKey: body.articleKey,
    postSlug: body.postSlug,
    title: body.title,
  })

  await appendAiArticleMessage(db, {
    threadId: thread.id,
    role: 'user',
    content: userMessage,
  })

  const pendingAssistantMessage = await appendAiArticleMessage(db, {
    threadId: thread.id,
    role: 'assistant',
    content: '',
  })

  const [persistedHistory, memoryRows] = await Promise.all([
    listAiArticleMessages(db, thread.id, 30),
    listAiArticleMemoryItems(db, articleKey, 40),
  ])

  const [{ runEditorAiRuntime }, { getAiRuntimeEnv }] = await Promise.all([
    import('@/lib/ai-editor/runtime'),
    import('@/lib/ai'),
  ])

  const result = await runEditorAiRuntime({
    articleKey,
    userMessage,
    title: body.title || '',
    postSlug: body.postSlug,
    documentText: body.documentText || '',
    documentJson: (body.documentJson as never) || null,
    activeBlockIndex: Number.isInteger(body.activeBlockIndex) ? body.activeBlockIndex : null,
    selectionText: body.selectionText || null,
    history: persistedHistory
      .filter((item): item is typeof item & { role: 'user' | 'assistant' } => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({
        role: item.role,
        content: item.content,
      })),
    memoryItems: memoryRows.map((item) => ({
      id: item.id,
      articleKey: item.article_key,
      scope: item.scope,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      payload: safeParseMemoryPayload(item.payload_json),
      sourceMessageId: item.source_message_id,
      sourceToolName: item.source_tool_name,
      confidence: item.confidence,
      pinned: item.pinned === 1,
      archived: item.archived === 1,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    activeSkill,
    textProfileId: Number.isInteger(body.textProfileId) ? Number(body.textProfileId) : null,
    imageProfileId: Number.isInteger(body.imageProfileId) ? Number(body.imageProfileId) : null,
    env: getAiRuntimeEnv(env),
    db,
  })
  const completion = result.completed.then(async (completed) => {
    if (pendingAssistantMessage?.id) {
      await updateAiArticleMessageContent(db, {
        id: pendingAssistantMessage.id,
        threadId: thread.id,
        content: completed.message,
      })
    }

    const generateEditorImage = async (input: {
      action: 'custom'
      userPrompt: string
      articleTitle?: string
      contextText?: string
      aspectRatio?: string
      resolution?: string
      db: D1Database
      env: Record<string, string | undefined>
      images: ImageBucket
    }) => {
      const { generateEditorImage } = await import('@/lib/ai-image')
      return generateEditorImage(input)
    }

    return finalizeEditorAiCompletion({
      articleKey,
      articleTitle: body.title,
      imageProfileId: Number.isInteger(body.imageProfileId) ? Number(body.imageProfileId) : null,
      db,
      env: env as Record<string, string | undefined>,
      images,
      threadId: thread.id,
      assistantMessageId: pendingAssistantMessage?.id ?? null,
      completed,
      generateEditorImage,
    })
  })

  const eventStream = createEditorAiEventStream(buildEditorAiRouteEvents(result.stream, completion))

  return new Response(new ReadableStream({
    async start(controller) {
      const reader = eventStream.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        controller.enqueue(value)
      }

      controller.close()
    },
  }), {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
})
