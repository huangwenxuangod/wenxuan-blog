import {
  buildEditorAiRouteEvents,
  finalizeEditorAiCompletion,
} from '@/lib/ai-editor/server-execution'
import { createEditorAiEventStream } from '@/lib/ai-editor/stream'
import { getAppCloudflareContext } from '@/lib/cloudflare'
import { normalizeArticleKey } from '@/lib/repositories/ai-article-threads'
import {
  appendAiArticleMessage,
  getOrCreateWorkspaceThread,
  loadWorkspaceHistoryWithCompaction,
  updateAiArticleMessageContent,
} from '@/lib/repositories/ai-article-threads'
import { listAiArticleMemoryItems } from '@/lib/repositories/ai-article-memory'
import { getAiArticleSummary } from '@/lib/repositories/ai-article-summary'
import {
  ensureAuthenticatedRequest,
  parseJsonBody,
  AppError,
  withRouteErrorHandling,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'
import { getEnabledSkillInstructions } from '@/lib/skills/repository'

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
  const cf = await getAppCloudflareContext()
  const env = cf.env
  const db = env?.DB as D1Database | undefined

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

  // 始终使用全局工作区线程
  const workspaceThread = await getOrCreateWorkspaceThread(db)

  // 消息写入工作区线程
  await appendAiArticleMessage(db, {
    threadId: workspaceThread.id,
    role: 'user',
    content: userMessage,
  })

  const pendingAssistantMessage = await appendAiArticleMessage(db, {
    threadId: workspaceThread.id,
    role: 'assistant',
    content: '',
  })

  // 注入文章锚点
  const anchoredMessage = body.postSlug
    ? `[当前文章: ${body.postSlug}] ${userMessage}`
    : userMessage

  // 压缩加载历史 + 文章级 memory/summary
  const [compactedHistory, memoryRows, articleSummary] = await Promise.all([
    loadWorkspaceHistoryWithCompaction(db, workspaceThread.id),
    listAiArticleMemoryItems(db, articleKey, 40),
    getAiArticleSummary(db, articleKey),
  ])

  const [{ runEditorAiRuntime }, { getAiRuntimeEnv }] = await Promise.all([
    import('@/lib/ai-editor/runtime'),
    import('@/lib/ai'),
  ])

  const result = await runEditorAiRuntime({
    articleKey,
    userMessage: anchoredMessage,
    title: body.title || '',
    postSlug: body.postSlug,
    documentText: body.documentText || '',
    documentJson: (body.documentJson as never) || null,
    activeBlockIndex: Number.isInteger(body.activeBlockIndex) ? body.activeBlockIndex : null,
    selectionText: body.selectionText || null,
    history: compactedHistory,
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
    userSummary: articleSummary?.user_summary || '',
    articleSummary: articleSummary?.article_summary || '',
    sessionSummary: articleSummary?.session_summary || '',
    activeSkill,
    textProfileId: Number.isInteger(body.textProfileId) ? Number(body.textProfileId) : null,
    imageProfileId: Number.isInteger(body.imageProfileId) ? Number(body.imageProfileId) : null,
    env: getAiRuntimeEnv(env),
    appEnv: env,
    db,
  })
  const completion = result.completed.then(async (completed) => {
    if (pendingAssistantMessage?.id) {
      await updateAiArticleMessageContent(db, {
        id: pendingAssistantMessage.id,
        threadId: workspaceThread.id,
        content: completed.message,
      })
    }

    return finalizeEditorAiCompletion({
      articleKey,
      db,
      threadId: workspaceThread.id,
      assistantMessageId: pendingAssistantMessage?.id ?? null,
      title: body.title || '',
      userMessage,
      completed,
    })
  })

  const eventStream = createEditorAiEventStream(buildEditorAiRouteEvents(result.stream, completion, {
    db,
    threadId: workspaceThread.id,
  }))

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
