import {
  appendAiArticleMessage,
  getOrCreateAiArticleThread,
  normalizeArticleKey,
  updateLatestAiArticleToolPayload,
} from '@/lib/repositories/ai-article-threads'
import { deriveAiEditorMemoryCandidates } from '@/lib/ai-editor/memory'
import { upsertAiArticleMemoryItem } from '@/lib/repositories/ai-article-memory'
import { refreshAiArticleSummaryFromTurn } from '@/lib/repositories/ai-article-summary'
import {
  ensureAuthenticatedRequest,
  getRouteEnvWithDb,
  jsonError,
  jsonOk,
  parseJsonBody,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'

interface ToolResultBody {
  articleKey?: string
  postSlug?: string
  title?: string
  tool?: string
  payload?: unknown
}

function normalizeToolPayload(payload: unknown) {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

function buildToolResultSummary(tool: string, payload: Record<string, unknown> | null) {
  if (tool !== 'generate_images') {
    return `${tool} 已完成。`
  }

  const execution = payload?.execution && typeof payload.execution === 'object'
    ? payload.execution as Record<string, unknown>
    : null

  const count = typeof execution?.count === 'number' ? execution.count : 0
  const completedCount = typeof execution?.completedCount === 'number' ? execution.completedCount : 0
  const failedCount = typeof execution?.failedCount === 'number' ? execution.failedCount : 0
  const coverCount = typeof execution?.coverCount === 'number' ? execution.coverCount : 0
  const inlineCount = typeof execution?.inlineCount === 'number' ? execution.inlineCount : 0

  return [
    `已完成 ${count} 张图片任务`,
    completedCount > 0 ? `成功 ${completedCount} 张` : '',
    failedCount > 0 ? `失败 ${failedCount} 张` : '',
    coverCount > 0 ? `封面 ${coverCount} 张` : '',
    inlineCount > 0 ? `正文插图 ${inlineCount} 张` : '',
  ].filter(Boolean).join('，') + '。'
}

export async function POST(req: NextRequest) {
  const route = await getRouteEnvWithDb('DB unavailable')
  if (!route.ok) return route.response

  const authError = await ensureAuthenticatedRequest(req, route.db)
  if (authError) return authError

  const body = await parseJsonBody<ToolResultBody>(req)
  const tool = String(body.tool || '').trim()
  if (!(body.articleKey || body.postSlug) || !tool) {
    return jsonError('缺少工具结果标识', 400)
  }
  const articleKey = normalizeArticleKey(body.articleKey, body.postSlug)

  const thread = await getOrCreateAiArticleThread(route.db, {
    articleKey: body.articleKey,
    postSlug: body.postSlug,
    title: body.title,
  })

  const normalizedPayload = normalizeToolPayload(body.payload)
  const toolPayload = JSON.stringify(body.payload ?? null)
  const updated = await updateLatestAiArticleToolPayload(route.db, {
    threadId: thread.id,
    toolName: tool,
    toolPayload,
  })

  if (!updated) {
    await appendAiArticleMessage(route.db, {
      threadId: thread.id,
      role: 'tool',
      content: tool,
      toolName: tool,
      toolPayload,
    })
  }

  const summaryMessage = buildToolResultSummary(tool, normalizedPayload)
  const memoryCandidates = deriveAiEditorMemoryCandidates({
    userMessage: '',
    assistantMessage: summaryMessage,
    tool: {
      name: tool,
      payload: normalizedPayload,
    },
  })

  for (const candidate of memoryCandidates) {
    await upsertAiArticleMemoryItem(route.db, articleKey, {
      ...candidate,
      sourceToolName: tool,
    })
  }

  await refreshAiArticleSummaryFromTurn(route.db, articleKey, {
    userMessage: '',
    assistantMessage: summaryMessage,
    actionType: tool,
    title: body.title || null,
  })

  return jsonOk({ success: true, updated, memoryCount: memoryCandidates.length })
}
