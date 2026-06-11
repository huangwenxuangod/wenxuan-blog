import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRouteEnvWithDb: vi.fn(),
  ensureAuthenticatedRequest: vi.fn(),
  parseJsonBody: vi.fn(),
  getOrCreateAiArticleThread: vi.fn(),
  updateLatestAiArticleToolPayload: vi.fn(),
  appendAiArticleMessage: vi.fn(),
  upsertAiArticleMemoryItem: vi.fn(),
  refreshAiArticleSummaryFromTurn: vi.fn(),
}))

vi.mock('@/lib/server/route-helpers', () => ({
  getRouteEnvWithDb: mocks.getRouteEnvWithDb,
  ensureAuthenticatedRequest: mocks.ensureAuthenticatedRequest,
  parseJsonBody: mocks.parseJsonBody,
  jsonError: (message: string, status = 500) => Response.json({ error: message }, { status }),
  jsonOk: (payload: unknown) => Response.json(payload, { status: 200 }),
}))

vi.mock('@/lib/repositories/ai-article-threads', () => ({
  normalizeArticleKey: (articleKey?: string, postSlug?: string) => postSlug ? `post:${postSlug}` : String(articleKey || ''),
  getOrCreateAiArticleThread: mocks.getOrCreateAiArticleThread,
  updateLatestAiArticleToolPayload: mocks.updateLatestAiArticleToolPayload,
  appendAiArticleMessage: mocks.appendAiArticleMessage,
}))

vi.mock('@/lib/repositories/ai-article-memory', () => ({
  upsertAiArticleMemoryItem: mocks.upsertAiArticleMemoryItem,
}))

vi.mock('@/lib/repositories/ai-article-summary', () => ({
  refreshAiArticleSummaryFromTurn: mocks.refreshAiArticleSummaryFromTurn,
}))

import { POST } from '@/app/api/editor/ai-chat/tool-result/route'

describe('/api/editor/ai-chat/tool-result route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRouteEnvWithDb.mockResolvedValue({
      ok: true,
      db: { kind: 'db' },
    })
    mocks.ensureAuthenticatedRequest.mockResolvedValue(null)
    mocks.getOrCreateAiArticleThread.mockResolvedValue({ id: 9 })
    mocks.updateLatestAiArticleToolPayload.mockResolvedValue(true)
    mocks.appendAiArticleMessage.mockResolvedValue(null)
    mocks.upsertAiArticleMemoryItem.mockResolvedValue(undefined)
    mocks.refreshAiArticleSummaryFromTurn.mockResolvedValue(undefined)
  })

  it('persists generate_images execution results into memory and summary', async () => {
    mocks.parseJsonBody.mockResolvedValue({
      postSlug: 'test-post',
      title: '测试文章',
      tool: 'generate_images',
      payload: {
        images: [
          {
            prompt: '封面图',
            usage: 'cover',
            visualRole: 'cover',
            styleFingerprint: 'warm-editorial-soft',
            generationReason: '用于文章封面',
          },
        ],
        execution: {
          count: 2,
          completedCount: 2,
          failedCount: 0,
          coverCount: 1,
          inlineCount: 1,
          results: [
            {
              visualRole: 'cover',
              styleFingerprint: 'warm-editorial-soft',
              generationReason: '用于文章封面',
            },
          ],
        },
      },
    })

    const response = await POST({} as never)
    const payload = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(mocks.upsertAiArticleMemoryItem).toHaveBeenCalled()
    expect(mocks.refreshAiArticleSummaryFromTurn).toHaveBeenCalledWith(
      { kind: 'db' },
      'post:test-post',
      expect.objectContaining({
        actionType: 'generate_images',
        assistantMessage: expect.stringContaining('已完成 2 张图片任务'),
      }),
    )
  })
})
